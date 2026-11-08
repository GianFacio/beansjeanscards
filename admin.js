// Verify the signed-in account before exposing card management tools.
const accessRequired = document.querySelector('#admin-access-required');
const dashboard = document.querySelector('#admin-dashboard');
const cardForm = document.querySelector('#card-form');
const signOutButton = document.querySelector('#admin-sign-out');
const message = document.querySelector('#admin-message');
const returnTo = getSafeReturnTarget();
let supabaseClient;

function getSafeReturnTarget() {
    const requested = new URLSearchParams(window.location.search).get('returnTo');
    if (!requested || requested.startsWith('//') || !requested.startsWith('/')) return 'index.html';
    const path = requested.split(/[?#]/, 1)[0];
    if (path.split('/').includes('..') || !/\/(?:index|collection)\.html$/.test(path)) return 'index.html';
    return requested;
}

document.querySelector('#cancel-add-card').href = returnTo;

window.setupCardPhotoSlotInputs(document.querySelector('#card-form'));

function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('store-error', isError);
}

async function verifyStoreAdmin(user) {
    const { data, error } = await supabaseClient.rpc('is_store_admin');
    if (error) throw error;
    if (!data) {
        window.setStoreAdminAccess(false);
        accessRequired.hidden = false;
        showMessage('This account is signed in but does not have admin access.', true);
        return;
    }

    accessRequired.hidden = true;
    dashboard.hidden = false;
    window.setStoreAdminAccess(true);
    if (user?.email) dashboard.querySelector('h1').title = `Signed in as ${user.email}`;
}

signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try {
        const confirmed = await window.confirmStoreAction({
            title: 'Sign out?',
            message: 'Are you sure you want to sign out?',
            confirmLabel: 'Sign out'
        });
        if (!confirmed) return;
        const { error } = await window.getStoreSupabaseClient().auth.signOut();
        if (error) throw error;
        window.location.assign('index.html');
    } catch (error) {
        showMessage(`Unable to sign out: ${error.message}`, true);
    } finally {
        signOutButton.disabled = false;
    }
});

cardForm.addEventListener('submit', async event => {
    event.preventDefault();
    showMessage('Saving card…');
    const cardId = document.querySelector('#card-id').value.trim();
    if (!/^[a-z0-9-]+$/.test(cardId)) {
        showMessage('Use only lowercase letters, numbers, and hyphens for the card ID.', true);
        return;
    }

    const frontFile = document.querySelector('#card-front-photo').files[0];
    const backFile = document.querySelector('#card-back-photo').files[0];
    if (!frontFile) {
        showMessage('Choose a front photo for the new card.', true);
        return;
    }

    let uploadedPhotos = [];
    let cardSaved = false;
    try {
        const detail = document.querySelector('#card-detail').value.trim();
        uploadedPhotos.push(await window.uploadCardPhoto(cardId, frontFile, 'Front', detail));
        if (backFile) uploadedPhotos.push(await window.uploadCardPhoto(cardId, backFile, 'Back', detail));
        const rotationEnabled = document.querySelector('#card-rotation-enabled').checked;
        if (rotationEnabled) {
            uploadedPhotos = uploadedPhotos.map(photo => ({ ...photo, rotationEnabled: true }));
        }
        const { error } = await supabaseClient.from('cards').insert({
            id: cardId,
            name: document.querySelector('#card-name').value.trim(),
            detail,
            grade: document.querySelector('#card-grade').value,
            title: document.querySelector('#card-title').value.trim(),
            photos: uploadedPhotos,
            sales: []
        });
        if (error) throw error;
        cardSaved = true;
        showMessage('Card added. Returning to your collection…');
        window.location.assign(returnTo);
    } catch (error) {
        if (!cardSaved && uploadedPhotos.length) {
            try {
                await window.removeManagedCardPhotos(uploadedPhotos);
            } catch (cleanupError) {
                console.error('Unable to clean up uploaded card photos:', cleanupError);
            }
        }
        showMessage(`Unable to add card: ${error.message}`, true);
    }
});

(async function restoreAdminSession() {
    try {
        supabaseClient = window.getStoreSupabaseClient();
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (data.session) {
            await verifyStoreAdmin(data.session.user);
        } else {
            accessRequired.hidden = false;
            showMessage('');
        }
    } catch (error) {
        accessRequired.hidden = false;
        showMessage(error.message, true);
    }
})();
