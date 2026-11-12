// Update member navigation when the session changes.
(async function () {
    const siteBrand = document.querySelector('.site-brand');
    if (!siteBrand) return;
    const feedLinks = [...document.querySelectorAll('[data-following-nav]')];
    const badgeKey = userId => `community-feed-seen:${userId}`;
    const recentWindow = 7 * 24 * 60 * 60 * 1000;
    const chunkSize = 50;
    let userId = null;
    let badgeRequest = 0;
    let client;

    feedLinks.forEach(link => {
        const badge = document.createElement('span');
        badge.className = 'feed-notifications-badge';
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
        link.append(badge);
    });

    function setFeedBadge(unread, error = false) {
        feedLinks.forEach(link => {
            link.querySelector('.feed-notifications-badge').hidden = !unread;
            link.setAttribute('aria-label', error ? 'Feed, unable to check for new cards' : unread ? 'Feed, new cards' : 'Feed');
            link.title = error ? 'Unable to check for new cards. Refresh the page to try again.' : '';
        });
    }

    async function refreshFeedBadge() {
        if (!userId || !feedLinks.length) return;
        const request = ++badgeRequest;
        const currentUser = userId;
        try {
            const lastSeen = localStorage.getItem(badgeKey(currentUser));
            const cutoff = lastSeen || new Date(Date.now() - recentWindow).toISOString();
            const { data: follows, error: followsError } = await client.from('community_follows')
                .select('followed_id').eq('follower_id', currentUser);
            if (followsError) throw followsError;
            let unread = false;
            for (let offset = 0; offset < follows.length; offset += chunkSize) {
                let query = client.from('community_cards').select('id')
                    .in('owner_id', follows.slice(offset, offset + chunkSize).map(follow => follow.followed_id));
                query = lastSeen ? query.gt('created_at', cutoff) : query.gte('created_at', cutoff);
                const { data, error } = await query.limit(1);
                if (error) throw error;
                if (data.length) {
                    unread = true;
                    break;
                }
            }
            if (request === badgeRequest && userId === currentUser) setFeedBadge(unread);
        } catch (error) {
            if (request !== badgeRequest || userId !== currentUser) return;
            console.error('Unable to check for new feed cards:', error);
            setFeedBadge(false, true);
        }
    }

    window.communityFeedBadge = {
        markViewed(viewerId, newestCreatedAt) {
            if (!newestCreatedAt) return;
            const key = badgeKey(viewerId);
            const previous = localStorage.getItem(key);
            if (!previous || new Date(newestCreatedAt) > new Date(previous)) {
                localStorage.setItem(key, newestCreatedAt);
            }
            refreshFeedBadge();
        }
    };

    function updateProfileLink(session) {
        userId = session?.user?.id || null;
        ++badgeRequest;
        setFeedBadge(false);
        siteBrand.href = session?.user
            ? `profile.html?user=${encodeURIComponent(session.user.id)}`
            : 'index.html';
        document.querySelectorAll('[data-favorites-nav], [data-following-nav]').forEach(link => {
            link.hidden = !session?.user;
        });
        document.querySelectorAll('[data-signin-nav]').forEach(link => {
            link.hidden = Boolean(session?.user);
        });
        if (userId) setTimeout(refreshFeedBadge, 0);
    }

    try {
        client = window.getStoreSupabaseClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        updateProfileLink(data.session);
        client.auth.onAuthStateChange((_event, session) => updateProfileLink(session));
        window.addEventListener('community-follow-changed', refreshFeedBadge);
        window.addEventListener('storage', event => {
            if (userId && event.key === badgeKey(userId)) refreshFeedBadge();
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshFeedBadge();
        });
        setInterval(() => {
            if (!document.hidden) refreshFeedBadge();
        }, 60000);
    } catch (error) {
        console.error('Unable to set the member profile link:', error);
    }
})();
