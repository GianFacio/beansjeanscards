(async function () {
    if (new URLSearchParams(window.location.search).get('favorites') !== '1') return;

    document.querySelector('#collectors-page').hidden = true;
    document.querySelector('#favorites-page').hidden = false;
    document.querySelector('a[href="community.html"]').removeAttribute('aria-current');
    document.querySelector('#favorites-nav').setAttribute('aria-current', 'page');
    document.title = 'My Favorites | Beans Jeans Card Club';

    const notice = document.querySelector('#favorites-notice');
    const grid = document.querySelector('#favorites-grid');
    const empty = document.querySelector('#favorites-empty');
    const signIn = document.querySelector('#favorites-signin');
    let signedOut = false;
    signIn.addEventListener('click', () => document.querySelector('#community-join-trigger').click());

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.hidden = !message;
        notice.classList.toggle('store-error', isError);
    }

    window.addEventListener('community-session-changed', event => {
        if (!event.detail.session?.user) {
            signedOut = true;
            grid.replaceChildren();
            empty.hidden = true;
            signIn.hidden = false;
            showNotice('Sign in to save and view your favorite cards.');
        }
    });

    grid.addEventListener('click', async event => {
        const button = event.target.closest('[data-favorite-card], [data-like-card]');
        if (!button) return;
        try {
            const cardId = button.closest('article').dataset.cardId;
            const isLike = 'likeCard' in button.dataset;
            const favorited = await window.communityFavorites.toggle(button);
            if (isLike) await window.communityFavorites.refreshCounts([cardId], grid);
            if (!favorited && 'favoriteCard' in button.dataset) button.closest('article').remove();
            empty.hidden = grid.children.length > 0;
            showNotice('');
        } catch (error) {
            showNotice(`Unable to update favorites: ${error.message}`, true);
        }
    });

    try {
        const session = await window.communityReady;
        if (!session?.user) {
            showNotice('Sign in to save and view your favorite cards.');
            signIn.hidden = false;
            return;
        }
        showNotice('Loading favorites…');
        await window.communityFavorites.load(session);
        const { data, error } = await window.communityClient.from('community_favorites')
            .select('card:community_cards(*, owner:community_profiles!owner_id(username))')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        const cards = data.map(item => item.card).filter(Boolean);
        const storeIds = cards.map(card => card.source_store_card_id).filter(Boolean);
        const storePhotos = new Map();
        if (storeIds.length) {
            const { data: storeCards, error: storeError } = await window.communityClient.from('cards')
                .select('id, photos').in('id', storeIds);
            if (storeError) throw storeError;
            storeCards.forEach(card => storePhotos.set(card.id, card.photos?.find(photo => photo?.src)?.src));
        }

        if (signedOut) return;
        grid.innerHTML = cards.map(card => {
            let imageUrl;
            if (card.photo_path || card.back_photo_path) {
                const path = card.photo_path || card.back_photo_path;
                imageUrl = window.communityClient.storage.from('community-card-photos').getPublicUrl(path).data.publicUrl;
            } else {
                imageUrl = storePhotos.get(card.source_store_card_id);
            }
            if (!imageUrl) throw new Error(`The photo for ${card.name} could not be loaded.`);
            if (!card.owner?.username) throw new Error(`The collector for ${card.name} could not be loaded.`);
            const link = `profile.html?user=${encodeURIComponent(card.owner_id)}&card=${encodeURIComponent(card.id)}`;
            return window.communityFavorites.cardMarkup(card, imageUrl, link, { id: card.owner_id, username: card.owner.username });
        }).join('');
        empty.hidden = cards.length > 0;
        try {
            await window.communityFavorites.refreshCounts(cards.map(card => card.id), grid);
            if (!signedOut) showNotice('');
        } catch (error) {
            if (!signedOut) showNotice(`Unable to load favorite counts: ${error.message}`, true);
        }
    } catch (error) {
        if (signedOut) return;
        showNotice(`Unable to load favorites: ${window.communityErrorMessage(error)}`, true);
    }
})();
