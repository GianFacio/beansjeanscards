// Search public profiles without exposing account emails.
(async function () {
    if (new URLSearchParams(window.location.search).get('favorites') === '1') return;
    const searchForm = document.querySelector('#community-search-form');
    const searchInput = document.querySelector('#community-search-input');
    const results = document.querySelector('#community-results');
    const notice = document.querySelector('#community-notice');
    const empty = document.querySelector('#community-empty');
    let activeSearch = 0;

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.classList.toggle('store-error', isError);
        notice.hidden = !message;
    }

    function profileInitials(profile) {
        return (profile.display_name || profile.username).slice(0, 1).toUpperCase();
    }

    async function renderProfiles(profiles) {
        const cards = await Promise.all(profiles.map(async profile => {
            let avatar = `<span class="community-avatar">${window.escapeStoreHTML(profileInitials(profile))}</span>`;
            if (profile.avatar_path) {
                const { data, error } = await window.communityClient.storage
                    .from('community-avatars')
                    .createSignedUrl(profile.avatar_path, 3600);
                if (error) throw error;
                avatar = `<img class="community-avatar" src="${window.escapeStoreHTML(data.signedUrl)}" alt="">`;
            }

            return `<a class="community-profile-card" href="profile.html?user=${encodeURIComponent(profile.username)}">
                ${avatar}
                <span class="community-profile-card-copy">
                    <strong>${window.escapeStoreHTML(profile.display_name)}</strong>
                    <span class="community-username">@${window.escapeStoreHTML(profile.username)}</span>
                    <span class="community-profile-tag">Card collector</span>
                </span>
                <span class="community-profile-open" aria-hidden="true">&rarr;</span>
            </a>`;
        }));
        results.innerHTML = cards.join('');
        empty.hidden = profiles.length > 0;
    }

    async function searchProfiles(value = '') {
        const username = value.trim().replace(/^@/, '').toLowerCase();
        if (username && !/^[a-z0-9_]{1,24}$/.test(username)) {
            showNotice('Search with a username using letters, numbers, or underscores.', true);
            results.replaceChildren();
            empty.hidden = true;
            return;
        }
        const requestId = ++activeSearch;
        showNotice('Loading collectors…');
        empty.hidden = true;
        results.replaceChildren();

        try {
            const { data, error } = await window.communityClient.rpc('search_community_profiles', {
                search_term: username
            });
            if (error) throw error;
            if (requestId !== activeSearch) return;
            await renderProfiles(data || []);
            showNotice('');
        } catch (error) {
            if (requestId !== activeSearch) return;
            showNotice(`Unable to load public profiles: ${window.communityErrorMessage(error)}`, true);
        }
    }

    searchForm.addEventListener('submit', event => {
        event.preventDefault();
        searchProfiles(searchInput.value);
    });

    let searchDelay;
    searchInput.addEventListener('input', () => {
        window.clearTimeout(searchDelay);
        searchDelay = window.setTimeout(() => searchProfiles(searchInput.value), 250);
    });

    try {
        await window.communityReady;
        await searchProfiles();
        if (new URLSearchParams(window.location.search).get('signin') === '1') {
            if (document.querySelector('#community-join-trigger').hidden) {
                window.location.assign(document.querySelector('#community-my-profile').href);
            } else {
                document.querySelector('#community-join-trigger').click();
            }
        }
    } catch (error) {
        showNotice(`Unable to connect to the community: ${error.message}`, true);
    }
})();
