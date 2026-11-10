const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nav = require('../../modules/spatial-nav');

// A tiny DOM: elements with rectangles laid out like the full-screen avatar window (1280x720).
function setup({ debugOn = false } = {}) {
    let keydown;
    const document = { activeElement: null, addEventListener: (_name, handler) => keydown = handler };
    const make = (id, rect, extra = {}) => ({
        id, rect, hidden: false, disabled: false, clicks: 0, parent: null, tag: 'button', scrollTop: 0, scrollHeight: 0, clientHeight: 0,
        getAttribute(name) { return this.attrs?.[name] ?? null; },
        getClientRects() { return this.hidden ? [] : [1]; },
        getBoundingClientRect() { return this.rect; },
        matches(selector) { return selector === 'button' ? this.tag === 'button' : selector === '[data-remote-scroll]' ? Boolean(this.scroll) : false; },
        closest(selector) {
            for (let el = this; el; el = el.parent) {
                if (selector === '[role="group"]' && el.role === 'group') return el;
                if (selector === '#debug-stream' && el.id === 'debug-stream') return el;
                if (selector === '[hidden],[inert]' && el.hidden) return el;
            }
            return null;
        },
        scrollBy({ top }) { this.scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, this.scrollTop + top)); },
        contains(other) { for (let el = other; el; el = el.parent) if (el === this) return true; return false; },
        focus() { document.activeElement = this; },
        click() { this.clicks++; this.onclick?.(); },
        ...extra
    });
    const row = { id: 'avatar-controls', role: 'group', hidden: false, parent: null };
    const y = 650, w = 44;
    const mic = make('control-mic', { x: 534, y, width: w, height: w });
    const camera = make('control-camera', { x: 590, y, width: w, height: w });
    const speaker = make('control-speaker', { x: 646, y, width: w, height: w });
    const settings = make('control-settings', { x: 702, y, width: w, height: w });
    for (const el of [mic, camera, speaker, settings]) el.parent = row;
    const debug = make('control-debug', { x: 1192, y: 24, width: 64, height: 32 }, { attrs: { 'aria-pressed': String(debugOn) } });
    const panel = make('debug-stream', { x: 24, y: 24, width: 380, height: 608 }, { tag: 'aside', scroll: true, hidden: !debugOn, scrollHeight: 2000, clientHeight: 600 });
    const clear = make('debug-clear', { x: 36, y: 36, width: 120, height: 32 }); clear.parent = panel;
    debug.onclick = () => { const on = debug.attrs['aria-pressed'] !== 'true'; debug.attrs['aria-pressed'] = String(on); panel.hidden = !on; };
    const all = [debug, clear, panel, mic, camera, speaker, settings];
    document.querySelectorAll = () => all;
    document.getElementById = id => all.find(el => el.id === id);
    vm.runInNewContext(fs.readFileSync('modules/remote-controls.js', 'utf8'), { document, window: { NodieSpatialNav: nav } });
    const press = (key, options = {}) => { const event = { key, prevented: false, preventDefault() { this.prevented = true; }, ...options }; keydown(event); return event; };
    return { document, press, mic, camera, speaker, settings, debug, panel, clear };
}

test('nearest-neighbour rule: straight ahead beats closer-but-sideways, nothing behind is chosen', () => {
    const at = (x, y) => ({ rect: { x, y, width: 10, height: 10 } });
    const from = { x: 100, y: 100, width: 10, height: 10 };
    const ahead = at(100, 300), diagonal = at(220, 160), behind = at(100, 0);
    assert.equal(nav.nearest(from, [ahead, diagonal, behind], 'ArrowDown'), ahead);
    assert.equal(nav.nearest(from, [ahead, diagonal, behind], 'ArrowUp'), behind);
    assert.equal(nav.nearest(from, [ahead, diagonal, behind], 'ArrowRight'), diagonal);
    assert.equal(nav.nearest(from, [ahead, diagonal, behind], 'ArrowLeft'), null);
    assert.equal(nav.nearest(from, [at(102, 103)], 'ArrowDown'), null, 'overlapping centres are not "in that direction"');
    assert.equal(nav.opposite('ArrowUp'), 'ArrowDown');
});

