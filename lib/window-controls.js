/**
 * Preserve the window and renderer while changing presentation. The mode is fixed at startup:
 * - 'compact': the floating avatar; full screen is a toggle and Escape restores the old bounds.
 * - 'fullscreen' (--fullscreen): standalone full screen that Nod.ie owns. Restore is ignored,
 *   Escape is left to the page and a window-manager exit from full screen is reversed.
 * - 'tv' (--tv): a TV launcher (Sofa) owns the window. Nod.ie starts full screen but respects an
 *   external exit (for example Sofa's screen-in-screen corner), rejects restore/tray requests and
 *   leaves Escape to the page.
 * Electron (X11) does not report a window manager's exit from full screen (Sofa's screen-in-screen
 * removes _NET_WM_STATE_FULLSCREEN, then moves the window): no leave-full-screen event and
 * isFullScreen() stays true. With `screen`, both full-screen modes infer it from the bounds.
 */
const MODES = ['compact', 'fullscreen', 'tv'];
function windowControls(win, tracker, shortcuts, { mode = 'compact', screen = null } = {}) {
    if (!MODES.includes(mode)) throw Error('Invalid window mode');
    const tv = mode === 'tv', locked = mode === 'fullscreen';
    let compact=null, full=false, native=false;
    const syncEscape=()=>{if(!shortcuts)return;shortcuts.unregister('Escape');if(mode==='compact' && full && win.isVisible() && win.isFocused())shortcuts.register('Escape',()=>action('restore'));};
    win.on('hide',syncEscape);win.on('show',syncEscape);win.on('focus',syncEscape);win.on('blur',syncEscape);win.on('closed',()=>shortcuts?.unregister('Escape'));
    const publish=()=>{syncEscape();win.webContents.send('window-mode',{fullscreen:full,tv});};
    const restore=()=>{if(!compact)return;win.setBounds(compact);compact=null;win.setResizable(false);};
    // Full-screen Nod.ie is not always-on-top, so a launcher's overlay menus can appear above it.
    win.on('enter-full-screen',()=>{native=true;full=true;win.setAlwaysOnTop(false);tracker.setFullScreen(true);publish();});
    win.on('leave-full-screen',()=>{
        native=false;
        if(locked){win.setFullScreen(true);return;}
        full=false;win.setAlwaysOnTop(true,tv?'floating':'screen-saver');
        // TV: the launcher chose the new geometry; keep the whole window interactive.
        tracker.setFullScreen(tv);if(!tv)restore();publish();
    });
    const coversDisplay=()=>{const b=win.getBounds(),d=screen.getDisplayMatching(b).bounds;return b.x<=d.x&&b.y<=d.y&&b.x+b.width>=d.x+d.width&&b.y+b.height>=d.y+d.height;};
    win.on('resize',()=>{
        if(!screen || !native || mode==='compact')return;
        const covers=coversDisplay();
        // Toggling lets Electron notice; leave-full-screen then re-enters full screen.
        if(locked){if(!covers){win.setFullScreen(false);win.setFullScreen(true);}return;}
        // TV: follow the launcher without touching its stacking (it manages "above" itself).
        if(full && !covers){full=false;tracker.setFullScreen(true);publish();}
        else if(!full && covers){full=true;publish();}
    });
    win.webContents.on('did-finish-load',publish);
    function action(value){
        if(!['fullscreen','restore','tray','show'].includes(value))throw Error('Invalid window action');
        if(tv && ['restore','tray'].includes(value))throw Error('Use the TV launcher (Sofa) to change the TV window');
        if(value==='show'){win.show();win.focus();return {fullscreen:full};}
        if(value==='tray'){win.hide();return {fullscreen:full};}
        const next=value==='fullscreen';
        if(locked && !next)return {fullscreen:full};
        if(next && !full){compact=win.getBounds();full=true;win.setAlwaysOnTop(false);win.setResizable(true);tracker.setFullScreen(true);win.setFullScreen(true);publish();}
        else if(!next && full){const wasFull=win.isFullScreen();win.setFullScreen(false);if(!wasFull){full=false;tracker.setFullScreen(false);restore();publish();}}
        return {fullscreen:full};
    }
    win.webContents.on('before-input-event',(event,input)=>{
        // Only compact mode uses Escape to restore; full-screen modes leave it to the page
        // (Back closes the debug log, for example). --fullscreen still never leaves full screen.
        if(mode!=='compact' || input.type!=='keyDown' || input.key!=='Escape' || !full)return;
        event.preventDefault();action('restore');
    });
    return {action,isFullscreen:()=>full,syncEscape,mode};
}
module.exports={windowControls,MODES};
