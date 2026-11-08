/** --fullscreen / --keep-awake, applied at startup and when a second launch forwards its argv. */

// At most one prevent-display-sleep blocker per process, stopped on quit.
function displayKeepAwake(powerSaveBlocker, app) {
    let id = null;
    app.once('will-quit', () => { if (id !== null && powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id); id = null; });
    return () => {
        if (id !== null && powerSaveBlocker.isStarted(id)) return id;
        id = powerSaveBlocker.start('prevent-display-sleep');
        return id;
    };
}

// A second launch (for example a TV launcher tile) while Nod.ie runs: show and focus
// the window, then honour the flags it was started with.
function applySecondLaunch(argv, { window, windowMode, keepAwake }) {
    const args = Array.isArray(argv) ? argv : [];
    if (args.includes('--keep-awake')) keepAwake();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (args.includes('--fullscreen') && windowMode && !windowMode.isFullscreen()) windowMode.action('fullscreen');
}

module.exports = { displayKeepAwake, applySecondLaunch };
