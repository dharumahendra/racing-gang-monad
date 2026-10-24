import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const root=process.env.APP_URL||'http://127.0.0.1:5173';const out=process.env.BROWSER_REPORT_DIR||'test-results';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];const checks=[];const metrics=[];const run={runId:`0x${'11'.repeat(32)}`,seed:'0x8cfd1f92705b1e83840e3e257e0120b7fc40a9569070f053c50a1d6ad428d684',seedBlock:5,configVersion:1};
function capture(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});}
async function instrument(page){await page.addInitScript(()=>{
  // Observe transient rendered warnings before input/IPC can outlast a countdown step.
  window.__hudWarnings=[];window.__hudMaxWarnings=0;window.__hudPops=[];
  addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>{window.__hudMaxWarnings=Math.max(window.__hudMaxWarnings,document.querySelectorAll('.warning-card').length);for(const node of document.querySelectorAll('[data-local-coins]')){const item={coins:node.getAttribute('data-local-coins'),animation:getComputedStyle(node).animationName};if(!window.__hudPops.some(old=>old.coins===item.coins&&old.animation===item.animation))window.__hudPops.push(item);}for(const node of document.querySelectorAll('[data-warning-kind]')){const item={kind:node.getAttribute('data-warning-kind'),seconds:node.getAttribute('data-warning-seconds'),icon:!!node.querySelector('svg'),label:node.textContent};if(!window.__hudWarnings.some(old=>old.kind===item.kind&&old.seconds===item.seconds&&old.icon===item.icon))window.__hudWarnings.push(item);}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-warning-kind','data-warning-seconds']});});
  const Native=window.AudioContext;window.__sound={contexts:0,resumes:0,starts:0,stops:0,closed:0,frequencies:[]};
  window.AudioContext=class extends Native{
    constructor(...args){super(...args);window.__sound.contexts++;}
    resume(){window.__sound.resumes++;return super.resume();}
    close(){window.__sound.closed++;return super.close();}
    createOscillator(){const osc=super.createOscillator();const start=osc.start.bind(osc),stop=osc.stop.bind(osc),frequency=osc.frequency.setValueAtTime.bind(osc.frequency);osc.frequency.setValueAtTime=(value,time)=>{window.__sound.frequencies.push(value);return frequency(value,time);};osc.start=(...args)=>{window.__sound.starts++;return start(...args);};osc.stop=(...args)=>{window.__sound.stops++;return stop(...args);};return osc;}
  };
});}
try{
  for(const kind of ['SPIKES','RED','NITRO']){
    const page=await browser.newPage({viewport:{width:1440,height:1000}});capture(page);await instrument(page);let socket;
    if(kind==='RED')await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/__network_fixture/runs',r=>r.fulfill({json:run}));
    await page.routeWebSocket('**/__network_fixture/ws/play?*',ws=>{socket=ws;ws.onMessage(raw=>{const m=JSON.parse(raw);if(m.t==='ping')ws.send(JSON.stringify({t:'pong',clientMs:m.clientMs,serverMs:Date.now()}));if(m.t==='run.ready'){ws.send(JSON.stringify({t:'run.go',startAt:Date.now()+3000}));ws.send(JSON.stringify({t:'disruption.scheduled',id:`hud-${kind}`,kind,lanes:kind==='NITRO'?[]:[0],...(kind==='RED'?{durationIndex:0}:{}),warnTick:3,by:'HUD fixture'}));if(kind==='RED')ws.send(JSON.stringify({t:'disruption.scheduled',id:'hud-overlap',kind:'SPIKES',lanes:[0],warnTick:35,by:'HUD fixture'}));}});});
    await page.goto(`${root}/dev/network`);await page.getByRole('button',{name:'Buat run pengujian',exact:true}).click();const connect=page.getByRole('button',{name:'Hubungkan run',exact:true});await connect.waitFor();await page.waitForFunction(()=>document.querySelector('.race-overlay button')?.disabled===false);
    assert.equal((await page.evaluate(()=>window.__sound)).contexts,0);await connect.click();await page.waitForSelector('[data-audio-state="ready"]');
    await page.waitForFunction(kind=>window.__hudWarnings.some(w=>w.kind===kind&&w.seconds==='2'&&w.icon),kind);const observed=await page.evaluate(kind=>window.__hudWarnings.find(w=>w.kind===kind&&w.seconds==='2'&&w.icon),kind);assert(observed.label.includes(kind==='NITRO'?'Semua lajur':'Lajur 1'));await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>window.__sound.starts>=2);assert.equal((await page.evaluate(()=>window.__sound)).contexts,1);checks.push(`${kind}: user-gesture unlock, native AudioContext, icon/lanes and 2-second warning`);
    await page.screenshot({path:`${out}/hud-${kind.toLowerCase()}-warning.png`,fullPage:true});
    if(kind==='RED'){
      await page.waitForSelector('[data-reduced-motion="true"]');await page.getByRole('button',{name:'Suara aktif',exact:true}).click();await page.waitForSelector('[data-audio-state="muted"]');const muted=await page.evaluate(()=>window.__sound.starts);
      await page.waitForFunction(()=>window.__hudWarnings.some(w=>w.kind==='RED'&&w.seconds==='1'));await page.waitForFunction(()=>window.__hudMaxWarnings>=2);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__sound.starts),muted);checks.push('overlapping warnings are both visible instead of hiding the second disruption');
      // Observe the overlapping SPIKES cue while muted as well; otherwise a legitimate
      // new countdown second may arrive between the unmute click and the IPC assertion.
      await page.waitForFunction(()=>window.__hudWarnings.some(w=>w.kind==='SPIKES'&&w.seconds==='1'));assert.equal(await page.evaluate(()=>window.__sound.starts),muted);
      await page.getByRole('button',{name:'Suara mati',exact:true}).click();await page.waitForSelector('[data-audio-state="ready"]');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__sound.starts),muted);checks.push('mute suppresses the next cue; unmute does not replay stale warning; reduced motion respected');
      await page.waitForFunction(()=>window.__hudPops.some(pop=>pop.coins==='200'));assert.equal(await page.evaluate(()=>window.__hudPops.find(pop=>pop.coins==='200').animation),'none');checks.push('actual sim near miss shows +200 local feedback without reduced-motion animation');
      const hash=`0x${'33'.repeat(32)}`;const receipt={t:'nearMiss.recorded',index:4,txHash:hash,blockNumber:123,latencyMs:120};socket.send(JSON.stringify(receipt));socket.send(JSON.stringify(receipt));await page.waitForSelector('[data-feed-index="4"][data-feed-status="recorded"]');
      assert.equal(await page.locator('[data-feed-index="4"]').count(),1);await page.getByText('Jumlah koin menunggu verifikasi',{exact:true}).waitFor();socket.send(JSON.stringify({t:'nearMiss.verified',index:4,tick:69,vehicleType:1,coins:200}));await page.getByText('200 koin menurut server',{exact:true}).waitFor();
      const link=page.getByRole('link',{name:'Lihat transaksi mepet 4',exact:true});assert((await link.getAttribute('href')).endsWith(`/tx/${hash}`));assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
      socket.send(JSON.stringify({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:100,nearMisses:4,coins:800,qualifiedTiers:[]}));await page.waitForSelector('[data-official-result="PARTIAL"]');assert.equal(await page.locator('.warning-card').count(),0);const finalSounds=await page.evaluate(()=>window.__sound.starts);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__sound.starts),finalSounds);checks.push('feed deduplicates early receipts, adds verified coin amount and safe transaction link; terminal result silences warnings');
      await page.screenshot({path:`${out}/hud-feed-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/hud-feed-mobile.png`,fullPage:true});checks.push('mobile HUD and feed have no horizontal overflow');
    }else{
      await page.waitForFunction(kind=>window.__hudWarnings.some(w=>w.kind===kind&&w.seconds==='1'),kind);await page.waitForFunction(()=>window.__sound.starts>=4);
      if(kind==='NITRO'){await page.keyboard.down('ArrowDown');await page.waitForSelector('[data-driving-effect="nitro"]');await page.getByText('Nitro aktif · rem diabaikan',{exact:true}).waitFor();await page.keyboard.up('ArrowDown');checks.push('active nitro explains that braking is ignored');}
    }
    await page.getByRole('navigation',{name:'Navigasi utama'}).getByRole('link',{name:'Garasi',exact:true}).click();await page.getByRole('heading',{name:/Garasimu/}).waitFor();const sound=await page.evaluate(()=>window.__sound);assert.equal(sound.closed,1);assert(sound.frequencies.includes({SPIKES:440,RED:330,NITRO:660}[kind]));metrics.push({kind,...sound});await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000}});capture(page);await page.addInitScript(()=>Object.defineProperty(window,'AudioContext',{value:undefined,writable:true,configurable:true}));await page.goto(`${root}/play`);await page.waitForFunction(()=>document.querySelector('.race-overlay button')?.disabled===false);await page.getByRole('button',{name:'Mulai latihan',exact:true}).click();await page.waitForSelector('[data-audio-state="unavailable"]');await page.waitForSelector('[data-phase="running"]');await page.keyboard.press('ArrowRight');await page.waitForSelector('[data-lane="2"]');checks.push('unsupported audio leaves practice and keyboard controls usable');await page.close();
  assert.deepEqual(errors,[]);checks.push('audio contexts closed on SPA navigation; console clean');const report={status:'PASS',scope:'native Web Audio scheduling and HUD in headless Edge with mocked run transport; no physical-listening or live-chain claim',checks,metrics,errors};await writeFile(`${out}/hud-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
