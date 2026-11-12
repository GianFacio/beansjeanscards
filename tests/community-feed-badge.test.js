const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const navigation = fs.readFileSync(path.join(__dirname, '..', 'js', 'community', 'community-navigation.js'), 'utf8');

async function setup({ follows = [], cards = [], stored = {}, user = 'viewer' } = {}) {
    const listeners = {};
    const values = new Map(Object.entries(stored));
    const badge = {};
    const link = {
        attributes: {},
        append(element) { this.badge = element; },
        querySelector() { return this.badge; },
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    const brand = {};
    let authChange;
    let fail = false;
    const client = {
        auth: {
            async getSession() { return { data: { session: user ? { user: { id: user } } : null } }; },
            onAuthStateChange(callback) { authChange = callback; }
        },
        from(table) {
            const query = {
                select() { return this; },
                eq(_column, id) { this.user = id; return this; },
                in(_column, ids) { this.ids = ids; return this; },
                gt(_column, cutoff) { this.cutoff = cutoff; this.inclusive = false; return this; },
                gte(_column, cutoff) { this.cutoff = cutoff; this.inclusive = true; return this; },
                async limit() {
                    if (fail) return { error: new Error('query failed') };
                    return { data: cards.filter(card => this.ids.includes(card.owner_id) &&
                        (this.inclusive ? card.created_at >= this.cutoff : card.created_at > this.cutoff)).slice(0, 1) };
                },
                then(resolve) {
                    resolve(fail ? { error: new Error('query failed') } :
                        { data: follows.filter(follow => follow.follower_id === this.user) });
                }
            };
            assert.ok(['community_follows', 'community_cards'].includes(table));
            return query;
        }
    };
    const context = {
        document: {
            hidden: false,
            querySelector() { return brand; },
            querySelectorAll(selector) { return selector.includes('data-following-nav') ? [link] : []; },
            createElement() { return { ...badge, setAttribute() {} }; },
            addEventListener(name, callback) { listeners[name] = callback; }
        },
        localStorage: {
            getItem(key) { return values.get(key) || null; },
            setItem(key, value) { values.set(key, value); }
        },
        window: {
            getStoreSupabaseClient() { return client; },
            addEventListener(name, callback) { listeners[name] = callback; }
        },
        console: { error() {} },
        setTimeout(callback) { callback(); },
        setInterval() {}
    };
    vm.runInNewContext(navigation, context);
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    return {
        link, values, listeners, cards, follows, flush,
        markViewed: (...args) => context.window.communityFeedBadge.markViewed(...args),
        signIn: id => authChange('SIGNED_IN', id ? { user: { id } } : null),
        setFail: value => { fail = value; }
    };
}

test('recent followed cards show a badge until the rendered feed is viewed', async () => {
    const created = new Date(Date.now() - 60000).toISOString();
    const app = await setup({
        follows: [{ follower_id: 'viewer', followed_id: 'collector' }],
        cards: [{ owner_id: 'collector', created_at: created }]
    });
    assert.equal(app.link.badge.hidden, false);
    assert.equal(app.link.attributes['aria-label'], 'Feed, new cards');
    app.markViewed('viewer', created);
    await app.flush();
    assert.equal(app.link.badge.hidden, true);
    assert.equal(app.values.get('community-feed-seen:viewer'), created);
    app.cards.push({ owner_id: 'collector', created_at: new Date().toISOString() });
    app.listeners.visibilitychange();
    await app.flush();
    assert.equal(app.link.badge.hidden, false);
});

test('ignores old and unfollowed cards and refreshes after following changes', async () => {
    const app = await setup({
        follows: [{ follower_id: 'viewer', followed_id: 'collector' }],
        cards: [
            { owner_id: 'collector', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
            { owner_id: 'other', created_at: new Date().toISOString() }
        ]
    });
    assert.equal(app.link.badge.hidden, true);
    app.follows.push({ follower_id: 'viewer', followed_id: 'other' });
    app.listeners['community-follow-changed']();
    await app.flush();
    assert.equal(app.link.badge.hidden, false);
});

test('read state is account-specific and never moves backwards', async () => {
    const earlier = new Date(Date.now() - 120000).toISOString();
    const later = new Date(Date.now() - 60000).toISOString();
    const app = await setup({
        follows: [{ follower_id: 'viewer', followed_id: 'collector' }, { follower_id: 'second', followed_id: 'collector' }],
        cards: [{ owner_id: 'collector', created_at: later }]
    });
    app.markViewed('viewer', later);
    app.markViewed('viewer', earlier);
    await app.flush();
    assert.equal(app.values.get('community-feed-seen:viewer'), later);
    app.signIn('second');
    await app.flush();
    assert.equal(app.link.badge.hidden, false);
    app.signIn(null);
    assert.equal(app.link.badge.hidden, true);
    assert.equal(app.link.hidden, true);
});

test('a failed check is exposed rather than reported as a successful check', async () => {
    const app = await setup();
    app.setFail(true);
    app.listeners.visibilitychange();
    await app.flush();
    assert.equal(app.link.attributes['aria-label'], 'Feed, unable to check for new cards');
    assert.match(app.link.title, /Unable to check/);
});

test('checks every batch of followed collectors and responds to another tab', async () => {
    const created = new Date(Date.now() - 60000).toISOString();
    const follows = Array.from({ length: 51 }, (_, index) => ({
        follower_id: 'viewer', followed_id: `collector-${index}`
    }));
    const app = await setup({
        follows,
        cards: [{ owner_id: 'collector-50', created_at: created }]
    });
    assert.equal(app.link.badge.hidden, false);
    app.values.set('community-feed-seen:viewer', created);
    app.listeners.storage({ key: 'community-feed-seen:viewer' });
    await app.flush();
    assert.equal(app.link.badge.hidden, true);
});
