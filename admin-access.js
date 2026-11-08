// Keep admin-only controls in sync with the authenticated admin session.
function setStoreAdminAccess(isAdmin) {
    window.storeAdminIsVerified = isAdmin;
    const addCardToggle = document.querySelector('#add-card-toggle');
    if (addCardToggle) addCardToggle.hidden = !isAdmin;
    window.dispatchEvent(new CustomEvent('store-admin-access-changed', { detail: { isAdmin } }));
}

window.setStoreAdminAccess = setStoreAdminAccess;

const addCardToggle = document.querySelector('#add-card-toggle');
if (addCardToggle) {
    addCardToggle.addEventListener('click', () => {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`admin.html?returnTo=${encodeURIComponent(returnTo)}`);
    });
}

const adminClient = window.getStoreSupabaseClient();
adminClient.auth.onAuthStateChange((_event, session) => {
    if (!session) {
        setStoreAdminAccess(false);
        return;
    }

    window.setTimeout(async () => {
        try {
            const { data, error } = await adminClient.rpc('is_store_admin');
            if (error) throw error;
            setStoreAdminAccess(data === true);
        } catch (error) {
            setStoreAdminAccess(false);
            console.error('Unable to verify admin access:', error);
        }
    }, 0);
});

(async function restoreAdminAccess() {
    try {
        const { data: sessionData, error: sessionError } = await adminClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
            setStoreAdminAccess(false);
            return;
        }

        const { data, error } = await adminClient.rpc('is_store_admin');
        if (error) throw error;
        setStoreAdminAccess(data === true);
    } catch (error) {
        setStoreAdminAccess(false);
        console.error('Unable to verify admin access:', error);
    }
})();
