// Shared storage helpers used by the add-card and inline-edit forms.
window.getCardPhotoSlots = function (photos) {
    const assigned = new Set();
    return ['Front', 'Back'].map((side, position) => {
        let index = photos.findIndex((photo, photoIndex) =>
            !assigned.has(photoIndex) && photo.side?.toLowerCase() === side.toLowerCase());
        if (index < 0 && photos[position] && !photos[position].side && !assigned.has(position)) index = position;
        if (index < 0) return { side, photo: null, index: -1 };
        assigned.add(index);
        return { side, photo: photos[index], index };
    });
};

window.setupCardPhotoSlotInputs = function (container) {
    const previewUrls = new Map();

    container.querySelectorAll('.photo-slot-picker').forEach(button => {
        const input = document.getElementById(button.dataset.fileInput);
        const preview = container.querySelector(`[data-preview-for="${input.id}"]`);
        const action = button.querySelector('.photo-slot-action');
        const emptyText = input.id.includes('front') ? 'Choose front' : 'Choose back';

        function renderPreview() {
            const previousUrl = previewUrls.get(input.id);
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            previewUrls.delete(input.id);
            preview.replaceChildren();

            const file = input.files[0];
            if (!file) {
                preview.textContent = emptyText;
                action.textContent = 'Choose photo';
                return;
            }

            const imageUrl = URL.createObjectURL(file);
            previewUrls.set(input.id, imageUrl);
            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = '';
            preview.append(image);
            action.textContent = 'Change photo';
        }

        button.addEventListener('click', () => input.click());
        input.addEventListener('change', renderPreview);
        renderPreview();
    });

    return function resetPhotoSlotInputs() {
        container.querySelectorAll('.photo-slot-picker').forEach(button => {
            const input = document.getElementById(button.dataset.fileInput);
            input.value = '';
            input.dispatchEvent(new Event('change'));
        });
    };
};

window.uploadCardPhoto = async function (cardId, file, side, detail) {
    const client = window.getStoreSupabaseClient();
    if (!['Front', 'Back'].includes(side)) throw new Error('Photo side must be Front or Back.');
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB.`);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error(`${file.name} is not a JPEG, PNG, or WebP image.`);
    }

    let path;
    let uploaded = false;
    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        path = `${cardId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await client.storage
            .from('card-photos')
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        uploaded = true;

        const { data } = client.storage.from('card-photos').getPublicUrl(path);
        return {
            src: data.publicUrl,
            alt: `${side} of ${detail}`,
            side,
            storagePath: path
        };
    } catch (error) {
        if (uploaded) {
            await window.removeManagedCardPhotos([{ storagePath: path }]);
        }
        throw error;
    }
};

window.removeManagedCardPhotos = async function (photos) {
    const paths = photos.map(photo => photo.storagePath).filter(Boolean);
    if (!paths.length) return;

    const { error } = await window.getStoreSupabaseClient()
        .storage.from('card-photos').remove(paths);
    if (error) throw error;
};
