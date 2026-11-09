// Favorites are private to the signed-in member; card details remain public.
(function () {
    const client = window.communityClient;
    const favoriteIds = new Set();
    let userId = null;
    let loadError = null;

    function errorMessage(error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            return 'Favorites are not set up yet. Run sql/supabase-community-favorites.sql in the Supabase SQL Editor.';
        }
        return error.message || String(error);
    }

    async function load(session) {
        userId = session?.user?.id || null;
        favoriteIds.clear();
        loadError = null;
        if (!userId) return;
        const { data, error } = await client.from('community_favorites').select('card_id').eq('user_id', userId);
        if (error) {
            loadError = errorMessage(error);
            throw new Error(loadError);
        }
        data.forEach(item => favoriteIds.add(item.card_id));
    }

    async function refreshCounts(cardIds, container) {
        if (!userId || !cardIds.length) return;
        const { data, error } = await client.rpc('community_favorite_counts', { requested_card_ids: cardIds });
        if (error) {
            if (error.code === 'PGRST202') {
                throw new Error('Favorite counts are not set up yet. Run sql/supabase-community-favorite-counts.sql in the Supabase SQL Editor.');
            }
            throw new Error(errorMessage(error));
        }
        const counts = new Map(data.map(row => [row.card_id, row.favorite_count]));
        container.querySelectorAll('[data-favorite-count]').forEach(element => {
            const id = element.dataset.favoriteCount;
            if (!cardIds.includes(id)) return;
            const count = counts.get(id) ?? 0;
            element.textContent = count === 0 ? '' : String(count);
            element.setAttribute('aria-label', `${count} ${count === 1 ? 'favorite' : 'favorites'}`);
        });
    }

    function cardMarkup(card, imageUrl, link = '', owner = null) {
        const escape = window.escapeStoreHTML;
        const name = escape(card.name);
        const id = escape(card.id);
        const favorite = favoriteIds.has(card.id);
        const open = link
            ? `<a class="community-card-open" href="${escape(link)}" aria-label="View ${name}">`
            : `<button type="button" class="community-card-open" data-open-card="${id}" aria-label="View ${name}">`;
        const close = link ? '</a>' : '</button>';
        const gradeClass = card.grade === 'Raw' ? 'grade-badge-raw' : card.grade === 'PSA 10' ? 'grade-badge-psa10' : 'grade-badge-graded';
        const ownerLink = owner
            ? `<a class="favorite-card-owner" href="profile.html?user=${encodeURIComponent(owner.id)}">@${escape(owner.username)}</a>`
            : '';
        return `<article class="product community-card" data-grade="${escape(card.grade)}" data-card-id="${id}">
            ${open}<span class="community-card-image">
                <img src="${escape(imageUrl)}" alt="${escape(card.detail || card.name)} card" loading="lazy" decoding="async">
            </span>${close}
            <div class="community-card-badge-row">
                <span class="grade-badge ${gradeClass}">${escape(card.grade)}</span>
                <span class="favorite-control"${userId ? '' : ' hidden'}>
                    <span class="favorite-count" data-favorite-count="${id}" aria-label="Favorite count unavailable">–</span>
                    <button class="favorite-button" type="button" data-favorite-card="${id}" aria-pressed="${favorite}" aria-label="${favorite ? 'Remove' : 'Add'} ${name} ${favorite ? 'from' : 'to'} favorites" title="${favorite ? 'Remove from' : 'Add to'} favorites">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.1 13C.2 9.3 2.4 3.5 7 3.5c2.1 0 3.9 1.1 5 2.6 1.1-1.5 2.9-2.6 5-2.6 4.6 0 6.8 5.8 2.9 9.5z"/></svg>
                    </button>
                </span>
            </div>
            ${open}<span class="product-meta"><span class="detail">${escape(card.detail || '')}</span></span>
                <span class="community-card-title">${name}</span>${close}
            ${ownerLink}
        </article>`;
    }

    async function toggle(button) {
        if (!userId) {
            throw new Error('Sign in to manage your favorites.');
        }
        if (loadError) throw new Error(loadError);
        const cardId = button.dataset.favoriteCard;
        const removing = favoriteIds.has(cardId);
        button.disabled = true;
        try {
            const result = removing
                ? await client.from('community_favorites').delete().eq('user_id', userId).eq('card_id', cardId)
                : await client.from('community_favorites').insert({ user_id: userId, card_id: cardId });
            if (result.error) throw result.error;
            if (removing) favoriteIds.delete(cardId);
            else favoriteIds.add(cardId);
            button.setAttribute('aria-pressed', String(!removing));
            const cardName = button.closest('article').querySelector('.community-card-title').textContent;
            button.setAttribute('aria-label', `${removing ? 'Add' : 'Remove'} ${cardName} ${removing ? 'to' : 'from'} favorites`);
            button.title = removing ? 'Add to favorites' : 'Remove from favorites';
            return !removing;
        } catch (error) {
            throw new Error(errorMessage(error));
        } finally {
            button.disabled = false;
        }
    }

    window.communityFavorites = { load, cardMarkup, toggle, refreshCounts };
})();
