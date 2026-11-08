// Share community authentication and account controls across community pages.
const communityClient = window.getStoreSupabaseClient();
const communityAuthDialog = document.querySelector('#community-auth-dialog');
const communitySignInForm = document.querySelector('#community-signin-form');
const communitySignUpForm = document.querySelector('#community-signup-form');
const communityAuthTitle = document.querySelector('#community-auth-title');
const communityAccountButton = document.querySelector('#community-join-trigger');
const communityMyProfile = document.querySelector('#community-my-profile');
const communitySignOut = document.querySelector('#community-sign-out');
window.communitySignOutInProgress = false;

function showCommunityAuthMessage(form, message, isError = false) {
    const target = form.querySelector('.community-form-message');
    target.textContent = message;
    target.hidden = !message;
    target.classList.toggle('store-error', isError);
}

async function ensureCommunitySetup() {
    const { error } = await communityClient.from('community_profiles').select('id').limit(1);
    if (error) throw new Error(window.communityErrorMessage(error));
}

async function communitySignInError(error) {
    const response = error.context;
    let responseBody;
    if (response && typeof response.clone === 'function' && typeof response.clone().json === 'function') {
        try {
            responseBody = await response.clone().json();
        } catch (parseError) {
            console.error('Unable to read the username sign-in error response:', parseError);
        }
    }

    const detail = responseBody?.error || responseBody?.message || error.message;
    const status = response?.status;
    if (status === 404 || /function.+not found/i.test(detail)) {
        return 'Username sign-in is not deployed yet. Run the community database setup, then deploy supabase/functions/community-sign-in and configure its Supabase secrets.';
    }
    if (status === 401) return 'Invalid username or password.';
    if (/community database setup is missing/i.test(detail)) {
        return 'Community database setup is missing. Run supabase-community-setup.sql in the Supabase SQL Editor.';
    }
    if (/community_profiles|schema cache/i.test(detail)) {
        return 'Community database setup is missing. Run supabase-community-setup.sql in the Supabase SQL Editor.';
    }
    if (/non-2xx status code/i.test(detail)) {
        return 'Username sign-in could not reach a working function. Run supabase-community-setup.sql, deploy supabase/functions/community-sign-in, and configure its Supabase secrets.';
    }
    return detail;
}

function setCommunityAuthMode(mode) {
    const signingUp = mode === 'signup';
    communitySignInForm.hidden = signingUp;
    communitySignUpForm.hidden = !signingUp;
    communityAuthTitle.textContent = signingUp ? 'Create your account' : 'Sign In';
    document.querySelectorAll('.community-password-toggle').forEach(toggle => {
        const password = document.getElementById(toggle.getAttribute('aria-controls'));
        password.type = 'password';
        toggle.setAttribute('aria-label', 'Show password');
        toggle.title = 'Show password';
        toggle.setAttribute('aria-pressed', 'false');
    });
    showCommunityAuthMessage(communitySignInForm, '');
    showCommunityAuthMessage(communitySignUpForm, '');
}

function updateCommunityAccountControls(session) {
    const isSignedIn = Boolean(session?.user);
    communityAccountButton.hidden = isSignedIn;
    communityMyProfile.hidden = !isSignedIn;
    communitySignOut.hidden = !isSignedIn;
    document.querySelectorAll('.community-join-callout').forEach(callout => {
        callout.hidden = isSignedIn;
    });
    if (isSignedIn) {
        communityMyProfile.href = `profile.html?user=${encodeURIComponent(session.user.id)}`;
    }
}

document.querySelector('[data-close-community-auth]').addEventListener('click', () => communityAuthDialog.close());
document.querySelectorAll('[data-switch-community-auth]').forEach(button => {
    button.addEventListener('click', () => setCommunityAuthMode(button.dataset.switchCommunityAuth));
});
document.querySelectorAll('[data-open-community-signup]').forEach(button => {
    button.addEventListener('click', () => {
        setCommunityAuthMode('signup');
        communityAuthDialog.showModal();
    });
});
communityAccountButton.addEventListener('click', () => {
    setCommunityAuthMode('signin');
    communityAuthDialog.showModal();
});

communitySignInForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = communitySignInForm.querySelector('[type="submit"]');
    button.disabled = true;
    showCommunityAuthMessage(communitySignInForm, 'Signing in…');

    try {
        await ensureCommunitySetup();
        const { data, error } = await communityClient.functions.invoke('community-sign-in', {
            body: {
                username: communitySignInForm.elements.username.value.trim().toLowerCase(),
                password: communitySignInForm.elements.password.value
            }
        });
        if (error) throw error;
        if (!data?.access_token || !data?.refresh_token) throw new Error('Sign-in is temporarily unavailable.');
        const { data: sessionData, error: sessionError } = await communityClient.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token
        });
        if (sessionError) throw sessionError;
        communityAuthDialog.close();
        communitySignInForm.reset();
        window.location.assign(`profile.html?user=${encodeURIComponent(sessionData.user.id)}`);
    } catch (error) {
        const message = error.context
            ? await communitySignInError(error)
            : error.message;
        showCommunityAuthMessage(communitySignInForm, `Unable to sign in: ${message}`, true);
    } finally {
        button.disabled = false;
    }
});

document.querySelectorAll('.community-password-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const password = document.getElementById(toggle.getAttribute('aria-controls'));
        const isVisible = password.type === 'text';
        password.type = isVisible ? 'password' : 'text';
        toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
        toggle.title = isVisible ? 'Show password' : 'Hide password';
        toggle.setAttribute('aria-pressed', String(!isVisible));
    });
});

communitySignUpForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = communitySignUpForm.querySelector('[type="submit"]');
    button.disabled = true;
    showCommunityAuthMessage(communitySignUpForm, 'Creating your account…');

    try {
        await ensureCommunitySetup();
        const username = communitySignUpForm.elements.username.value.trim().toLowerCase();
        const displayName = communitySignUpForm.elements.display_name.value.trim();
        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
            throw new Error('Use 3–24 letters, numbers, or underscores for your username.');
        }

        const options = { data: { username, display_name: displayName } };
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            options.emailRedirectTo = new URL('profile.html', window.location.href).href;
        }
        const { data, error } = await communityClient.auth.signUp({
            email: communitySignUpForm.elements.email.value.trim(),
            password: communitySignUpForm.elements.password.value,
            options
        });
        if (error) throw error;

        if (data.session) {
            communitySignUpForm.reset();
            window.location.assign(`profile.html?user=${encodeURIComponent(data.user.id)}`);
        } else {
            showCommunityAuthMessage(
                communitySignUpForm,
                'Account created. Check your email to confirm your address, then sign in.'
            );
        }
    } catch (error) {
        showCommunityAuthMessage(communitySignUpForm, `Unable to create account: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
});

communitySignOut.addEventListener('click', async () => {
    communitySignOut.disabled = true;
    try {
        const confirmed = await window.confirmStoreAction({
            title: 'Sign out?',
            message: 'Are you sure you want to sign out?',
            confirmLabel: 'Sign out'
        });
        if (!confirmed) return;
        window.communitySignOutInProgress = true;
        const { error } = await communityClient.auth.signOut();
        if (error) throw error;
        window.location.assign('index.html');
    } catch (error) {
        window.communitySignOutInProgress = false;
        window.alert(`Unable to sign out: ${error.message}`);
    } finally {
        communitySignOut.disabled = false;
    }
});

window.communityReady = (async () => {
    const { data, error } = await communityClient.auth.getSession();
    if (error) throw error;
    updateCommunityAccountControls(data.session);
    return data.session;
})();

communityClient.auth.onAuthStateChange((_event, session) => {
    updateCommunityAccountControls(session);
    window.dispatchEvent(new CustomEvent('community-session-changed', { detail: { session } }));
});

window.communityClient = communityClient;
window.showCommunityAuthMessage = showCommunityAuthMessage;
window.communityErrorMessage = error => {
    const detail = error.message || String(error);
    if (error.code === 'PGRST202' || error.code === 'PGRST205') {
        return `Community database setup is missing. Run supabase-community-setup.sql in the Supabase SQL Editor. ${detail}`;
    }
    return detail;
};
