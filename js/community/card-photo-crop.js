// Crops card photos to one fixed size per card type so every card in a collection lines up.
window.cardPhotoCrop = (function () {
    // Matched to the existing collection: PSA slabs are 1140x1912, raw cards are 1140x1575.
    const sizes = {
        raw: { width: 1140, height: 1575, label: 'Raw card' },
        psa: { width: 1140, height: 1912, label: 'PSA slab' }
    };
    const maxSourceBytes = 25 * 1024 * 1024;
    const dialog = document.querySelector('#card-crop-dialog');
    const viewport = document.querySelector('#card-crop-viewport');
    const image = document.querySelector('#card-crop-image');
    const zoom = document.querySelector('#card-crop-zoom');
    const title = document.querySelector('#card-crop-title');
    const message = document.querySelector('#card-crop-message');
    const applyButton = document.querySelector('#card-crop-apply');
    const cancelButton = document.querySelector('#card-crop-cancel');
    let finish = null;
    let objectUrl = '';
    let size = sizes.raw;
    let baseScale = 1;
    let scale = 1;
    let left = 0;
    let top = 0;
    let drag = null;

    function kindFor(grade) {
        return grade === 'Raw' ? 'raw' : 'psa';
    }

    function setMessage(text) {
        message.textContent = text;
        message.hidden = !text;
        message.classList.toggle('store-error', Boolean(text));
    }

    function position(nextLeft, nextTop) {
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        left = Math.min(0, Math.max(viewport.clientWidth - width, nextLeft));
        top = Math.min(0, Math.max(viewport.clientHeight - height, nextTop));
        image.style.width = `${width}px`;
        image.style.height = `${height}px`;
        image.style.left = `${left}px`;
        image.style.top = `${top}px`;
    }

    function setZoom(value) {
        const focusX = (viewport.clientWidth / 2 - left) / scale;
        const focusY = (viewport.clientHeight / 2 - top) / scale;
        scale = baseScale * Number(value);
        position(viewport.clientWidth / 2 - focusX * scale, viewport.clientHeight / 2 - focusY * scale);
    }

    function release() {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = '';
        drag = null;
    }

    // Resolves with the cropped File, or null when the member cancels.
    async function crop(file, grade) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Choose a JPEG, PNG, or WebP image.');
        }
        if (file.size > maxSourceBytes) throw new Error('Card photos must be 25 MB or smaller.');
        const kind = kindFor(grade);
        size = sizes[kind];
        objectUrl = URL.createObjectURL(file);
        image.src = objectUrl;
        try {
            await image.decode();
        } catch (error) {
            release();
            throw new Error('That photo could not be read.');
        }
        title.textContent = `Crop ${size.label} photo`;
        viewport.style.aspectRatio = `${size.width} / ${size.height}`;
        applyButton.disabled = false;
        setMessage('');
        dialog.showModal();
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        baseScale = Math.max(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
        scale = baseScale;
        zoom.value = '1';
        position(
            (viewport.clientWidth - image.naturalWidth * scale) / 2,
            (viewport.clientHeight - image.naturalHeight * scale) / 2
        );
        viewport.focus();
        return new Promise(resolve => { finish = resolve; });
    }

    async function apply() {
        applyButton.disabled = true;
        setMessage('Preparing your crop…');
        try {
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Your browser could not prepare the cropped photo.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(
                image,
                -left / scale,
                -top / scale,
                viewport.clientWidth / scale,
                viewport.clientHeight / scale,
                0,
                0,
                canvas.width,
                canvas.height
            );
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(result => {
                    if (result) resolve(result);
                    else reject(new Error('Your browser could not create the cropped photo.'));
                }, 'image/jpeg', 0.92);
            });
            if (blob.size > 5 * 1024 * 1024) throw new Error('The cropped photo must be 5 MB or smaller.');
            const resolve = finish;
            finish = null;
            dialog.close();
            resolve(new File([blob], 'card-photo.jpg', { type: 'image/jpeg' }));
        } catch (error) {
            setMessage(error.message);
            applyButton.disabled = false;
        }
    }

    zoom.addEventListener('input', () => setZoom(zoom.value));
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        viewport.setPointerCapture(event.pointerId);
        drag = { x: event.clientX, y: event.clientY, left, top };
    });
    viewport.addEventListener('pointermove', event => {
        if (drag) position(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
    });
    viewport.addEventListener('pointerup', () => { drag = null; });
    viewport.addEventListener('pointercancel', () => { drag = null; });
    viewport.addEventListener('keydown', event => {
        const offsets = {
            ArrowLeft: [24, 0],
            ArrowRight: [-24, 0],
            ArrowUp: [0, 24],
            ArrowDown: [0, -24]
        }[event.key];
        if (!offsets) return;
        event.preventDefault();
        position(left + offsets[0], top + offsets[1]);
    });
    applyButton.addEventListener('click', apply);
    cancelButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        release();
        const resolve = finish;
        finish = null;
        if (resolve) resolve(null);
    });

    return { crop, kindFor };
})();
