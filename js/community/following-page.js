// Feed of the newest cards added by collectors the signed-in member follows.
(async function () {
    if (new URLSearchParams(window.location.search).get('following') !== '1') return;

    document.querySelector('#collectors-page').hidden = true;
    document.querySelector('#following-page').hidden = false;
    document.querySelector('a[href="community.html"]').removeAttribute('aria-current');
    document.querySelector('#following-nav').setAttribute('aria-current', 'page');
    document.title = 'Feed | Beans Jeans Card Club';

    const client = window.communityClient;
    const notice = document.querySelector('#following-notice');
    const feed = document.querySelector('#following-feed');
    const empty = document.querySelector('#following-empty');
    const emptyText = document.querySelector('#following-empty-text');
    const findLink = document.querySelector('#following-find');
    const signIn = document.querySelector('#following-signin');
    const idChunkSize = 50;
    const feedLimit = 60;
    let signedOut = false;
    signIn.addEventListener('click', () => document.querySelector('#community-join-trigger').click());

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.hidden = !message;
        notice.classList.toggle('store-error', isError);
    }

    function showEmpty(message, canFind) {
        emptyText.textContent = message;
        findLink.hidden = !canFind;
        empty.hidden = false;
    }

    window.addEventListener('community-session-changed', event => {
        if (!event.detail.session?.user) {
            signedOut = true;
            feed.replaceChildren();
            empty.hidden = true;
            signIn.hidden = false;
            showNotice('Sign in to see new cards from collectors you follow.');
        }
    });

    feed.addEventListener('click', async event => {
        const button = event.target.closest('[data-favorite-card], [data-like-card]');
        if (!button) return;
        try {
            await window.communityFavorites.toggle(button);
            await window.communityFavorites.refreshCounts([button.closest('article').dataset.cardId], feed);
            showNotice('');
        } catch (error) {
            showNotice(`Unable to update favorites: ${error.message}`, true);
        }
    });

    function groupLabel(createdAt) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const created = new Date(createdAt);
        if (created >= startOfToday) return 'Today';
        const weekAgo = new Date(startOfToday);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return created >= weekAgo ? 'Earlier this week' : 'Earlier';
    }

    async function loadFeedCards(ownerIds) {
        const cards = [];
        for (let offset = 0; offset < ownerIds.length; offset += idChunkSize) {
            const { data, error } = await client.from('community_cards')
                .select('*, owner:community_profiles!owner_id(username)')
                .in('owner_id', ownerIds.slice(offset, offset + idChunkSize))
                .order('created_at', { ascending: false })
                .limit(feedLimit);
            if (error) throw error;
            cards.push(...data);
        }
        return cards;
    }

    async function loadStorePhotos(cards) {
        const ids = [...new Set(cards.map(card => card.source_store_card_id).filter(Boolean))];
        const photos = new Map();
        for (let offset = 0; offset < ids.length; offset += idChunkSize) {
            const { data, error } = await client.from('cards')
                .select('id, photos').in('id', ids.slice(offset, offset + idChunkSize));
            if (error) throw error;
            data.forEach(card => photos.set(card.id, card.photos?.find(photo => photo?.src)?.src));
        }
        return photos;
    }

    function cardMarkup(card, storePhotos) {
        const path = card.photo_path || card.back_photo_path;
        const imageUrl = path
            ? client.storage.from('community-card-photos').getPublicUrl(path).data.publicUrl
            : storePhotos.get(card.source_store_card_id);
        if (!imageUrl) throw new Error(`The photo for ${card.name} could not be loaded.`);
        if (!card.owner?.username) throw new Error(`The collector for ${card.name} could not be loaded.`);
        const link = `profile.html?user=${encodeURIComponent(card.owner_id)}&card=${encodeURIComponent(card.id)}`;
        return window.communityFavorites.cardMarkup(card, imageUrl, link, { id: card.owner_id, username: card.owner.username });
    }

    function renderFeed(cards, storePhotos) {
        const groups = new Map();
        for (const card of cards) {
            const label = groupLabel(card.created_at);
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(card);
        }
        feed.innerHTML = [...groups].map(([label, groupCards]) => `
            <h2 class="feed-day">${window.escapeStoreHTML(label)}</h2>
            <section class="products community-card-grid">${groupCards.map(card => cardMarkup(card, storePhotos)).join('')}</section>`).join('');
    }

    try {
        const session = await window.communityReady;
        if (!session?.user) {
            showNotice('Sign in to see new cards from collectors you follow.');
            signIn.hidden = false;
            return;
        }
        showNotice('Loading new cards…');
        await window.communityFavorites.load(session);
        await window.communityFollows.load(session);
        const ownerIds = window.communityFollows.ids();
        if (ownerIds.length === 0) {
            showNotice('');
            showEmpty("You're not following anyone yet. Follow a collector to see their new cards here.", true);
            return;
        }
        const allCards = await loadFeedCards(ownerIds);
        const storePhotos = await loadStorePhotos(allCards);
        const cards = allCards
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, feedLimit);
        if (signedOut) return;
        if (cards.length === 0) {
            showNotice('');
            showEmpty('No cards from the collectors you follow yet.', false);
            return;
        }
        renderFeed(cards, storePhotos);
        window.communityFeedBadge.markViewed(session.user.id, cards[0].created_at);
        try {
            await window.communityFavorites.refreshCounts(cards.map(card => card.id), feed);
            if (!signedOut) showNotice('');
        } catch (error) {
            if (!signedOut) showNotice(`Unable to load favorite counts: ${error.message}`, true);
        }
    } catch (error) {
        if (signedOut) return;
        showNotice(`Unable to load your feed: ${window.communityErrorMessage(error)}`, true);
    }
})();
