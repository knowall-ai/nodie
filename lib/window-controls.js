/**
 * Preserve the window and renderer while changing presentation. The mode is fixed at startup:
 * - 'compact': the floating avatar; full screen is a toggle and Escape restores the old bounds.
 * - 'fullscreen' (--fullscreen): standalone full screen that Nod.ie owns. Restore and Escape are
 *   ignored and a window-manager exit from full screen is reversed.
 * - 'tv' (--tv): a TV launcher (Sofa) owns the window. Nod.ie starts full screen but respects an
 *   external exit (for example Sofa's screen-in-screen corner), rejects restore/tray requests and
 *   leaves Escape to the page.
 */
const MODES = ['compact', 'fullscreen', 'tv'];
function windowControls(win, tracker, shortcuts, { mode = 'compact' } = {}) {
    if (!MODES.includes(mode)) throw Error('Invalid window mode');
    const tv = mode === 'tv', locked = mode === 'fullscreen';
    let compact=null, full=false;
    const syncEscape=()=>{if(!shortcuts)return;shortcuts.unregister('Escape');if(mode==='compact' && full && win.isVisible() && win.isFocused())shortcuts.register('Escape',()=>action('restore'));};
    win.on('hide',syncEscape);win.on('show',syncEscape);win.on('focus',syncEscape);win.on('blur',syncEscape);win.on('closed',()=>shortcuts?.unregister('Escape'));
    const publish=()=>{syncEscape();win.webContents.send('window-mode',{fullscreen:full,tv});};
    const restore=()=>{if(!compact)return;win.setBounds(compact);compact=null;win.setResizable(false);};
    // Full-screen Nod.ie is not always-on-top, so a launcher's overlay menus can appear above it.
    win.on('enter-full-screen',()=>{full=true;win.setAlwaysOnTop(false);tracker.setFullScreen(true);publish();});
    win.on('leave-full-screen',()=>{
        if(locked){win.setFullScreen(true);return;}
        full=false;win.setAlwaysOnTop(true,tv?'floating':'screen-saver');
        // TV: the launcher chose the new geometry; keep the whole window interactive.
        tracker.setFullScreen(tv);if(!tv)restore();publish();
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
        if(tv || input.type!=='keyDown' || input.key!=='Escape' || !full)return;
        event.preventDefault();action('restore');
    });
    return {action,isFullscreen:()=>full,syncEscape,mode};
}
module.exports={windowControls,MODES};
