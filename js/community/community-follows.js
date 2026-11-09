// Following is private to the signed-in member; only follower and following counts are public.
(function () {
    const client = window.communityClient;
    const followingIds = new Set();
    let userId = null;
    let loadError = null;

    function errorMessage(error) {
        if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202') {
            return 'Following is not set up yet. Run sql/supabase-community-follows.sql in the Supabase SQL Editor.';
        }
        return error.message || String(error);
    }

    async function load(session) {
        userId = session?.user?.id || null;
        followingIds.clear();
        loadError = null;
        if (!userId) return;
        const { data, error } = await client.from('community_follows').select('followed_id').eq('follower_id', userId);
        if (error) {
            loadError = errorMessage(error);
            throw new Error(loadError);
        }
        data.forEach(item => followingIds.add(item.followed_id));
    }

    async function counts(profileIds) {
        const { data, error } = await client.rpc('community_follow_counts', { requested_profile_ids: profileIds });
        if (error) throw new Error(errorMessage(error));
        return new Map(data.map(row => [row.profile_id, {
            followers: Number(row.follower_count),
            following: Number(row.following_count)
        }]));
    }

    function label(button, following, username) {
        button.setAttribute('aria-pressed', String(following));
        button.textContent = following ? 'Following' : 'Follow';
        button.setAttribute('aria-label', `${following ? 'Unfollow' : 'Follow'} @${username}`);
    }

    function buttonMarkup(profile) {
        if (!userId || profile.id === userId || loadError) return '';
        const escape = window.escapeStoreHTML;
        const following = followingIds.has(profile.id);
        return `<button type="button" class="follow-button" data-follow-user="${escape(profile.id)}" data-follow-name="${escape(profile.username)}" aria-pressed="${following}" aria-label="${following ? 'Unfollow' : 'Follow'} @${escape(profile.username)}">${following ? 'Following' : 'Follow'}</button>`;
    }

    async function toggle(button) {
        if (!userId) throw new Error('Sign in to follow collectors.');
        if (loadError) throw new Error(loadError);
        const profileId = button.dataset.followUser;
        const removing = followingIds.has(profileId);
        document.querySelectorAll(`[data-follow-user="${profileId}"]`).forEach(item => { item.disabled = true; });
        try {
            const result = removing
                ? await client.from('community_follows').delete().eq('follower_id', userId).eq('followed_id', profileId)
                : await client.from('community_follows').insert({ follower_id: userId, followed_id: profileId });
            if (result.error) throw result.error;
            if (removing) followingIds.delete(profileId);
            else followingIds.add(profileId);
            document.querySelectorAll(`[data-follow-user="${profileId}"]`).forEach(item => {
                label(item, !removing, item.dataset.followName);
            });
            window.dispatchEvent(new CustomEvent('community-follow-changed', { detail: { profileId, following: !removing } }));
            return !removing;
        } catch (error) {
            throw new Error(errorMessage(error));
        } finally {
            document.querySelectorAll(`[data-follow-user="${profileId}"]`).forEach(item => { item.disabled = false; });
        }
    }

    function bind(container, onError) {
        container.addEventListener('click', async event => {
            const button = event.target.closest('[data-follow-user]');
            if (!button || !container.contains(button)) return;
            event.preventDefault();
            try {
                await toggle(button);
                onError('');
            } catch (error) {
                onError(`Unable to update following: ${error.message}`);
            }
        });
    }

    async function avatarMarkup(profile) {
        const escape = window.escapeStoreHTML;
        if (profile.avatar_path) {
            const { data, error } = await client.storage.from('community-avatars').createSignedUrl(profile.avatar_path, 3600);
            if (error) throw error;
            return `<img class="community-avatar" src="${escape(data.signedUrl)}" alt="">`;
        }
        const name = (profile.display_name || profile.username).trim();
        return `<span class="community-avatar">${escape(name.slice(0, 1).toUpperCase())}</span>`;
    }

    // Lists are limited by row-level security to the signed-in member's own followers and follows.
    async function list(kind) {
        if (!userId) throw new Error('Sign in to see your followers.');
        const ownColumn = kind === 'following' ? 'follower_id' : 'followed_id';
        const otherColumn = kind === 'following' ? 'followed_id' : 'follower_id';
        const { data, error } = await client.from('community_follows')
            .select(`created_at, profile:community_profiles!${otherColumn}(id, username, display_name, avatar_path)`)
            .eq(ownColumn, userId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(errorMessage(error));
        return data.map(item => item.profile).filter(Boolean);
    }

    window.communityFollows = {
        load,
        counts,
        buttonMarkup,
        toggle,
        bind,
        avatarMarkup,
        list,
        errorMessage,
        ids: () => [...followingIds]
    };
})();
