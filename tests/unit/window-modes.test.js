const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { applySecondLaunch, displayKeepAwake } = require('../../lib/launch-flags');

// Exercise the actual main-process factory without starting Electron or services.
// launchMode is 'compact' (no flag), 'fullscreen' (--fullscreen: Nod.ie owns full screen)
// or 'tv' (--tv: a TV launcher such as Sofa manages the window).
function desktop(launchMode = 'compact', platform = 'linux') {
    const windows = [], trackers = [], keys = new Map(), saved = [];
    const source = fs.readFileSync(require.resolve('../../main'), 'utf8');
    const factory = source.slice(source.indexOf('    function createMainWindow('), source.indexOf('    app.whenReady().then('));
    const display = { x: 0, y: 0, width: 1920, height: 1080 };
    const screen = { getPrimaryDisplay: () => ({ workArea: { ...display } }), getDisplayMatching: () => ({ bounds: { ...display } }) };
    const settingsWindow = { setParentWindow(win) { this.parent = win; } };
    const context = vm.createContext({
        launchMode, mainWindow: null, pointerTracker: null, windowMode: null, settingsWindow,
        process: { platform, env: {} }, app: {}, logger: {}, dragTimer: null,
        stopDrag() {}, store: { get() {}, set(key, value) { saved.push([key, value]); } }, showSettings() {},
        globalShortcut: { register: (key, fn) => keys.set(key, fn), unregister: key => keys.delete(key) },
        Menu: { buildFromTemplate: items => ({ items, popup() {} }) },
        require(name) {
            if (name === 'electron') return { screen };
            if (name === './lib/window-controls') return require('../../lib/window-controls');
            if (name === './lib/window-hit-test') return { trackPointer() {
                const tracker = { stopped: false, interactive: false, stop() { this.stopped = true; }, setFullScreen(value) { this.interactive = value; } };
                trackers.push(tracker); return tracker;
            } };
            throw Error(name);
        },
        secureWindow(options) {
            const win = new EventEmitter();
            Object.assign(win, {
                options, bounds: { x: 0, y: 0, width: options.width, height: options.height },
                visible: true, destroyed: false, nativeFull: false, onTop: options.alwaysOnTop,
                webContents: Object.assign(new EventEmitter(), { sent: [], send(channel, value) { this.sent.push([channel, value]); } }),
                setAlwaysOnTop(value) { this.onTop = value; }, setResizable() {},
                getBounds() { return { ...this.bounds }; }, setBounds(bounds) { this.bounds = { ...bounds }; },
                setPosition(x, y) { Object.assign(this.bounds, { x, y }); },
                getPosition() { return [this.bounds.x, this.bounds.y]; },
                // Like Electron: a change of its own full-screen state resizes and emits an event.
                setFullScreen(value) {
                    if (value === this.nativeFull) return;
                    this.nativeFull = value;
                    if (value) { this.bounds = { ...display }; this.emit('resize'); this.emit('enter-full-screen'); } else this.emit('leave-full-screen');
                },
                isFullScreen() { return this.nativeFull; },
                isVisible() { return this.visible; }, isFocused() { return this.focused ?? true; }, isDestroyed() { return this.destroyed; }, isMinimized() { return false; },
                show() { this.visible = true; this.emit('show'); }, hide() { this.visible = false; this.emit('hide'); }, focus() { this.focused = true; },
                destroy() { assert.fail('Mode changes must never destroy the window'); }
            });
            windows.push(win); return win;
        }
    });
    vm.runInContext(factory, context);
    return { context, windows, trackers, keys, saved, create: () => context.createMainWindow() };
}
const escape = win => { let prevented = false; win.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', key: 'Escape' }); return prevented; };

test('--fullscreen (Nod.ie-owned) uses one normal window; Escape, restore and window-manager exits keep it full screen', () => {
    const d = desktop('fullscreen'); d.create();
    const win = d.context.mainWindow;
    assert.equal(win.options.type, undefined);
    assert.equal(win.nativeFull, true);
    assert.equal(d.keys.has('Escape'), false);
    assert.equal(escape(win), true, 'Escape is swallowed, not passed on');
    d.context.windowMode.action('restore');
    assert.equal(win.nativeFull, true);
    d.context.windowMode.action('tray');
    win.nativeFull = false;
    win.emit('leave-full-screen');
    assert.equal(win.nativeFull, true, 'an external exit is reversed');
    assert.equal(win.isVisible(), false);
    assert.equal(d.context.windowMode.isFullscreen(), true);
    d.context.windowMode.action('show');
    assert.equal(win.isVisible(), true);
    assert.equal(d.context.mainWindow, win);
    assert.equal(d.windows.length, 1);
    assert.equal(d.trackers[0].stopped, false);
});

test('--tv (launcher-managed) starts full screen in one normal window and respects an external exit instead of fighting it', () => {
    const d = desktop('tv'); d.create();
    const win = d.context.mainWindow;
    assert.equal(win.options.type, undefined);
    assert.equal(win.nativeFull, true);
    assert.equal(win.onTop, false, 'launcher overlays can appear above the full-screen window');
    assert.equal(d.keys.has('Escape'), false);
    assert.equal(escape(win), false, 'Escape is left to the page');
    assert.throws(() => d.context.windowMode.action('restore'), /TV launcher/);
    assert.throws(() => d.context.windowMode.action('tray'), /TV launcher/);
    assert.equal(win.isVisible(), true);
    // Sofa's screen-in-screen: it un-fullscreens Nod.ie and moves it into a corner.
    win.nativeFull = false;
    win.setBounds({ x: 1440, y: 790, width: 448, height: 252 });
    win.emit('leave-full-screen');
    win.emit('moved');
    assert.equal(win.nativeFull, false, 'Nod.ie does not re-enter full screen');
    assert.deepEqual(win.getBounds(), { x: 1440, y: 790, width: 448, height: 252 }, 'the old compact bounds are not restored');
    assert.equal(d.context.windowMode.isFullscreen(), false);
    assert.equal(d.trackers[0].interactive, true, 'the whole window stays interactive');
    assert.deepEqual(win.webContents.sent.at(-1), ['window-mode', { fullscreen: false, tv: true }]);
    assert.deepEqual(d.saved, [], 'the launcher geometry is never saved as the floating position');
    // Sofa returns it to full screen.
    win.nativeFull = true; win.emit('enter-full-screen');
    assert.equal(d.context.windowMode.isFullscreen(), true);
    assert.equal(win.onTop, false);
    assert.equal(d.windows.length, 1);
});

test('--tv follows a window-manager exit Electron does not report (X11): only the bounds change', () => {
    const d = desktop('tv'); d.create();
    const win = d.context.mainWindow;
    // Sofa removes _NET_WM_STATE_FULLSCREEN and moves the window; Electron still reports full screen.
    win.setBounds({ x: 1440, y: 790, width: 448, height: 252 }); win.emit('resize');
    assert.equal(win.nativeFull, true, 'no event, and Nod.ie does not toggle full screen back');
    assert.deepEqual(win.getBounds(), { x: 1440, y: 790, width: 448, height: 252 });
    assert.equal(d.context.windowMode.isFullscreen(), false);
    assert.deepEqual(win.webContents.sent.at(-1), ['window-mode', { fullscreen: false, tv: true }]);
    assert.equal(win.onTop, false, 'stacking is left to the launcher');
    // Sofa restores full screen.
    win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 }); win.emit('resize');
    assert.equal(d.context.windowMode.isFullscreen(), true);
    assert.deepEqual(win.webContents.sent.at(-1), ['window-mode', { fullscreen: true, tv: true }]);
});

