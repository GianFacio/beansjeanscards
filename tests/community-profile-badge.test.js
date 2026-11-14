const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const navigation = fs.readFileSync(path.join(__dirname, '..', 'js', 'community', 'community-navigation.js'), 'utf8');
const notifications = fs.readFileSync(path.join(__dirname, '..', 'js', 'community', 'profile-notifications.js'), 'utf8');

function element() {
    return {
        hidden: false, attributes: {}, children: [], events: {},
        classList: { toggle() {}, add() {} },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; },
        querySelector() { return this.children[0]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) { this.events[name] = callback; },
        showModal() { this.open = true; },
        close() { this.open = false; if (this.events.close) this.events.close(); }
    };
}

async function setup(rows, options = {}) {
    const tables = {
        community_favorite_notifications: [],
        community_like_notifications: [],
        community_follows: [],
        ...rows
    };
    const nodes = {
        '.site-brand': element(),
        '#community-my-profile': element(),
        '#profile-notifications-toggle': element(),
        '#profile-notifications-badge': element(),
        '#profile-notifications': element(),
        '#profile-notifications-message': element(),
        '#profile-notifications-status': element(),
        '#profile-notifications-list': element(),
        '#profile-notifications-close': element()
    };
    const windowEvents = {};
    const documentEvents = {};
    let authChange;
    let beforeUpdate;
    let failedTable;
    const client = {
        auth: {
            async getSession() { return { data: { session: { user: { id: 'viewer' } } } }; },
            onAuthStateChange(callback) { authChange = callback; }
        },
        storage: { from() { return { getPublicUrl() { return { data: { publicUrl: 'photo' } }; } }; } },
        from(table) {
            let filters = [];
            let ids;
            let update;
            let count = false;
            const query = {
                select(_columns, options) { count = !!options?.head; return this; },
                eq(column, value) { filters.push(row => row[column] === value); return this; },
                in(column, values) { ids = row => values.includes(row[column]); return this; },
                order() { return this; },
                range() { return this; },
                update(value) { update = value; return this; },
                then(resolve) {
                    if (failedTable === table) return resolve({ error: new Error('query failed') });
                    if (update && beforeUpdate) { const callback = beforeUpdate; beforeUpdate = null; callback(); }
                    const matches = (tables[table] || []).filter(row => filters.every(filter => filter(row)) && (!ids || ids(row)));
                    if (update) matches.forEach(row => Object.assign(row, update));
                    resolve(count ? { count: matches.length, error: null } : { data: matches, error: null });
                }
            };
            return query;
        }
    };
    const context = {
        document: {
            hidden: false,
            querySelector(selector) { return nodes[selector] || null; },
            querySelectorAll() { return []; },
            createElement: element,
            addEventListener(name, callback) { (documentEvents[name] ||= []).push(callback); }
        },
        window: {
            communityClient: client,
            communityFollows: { async avatarMarkup() { return ''; } },
            getStoreSupabaseClient() { return client; },
            addEventListener(name, callback) { (windowEvents[name] ||= []).push(callback); }
        },
        localStorage: { getItem() { return null; } },
        console: { error() {} },
        setTimeout(callback) { callback(); },
        setInterval() { return 1; },
        clearInterval() {}
    };
    vm.runInNewContext(navigation, context);
    vm.runInNewContext(notifications, context);
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    if (options.start !== false) {
        context.window.profileNotifications.start('viewer');
        await flush();
    }
    return {
        nodes, tables, flush,
        open: () => nodes['#profile-notifications-toggle'].events.click(),
        refresh: () => context.window.communityNotificationBadge.refresh(),
        visibilityChange: () => documentEvents.visibilitychange.forEach(callback => callback()),
        signIn: id => authChange('SIGNED_IN', id ? { user: { id } } : null),
        fail: table => { failedTable = table; },
        beforeUpdate: callback => { beforeUpdate = callback; }
    };
}

function favorite(id = 'favorite') {
    return { id, recipient_id: 'viewer', is_read: false, created_at: '2026-01-01T00:00:00Z',
        actor: { username: 'collector' }, card: { name: 'Card', photo_path: 'card.jpg' } };
}

function follow(id = 'follower') {
    return { follower_id: id, followed_id: 'viewer', is_read: false, created_at: '2026-01-01T00:00:00Z',
        follower: { username: id } };
}

test('each notification type lights both badges and viewing clears both', async () => {
    for (const [table, row] of [
        ['community_favorite_notifications', favorite()],
        ['community_like_notifications', favorite('like')],
        ['community_follows', follow()]
    ]) {
        const app = await setup({ [table]: [row] });
        const profileLink = app.nodes['#community-my-profile'];
        const badge = app.nodes['#profile-notifications-badge'];
        assert.equal(profileLink.children[0].hidden, false, table);
        assert.equal(profileLink.attributes['aria-label'], 'My Profile, new notifications');
        assert.equal(badge.hidden, false, table);
        await app.open();
        await app.flush();
        assert.equal(row.is_read, true, table);
        assert.equal(profileLink.children[0].hidden, true, table);
        assert.equal(badge.hidden, true, table);
    }
});

test('new follows arriving while viewing remain unread', async () => {
    const app = await setup({ community_follows: [follow()] });
    const incoming = follow('new-follower');
    app.beforeUpdate(() => app.tables.community_follows.push(incoming));
    await app.open();
    await app.flush();
    assert.equal(incoming.is_read, false);
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, false);
    assert.equal(app.nodes['#profile-notifications-badge'].hidden, false);
});

test('My Profile uses the signed-in account and resets on sign out', async () => {
    const app = await setup({ community_favorite_notifications: [favorite()] }, { start: false });
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, false);
    app.signIn('other');
    await app.flush();
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, true);
    app.signIn('viewer');
    await app.flush();
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, false);
    app.signIn(null);
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, true);
});

test('a failed notification check is exposed without clearing the existing badge', async () => {
    const app = await setup({ community_favorite_notifications: [favorite()] });
    app.fail('community_favorite_notifications');
    await app.refresh();
    const profileLink = app.nodes['#community-my-profile'];
    assert.equal(profileLink.children[0].hidden, false);
    assert.equal(profileLink.attributes['aria-label'], 'My Profile, unable to check for new notifications');
    assert.match(profileLink.title, /Unable to check/);
});

test('new notifications after viewing reactivate both indicators', async () => {
    const app = await setup({ community_favorite_notifications: [favorite()] });
    await app.open();
    await app.flush();
    app.tables.community_favorite_notifications.push(favorite('new'));
    app.visibilityChange();
    await app.flush();
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, false);
    assert.equal(app.nodes['#profile-notifications-badge'].hidden, false);
});

test('notifications are not cleared when loading them fails', async () => {
    const app = await setup({ community_favorite_notifications: [favorite()] });
    app.fail('community_favorite_notifications');
    await app.open();
    await app.flush();
    assert.equal(app.tables.community_favorite_notifications[0].is_read, false);
    assert.equal(app.nodes['#community-my-profile'].children[0].hidden, false);
    assert.equal(app.nodes['#profile-notifications-badge'].hidden, false);
    assert.match(app.nodes['#profile-notifications-message'].textContent, /Unable to load notifications/);
});