test('arrows enter the controls and move the focus that OK activates', () => {
    const { document, press, mic, camera } = setup();
    press('ArrowDown'); assert.equal(document.activeElement, mic);
    press('ArrowRight'); assert.equal(document.activeElement, camera);
    press('Enter'); assert.equal(camera.clicks, 1);
    press('Enter', { repeat: true }); assert.equal(camera.clicks, 1);
    press('ArrowLeft'); assert.equal(document.activeElement, mic);
    press('ArrowLeft'); assert.equal(document.activeElement, mic, 'the row has an end');
});

test('Up from the controls row reaches Debug, Down returns to the control it came from, OK toggles it', () => {
    const { document, press, speaker, debug, mic } = setup();
    speaker.focus();
    press('ArrowUp'); assert.equal(document.activeElement, debug);
    press('Enter'); assert.equal(debug.getAttribute('aria-pressed'), 'true');
    press('Enter'); assert.equal(debug.getAttribute('aria-pressed'), 'false');
    press('ArrowDown'); assert.equal(document.activeElement, speaker, 'back to where focus came from');
    // Without a remembered origin, entering the row lands on its first control.
    debug.focus(); press('ArrowDown'); assert.equal(document.activeElement, mic);
});

test('the debug log scrolls with Up/Down, then focus moves on; Back switches Debug off', () => {
    const { document, press, debug, panel, clear, mic } = setup({ debugOn: true });
    debug.focus();
    press('ArrowLeft'); assert.equal(document.activeElement, clear, 'nearest control to the left is in the log');
    press('ArrowDown'); assert.equal(document.activeElement, panel);
    press('ArrowDown'); assert.ok(panel.scrollTop > 0, 'Down scrolls the log');
    while (panel.scrollTop < panel.scrollHeight - panel.clientHeight) press('ArrowDown');
    press('ArrowUp'); assert.equal(document.activeElement, panel); assert.ok(panel.scrollTop < 1400);
    panel.scrollTop = 0; press('ArrowUp'); assert.equal(document.activeElement, clear, 'at the top, Up leaves the log');
    press('ArrowRight'); assert.equal(document.activeElement, debug);
    panel.focus();
    const back = press('Escape');
    assert.equal(back.prevented, true); assert.equal(debug.getAttribute('aria-pressed'), 'false'); assert.equal(panel.hidden, true); assert.equal(document.activeElement, debug);
    // With Debug off, Back is left for the launcher.
    assert.equal(press('Escape').prevented, false);
    mic.focus(); assert.equal(press('Escape').prevented, false);
});

test('hidden and disabled controls are skipped', () => {
    const { document, press, mic, camera, speaker, debug } = setup();
    mic.disabled = true; camera.hidden = true;
    press('ArrowDown'); assert.equal(document.activeElement, speaker);
    debug.hidden = true; press('ArrowUp'); assert.equal(document.activeElement, speaker, 'nothing above: focus stays');
});

test('Sofa device shortcuts target only named controls, ignore repeats and do not interrupt editing', () => {
    const { press, mic, camera, speaker } = setup();
    press('C', { ctrlKey: true, shiftKey: true }); assert.equal(camera.clicks, 1);
    press('C', { ctrlKey: true, shiftKey: true, repeat: true }); assert.equal(camera.clicks, 1);
    press('M', { ctrlKey: true, shiftKey: true }); assert.equal(mic.clicks, 1);
    press('S', { ctrlKey: true, shiftKey: true, target: { closest: () => ({}) } }); assert.equal(speaker.clicks, 0);
});

test('editing and launcher modifier shortcuts keep their normal behaviour', () => {
    const { document, press } = setup();
    press('ArrowRight', { ctrlKey: true }); assert.equal(document.activeElement, null);
    press('ArrowRight', { target: { closest: () => ({}) } }); assert.equal(document.activeElement, null);
});
