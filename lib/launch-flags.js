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
// the window and apply keep-awake. TV mode can only be selected at startup.
function applySecondLaunch(argv, { window, tvMode = false, keepAwake, notify = console.info }) {
    const args = Array.isArray(argv) ? argv : [];
    if (args.includes('--keep-awake')) keepAwake();
    if (args.includes('--fullscreen') && !tvMode) notify('Restart Nod.ie with --fullscreen to use TV mode');
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

module.exports = { displayKeepAwake, applySecondLaunch };
