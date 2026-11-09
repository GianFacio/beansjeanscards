// Follower and following counts, the Follow button, and the owner-only follow lists on a profile.
window.profileFollows = (function () {
    const stats = document.querySelector('#profile-follow-stats');
    const followersButton = document.querySelector('#profile-followers-count');
    const followingButton = document.querySelector('#profile-following-count');
    const slot = document.querySelector('#profile-follow-slot');
    const dialog = document.querySelector('#profile-follow-dialog');
    const title = document.querySelector('#profile-follow-title');
    const message = document.querySelector('#profile-follow-message');
    const list = document.querySelector('#profile-follow-list');
    let profile = null;
    let ownerView = false;
    let listRequest = 0;

    function setMessage(text, isError = false) {
        message.textContent = text;
        message.hidden = !text;
        message.classList.toggle('store-error', isError);
    }

    function paintCount(button, value, noun) {
        button.replaceChildren();
        const strong = document.createElement('strong');
        strong.textContent = String(value);
        button.append(strong, ` ${noun}`);
    }

    function setCardCount(value) {
        paintCount(document.querySelector('#profile-card-count'), value, value === 1 ? 'card' : 'cards');
        stats.hidden = false;
    }

    async function refreshCounts() {
        try {
            const counts = (await window.communityFollows.counts([profile.id])).get(profile.id)
                || { followers: 0, following: 0 };
            paintCount(followersButton, counts.followers, counts.followers === 1 ? 'follower' : 'followers');
            paintCount(followingButton, counts.following, 'following');
            stats.hidden = false;
        } catch (error) {
            console.warn(error.message);
        }
    }

    function renderFollowButton(signedIn) {
        slot.innerHTML = signedIn
            ? window.communityFollows.buttonMarkup(profile)
            : '<button type="button" class="follow-button" data-follow-signin>Follow</button>';
    }

    async function openList(kind) {
        const request = ++listRequest;
        title.textContent = kind === 'following' ? 'Following' : 'Followers';
        list.replaceChildren();
        setMessage('Loading…');
        if (!dialog.open) dialog.showModal();
        try {
            const profiles = await window.communityFollows.list(kind);
            const items = await Promise.all(profiles.map(async item => `
                <li>
                    <a class="community-profile-link" href="profile.html?user=${encodeURIComponent(item.username)}">
                        ${await window.communityFollows.avatarMarkup(item)}
                        <span class="community-profile-card-copy">
                            <strong>${window.escapeStoreHTML(item.display_name)}</strong>
                            <span class="community-username">@${window.escapeStoreHTML(item.username)}</span>
                        </span>
                    </a>
                    ${window.communityFollows.buttonMarkup(item)}
                </li>`));
            if (request !== listRequest) return;
            list.innerHTML = items.join('');
            setMessage(items.length ? '' : kind === 'following' ? "You're not following anyone yet." : 'No followers yet.');
        } catch (error) {
            if (request === listRequest) setMessage(`Unable to load this list: ${error.message}`, true);
        }
    }

    async function start(activeProfile, session, isOwner) {
        profile = activeProfile;
        ownerView = isOwner;
        const signedIn = Boolean(session?.user);
        followersButton.disabled = !ownerView;
        followingButton.disabled = !ownerView;
        refreshCounts();
        try {
            await window.communityFollows.load(session);
        } catch (error) {
            setMessage(error.message, true);
            console.warn(error.message);
        }
        if (!ownerView) renderFollowButton(signedIn);
    }

    followersButton.addEventListener('click', () => ownerView && openList('followers'));
    followingButton.addEventListener('click', () => ownerView && openList('following'));
    document.querySelector('#profile-follow-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });

    slot.addEventListener('click', event => {
        if (event.target.closest('[data-follow-signin]')) {
            document.querySelector('#community-join-trigger').click();
        }
    });
    window.communityFollows.bind(slot, text => setMessage(text, Boolean(text)));
    window.communityFollows.bind(list, text => setMessage(text, Boolean(text)));
    window.addEventListener('community-follow-changed', () => profile && refreshCounts());

    return { start, setCardCount };
})();
