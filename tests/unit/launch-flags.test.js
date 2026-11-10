const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { windowMode, displayKeepAwake, applySecondLaunch } = require('../../lib/launch-flags');

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
test('a forwarded mode flag requests a restart without changing the running window', () => {
    for (const [argv, mode, notice] of [
        [['nodie', '--fullscreen', '--keep-awake'], 'compact', 'Restart Nod.ie with --fullscreen to use full-screen mode'],
        [['nodie', '--tv', '--keep-awake'], 'compact', 'Restart Nod.ie with --tv to use TV mode'],
        [['nodie', '--tv', '--keep-awake'], 'fullscreen', 'Restart Nod.ie with --tv to use TV mode'],
        [['nodie', '--fullscreen', '--keep-awake'], 'tv', 'Restart Nod.ie with --fullscreen to use full-screen mode']
    ]) {
        const window = fakeWindow(), notices = []; let awake = 0;
        applySecondLaunch(argv, { window, mode, keepAwake: () => awake++, notify: message => notices.push(message) });
        assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
        assert.deepEqual(notices, [notice]);
        assert.equal(awake, 1);
    }
});

test('plain launches and a repeat of the running mode just show and focus', () => {
    for (const [argv, mode] of [[['nodie'], 'compact'], [['nodie'], 'fullscreen'], [['nodie'], 'tv'], [['nodie', '--fullscreen'], 'fullscreen'], [['nodie', '--tv'], 'tv'], [['nodie', '--tv', '--fullscreen'], 'tv']]) {
        const window = fakeWindow(); let awake = 0;
        applySecondLaunch(argv, { window, mode, keepAwake: () => awake++, notify: () => assert.fail('Unexpected notice') });
        assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
        assert.equal(awake, 0);
    }
});

test('keep-awake still applies before the window exists', () => {
    let awake = 0;
    applySecondLaunch(['nodie', '--keep-awake'], { window: null, keepAwake: () => awake++ });
    assert.equal(awake, 1);
});

test('startup flags select one window mode; --tv (launcher-managed) wins over --fullscreen', () => {
    assert.equal(windowMode(['electron', '.']), 'compact');
    assert.equal(windowMode(['electron', '.', '--keep-awake']), 'compact');
    assert.equal(windowMode(['electron', '.', '--fullscreen']), 'fullscreen');
    assert.equal(windowMode(['nodie-desktop', '--tv']), 'tv');
    assert.equal(windowMode(['nodie-desktop', '--fullscreen', '--tv']), 'tv');
    assert.equal(windowMode(undefined), 'compact');
});
