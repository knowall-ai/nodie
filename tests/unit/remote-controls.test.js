const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    let keydown;
    const document = { activeElement: null, querySelectorAll: () => buttons, addEventListener: (_name, handler) => keydown = handler };
    const buttons = Array.from({ length: 6 }, (_, index) => ({
        index, hidden: false, disabled: false, clicks: 0,
        getAttribute: () => null, getClientRects: () => [1],
        focus() { document.activeElement = this; }, click() { this.clicks++; }
    }));
    vm.runInNewContext(fs.readFileSync('modules/remote-controls.js', 'utf8'), { document });
    const press = (key, options = {}) => keydown({ key, preventDefault() {}, ...options });
    return { buttons, document, press };
}

test('arrows enter the controls and move the focus that OK activates', () => {
    const { buttons, document, press } = setup();
    press('ArrowDown'); assert.equal(document.activeElement, buttons[0]);
    press('ArrowRight'); assert.equal(document.activeElement, buttons[1]);
    press('Enter'); assert.equal(buttons[1].clicks, 1);
    press('Enter', { repeat: true }); assert.equal(buttons[1].clicks, 1);
    press('ArrowLeft'); assert.equal(document.activeElement, buttons[0]);
    press('ArrowLeft'); assert.equal(document.activeElement, buttons[0]);
});
test('hidden and disabled controls are skipped', () => {
    const { buttons, document, press } = setup();
    buttons[0].disabled = true; buttons[1].hidden = true;
    press('ArrowDown'); assert.equal(document.activeElement, buttons[2]);
});
test('editing and launcher modifier shortcuts keep their normal behaviour', () => {
    const { document, press } = setup();
    press('ArrowRight', { ctrlKey: true }); assert.equal(document.activeElement, null);
    press('ArrowRight', { target: { closest: () => ({}) } }); assert.equal(document.activeElement, null);
});
