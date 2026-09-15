const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();
const logs = [];
const stats = {};
app.whenReady().then(async () => {
  const out = path.join(root, 'screenshots', 'atmosphere');
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width:1600, height:900, show:true,
    webPreferences:{ preload: path.join(root,'dist-electron/preload.cjs'),
      contextIsolation:true, nodeIntegration:false, sandbox:false, backgroundThrottling:false }});
  win.webContents.on('console-message',(_e,level,message)=>{logs.push('['+(level===3?'error':'log')+'] '+message);});
  await win.loadFile(path.join(root,'dist/index.html'));
  win.focus();
  const run=(c)=>win.webContents.executeJavaScript(c,true);
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  await run(`(async()=>{const w=(ms)=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();
    while(!(window.game&&window.game.state.phase==='menu')){if(Date.now()-t0>40000)return 'timeout';await w(120);}return 'ready';})()`);
  await run(`(async()=>{const g=window.game;g.headless=true;g.startNewRun();
    await new Promise(r=>setTimeout(r,2500));window.__t=g.__test();g.dayNight.paused=true;return 1;})()`);
  for (const [name,hour,wx] of [['sky-cloudy',13,'cloudy'],['sky-clear',13,'clear'],['sky-rain',13,'rain']]) {
    await run(`(async()=>{const g=window.game;g.__setTimeOfDay(${hour});g.__setWeather('${wx}',true);
      window.__t.player.pitch=1.45;await new Promise(r=>setTimeout(r,1200));return 1;})()`);
    await wait(900);
    const img = await win.capturePage();
    fs.writeFileSync(path.join(out,name+'.png'), img.toPNG());
    const bmp=img.getBitmap(); const size=img.getSize();
    let sum=0,count=0;
    const y0=Math.floor(size.height*0.10), y1=Math.floor(size.height*0.35);
    const x0=Math.floor(size.width*0.30), x1=Math.floor(size.width*0.70);
    for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const i=(y*size.width+x)*4;
      sum+=(0.2126*bmp[i+2]+0.7152*bmp[i+1]+0.0722*bmp[i])/255; count++;}}
    const mean=sum/count;
    stats[name]=mean;
    console.log('saved '+name+' zenithMean='+mean.toFixed(4));
  }
  let failed=false;
  const fail=(m)=>{failed=true;console.log('FAIL: '+m);};
  if(!(stats['sky-clear']>stats['sky-cloudy'])) fail('clear sky not brighter than cloudy');
  if(!(stats['sky-cloudy']>stats['sky-rain'])) fail('cloudy sky not brighter than rain');
  for(const k of Object.keys(stats)) if(stats[k]<0.02) fail(k+' sky is black ('+stats[k].toFixed(4)+')');
  const errs=logs.filter(l=>l.startsWith('[error]'));
  if(errs.length){console.log('=== PAGE ERRORS ===\n'+errs.join('\n'));fail(errs.length+' page errors');}
  console.log('\nVERDICT: '+(failed?'FAIL':'PASS'));
  setTimeout(()=>app.exit(failed?1:0),200);
});
