import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const root=process.env.APP_URL||'http://127.0.0.1:5173';
const out=process.env.BROWSER_REPORT_DIR||'test-results';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];const checks=[];const connections=[];let posts=0;let closed=0;
const run={runId:`0x${'11'.repeat(32)}`,seed:'0x8cfd1f92705b1e83840e3e257e0120b7fc40a9569070f053c50a1d6ad428d684',seedBlock:5,configVersion:1};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
try{
  await page.route('**/__network_fixture/runs',async route=>{posts++;assert.equal(route.request().method(),'POST');assert.equal(route.request().headers().authorization,'Bearer public-test-fixture');assert.deepEqual(route.request().postDataJSON(),{carTier:0});await route.fulfill({json:run});});
  await page.routeWebSocket('**/__network_fixture/ws/play?*',socket=>{
    assert.equal(new URL(socket.url()).searchParams.get('token'),'public-test-fixture');
    const connection={socket,messages:[]};connections.push(connection);socket.onClose(()=>closed++);
    socket.onMessage(raw=>{const m=JSON.parse(raw);connection.messages.push(m);
      if(m.t==='ping')socket.send(JSON.stringify({t:'pong',clientMs:m.clientMs,serverMs:Date.now()+7000}));
      if(m.t==='run.ready'){
        socket.send(JSON.stringify({t:'run.go',startAt:Date.now()+7000+3000}));
        const disruption={t:'disruption.scheduled',id:'fixture-early',kind:'SPIKES',lanes:[0],warnTick:15,by:'Fixture'};
        socket.send(JSON.stringify(disruption));socket.send(JSON.stringify(disruption));
      }
    });
  });
  await page.goto(`${root}/online`);await page.getByRole('heading',{name:'Online racing is being set up.'}).waitFor();assert.equal(posts,0);checks.push('online unavailable without Privy/API/WS config; no POST');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/online-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${root}/dev/network`);await page.getByRole('button',{name:'Create test run',exact:true}).click();
  const connect=page.getByRole('button',{name:'Connect run',exact:true});await connect.waitFor();await page.waitForFunction(()=>document.querySelector('.race-overlay button')?.disabled===false);await connect.click();
  await page.waitForSelector('[data-phase="countdown"]');await page.waitForSelector('[data-phase="running"]');assert.equal(posts,1);checks.push('one authenticated POST, clock sync and countdown using +7s server offset');
  const steeringX=Number(await page.locator('.race-shell').getAttribute('data-x'));await page.keyboard.down('ArrowRight');await page.waitForFunction(initial=>Number(document.querySelector('.race-shell')?.getAttribute('data-x'))>initial,steeringX);await page.keyboard.up('ArrowRight');await page.waitForSelector('[data-steer="0"]');
  await page.keyboard.down('ArrowDown');await page.waitForSelector('[data-braking="true"]');await page.keyboard.up('ArrowDown');await page.waitForSelector('[data-braking="false"]');
  // Keep a safe speed while screenshots and reconnect assertions run on slower CI machines.
  await page.keyboard.down('ArrowDown');await page.waitForSelector('[data-braking="true"]');
  await page.waitForFunction(()=>Number(document.querySelector('.race-shell')?.getAttribute('data-tick'))>20);
  const messages=connections[0].messages;assert.equal(messages.filter(m=>m.t==='disruption.ack'&&m.id==='fixture-early'&&m.applied).length,1);
  const input=messages.findIndex(m=>m.t==='input'&&m.kind===2);assert(input>=0);assert(messages.findIndex((m,i)=>i>input&&m.t==='watermark'&&m.tick>=messages[input].tick)>input);checks.push('real keyboard input before covering watermark; duplicate timely disruption acked once');
  connections[0].socket.send(JSON.stringify({t:'disruption.scheduled',id:'fixture-late',kind:'SPIKES',lanes:[1],warnTick:1,by:'Fixture'}));
  await page.waitForTimeout(150);assert(messages.some(m=>m.t==='disruption.ack'&&m.id==='fixture-late'&&!m.applied));checks.push('late spectator disruption rejected');
  connections[0].socket.send(JSON.stringify({t:'error',code:'RECORD_FAILED',message:'fixture rpc failure'}));await page.waitForTimeout(150);await page.waitForSelector('[data-network-status="running"]');checks.push('chain recording failure does not stop gameplay');
  await page.screenshot({path:`${out}/network-running.png`,fullPage:true});
  connections[0].socket.close({code:1012,reason:'fixture disconnect'});await page.waitForSelector('[data-network-status="disconnected"]');await page.keyboard.press('ArrowLeft');const disconnectedTick=Number(await page.locator('.race-shell').getAttribute('data-tick'));await page.waitForTimeout(5000);assert(Number(await page.locator('.race-shell').getAttribute('data-tick'))>disconnectedTick,'simulation advances during five-second outage');
  await page.getByRole('button',{name:'Reconnect',exact:true}).click();await page.waitForSelector('[data-network-status="running"]');await page.waitForTimeout(200);
  assert.equal(connections.length,2);const restored=connections[1].messages;const queued=restored.findIndex(m=>m.t==='input'&&m.kind===1);const mark=restored.findIndex(m=>m.t==='watermark');assert(queued>=0&&mark>queued);assert(!restored.some(m=>m.t==='run.ready'));checks.push('five-second outage advances sim; reconnect flushes queued input before watermark, no second run creation');
  await page.keyboard.up('ArrowDown');
  connections[1].socket.send(JSON.stringify({t:'disruption.scheduled',id:'fixture-early',kind:'SPIKES',lanes:[0],warnTick:15,by:'Fixture'}));await page.waitForTimeout(150);assert.equal(restored.filter(m=>m.t==='disruption.ack'&&m.id==='fixture-early'&&m.applied).length,1);checks.push('replayed disruption receives original ack after reconnect without reapplying SPEC');
  const tx=`0x${'33'.repeat(32)}`;
  connections[1].socket.send(JSON.stringify({t:'nearMiss.verified',index:1,tick:1,vehicleType:0,coins:100}));await page.getByText('1 near misses verified · 0 recorded',{exact:true}).waitFor();
  connections[1].socket.send(JSON.stringify({t:'nearMiss.recorded',index:1,txHash:tx,blockNumber:9,latencyMs:50}));await page.getByText('1 near misses verified · 1 recorded',{exact:true}).waitFor();
  connections[1].socket.send(JSON.stringify({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:100,nearMisses:1,coins:100,qualifiedTiers:[]}));await page.waitForSelector('[data-official-result="PARTIAL"]');checks.push('verified/recorded remain separate; official server PARTIAL result displayed');
  connections[1].socket.send(JSON.stringify({t:'run.result',status:'VERIFIED',reason:'CRASH',endTick:100,nearMisses:1,coins:999,qualifiedTiers:[]}));connections[1].socket.send(JSON.stringify({t:'error',code:'RUN_ENDED',message:'fixture ended'}));await page.waitForTimeout(150);await page.waitForSelector('[data-official-result="PARTIAL"]');await page.waitForSelector('[data-network-status="result"]');checks.push('terminal result stays immutable under conflicting late messages');
  await page.screenshot({path:`${out}/network-result.png`,fullPage:true});
  await page.goto(`${root}/play`);await page.getByRole('heading',{name:'Practice Mode',exact:true}).waitFor();await page.waitForTimeout(150);assert(closed>=1);assert.deepEqual(errors,[]);checks.push('navigation disposes connection; browser console clean');
  const report={status:'PASS',scope:'frontend contract test with Playwright-mocked REST/WS, not real backend or Privy verification',checks,posts,connections:connections.length,errors};
  await writeFile(`${out}/network-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){const state=await page.evaluate(()=>({status:document.querySelector('[data-network-status]')?.getAttribute('data-network-status'),phase:document.querySelector('.race-shell')?.getAttribute('data-phase'),tick:document.querySelector('.race-shell')?.getAttribute('data-tick')}));await writeFile(`${out}/network-failure.json`,JSON.stringify({state,errors,lastMessages:connections.at(-1)?.messages.slice(-12)},null,2));console.log(JSON.stringify({failureState:state}));throw error;}finally{await browser.close();}
