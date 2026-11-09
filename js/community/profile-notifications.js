(function () {
    const client = window.communityClient;
    const button = document.querySelector('#profile-notifications-toggle');
    const badge = document.querySelector('#profile-notifications-badge');
    const dialog = document.querySelector('#profile-notifications');
    const message = document.querySelector('#profile-notifications-message');
    const status = document.querySelector('#profile-notifications-status');
    const list = document.querySelector('#profile-notifications-list');
    const pageSize = 200;
    let userId = null;
    let timer = null;
    let badgeRequest = 0;
    let dialogRequest = 0;

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.hidden = !text;
        message.classList.toggle('store-error', isError);
    }

    function describeError(error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
            return 'Notifications are not set up yet. Run sql/supabase-community-notifications.sql in the Supabase SQL Editor.';
        }
        return error.message || String(error);
    }

    async function refreshBadge() {
        if (!userId) return;
        const request = ++badgeRequest;
        try {
            const { count, error } = await client.from('community_favorite_notifications')
                .select('id', { count: 'exact', head: true })
                .eq('recipient_id', userId).eq('is_read', false);
            if (request !== badgeRequest || !userId) return;
            if (error) throw error;
            badge.hidden = count === 0;
            button.setAttribute('aria-label', count ? 'Notifications, new alerts' : 'Notifications');
            status.hidden = true;
            status.textContent = '';
        } catch (error) {
            if (request !== badgeRequest || !userId) return;
            console.error('Unable to check notifications:', error);
            button.setAttribute('aria-label', 'Notifications, unable to check for new alerts');
            status.textContent = `Unable to check notifications: ${describeError(error)}`;
            status.classList.add('store-error');
            status.hidden = false;
        }
    }

    async function loadNotifications() {
        const notifications = [];
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await client.from('community_favorite_notifications')
                .select('id, created_at, is_read, actor:community_profiles!actor_id(username), card:community_cards!card_id(name, photo_path, back_photo_path, source_store_card_id)')
                .eq('recipient_id', userId)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (error) throw error;
            notifications.push(...data);
            if (data.length < pageSize) return notifications;
        }
    }

    async function loadStorePhotos(notifications) {
        const ids = [...new Set(notifications.map(item => item.card)
            .filter(card => card && !card.photo_path && !card.back_photo_path && card.source_store_card_id)
            .map(card => card.source_store_card_id))];
        const photos = new Map();
        for (let offset = 0; offset < ids.length; offset += pageSize) {
            const { data, error } = await client.from('cards')
                .select('id, photos').in('id', ids.slice(offset, offset + pageSize));
            if (error) throw error;
            data.forEach(card => photos.set(card.id, card.photos?.find(photo => photo?.src)?.src));
        }
        return photos;
    }

    function renderNotifications(notifications, storePhotos) {
        list.replaceChildren();
        for (const notification of notifications) {
            if (!notification.actor?.username || !notification.card?.name) {
                throw new Error('A notification could not be displayed because its collector or card is unavailable.');
            }
            const item = document.createElement('li');
            const path = notification.card.photo_path || notification.card.back_photo_path;
            const imageUrl = path
                ? client.storage.from('community-card-photos').getPublicUrl(path).data.publicUrl
                : storePhotos.get(notification.card.source_store_card_id);
            if (!imageUrl) throw new Error(`The photo for ${notification.card.name} could not be loaded.`);
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = notification.card.name;
            image.loading = 'lazy';
            const text = document.createElement('span');
            text.textContent = `@${notification.actor.username} favorited your card`;
            item.append(image, text);
            list.append(item);
        }
    }

    button.addEventListener('click', async () => {
        if (!userId || dialog.open) return;
        dialog.showModal();
        const request = ++dialogRequest;
        button.setAttribute('aria-expanded', 'true');
        list.replaceChildren();
        showMessage('Loading notifications...');
        try {
            const notifications = await loadNotifications();
            if (!userId || request !== dialogRequest) return;
            const storePhotos = await loadStorePhotos(notifications);
            if (!userId || request !== dialogRequest) return;
            renderNotifications(notifications, storePhotos);
            const unreadIds = notifications.filter(item => !item.is_read).map(item => item.id);
            for (let offset = 0; offset < unreadIds.length; offset += pageSize) {
                const { error } = await client.from('community_favorite_notifications')
                    .update({ is_read: true }).eq('recipient_id', userId)
                    .in('id', unreadIds.slice(offset, offset + pageSize));
                if (error) throw error;
                if (!userId || request !== dialogRequest) return;
            }
            showMessage(notifications.length ? '' : 'No notifications yet.');
            await refreshBadge();
        } catch (error) {
            if (!userId || request !== dialogRequest) return;
            showMessage(`Unable to load notifications: ${describeError(error)}`, true);
            await refreshBadge();
        }
    });

    document.querySelector('#profile-notifications-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        dialogRequest++;
        button.setAttribute('aria-expanded', 'false');
        refreshBadge();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshBadge();
    });
    window.addEventListener('community-session-changed', event => {
        if (userId && event.detail.session?.user?.id !== userId) {
            userId = null;
            badgeRequest++;
            clearInterval(timer);
            button.hidden = true;
            badge.hidden = true;
            list.replaceChildren();
            status.hidden = true;
            if (dialog.open) dialog.close();
        }
    });

    window.profileNotifications = {
        start(ownerId) {
            userId = ownerId;
            button.hidden = false;
            refreshBadge();
            timer = setInterval(() => {
                if (!document.hidden) refreshBadge();
            }, 30000);
        }
    };
})();