test('--fullscreen re-asserts full screen after a window-manager exit Electron does not report (X11)', () => {
    const d = desktop('fullscreen'); d.create();
    const win = d.context.mainWindow;
    win.setBounds({ x: 490, y: 210, width: 300, height: 300 }); win.emit('resize');
    assert.equal(win.nativeFull, true);
    assert.deepEqual(win.getBounds(), { x: 0, y: 0, width: 1920, height: 1080 });
    assert.equal(d.context.windowMode.isFullscreen(), true);
    assert.equal(d.windows.length, 1);
});

test('compact startup keeps existing dock and restores bounds without replacement', () => {
    const d = desktop('compact'); d.create();
    const win = d.context.mainWindow;
    assert.equal(win.options.type, 'dock');
    assert.equal(win.nativeFull, false);
    win.setBounds({ x: -100, y: 70, width: 300, height: 300 });
    d.context.windowMode.action('fullscreen');
    assert.equal(win.options.type, 'dock');
    assert.deepEqual(win.webContents.sent.at(-1), ['window-mode', { fullscreen: true, tv: false }]);
    d.keys.get('Escape')();
    win.emit('leave-full-screen');
    assert.deepEqual(win.getBounds(), { x: -100, y: 70, width: 300, height: 300 });
    assert.equal(d.context.windowMode.isFullscreen(), false);
    assert.equal(d.windows.length, 1);
});

test('repeated second launches retain the renderer and a single blocker in every mode', () => {
    for (const launchMode of ['compact', 'fullscreen', 'tv']) {
        const d = desktop(launchMode); d.create();
        const win = d.context.mainWindow;
        const notices = [];
        const app = new EventEmitter(); let starts = 0, stops = 0;
        const keepAwake = displayKeepAwake({ start() { return ++starts; }, isStarted: () => true, stop() { stops++; } }, app);
        win.hide();
        for (let i = 0; i < 2; i++) applySecondLaunch(['nodie', '--fullscreen', '--keep-awake'], {
            window: win, mode: launchMode, keepAwake, notify: message => notices.push(message)
        });
        assert.equal(win.isVisible(), true);
        assert.equal(win.focused, true);
        assert.equal(win.nativeFull, launchMode !== 'compact');
        assert.equal(d.windows.length, 1);
        assert.equal(d.trackers[0].stopped, false);
        assert.equal(notices.length, launchMode === 'fullscreen' ? 0 : 2, launchMode);
        assert.equal(starts, 1);
        app.emit('will-quit'); assert.equal(stops, 1);
    }
});
