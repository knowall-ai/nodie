const {app,BrowserWindow}=require('electron');
const fs=require('fs'),assert=require('assert/strict');
app.whenReady().then(async()=>{const w=new BrowserWindow({width:1280,height:720,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});const wc=w.webContents;
 await w.loadURL('data:text/html,'+encodeURIComponent('<style>input,button{display:block;margin:50px}#third{margin-top:900px}</style><input id=first type=checkbox><input id=second type=checkbox><input id=third type=text><button id=save>Save</button>'));
 await wc.executeJavaScript(fs.readFileSync(require('path').join(__dirname,'../modules/settings-remote.js'),'utf8'));
 async function key(keyCode){wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode});await new Promise(r=>setTimeout(r,40));}
 await key('Down');assert.equal(await wc.executeJavaScript('document.activeElement.id'),'first');await key('Return');assert.equal(await wc.executeJavaScript('first.checked'),true);
 await key('Down');assert.equal(await wc.executeJavaScript('document.activeElement.id'),'second');await key('Down');assert.equal(await wc.executeJavaScript('document.activeElement.id'),'third');assert.ok(await wc.executeJavaScript('scrollY>0'));
 await wc.executeJavaScript("third.value='abc';third.setSelectionRange(1,1)");await key('Left');assert.equal(await wc.executeJavaScript('third.selectionStart'),0);await key('Down');assert.equal(await wc.executeJavaScript('document.activeElement.id'),'save');
 console.log('Nodie settings: arrow focus, checkbox OK, scrolling, text editing and form exit passed');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1)});
