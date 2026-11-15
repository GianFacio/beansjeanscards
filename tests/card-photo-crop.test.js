const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'community', 'card-photo-crop.js'), 'utf8');

function setup() {
    function element() {
        return {
            style: {}, events: {}, classList: { toggle() {} },
            addEventListener(name, callback) { this.events[name] = callback; },
            focus() {}, setPointerCapture() {},
            showModal() { this.open = true; },
            close() { this.open = false; this.events.close(); }
        };
    }
    const nodes = {};
    for (const id of ['dialog', 'viewport', 'image', 'zoom', 'rotation', 'rotation-value', 'title', 'message', 'apply', 'cancel']) {
        nodes[id] = element();
    }
    Object.assign(nodes.viewport, { clientWidth: 260, clientHeight: 359 });
    Object.assign(nodes.image, { naturalWidth: 1200, naturalHeight: 1600, async decode() {} });
    const calls = [];
    const context = {
        window: { requestAnimationFrame(callback) { callback(); } },
        document: {
            querySelector(selector) { return nodes[selector.replace('#card-crop-', '')]; },
            createElement() {
                return {
                    getContext() {
                        return Object.fromEntries(['fillRect', 'scale', 'translate', 'rotate', 'drawImage']
                            .map(name => [name, (...args) => calls.push([name, ...args])]));
                    },
                    toBlob(callback) { callback({ size: 100 }); }
                };
            }
        },
        URL: { createObjectURL() { return 'blob:photo'; }, revokeObjectURL() {} },
        File: class File { constructor(parts, name, options) { Object.assign(this, { parts, name, ...options }); } }
    };
    vm.runInNewContext(source, context);
    return { nodes, calls, crop: context.window.cardPhotoCrop.crop };
}

function assertViewportCovered(nodes) {
    const width = parseFloat(nodes.image.style.width);
    const height = parseFloat(nodes.image.style.height);
    const left = parseFloat(nodes.image.style.left);
    const top = parseFloat(nodes.image.style.top);
    const angle = parseFloat(nodes.image.style.transform.slice(7));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const x of [0, nodes.viewport.clientWidth]) {
        for (const y of [0, nodes.viewport.clientHeight]) {
            const dx = x - left - width / 2;
            const dy = y - top - height / 2;
            assert.ok(Math.abs(cos * dx + sin * dy) <= width / 2 + 1e-8);
            assert.ok(Math.abs(-sin * dx + cos * dy) <= height / 2 + 1e-8);
        }
    }
}

test('rotation keeps the crop covered while zooming and dragging, and is applied to the saved photo', async () => {
    const { nodes, calls, crop } = setup();
    const result = crop({ type: 'image/png', size: 100 }, 'Raw');
    await new Promise(resolve => setImmediate(resolve));
    for (const degrees of ['-15', '90', '180', '0']) {
        nodes.rotation.value = degrees;
        nodes.rotation.events.input();
        assert.equal(nodes['rotation-value'].textContent, `${degrees}°`);
        assertViewportCovered(nodes);
        nodes.zoom.value = '2';
        nodes.zoom.events.input();
        nodes.viewport.events.pointerdown({ button: 0, pointerId: 1, clientX: 0, clientY: 0 });
        nodes.viewport.events.pointermove({ clientX: 10000, clientY: -10000 });
        nodes.viewport.events.pointerup();
        assertViewportCovered(nodes);
    }
    nodes.rotation.value = '-12';
    nodes.rotation.events.input();
    const expectedAngle = -12 * Math.PI / 180;
    await nodes.apply.events.click();
    const file = await result;
    assert.equal(file.type, 'image/jpeg');
    assert.equal(calls.find(call => call[0] === 'rotate')[1], expectedAngle);
    const translation = calls.find(call => call[0] === 'translate');
    assert.equal(translation[1], parseFloat(nodes.image.style.left) + parseFloat(nodes.image.style.width) / 2);
    assert.equal(translation[2], parseFloat(nodes.image.style.top) + parseFloat(nodes.image.style.height) / 2);
});

test('rotation resets for the next photo and cancellation returns null', async () => {
    const { nodes, crop } = setup();
    const file = { type: 'image/jpeg', size: 100 };
    const first = crop(file, 'Raw');
    await new Promise(resolve => setImmediate(resolve));
    nodes.rotation.value = '45';
    nodes.rotation.events.input();
    nodes.cancel.events.click();
    assert.equal(await first, null);
    const second = crop(file, 'PSA 10');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nodes.rotation.value, '0');
    assert.equal(nodes['rotation-value'].textContent, '0°');
    assertViewportCovered(nodes);
    nodes.cancel.events.click();
    assert.equal(await second, null);
});
