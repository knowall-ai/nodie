/** --tv / --fullscreen / --keep-awake, applied at startup and when a second launch forwards its argv. */

// The window mode is chosen once, at startup:
// - '--tv': a TV launcher (Sofa) manages the window; it may un-fullscreen or resize it.
// - '--fullscreen': standalone full screen that Nod.ie owns and re-asserts.
// - neither: the compact floating avatar.
// --tv wins if both are given, because the launcher's window management must not be fought.
const MODE_FLAGS = { tv: '--tv', fullscreen: '--fullscreen' };
function windowMode(argv) {
    const args = Array.isArray(argv) ? argv : [];
    if (args.includes(MODE_FLAGS.tv)) return 'tv';
    if (args.includes(MODE_FLAGS.fullscreen)) return 'fullscreen';
    return 'compact';
}
const MODE_NAMES = { tv: 'TV mode', fullscreen: 'full-screen mode' };

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
// the window and apply keep-awake. The window mode can only be selected at startup.
function applySecondLaunch(argv, { window, mode = 'compact', keepAwake, notify = console.info }) {
    const args = Array.isArray(argv) ? argv : [];
    if (args.includes('--keep-awake')) keepAwake();
    const requested = windowMode(args);
    if (requested !== 'compact' && requested !== mode) notify(`Restart Nod.ie with ${MODE_FLAGS[requested]} to use ${MODE_NAMES[requested]}`);
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

module.exports = { windowMode, displayKeepAwake, applySecondLaunch };
