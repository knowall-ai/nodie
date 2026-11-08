const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { displayKeepAwake, applySecondLaunch } = require('../../lib/launch-flags');

function fakeBlocker() {
    const started = new Set(); let next = 1; const calls = [];
    return { calls, started, start(type) { calls.push(['start', type]); const id = next++; started.add(id); return id; }, stop(id) { calls.push(['stop', id]); started.delete(id); }, isStarted: id => started.has(id) };
}

test('keep-awake starts at most one blocker and stops it on quit', () => {
    const blocker = fakeBlocker(), app = new EventEmitter();
    const keepAwake = displayKeepAwake(blocker, app);
    const id = keepAwake();
    assert.equal(keepAwake(), id);
    assert.deepEqual(blocker.calls, [['start', 'prevent-display-sleep']]);
    app.emit('will-quit');
    assert.deepEqual(blocker.calls.at(-1), ['stop', id]);
    assert.equal(blocker.started.size, 0);
});

test('keep-awake restarts if the blocker was stopped elsewhere', () => {
    const blocker = fakeBlocker(), app = new EventEmitter();
    const keepAwake = displayKeepAwake(blocker, app);
    const first = keepAwake(); blocker.stop(first);
    assert.notEqual(keepAwake(), first);
    assert.equal(blocker.started.size, 1);
});

function fakeWindow() {
    const calls = [];
    return { calls, isDestroyed: () => false, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') };
}
function fakeMode(full = false) {
    const actions = [];
    return { actions, isFullscreen: () => full, action: value => { actions.push(value); full = value === 'fullscreen'; } };
}

test('a second launch shows, focuses and applies forwarded flags', () => {
    const window = fakeWindow(), windowMode = fakeMode(); let awake = 0;
    applySecondLaunch(['/usr/bin/nodie', '--fullscreen', '--keep-awake'], { window, windowMode, keepAwake: () => awake++ });
    assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
    assert.deepEqual(windowMode.actions, ['fullscreen']);
    assert.equal(awake, 1);
});

test('a second launch without flags only shows and focuses; already-fullscreen is left alone', () => {
    const window = fakeWindow(), plain = fakeMode(); let awake = 0;
    applySecondLaunch(['/usr/bin/nodie'], { window, windowMode: plain, keepAwake: () => awake++ });
    assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
    assert.deepEqual(plain.actions, []);
    assert.equal(awake, 0);
    const full = fakeMode(true);
    applySecondLaunch(['nodie', '--fullscreen'], { window: fakeWindow(), windowMode: full, keepAwake: () => {} });
    assert.deepEqual(full.actions, []);
});

test('keep-awake still applies before the window exists', () => {
    let awake = 0;
    applySecondLaunch(['nodie', '--keep-awake', '--fullscreen'], { window: null, windowMode: null, keepAwake: () => awake++ });
    assert.equal(awake, 1);
});
