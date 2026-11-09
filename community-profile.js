// Load public member profiles and collections; only owners and store admins can manage them.
(async function () {
    const client = window.communityClient;
    const notice = document.querySelector('#profile-notice');
    const summary = document.querySelector('#profile-summary');
    const editToggle = document.querySelector('#profile-edit-toggle');
    const addCardToggle = document.querySelector('#profile-add-card-toggle');
    const editor = document.querySelector('#profile-editor');
    const profileForm = document.querySelector('#profile-edit-form');
    const editMessage = document.querySelector('#profile-edit-message');
    const avatarInput = profileForm.elements.avatar;
    const avatarPicker = document.querySelector('#profile-avatar-picker');
    const avatarPreview = document.querySelector('#profile-avatar-preview');
    const avatarAction = document.querySelector('#profile-avatar-action');
    const avatarSlot = avatarPicker.closest('.photo-slot');
    const cropCurrentAvatarButton = document.querySelector('#profile-avatar-crop-current');
    const removeAvatarButton = document.querySelector('#profile-avatar-remove');
    const avatarCropDialog = document.querySelector('#profile-avatar-crop-dialog');
    const avatarCropViewport = document.querySelector('#profile-avatar-crop-viewport');
    const avatarCropImage = document.querySelector('#profile-avatar-crop-image');
    const avatarCropZoom = document.querySelector('#profile-avatar-crop-zoom');
    const avatarCropMessage = document.querySelector('#profile-avatar-crop-message');
    const avatarCropApply = document.querySelector('#profile-avatar-crop-apply');
    const avatarCropCancel = document.querySelector('#profile-avatar-crop-cancel');
    const collection = document.querySelector('#profile-collection');
    const collectionTitle = document.querySelector('#profile-collection-title');
    const collectionNotice = document.querySelector('#collection-notice');
    const cardFilters = document.querySelector('#community-card-filters');
    const cardGrid = document.querySelector('#community-card-grid');
    const cardEmpty = document.querySelector('#community-card-empty');
    const cardEditor = document.querySelector('#collection-editor');
    const cardForm = document.querySelector('#community-card-form');
    const cardMessage = document.querySelector('#community-card-message');
    const cardDialog = document.querySelector('#community-card-dialog');
    const detailGrade = document.querySelector('#community-card-detail-grade');
    const detailTitle = document.querySelector('#community-card-detail-title');
    const detailImage = document.querySelector('#community-card-detail-image');
    const detailPhotoCount = document.querySelector('#community-card-photo-count');
    const rotateButton = document.querySelector('#community-card-rotate');
    const detailEditToggle = document.querySelector('#community-card-edit-toggle');
    const cardEditPanel = document.querySelector('#community-card-edit-panel');
    const cardEditForm = document.querySelector('#community-card-edit-form');
    const cardEditMessage = document.querySelector('#community-card-edit-message');
    const zoomDialog = document.querySelector('#community-card-zoom-dialog');
    const zoomImage = document.querySelector('#community-card-zoom-image');
    let activeProfile;
    let currentUser;
    let isOwner = false;
    let isAdmin = false;
    let croppedAvatarFile = null;
    let removeAvatar = false;
    let savedAvatarUrl = '';
    let stagedAvatarUrl = '';
    let avatarCropObjectUrl = '';
    let avatarCropScale = 1;
    let avatarCropBaseScale = 1;
    let avatarCropLeft = 0;
    let avatarCropTop = 0;
    let avatarCropDrag = null;
    let activeCards = new Map();
    let selectedCardId = null;
    let selectedPhotos = [];
    let selectedPhotoIndex = 0;
    let photoIsSideways = false;
    const removedSides = new Set();
    const previewUrls = new Map();

    function resizeCardName(input) {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
    }

    for (const form of [cardForm, cardEditForm]) {
        form.elements.name.addEventListener('input', () => resizeCardName(form.elements.name));
    }
    window.addEventListener('resize', () => {
        if (cardEditor.open) resizeCardName(cardForm.elements.name);
        if (cardDialog.open && !cardEditPanel.hidden) resizeCardName(cardEditForm.elements.name);
    });

    function renderPhotoSlot(input, currentUrl = '') {
        const oldUrl = previewUrls.get(input);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        previewUrls.delete(input);
        const slot = input.closest('.photo-slot');
        const side = input.name === 'front_photo' ? 'front' : 'back';
        const preview = slot.querySelector('.photo-slot-preview');
        const file = input.files[0];
        const url = file ? URL.createObjectURL(file) : currentUrl;
        if (file) previewUrls.set(input, url);
        preview.replaceChildren();
        if (url) {
            const image = document.createElement('img');
            image.src = url;
            image.alt = '';
            preview.append(image);
        } else {
            preview.textContent = `Choose ${side}`;
        }
        slot.querySelector('.photo-slot-action').textContent = url ? 'Click to replace' : 'Choose photo';
        const remove = slot.querySelector('[data-remove-side]');
        if (remove) {
            remove.disabled = !url;
            remove.setAttribute('aria-pressed', String(removedSides.has(side)));
            remove.textContent = removedSides.has(side) ? `Keep ${side}` : `Remove ${side}`;
            slot.classList.toggle('is-marked-for-removal', removedSides.has(side));
        }
    }

    function isStorePhotoSource(entry) {
        return Boolean(entry?.card.source_store_card_id && !entry.card.photo_path && !entry.card.back_photo_path);
    }

    function currentPhotoUrl(entry, side) {
        if (!entry) return '';
        if (isStorePhotoSource(entry)) {
            return window.getCardPhotoSlots(entry.photos).find(slot => slot.side.toLowerCase() === side)?.photo?.src || '';
        }
        const path = side === 'front' ? entry.card.photo_path : entry.card.back_photo_path;
        return path ? client.storage.from('community-card-photos').getPublicUrl(path).data.publicUrl : '';
    }

    function resetPhotoSlots(form, entry = null) {
        removedSides.clear();
        for (const side of ['front', 'back']) {
            const input = form.elements[`${side}_photo`];
            input.value = '';
            renderPhotoSlot(input, currentPhotoUrl(entry, side));
        }
    }

    for (const form of [cardForm, cardEditForm]) {
        form.querySelectorAll('.photo-slot-picker').forEach(button => {
            button.addEventListener('click', () => document.getElementById(button.dataset.fileInput).click());
        });
        form.querySelectorAll('input[type="file"]').forEach(input => {
            input.addEventListener('change', () => {
                const side = input.name === 'front_photo' ? 'front' : 'back';
                removedSides.delete(side);
                const entry = form === cardEditForm ? activeCards.get(selectedCardId) : null;
                renderPhotoSlot(input, currentPhotoUrl(entry, side));
            });
        });
    }
    cardEditForm.querySelectorAll('[data-remove-side]').forEach(button => {
        button.addEventListener('click', () => {
            const side = button.dataset.removeSide;
            if (removedSides.has(side)) removedSides.delete(side);
            else removedSides.add(side);
            const entry = activeCards.get(selectedCardId);
            renderPhotoSlot(cardEditForm.elements[`${side}_photo`], currentPhotoUrl(entry, side));
        });
    });

    window.addEventListener('community-session-changed', event => {
        if (!window.communitySignOutInProgress && currentUser !== undefined && event.detail.session?.user?.id !== currentUser?.id) {
            window.location.reload();
        }
    });

    function setMessage(target, message, isError = false) {
        target.textContent = message;
        target.hidden = !message;
        target.classList.toggle('store-error', isError);
    }

    function cardSaveError(error) {
        if (error.code === 'PGRST204' || error.code === '42703') {
            return 'Community card fields are outdated. Run supabase-community-card-fields.sql in the Supabase SQL Editor, then try again.';
        }
        if (/permission denied for table community_cards/i.test(error.message)) {
            return 'Community card permissions are outdated. Run the latest supabase-community-setup.sql in the Supabase SQL Editor, then try again.';
        }
        return error.message;
    }

    function initials(profile) {
        return (profile.display_name || profile.username).slice(0, 1).toUpperCase();
    }

    function supportedImageType(file) {
        return ({
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        })[file.type];
    }

    function updateAvatarActions() {
        if (stagedAvatarUrl) URL.revokeObjectURL(stagedAvatarUrl);
        stagedAvatarUrl = croppedAvatarFile ? URL.createObjectURL(croppedAvatarFile) : '';
        const previewUrl = stagedAvatarUrl || savedAvatarUrl;
        avatarPreview.replaceChildren();
        if (previewUrl) {
            const image = document.createElement('img');
            image.src = previewUrl;
            image.alt = '';
            avatarPreview.append(image);
        } else {
            avatarPreview.textContent = 'Choose photo';
        }
        avatarAction.textContent = previewUrl ? 'Click to replace' : 'Choose photo';
        cropCurrentAvatarButton.hidden = !previewUrl || removeAvatar;
        removeAvatarButton.hidden = !previewUrl;
        removeAvatarButton.textContent = croppedAvatarFile
            ? 'Discard new photo'
            : removeAvatar ? 'Keep photo' : 'Remove photo';
        removeAvatarButton.setAttribute('aria-pressed', String(removeAvatar));
        avatarSlot.classList.toggle('is-marked-for-removal', removeAvatar);
    }

    function positionAvatarCropImage(left, top) {
        const viewportSize = avatarCropViewport.clientWidth;
        const imageWidth = avatarCropImage.naturalWidth * avatarCropScale;
        const imageHeight = avatarCropImage.naturalHeight * avatarCropScale;
        avatarCropLeft = Math.min(0, Math.max(viewportSize - imageWidth, left));
        avatarCropTop = Math.min(0, Math.max(viewportSize - imageHeight, top));
        avatarCropImage.style.width = `${imageWidth}px`;
        avatarCropImage.style.height = `${imageHeight}px`;
        avatarCropImage.style.left = `${avatarCropLeft}px`;
        avatarCropImage.style.top = `${avatarCropTop}px`;
    }

    function setAvatarCropZoom(value) {
        const viewportSize = avatarCropViewport.clientWidth;
        const focusX = (viewportSize / 2 - avatarCropLeft) / avatarCropScale;
        const focusY = (viewportSize / 2 - avatarCropTop) / avatarCropScale;
        avatarCropScale = avatarCropBaseScale * Number(value);
        positionAvatarCropImage(
            viewportSize / 2 - focusX * avatarCropScale,
            viewportSize / 2 - focusY * avatarCropScale
        );
    }

    async function openAvatarCrop(file) {
        if (!supportedImageType(file)) {
            throw new Error('Choose a JPEG, PNG, or WebP image.');
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('Profile photos must be 5 MB or smaller.');
        }

        avatarCropImage.dataset.type = file.type;
        avatarCropObjectUrl = URL.createObjectURL(file);
        avatarCropImage.src = avatarCropObjectUrl;
        await avatarCropImage.decode();
        avatarCropDialog.showModal();
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        const viewportSize = avatarCropViewport.clientWidth;
        avatarCropBaseScale = Math.max(
            viewportSize / avatarCropImage.naturalWidth,
            viewportSize / avatarCropImage.naturalHeight
        );
        avatarCropScale = avatarCropBaseScale;
        avatarCropZoom.value = '1';
        positionAvatarCropImage(
            (viewportSize - avatarCropImage.naturalWidth * avatarCropScale) / 2,
            (viewportSize - avatarCropImage.naturalHeight * avatarCropScale) / 2
        );
        setMessage(avatarCropMessage, '');
        avatarCropViewport.focus();
    }

    avatarPicker.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        try {
            await openAvatarCrop(file);
        } catch (error) {
            if (avatarCropDialog.open) avatarCropDialog.close();
            else if (avatarCropObjectUrl) URL.revokeObjectURL(avatarCropObjectUrl);
            avatarCropObjectUrl = '';
            avatarInput.value = '';
            setMessage(editMessage, `Unable to open that photo for cropping: ${error.message}`, true);
        }
    });

    cropCurrentAvatarButton.addEventListener('click', async () => {
        cropCurrentAvatarButton.disabled = true;
        setMessage(editMessage, 'Loading photo…');
        try {
            let file = croppedAvatarFile;
            if (!file) {
                const imageUrl = await avatarUrl(activeProfile.avatar_path);
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`Photo download failed (${response.status}).`);
                const blob = await response.blob();
                const extension = supportedImageType(blob);
                if (!extension) throw new Error('The current photo is not a supported image.');
                file = new File([blob], `profile-avatar.${extension}`, { type: blob.type });
            }
            await openAvatarCrop(file);
            setMessage(editMessage, '');
        } catch (error) {
            if (avatarCropDialog.open) avatarCropDialog.close();
            else if (avatarCropObjectUrl) URL.revokeObjectURL(avatarCropObjectUrl);
            avatarCropObjectUrl = '';
            setMessage(editMessage, `Unable to crop the current photo: ${error.message}`, true);
        } finally {
            cropCurrentAvatarButton.disabled = false;
        }
    });

    avatarCropZoom.addEventListener('input', () => setAvatarCropZoom(avatarCropZoom.value));
    avatarCropViewport.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        avatarCropViewport.setPointerCapture(event.pointerId);
        avatarCropDrag = {
            x: event.clientX,
            y: event.clientY,
            left: avatarCropLeft,
            top: avatarCropTop
        };
    });
    avatarCropViewport.addEventListener('pointermove', event => {
        if (!avatarCropDrag) return;
        positionAvatarCropImage(
            avatarCropDrag.left + event.clientX - avatarCropDrag.x,
            avatarCropDrag.top + event.clientY - avatarCropDrag.y
        );
    });
    avatarCropViewport.addEventListener('pointerup', () => {
        avatarCropDrag = null;
    });
    avatarCropViewport.addEventListener('pointercancel', () => {
        avatarCropDrag = null;
    });
    avatarCropViewport.addEventListener('keydown', event => {
        const movement = event.shiftKey ? 10 : 2;
        const offsets = {
            ArrowLeft: [movement, 0],
            ArrowRight: [-movement, 0],
            ArrowUp: [0, movement],
            ArrowDown: [0, -movement]
        }[event.key];
        if (!offsets) return;
        event.preventDefault();
        positionAvatarCropImage(avatarCropLeft + offsets[0], avatarCropTop + offsets[1]);
    });
    avatarCropCancel.addEventListener('click', () => avatarCropDialog.close());
    avatarCropDialog.addEventListener('close', () => {
        avatarInput.value = '';
        avatarCropDrag = null;
        if (avatarCropObjectUrl) URL.revokeObjectURL(avatarCropObjectUrl);
        avatarCropObjectUrl = '';
    });
    removeAvatarButton.addEventListener('click', () => {
        if (croppedAvatarFile) {
            croppedAvatarFile = null;
            removeAvatar = false;
        } else {
            removeAvatar = !removeAvatar;
        }
        updateAvatarActions();
    });
    avatarCropApply.addEventListener('click', async () => {
        avatarCropApply.disabled = true;
        setMessage(avatarCropMessage, 'Preparing your crop…');
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Your browser could not prepare the cropped photo.');
            const sourceSize = avatarCropViewport.clientWidth / avatarCropScale;
            context.drawImage(
                avatarCropImage,
                -avatarCropLeft / avatarCropScale,
                -avatarCropTop / avatarCropScale,
                sourceSize,
                sourceSize,
                0,
                0,
                canvas.width,
                canvas.height
            );
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(result => {
                    if (result) resolve(result);
                    else reject(new Error('Your browser could not create the cropped photo.'));
                }, avatarCropImage.dataset.type, 0.92);
            });
            if (blob.size > 5 * 1024 * 1024) throw new Error('The cropped photo must be 5 MB or smaller.');
            const extension = supportedImageType(blob) || 'jpg';
            croppedAvatarFile = new File([blob], `profile-avatar.${extension}`, { type: blob.type });
            removeAvatar = false;
            updateAvatarActions();
            setMessage(editMessage, '');
            avatarCropDialog.close();
        } catch (error) {
            setMessage(avatarCropMessage, error.message, true);
        } finally {
            avatarCropApply.disabled = false;
        }
    });

    async function avatarUrl(path) {
        if (!path) return '';
        const { data, error } = await client.storage.from('community-avatars').createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
    }

    async function drawSummary(profile) {
        const imageUrl = await avatarUrl(profile.avatar_path);
        savedAvatarUrl = imageUrl;
        updateAvatarActions();
        const avatar = document.querySelector('#profile-avatar');
        avatar.textContent = imageUrl ? '' : initials(profile);
        avatar.replaceChildren();
        if (imageUrl) {
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = '';
            avatar.append(image);
        } else {
            avatar.textContent = initials(profile);
        }

        document.querySelector('#profile-username').textContent = `@${profile.username}`;
        document.querySelector('#profile-display-name').textContent = profile.display_name;
        document.querySelector('#profile-bio').textContent = profile.bio;
        const visibility = document.querySelector('#profile-visibility');
        visibility.textContent = profile.is_founder ? 'Founder' : '';
        visibility.hidden = !profile.is_founder;
        visibility.classList.toggle('is-founder', profile.is_founder);
        summary.hidden = false;
    }

    function populateEditor(profile) {
        profileForm.elements.display_name.value = profile.display_name;
        profileForm.elements.username.value = profile.username;
        profileForm.elements.bio.value = profile.bio || '';
        avatarInput.value = '';
        croppedAvatarFile = null;
        removeAvatar = false;
        updateAvatarActions();
    }

    function renderSelectedCard() {
        const entry = activeCards.get(selectedCardId);
        if (!entry) {
            cardDialog.close();
            return;
        }

        const { card } = entry;
        selectedPhotos = entry.photos;
        selectedPhotoIndex = Math.min(selectedPhotoIndex, selectedPhotos.length - 1);
        detailGrade.textContent = card.detail ? `${card.grade} · ${card.detail}` : card.grade;
        detailTitle.textContent = card.name;
        detailEditToggle.hidden = !(isOwner || isAdmin);
        detailImage.src = selectedPhotos[selectedPhotoIndex].src;
        detailImage.alt = selectedPhotos[selectedPhotoIndex].alt || `${card.detail || card.name} card`;
        detailPhotoCount.textContent = `${selectedPhotos[selectedPhotoIndex].side || `Photo ${selectedPhotoIndex + 1}`} · ${selectedPhotoIndex + 1} of ${selectedPhotos.length}`;
        document.querySelector('#community-card-previous-photo').hidden = selectedPhotos.length < 2;
        document.querySelector('#community-card-next-photo').hidden = selectedPhotos.length < 2;
        rotateButton.hidden = !(card.rotation_enabled ?? entry.storeRotation);
        const rotationClass = selectedPhotos[selectedPhotoIndex].side === 'Back' ? 'is-sideways-reversed' : 'is-sideways';
        for (const image of [detailImage, zoomImage]) {
            image.classList.remove('is-sideways', 'is-sideways-reversed');
            if (photoIsSideways && !rotateButton.hidden) image.classList.add(rotationClass);
        }
        rotateButton.setAttribute('aria-pressed', String(photoIsSideways && !rotateButton.hidden));
        const rotationAction = photoIsSideways && !rotateButton.hidden ? 'Rotate photo upright' : 'Rotate photo sideways';
        rotateButton.setAttribute('aria-label', rotationAction);
        rotateButton.title = rotationAction;
    }

    function openCardDetails(cardId) {
        selectedCardId = cardId;
        selectedPhotoIndex = 0;
        photoIsSideways = false;
        cardEditPanel.hidden = true;
        setMessage(cardEditMessage, '');
        renderSelectedCard();
        if (!cardDialog.open) cardDialog.showModal();
    }

    async function loadCards(profile) {
        collection.hidden = false;
        collectionTitle.textContent = isOwner ? 'My Collection' : 'Card Collection';
        if (isAdmin && !isOwner) {
            document.querySelector('#collection-editor h2').textContent = `Add a card to @${profile.username}’s collection`;
            cardForm.querySelector('[type="submit"]').textContent = 'Add card for collector';
        }
        setMessage(collectionNotice, '');
        cardGrid.replaceChildren();
        cardEmpty.hidden = true;
        activeCards.clear();

        const { data, error } = await client.from('community_cards')
            .select('*')
            .eq('owner_id', profile.id)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const storeSourceIds = (data || [])
            .map(card => card.source_store_card_id)
            .filter(Boolean);
        const storePhotosById = new Map();
        if (storeSourceIds.length > 0) {
            const { data: storeCards, error: storeCardError } = await client.from('cards')
                .select('id, title, photos, created_at')
                .in('id', storeSourceIds);
            if (storeCardError) throw storeCardError;
            for (const storeCard of storeCards || []) {
                const photos = (storeCard.photos || []).filter(photo => photo?.src);
                if (photos.length === 0) throw new Error(`The store card ${storeCard.id} has no display photo.`);
                storePhotosById.set(storeCard.id, { photos, title: storeCard.title, photoCount: (storeCard.photos || []).length, createdAt: storeCard.created_at });
            }
        }

        const orderedCards = [...(data || [])].sort((first, second) => {
            if (first.grade === 'Raw') return second.grade === 'Raw' ? 0 : 1;
            if (second.grade === 'Raw') return -1;
            return Number(second.grade.slice(4)) - Number(first.grade.slice(4));
        });
        const recentCards = [...(data || [])].sort((first, second) => {
            const addedOrder = second.created_at.localeCompare(first.created_at);
            if (addedOrder) return addedOrder;
            const firstOriginal = storePhotosById.get(first.source_store_card_id)?.createdAt || first.created_at;
            const secondOriginal = storePhotosById.get(second.source_store_card_id)?.createdAt || second.created_at;
            return secondOriginal.localeCompare(firstOriginal);
        });
        const cards = await Promise.all(orderedCards.map(async card => {
            let photos;
            if (card.photo_path || card.back_photo_path) {
                photos = [];
                for (const [side, path] of [['Front', card.photo_path], ['Back', card.back_photo_path]]) {
                    if (!path) continue;
                    const { data: urlData } = client.storage.from('community-card-photos').getPublicUrl(path);
                    if (!urlData.publicUrl) throw new Error(`The ${side.toLowerCase()} photo for ${card.name} could not be loaded.`);
                    photos.push({ src: urlData.publicUrl, side, alt: `${side} of ${card.detail || card.name}` });
                }
            } else if (card.source_store_card_id) {
                const storeCard = storePhotosById.get(card.source_store_card_id);
                if (!storeCard) throw new Error(`The store card ${card.source_store_card_id} could not be loaded.`);
                photos = storeCard.photos;
            } else {
                throw new Error(`The card ${card.name} has no photo.`);
            }
            const storeCard = storePhotosById.get(card.source_store_card_id);
            const storeRotation = storeCard && (storeCard.photos.some(photo => typeof photo.rotationEnabled === 'boolean')
                ? storeCard.photos.some(photo => photo.rotationEnabled === true)
                : card.source_store_card_id === 'marlon');
            activeCards.set(card.id, { card, photos, storeTitle: storeCard?.title, storePhotoCount: storeCard?.photoCount, storeRotation });
            return window.communityFavorites.cardMarkup(card, photos[0].src);
        }));
        cardGrid.innerHTML = cards.join('');
        try {
            await window.communityFavorites.refreshCounts(orderedCards.map(card => card.id), cardGrid);
        } catch (error) {
            setMessage(collectionNotice, `Unable to load favorite counts: ${error.message}`, true);
        }
        const grades = [...new Set(orderedCards.map(card => card.grade))]
            .sort((first, second) => {
                if (first === 'Raw') return 1;
                if (second === 'Raw') return -1;
                return Number(second.slice(4)) - Number(first.slice(4));
            });
        cardFilters.innerHTML = ['all', ...grades, 'recent'].map(grade =>
            `<button class="filter${grade === 'all' ? ' active' : ''}" type="button" data-grade-filter="${window.escapeStoreHTML(grade)}" aria-pressed="${grade === 'all'}">${grade === 'all' ? 'All Cards' : grade === 'recent' ? 'Recent' : window.escapeStoreHTML(grade)}</button>`
        ).join('');
        const cardElements = new Map(
            [...cardGrid.querySelectorAll('.community-card')].map(element => [element.dataset.cardId, element])
        );
        cardFilters.querySelectorAll('[data-grade-filter]').forEach(button => {
            button.addEventListener('click', () => {
                const previous = cardFilters.querySelector('.filter.active');
                previous?.classList.remove('active');
                previous?.setAttribute('aria-pressed', 'false');
                button.classList.add('active');
                button.setAttribute('aria-pressed', 'true');
                const selectedGrade = button.dataset.gradeFilter;
                const displayOrder = selectedGrade === 'recent' ? recentCards : orderedCards;
                displayOrder.forEach(card => {
                    const element = cardElements.get(card.id);
                    element.hidden = selectedGrade !== 'all' && selectedGrade !== 'recent' && card.grade !== selectedGrade;
                    cardGrid.append(element);
                });
            });
        });
        cardEmpty.hidden = cards.length > 0;
        cardFilters.hidden = cards.length === 0;
    }

    editToggle.addEventListener('click', () => {
        setMessage(notice, '');
        populateEditor(activeProfile);
        setMessage(editMessage, '');
        editor.showModal();
        editToggle.setAttribute('aria-expanded', 'true');
    });
    addCardToggle.addEventListener('click', () => {
        cardEditor.showModal();
        addCardToggle.setAttribute('aria-expanded', 'true');
        resizeCardName(cardForm.elements.name);
    });
    document.querySelector('#profile-editor-close').addEventListener('click', () => {
        if (!profileForm.querySelector('[type="submit"]').disabled) editor.close();
    });
    editor.addEventListener('cancel', event => {
        if (profileForm.querySelector('[type="submit"]').disabled) event.preventDefault();
    });
    editor.addEventListener('close', () => {
        editToggle.setAttribute('aria-expanded', 'false');
    });
    function closeCardEditor() {
        if (!cardForm.querySelector('[type="submit"]').disabled) cardEditor.close();
    }
    document.querySelector('#collection-editor-close').addEventListener('click', closeCardEditor);
    document.querySelector('#community-card-add-cancel').addEventListener('click', closeCardEditor);
    cardEditor.addEventListener('cancel', event => {
        if (cardForm.querySelector('[type="submit"]').disabled) event.preventDefault();
    });
    cardEditor.addEventListener('close', () => {
        addCardToggle.setAttribute('aria-expanded', 'false');
        cardForm.reset();
        resetPhotoSlots(cardForm);
        setMessage(cardMessage, '');
    });

    document.querySelector('#community-card-detail-close').addEventListener('click', () => cardDialog.close());
    cardDialog.addEventListener('close', () => {
        cardEditPanel.hidden = true;
        resetPhotoSlots(cardEditForm);
    });
    document.querySelector('#community-card-previous-photo').addEventListener('click', () => {
        selectedPhotoIndex = (selectedPhotoIndex + selectedPhotos.length - 1) % selectedPhotos.length;
        renderSelectedCard();
    });
    document.querySelector('#community-card-next-photo').addEventListener('click', () => {
        selectedPhotoIndex = (selectedPhotoIndex + 1) % selectedPhotos.length;
        renderSelectedCard();
    });
    rotateButton.addEventListener('click', () => {
        photoIsSideways = !photoIsSideways;
        renderSelectedCard();
    });
    document.querySelector('#community-card-zoom-trigger').addEventListener('click', () => {
        zoomImage.src = detailImage.src;
        zoomImage.alt = detailImage.alt;
        zoomDialog.showModal();
    });
    document.querySelector('#community-card-zoom-close').addEventListener('click', () => zoomDialog.close());
    zoomDialog.addEventListener('click', event => {
        if (event.target === zoomDialog) zoomDialog.close();
    });
    detailEditToggle.addEventListener('click', () => {
        const entry = activeCards.get(selectedCardId);
        if (!entry || !(isOwner || isAdmin)) return;
        cardEditForm.elements.name.value = entry.card.name;
        cardEditForm.elements.detail.value = entry.card.detail || '';
        cardEditForm.elements.grade.value = entry.card.grade;
        cardEditForm.elements.rotation_enabled.checked = entry.card.rotation_enabled ?? Boolean(entry.storeRotation);
        const storePhotos = isStorePhotoSource(entry);
        resetPhotoSlots(cardEditForm, entry);
        document.querySelector('#community-card-edit-photos').hidden = storePhotos && !isAdmin;
        const linkedNotice = document.querySelector('#community-card-linked-photos');
        linkedNotice.hidden = !storePhotos;
        linkedNotice.textContent = isAdmin
            ? 'Photo changes also update the store card.'
            : 'Only a store admin can change photos for this linked card.';
        setMessage(cardEditMessage, '');
        cardEditPanel.hidden = false;
        resizeCardName(cardEditForm.elements.name);
    });
    document.querySelector('#community-card-edit-cancel').addEventListener('click', () => {
        cardEditForm.reset();
        resetPhotoSlots(cardEditForm);
        cardEditPanel.hidden = true;
        setMessage(cardEditMessage, '');
    });

    cardEditForm.addEventListener('submit', async event => {
        event.preventDefault();
        const entry = activeCards.get(selectedCardId);
        if (!entry || !(isOwner || isAdmin)) return;

        const button = cardEditForm.querySelector('[type="submit"]');
        button.disabled = true;
        setMessage(cardEditMessage, 'Saving card…');
        const uploadedPhotoPaths = [];
        const uploadedStorePhotos = [];
        let cardSaved = false;
        let storePhotosSaved = false;

        try {
            const photoPaths = {};
            const storePhotoSource = isStorePhotoSource(entry);
            const storeSlots = storePhotoSource ? window.getCardPhotoSlots(entry.photos) : [];
            const photoFiles = {
                front_photo: cardEditForm.elements.front_photo.files[0],
                back_photo: cardEditForm.elements.back_photo.files[0]
            };
            const storePhotosChanged = storePhotoSource && (removedSides.size > 0 || photoFiles.front_photo || photoFiles.back_photo);
            if (storePhotosChanged && !isAdmin) throw new Error('Only a store admin can change photos for this linked card.');
            if (storePhotosChanged && entry.storePhotoCount !== entry.photos.length) {
                throw new Error('The store card contains an invalid photo entry. Correct it in the store catalog before editing photos.');
            }
            const assignedIndexes = new Set(storeSlots.map(slot => slot.index).filter(index => index >= 0));
            const extraStorePhotos = storePhotoSource ? entry.photos.filter((photo, index) => !assignedIndexes.has(index)) : [];
            if (!['front', 'back'].some(side =>
                !removedSides.has(side) && (photoFiles[`${side}_photo`] || currentPhotoUrl(entry, side))
            ) && extraStorePhotos.length === 0) {
                throw new Error('Keep at least one front or back photo of the card.');
            }
            const storeReplacements = {};
            for (const [side, fieldName] of [['front', 'front_photo'], ['back', 'back_photo']]) {
                const image = photoFiles[fieldName];
                if (!image || removedSides.has(side)) continue;
                if (storePhotoSource) {
                    const label = side === 'front' ? 'Front' : 'Back';
                    const photo = await window.uploadCardPhoto(entry.card.source_store_card_id, image, label, cardEditForm.elements.detail.value.trim());
                    photo.rotationEnabled = Boolean(entry.storeRotation);
                    uploadedStorePhotos.push(photo);
                    storeReplacements[side] = photo;
                    continue;
                }
                const extension = supportedImageType(image);
                if (!extension) throw new Error('Choose a JPEG, PNG, or WebP image.');
                if (image.size > 5 * 1024 * 1024) throw new Error('Card photos must be 5 MB or smaller.');
                const path = `${activeProfile.id}/${entry.card.id}-${side}-${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await client.storage.from('community-card-photos').upload(path, image, {
                    contentType: image.type,
                    upsert: false
                });
                if (uploadError) throw uploadError;
                uploadedPhotoPaths.push(path);
                photoPaths[side] = path;
            }

            const updates = {
                name: cardEditForm.elements.name.value.trim(),
                detail: cardEditForm.elements.detail.value.trim(),
                grade: cardEditForm.elements.grade.value,
                rotation_enabled: cardEditForm.elements.rotation_enabled.checked
            };
            if (updates.name !== entry.card.name) updates.title = updates.name;
            if (photoPaths.front || removedSides.has('front')) updates.photo_path = photoPaths.front || null;
            if (photoPaths.back || removedSides.has('back')) updates.back_photo_path = photoPaths.back || null;
            const { error } = await client.from('community_cards')
                .update(updates)
                .eq('id', entry.card.id)
                .eq('owner_id', activeProfile.id)
                .select('id')
                .single();
            if (error) throw error;
            cardSaved = true;
            uploadedPhotoPaths.length = 0;

            let replacedStorePhotos = [];
            if (storePhotosChanged) {
                const storePhotos = storeSlots.map(slot => {
                    const side = slot.side.toLowerCase();
                    if (storeReplacements[side] || removedSides.has(side)) {
                        if (slot.photo) replacedStorePhotos.push(slot.photo);
                        return storeReplacements[side] || null;
                    }
                    return slot.photo;
                }).filter(Boolean).concat(extraStorePhotos);
                const retainedPaths = new Set(storePhotos.map(photo => photo.storagePath).filter(Boolean));
                replacedStorePhotos = replacedStorePhotos.filter(photo => !photo.storagePath || !retainedPaths.has(photo.storagePath));
                const { error: storeError } = await client.from('cards')
                    .update({ photos: storePhotos })
                    .eq('id', entry.card.source_store_card_id)
                    .select('id')
                    .single();
                if (storeError) throw storeError;
                storePhotosSaved = true;
                uploadedStorePhotos.length = 0;
            }

            let cleanupError;
            if (replacedStorePhotos.length) {
                try {
                    await window.removeManagedCardPhotos(replacedStorePhotos);
                } catch (error) {
                    cleanupError = error;
                }
            }
            try {
                await loadCards(activeProfile);
            } catch (error) {
                throw new Error(`Card updated, but the collection could not refresh: ${error.message}`);
            }
            const replacedPhotoPaths = [
                (photoPaths.front || removedSides.has('front')) && entry.card.photo_path,
                (photoPaths.back || removedSides.has('back')) && entry.card.back_photo_path
            ].filter(Boolean);
            renderSelectedCard();
            resetPhotoSlots(cardEditForm, activeCards.get(selectedCardId));
            if (cleanupError) {
                setMessage(cardEditMessage, `Card updated, but previous store photo cleanup failed: ${cleanupError.message}`, true);
                return;
            }
            if (replacedPhotoPaths.length) {
                const { error: cleanupError } = await client.storage.from('community-card-photos').remove(replacedPhotoPaths);
                if (cleanupError) {
                    setMessage(cardEditMessage, `Card updated, but previous photo cleanup failed: ${cleanupError.message}`, true);
                    return;
                }
            }
            setMessage(cardEditMessage, 'Card updated.');
        } catch (error) {
            if (uploadedPhotoPaths.length && !cardSaved) {
                const { error: cleanupError } = await client.storage.from('community-card-photos').remove(uploadedPhotoPaths);
                if (cleanupError) console.error('Unable to remove unused card photos:', cleanupError);
            }
            if (uploadedStorePhotos.length && !storePhotosSaved) {
                try {
                    await window.removeManagedCardPhotos(uploadedStorePhotos);
                } catch (cleanupError) {
                    console.error('Unable to remove unused store card photos:', cleanupError);
                }
            }
            const prefix = cardSaved ? 'Card details saved, but the remaining changes failed' : 'Unable to save card';
            setMessage(cardEditMessage, `${prefix}: ${cardSaveError(error)}`, true);
        } finally {
            button.disabled = false;
        }
    });

    profileForm.addEventListener('submit', async event => {
        event.preventDefault();
        const button = profileForm.querySelector('[type="submit"]');
        button.disabled = true;
        setMessage(editMessage, 'Saving profile…');
        let uploadedAvatarPath = '';
        let profileSaved = false;

        try {
            const updates = {
                username: profileForm.elements.username.value.trim().toLowerCase(),
                display_name: profileForm.elements.display_name.value.trim(),
                bio: profileForm.elements.bio.value.trim()
            };
            if (!/^[a-z0-9_]{3,24}$/.test(updates.username)) {
                throw new Error('Use 3–24 letters, numbers, or underscores for your username.');
            }
            if (updates.username !== activeProfile.username) {
                await window.ensureCommunityUsernameAvailable(updates.username, activeProfile.id);
            }

            const image = croppedAvatarFile;
            if (image) {
                const extension = supportedImageType(image);
                if (!extension) throw new Error('Choose a JPEG, PNG, or WebP image.');
                if (image.size > 5 * 1024 * 1024) throw new Error('Profile photos must be 5 MB or smaller.');
                uploadedAvatarPath = `${activeProfile.id}/${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await client.storage.from('community-avatars').upload(uploadedAvatarPath, image, {
                    contentType: image.type,
                    upsert: false
                });
                if (uploadError) throw uploadError;
            }

            const avatarChanged = Boolean(uploadedAvatarPath) || removeAvatar;
            if (avatarChanged) updates.avatar_path = uploadedAvatarPath || null;

            const { data, error } = await client.from('community_profiles')
                .update(updates)
                .eq('id', activeProfile.id)
                .select('id, username, display_name, bio, is_public, is_founder, avatar_path')
                .single();
            if (error) {
                if (error.code === '23505') {
                    throw new Error('That username is already taken. Please choose another one.');
                }
                throw error;
            }

            const previousAvatarPath = activeProfile.avatar_path;
            profileSaved = true;
            activeProfile = data;
            croppedAvatarFile = null;
            removeAvatar = false;
            avatarInput.value = '';
            updateAvatarActions();
            await drawSummary(activeProfile);
            if (avatarChanged && previousAvatarPath) {
                const { error: removeError } = await client.storage.from('community-avatars').remove([previousAvatarPath]);
                if (removeError) throw new Error(`Profile saved, but the previous photo could not be removed: ${removeError.message}`);
            }
            const profileUrl = new URL(window.location.href);
            profileUrl.searchParams.set('user', activeProfile.username);
            window.history.replaceState({}, '', profileUrl);
            setMessage(editMessage, '');
            editor.close();
            setMessage(notice, 'Profile saved.');
            editToggle.focus();
        } catch (error) {
            if (uploadedAvatarPath && !profileSaved) {
                const { error: cleanupError } = await client.storage.from('community-avatars').remove([uploadedAvatarPath]);
                if (cleanupError) console.error('Unable to remove the unused profile photo:', cleanupError);
            }
            setMessage(editMessage, `Unable to save profile: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    });

    cardForm.addEventListener('submit', async event => {
        event.preventDefault();
        const button = cardForm.querySelector('[type="submit"]');
        button.disabled = true;
        setMessage(cardMessage, 'Adding card…');
        const uploadedPhotoPaths = [];

        try {
            const photoFiles = {
                front_photo: cardForm.elements.front_photo.files[0],
                back_photo: cardForm.elements.back_photo.files[0]
            };
            if (!photoFiles.front_photo && !photoFiles.back_photo) {
                throw new Error('Choose at least a front or back photo of the card.');
            }
            const photoPaths = {};
            for (const [side, fieldName] of [['front', 'front_photo'], ['back', 'back_photo']]) {
                const image = photoFiles[fieldName];
                if (!image) continue;
                const extension = supportedImageType(image);
                if (!extension) throw new Error('Choose JPEG, PNG, or WebP card photos.');
                if (image.size > 5 * 1024 * 1024) throw new Error('Card photos must be 5 MB or smaller.');
                const path = `${activeProfile.id}/${crypto.randomUUID()}.${extension}`;
                const { error: uploadError } = await client.storage.from('community-card-photos').upload(path, image, {
                    contentType: image.type,
                    upsert: false
                });
                if (uploadError) throw uploadError;
                uploadedPhotoPaths.push(path);
                photoPaths[side] = path;
            }

            const { error } = await client.from('community_cards').insert({
                owner_id: activeProfile.id,
                name: cardForm.elements.name.value.trim(),
                detail: cardForm.elements.detail.value.trim(),
                grade: cardForm.elements.grade.value,
                title: cardForm.elements.name.value.trim(),
                rotation_enabled: cardForm.elements.rotation_enabled.checked,
                photo_path: photoPaths.front || null,
                back_photo_path: photoPaths.back || null
            });
            if (error) throw error;
            uploadedPhotoPaths.length = 0;
            cardForm.reset();
            resetPhotoSlots(cardForm);
            try {
                await loadCards(activeProfile);
            } catch (error) {
                cardEditor.close();
                setMessage(collectionNotice, `Card added, but the collection could not refresh: ${error.message}`, true);
                return;
            }
            cardEditor.close();
            setMessage(
                collectionNotice,
                isOwner ? 'Card added to your collection.' : `Card added to @${activeProfile.username}’s collection.`
            );
        } catch (error) {
            if (uploadedPhotoPaths.length) {
                const { error: cleanupError } = await client.storage.from('community-card-photos').remove(uploadedPhotoPaths);
                if (cleanupError) console.error('Unable to remove unused card photos:', cleanupError);
            }
            const message = /row-level security|violates row-level security/i.test(error.message)
                    ? 'Only this profile owner or the store admin can add cards to this collection.'
                    : cardSaveError(error);
            setMessage(cardMessage, `Unable to add card: ${message}`, true);
        } finally {
            button.disabled = false;
        }
    });

    async function deleteCard(cardId, button) {
        const collectionOwner = isOwner ? 'your collection' : `@${activeProfile.username}’s collection`;
        button.disabled = true;
        try {
            const cardName = activeCards.get(cardId)?.card.name || 'this card';
            const confirmed = await window.confirmStoreAction({
                title: 'Delete card?',
                message: `Are you sure you want to delete ${cardName} from ${collectionOwner}? This cannot be undone.`,
                confirmLabel: 'Delete'
            });
            if (!confirmed) return;
            setMessage(cardEditMessage, 'Removing card…');
            const card = (await client.from('community_cards')
                .select('id, photo_path, back_photo_path')
                .eq('id', cardId)
                .eq('owner_id', activeProfile.id)
                .single());
            if (card.error) throw card.error;

            const { error } = await client.from('community_cards')
                .delete()
                .eq('id', cardId)
                .eq('owner_id', activeProfile.id);
            if (error) throw error;
            activeCards.delete(cardId);
            if (selectedCardId === cardId) cardDialog.close();
            resetPhotoSlots(cardEditForm);
            const photoPaths = [card.data.photo_path, card.data.back_photo_path].filter(Boolean);
            let photoError;
            if (photoPaths.length) {
                ({ error: photoError } = await client.storage.from('community-card-photos').remove(photoPaths));
            }
            await loadCards(activeProfile);
            if (photoError) {
                setMessage(collectionNotice, `Card removed, but its photo could not be deleted: ${photoError.message}`, true);
            }
        } catch (error) {
            setMessage(cardDialog.open ? cardEditMessage : collectionNotice, `Unable to remove card: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    }

    document.querySelector('#community-card-edit-delete').addEventListener('click', event => {
        if (selectedCardId && (isOwner || isAdmin)) deleteCard(selectedCardId, event.currentTarget);
    });

    cardGrid.addEventListener('click', async event => {
        const favoriteButton = event.target.closest('[data-favorite-card]');
        if (favoriteButton) {
            try {
                await window.communityFavorites.toggle(favoriteButton);
            } catch (error) {
                setMessage(collectionNotice, `Unable to update favorites: ${error.message}`, true);
                return;
            }
            try {
                await window.communityFavorites.refreshCounts([favoriteButton.dataset.favoriteCard], cardGrid);
                setMessage(collectionNotice, '');
            } catch (error) {
                const count = favoriteButton.closest('article').querySelector('[data-favorite-count]');
                count.textContent = '–';
                count.setAttribute('aria-label', 'Favorite count unavailable');
                setMessage(collectionNotice, `Favorite updated, but its count could not be refreshed: ${error.message}`, true);
            }
            return;
        }
        const openButton = event.target.closest('[data-open-card]');
        if (openButton) {
            openCardDetails(openButton.dataset.openCard);
            return;
        }
    });

    try {
        const session = await window.communityReady;
        currentUser = session?.user || null;
        let favoritesError = '';
        try {
            await window.communityFavorites.load(session);
        } catch (error) {
            favoritesError = error.message;
        }
        if (currentUser) {
            const { data: adminStatus, error: adminError } = await client.rpc('is_store_admin');
            if (adminError) throw adminError;
            isAdmin = adminStatus === true;
        }
        const requestedUser = new URLSearchParams(window.location.search).get('user');
        if (!requestedUser && !currentUser) {
            setMessage(notice, 'Sign in or create an account to set up your collector profile.');
            communityAuthDialogFallback();
            return;
        }

        let query = client.from('community_profiles')
            .select('id, username, display_name, bio, is_public, is_founder, avatar_path');
        if (!requestedUser) {
            query = query.eq('id', currentUser.id);
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUser)) {
            query = query.eq('id', requestedUser);
        } else if (/^[a-z0-9_]{3,24}$/i.test(requestedUser)) {
            query = query.eq('username', requestedUser.toLowerCase());
        } else {
            setMessage(notice, 'This profile is unavailable.');
            return;
        }
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) {
            setMessage(notice, 'This profile is unavailable.');
            return;
        }

        activeProfile = data;
        isOwner = currentUser?.id === activeProfile.id;
        const canManage = isOwner || isAdmin;
        await drawSummary(activeProfile);
        document.title = `${activeProfile.display_name} | Beans Jeans Card Club`;
        if (canManage) {
            populateEditor(activeProfile);
            editToggle.hidden = false;
            addCardToggle.hidden = false;
            if (isAdmin && !isOwner) {
                document.querySelector('#profile-editor h2').textContent = 'Edit collector profile';
            }
        }
        await loadCards(activeProfile);
        if (favoritesError) setMessage(collectionNotice, `Unable to load favorites: ${favoritesError}`, true);
        const requestedCard = new URLSearchParams(window.location.search).get('card');
        if (requestedCard) {
            if (activeCards.has(requestedCard)) openCardDetails(requestedCard);
            else setMessage(collectionNotice, 'This card is no longer available.');
        }
    } catch (error) {
        const message = /object not found/i.test(error.message)
            ? 'Collection photos are not public yet. Run the latest supabase-community-setup.sql in the Supabase SQL Editor, then reload this profile.'
            : window.communityErrorMessage(error);
        setMessage(notice, `Unable to load this profile: ${message}`, true);
    }

    function communityAuthDialogFallback() {
        document.querySelector('#community-join-trigger').click();
    }
})();
