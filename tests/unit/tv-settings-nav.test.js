const test = require('node:test');
const assert = require('node:assert/strict');
const { route, step } = require('../../modules/tv-settings-nav');

const pane = (kind, extra = {}) => ({ level: 'pane', kind, hasNeighbour: () => false, ...extra });
const type = (key, s) => route(key, s).type;

test('section list: Up/Down move, Right or OK enters, Back closes settings', () => {
    const list = { level: 'list' };
    assert.deepEqual(route('ArrowDown', list), { type: 'list-move', delta: 1 });
    assert.deepEqual(route('ArrowUp', list), { type: 'list-move', delta: -1 });
    assert.equal(type('ArrowRight', list), 'enter-section');
    assert.equal(type('Enter', list), 'enter-section');
    assert.equal(type('Escape', list), 'close');
    assert.equal(type('ArrowLeft', list), 'ignore');
});

test('section pane: arrows move between controls; Left with nothing to the left, or Back, returns to the list', () => {
    const neighbours = new Set(['ArrowDown', 'ArrowRight']);
    const s = pane('button', { hasNeighbour: key => neighbours.has(key) });
    assert.deepEqual(route('ArrowDown', s), { type: 'move', key: 'ArrowDown' });
    assert.deepEqual(route('ArrowRight', s), { type: 'move', key: 'ArrowRight' });
    assert.equal(type('ArrowUp', s), 'ignore', 'the top of a section is a stop, not a jump to the list');
    assert.equal(type('ArrowLeft', s), 'to-list');
    assert.equal(type('Escape', s), 'to-list');
    neighbours.add('ArrowLeft');
    assert.equal(type('ArrowLeft', s), 'move', 'Left moves to a control on the same row first');
});

test('OK: buttons and switches activate, choice lists open, status blocks do nothing', () => {
    assert.equal(type('Enter', pane('button')), 'activate');
    assert.equal(type('Enter', pane('switch')), 'activate');
    assert.equal(type(' ', pane('switch')), 'activate');
    assert.equal(type('Enter', pane('select')), 'open-chooser');
    assert.equal(type('Enter', pane('scroll')), 'ignore');
});

test('status blocks scroll with Up/Down until their edge, then focus moves on', () => {
    const s = pane('scroll', { canScroll: { up: false, down: true }, hasNeighbour: () => true });
    assert.deepEqual(route('ArrowDown', s), { type: 'scroll', delta: 1 });
    assert.deepEqual(route('ArrowUp', s), { type: 'move', key: 'ArrowUp' });
    s.canScroll.down = false;
    assert.deepEqual(route('ArrowDown', s), { type: 'move', key: 'ArrowDown' });
});

test('text fields: typing is native (Sofa\'s keyboard sends key presses), OK saves, Back discards then leaves', () => {
    const s = pane('text', { caret: 'middle', dirty: false, hasNeighbour: () => true });
    for (const key of ['a', 'Z', ' ', '5', 'Backspace', 'Delete']) assert.equal(type(key, s), 'native', key);
    assert.equal(type('ArrowLeft', s), 'native', 'caret moves inside the text');
    assert.equal(type('ArrowRight', s), 'native');
    assert.equal(type('Enter', s), 'save-text');
    assert.equal(type('ArrowDown', s), 'move', 'Up/Down always leave the field');
    s.caret = 'start';
    assert.equal(type('ArrowLeft', s), 'move', 'at the start, Left leaves the field');
    s.caret = 'end'; s.hasNeighbour = () => false;
    assert.equal(type('ArrowRight', s), 'ignore');
    assert.equal(type('ArrowLeft', s), 'native');
    s.dirty = true;
    assert.equal(type('Escape', s), 'revert-text');
    s.dirty = false;
    assert.equal(type('Escape', s), 'to-list');
});

test('choice lists and confirmations: arrows step, OK chooses, Back cancels', () => {
    for (const level of ['chooser', 'dialog']) {
        assert.deepEqual(route('ArrowDown', { level }), { type: 'step', delta: 1 });
        assert.deepEqual(route('ArrowUp', { level }), { type: 'step', delta: -1 });
        assert.deepEqual(route('ArrowRight', { level }), { type: 'step', delta: 1 });
        assert.equal(type('Enter', { level }), 'choose');
        assert.equal(type('Escape', { level }), 'cancel');
        assert.equal(type('x', { level }), 'ignore', 'nothing leaks to the page behind');
    }
});

test('Back is always a way out: from every level and kind', () => {
    for (const s of [{ level: 'list' }, { level: 'chooser' }, { level: 'dialog' }, pane('button'), pane('switch'), pane('select'), pane('scroll'), pane('text', { dirty: false })]) {
        assert.ok(['close', 'to-list', 'cancel'].includes(type('Escape', s)), JSON.stringify(s));
    }
    assert.equal(step(0, -1, 3), 0); assert.equal(step(2, 1, 3), 2); assert.equal(step(1, 1, 3), 2);
});

test('OK on the nested person-name input clicks person-save once and ignores key repeats', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const source = fs.readFileSync('modules/settings-tv.js', 'utf8');
    // Exercise the actual DOM key handler with the real router, without Electron.
    const handler = source.slice(source.indexOf('    function onKey(event)'), source.indexOf('    /** A modal list'));
    let saved = 0, restored = 0;
    const current = { id: 'person-name', value: 'Alice', parentElement: { querySelector: () => null } };
    const button = { disabled: false, click() { saved++; assert.equal(current.value, 'Alice'); } };
    const document = { activeElement: current, getElementById: id => id === 'person-save' ? button : null };
    const context = vm.createContext({
        document, route, level: 'pane', items: [], overlay: null, active: 0,
        sections: [{ contains: node => node === current }], CONFIG: {},
        state: () => pane('text', { dirty: true }),
        keepFocus: node => { assert.equal(node, button); restored++; }
    });
    vm.runInContext(handler, context);
    const press = repeat => {
        let prevented = false;
        context.onKey({ key: 'Enter', repeat, preventDefault() { prevented = true; }, stopPropagation() {} });
        assert.equal(prevented, true);
    };
    press(false);
    assert.equal(saved, 1);
    assert.equal(restored, 1);
    press(true);
    assert.equal(saved, 1, 'holding OK must not save again');
    button.disabled = true;
    press(false);
    assert.equal(saved, 1, 'a save in progress must not be repeated');
});
