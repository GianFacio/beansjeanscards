// Update member navigation when the session changes.
(async function () {
    const siteBrand = document.querySelector('.site-brand');
    if (!siteBrand) return;

    function updateProfileLink(session) {
        siteBrand.href = session?.user
            ? `profile.html?user=${encodeURIComponent(session.user.id)}`
            : 'index.html';
        document.querySelectorAll('[data-favorites-nav]').forEach(link => {
            link.hidden = !session?.user;
        });
    }

    try {
        const client = window.getStoreSupabaseClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        updateProfileLink(data.session);
        client.auth.onAuthStateChange((_event, session) => updateProfileLink(session));
    } catch (error) {
        console.error('Unable to set the member profile link:', error);
    }
})();
