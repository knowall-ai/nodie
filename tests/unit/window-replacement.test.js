const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { applySecondLaunch, displayKeepAwake } = require('../../lib/launch-flags');

// Exercise the actual main-process factory without starting Electron or services.
function desktop(platform = 'linux') {
    const windows = [], trackers = [], keys = new Map();
    const source = fs.readFileSync(require.resolve('../../main'), 'utf8');
    const factory = source.slice(source.indexOf('    function createMainWindow('), source.indexOf('    app.whenReady().then('));
    const screen = { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) };
    const settingsWindow = { setParentWindow(win) { this.parent = win; } };
    const context = vm.createContext({
        mainWindow: null, pointerTracker: null, windowMode: null, settingsWindow,
        process: { platform, env: {} }, app: {}, logger: {}, dragTimer: null,
        stopDrag() {}, store: { get() {}, set() {} }, showSettings() {},
        globalShortcut: { register: (key, fn) => keys.set(key, fn), unregister: key => keys.delete(key) },
        Menu: { buildFromTemplate: items => ({ items, popup() {} }) },
        require(name) {
            if (name === 'electron') return { screen };
            if (name === './lib/window-controls') return require('../../lib/window-controls');
            if (name === './lib/window-hit-test') return { trackPointer() {
                const tracker = { stopped: false, stop() { this.stopped = true; }, setFullScreen() {} };
                trackers.push(tracker); return tracker;
            } };
            throw Error(name);
        },
        secureWindow(options) {
            const win = new EventEmitter();
            Object.assign(win, {
                options, bounds: { x: 0, y: 0, width: options.width, height: options.height },
                visible: false, destroyed: false, nativeFull: false,
                webContents: Object.assign(new EventEmitter(), { send() {} }),
                setAlwaysOnTop() {}, setResizable() {},
                getBounds() { return { ...this.bounds }; }, setBounds(bounds) { this.bounds = { ...bounds }; },
                setPosition(x, y) { Object.assign(this.bounds, { x, y }); },
                getPosition() { return [this.bounds.x, this.bounds.y]; },
                setFullScreen(value) { this.nativeFull = value; }, isFullScreen() { return this.nativeFull; },
                isVisible() { return this.visible; }, isDestroyed() { return this.destroyed; }, isMinimized() { return false; },
                show() { this.visible = true; this.emit('show'); }, hide() { this.visible = false; this.emit('hide'); }, focus() {},
                destroy() { assert.notEqual(context.mainWindow, this); this.destroyed = true; this.emit('closed'); }
            });
            windows.push(win); return win;
        }
    });
    vm.runInContext(factory, context);
    return { context, windows, trackers, keys, create: full => context.createMainWindow(full) };
}

test('Linux startup fullscreen restores a dock on Escape and forwards repeated fullscreen launches', () => {
    const d = desktop(); d.create(true);
    const bounds = d.context.mainWindow.getBounds();
    assert.equal(d.windows[0].options.type, undefined);
    assert.equal(d.windows[0].nativeFull, true);
    let prevented = false;
    d.windows[0].webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', key: 'Escape' });
    assert.equal(prevented, true);
    assert.equal(d.context.mainWindow.options.type, 'dock');
    assert.deepEqual(d.context.mainWindow.getBounds(), bounds);
    assert.equal(d.windows[0].destroyed, true);
    assert.equal(d.trackers[0].stopped, true);
    assert.equal(d.keys.has('Escape'), false);
    assert.equal(d.context.settingsWindow.parent, d.context.mainWindow);
    const app = new EventEmitter(); let starts = 0, stops = 0;
    const keepAwake = displayKeepAwake({ start() { return ++starts; }, isStarted: () => true, stop() { stops++; } }, app);
    for (let i = 0; i < 2; i++) {
        applySecondLaunch(['nodie', '--fullscreen', '--keep-awake'], { window: d.context.mainWindow, windowMode: d.context.windowMode, keepAwake });
        assert.equal(d.context.mainWindow.options.type, undefined);
        assert.equal(d.context.mainWindow.nativeFull, true);
        const count = d.windows.length;
        applySecondLaunch(['nodie', '--fullscreen'], { window: d.context.mainWindow, windowMode: d.context.windowMode, keepAwake });
        assert.equal(d.windows.length, count);
        d.keys.get('Escape')();
        assert.equal(d.context.mainWindow.options.type, 'dock');
        assert.deepEqual(d.context.mainWindow.getBounds(), bounds);
    }
    assert.equal(starts, 1); assert.equal(stops, 0);
    app.emit('will-quit'); assert.equal(stops, 1);
    assert.equal(d.windows.filter(w => !w.destroyed).length, 1);
});

test('native fullscreen exit replaces a hidden window without showing it', () => {
    const d = desktop(); d.create(true);
    d.context.windowMode.action('tray');
    d.context.mainWindow.emit('leave-full-screen');
    assert.equal(d.context.mainWindow.options.type, 'dock');
    assert.equal(d.context.mainWindow.isVisible(), false);
    assert.equal(d.keys.has('Escape'), false);
    d.context.windowMode.action('show');
    assert.equal(d.context.mainWindow.isVisible(), true);
});

test('compact startup transitions to a normal fullscreen window; other platforms retain their window', () => {
    const d = desktop(); d.create(false);
    assert.equal(d.context.mainWindow.options.type, 'dock');
    d.context.mainWindow.setBounds({ x: -100, y: 70, width: 300, height: 300 });
    d.context.windowMode.action('fullscreen');
    assert.equal(d.context.mainWindow.options.type, undefined);
    d.context.windowMode.action('restore');
    assert.deepEqual(d.context.mainWindow.getBounds(), { x: -100, y: 70, width: 300, height: 300 });
    for (const platform of ['darwin', 'win32']) {
        const other = desktop(platform); other.create(false);
        other.context.windowMode.action('fullscreen');
        other.context.windowMode.action('restore');
        other.context.mainWindow.emit('leave-full-screen');
        assert.equal(other.windows.length, 1);
        assert.equal(other.context.windowMode.isFullscreen(), false);
    }
});
