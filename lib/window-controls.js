/** Preserve the window and renderer; TV mode is fixed at startup. */
function windowControls(win, tracker, shortcuts, { tvMode = false } = {}) {
    let compact=null, full=false;
    const syncEscape=()=>{if(!shortcuts)return;shortcuts.unregister('Escape');if(!tvMode && full && win.isVisible())shortcuts.register('Escape',()=>action('restore'));};
    win.on('hide',syncEscape);win.on('show',syncEscape);win.on('closed',()=>shortcuts?.unregister('Escape'));
    const publish=()=>{syncEscape();win.webContents.send('window-mode',{fullscreen:full});};
    const restore=()=>{if(!compact)return;win.setBounds(compact);compact=null;win.setResizable(false);};
    win.on('enter-full-screen',()=>{full=true;tracker.setFullScreen(true);publish();});
    win.on('leave-full-screen',()=>{if(tvMode){win.setFullScreen(true);return;}full=false;tracker.setFullScreen(false);restore();publish();});
    win.webContents.on('did-finish-load',publish);
    function action(value){
        if(!['fullscreen','restore','tray','show'].includes(value))throw Error('Invalid window action');
        if(value==='show'){win.show();win.focus();return {fullscreen:full};}
        if(value==='tray'){win.hide();return {fullscreen:full};}
        const next=value==='fullscreen';
        if(tvMode && !next)return {fullscreen:full};
        if(next && !full){compact=win.getBounds();full=true;win.setResizable(true);tracker.setFullScreen(true);win.setFullScreen(true);publish();}
        else if(!next && full){const wasFull=win.isFullScreen();win.setFullScreen(false);if(!wasFull){full=false;tracker.setFullScreen(false);restore();publish();}}
        return {fullscreen:full};
    }
    win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&full){event.preventDefault();action('restore');}});
    return {action,isFullscreen:()=>full,syncEscape};
}
module.exports={windowControls};
