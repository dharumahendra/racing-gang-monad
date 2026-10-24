import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.APP_URL||'http://127.0.0.1:5179';
const out=process.env.BROWSER_REPORT_DIR||'test-results/garage';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[],warnings=[],driverWarnings=[],loaded=new Set(),metrics=[];
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning'){if(m.text().includes('GPU stall due to ReadPixels'))driverWarnings.push(m.text());else warnings.push(m.text());}});
page.on('response',r=>{if(r.ok()&&r.url().endsWith('.glb'))loaded.add(r.url().split('/').pop());});
const check=(message)=>{checks.push(message);console.log('PASS: '+message);};
const ready=()=>page.waitForSelector('[data-model-ready="true"][data-camera-state]',{timeout:60000});
const fits=async(label)=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' page overflow');assert(await page.locator('.garage-showcase,.vehicle-roster').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1)),label+' component overflow');};
try{
 await page.goto(root,{waitUntil:'domcontentloaded',timeout:60000});await ready();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.garage-start').count(),1,'one primary race action');
 for(const [theme,toggle] of [['light',null],['dark','Aktifkan tema gelap']]){
  if(toggle)await page.getByRole('button',{name:toggle}).click();
  for(const [width,height] of [[1440,900],[1280,800],[1024,768],[390,844],[320,844],[2560,1440]]){
   await page.setViewportSize({width,height});await ready();await fits(`${theme} ${width}`);
   const boxes=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {car:box('.actual-car'),cta:box('.garage-start'),roster:box('.vehicle-roster')};});
   if(width>=1024)assert(boxes.cta.y+boxes.cta.height<=height,'desktop CTA above fold '+width);
   if(width<=390)assert(boxes.car.y<height*.6,'car appears early on phone');
   metrics.push({theme,width,height,...boxes});
   await page.screenshot({path:`${out}/garage-${theme}-${width}.png`,fullPage:true,timeout:60000});
  }
 }
 check('light/dark, four target viewports plus 320 and 2560; no page or component overflow; desktop CTA visible');
 await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Aktifkan tema terang'}).click();
 for(let tier=0;tier<5;tier++){
  await page.getByRole('button',{name:tier===0?'S Starter':`T${tier} Preview`,exact:true}).click();await ready();
  assert.equal(await page.locator('#selected-car-name').textContent(),tier===0?'Starter':`Tier ${tier}`);
  assert.equal(await page.locator('.tier-picker [aria-pressed="true"]').count(),1);
  if(tier>0)assert(await page.getByText('Pratinjau · terkunci',{exact:true}).isVisible());
  await page.locator('.vehicle-specs>summary').click();
  assert(await page.locator('.purchase-gate').isDisabled());
  assert.equal((await page.locator('.car-stats dd').allTextContents())[3],['0','0.05','0.1','0.25','0.5'][tier]);
  await page.locator('.vehicle-specs>summary').click();
 }
 assert.equal(loaded.size,5,'five original car assets loaded');
 assert(await page.getByText('Latihan lokal selalu memakai Starter.',{exact:false}).isVisible());
 check('all five real GLBs, selected identity/ownership, unchanged prices and honest disabled purchase; Starter-only training disclosed');
 const stage=page.locator('.actual-car');
 let initial=await stage.getAttribute('data-camera-state');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.notEqual(await stage.getAttribute('data-camera-state'),initial);
 await page.getByRole('button',{name:'Reset car angle',exact:true}).click();assert.equal(await stage.getAttribute('data-camera-state'),initial);
 const b=await stage.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.57,{steps:12});await page.mouse.up();
 assert.notEqual(await stage.getAttribute('data-camera-state'),initial,'actual camera responds to pointer drag');
 await page.getByRole('button',{name:'Reset car angle',exact:true}).click();assert.equal(await stage.getAttribute('data-camera-state'),initial);
 await page.getByRole('button',{name:'Rotate car right',exact:true}).click();assert.notEqual(await stage.getAttribute('data-view-angle'),'0');
 await page.getByRole('button',{name:'Reset car angle',exact:true}).click();assert.equal(await stage.getAttribute('data-view-angle'),'0');
 await page.waitForTimeout(200);const frames=await stage.getAttribute('data-render-count');await page.waitForTimeout(500);assert.equal(await stage.getAttribute('data-render-count'),frames,'idle viewer does not render continuously');
 await page.getByRole('button',{name:'Zoom in',exact:true}).focus();await page.keyboard.press('Enter');assert.notEqual(await stage.getAttribute('data-camera-state'),initial);
 check('real pointer orbit, zoom, model rotation and reset; keyboard zoom; idle demand rendering');
 const failing=await browser.newContext({viewport:{width:1280,height:800}}),failedPage=await failing.newPage();
 await failedPage.route('**/CarConcept.glb',route=>route.fulfill({status:404,body:''}));
 await failedPage.goto(root,{waitUntil:'domcontentloaded'});await failedPage.waitForSelector('[data-model-ready="true"]');
 await failedPage.getByRole('button',{name:'T4 Preview',exact:true}).click();
 await failedPage.getByRole('alert').filter({hasText:"Couldn't load the 3D model"}).waitFor();
 assert.equal(await failedPage.locator('.stage-label').count(),0,'failed model is not indefinitely loading');
 assert(await failedPage.getByRole('button',{name:'Zoom in',exact:true}).isDisabled());
 await failedPage.screenshot({path:out+'/model-unavailable.png',fullPage:true});
 await failedPage.getByRole('button',{name:'S Starter',exact:true}).click();await failedPage.waitForSelector('[data-model-ready="true"]');await failing.close();
 check('failed GLB shows honest fallback, disables viewer controls, and recovers by selecting another car');
 await page.getByRole('button',{name:'S Starter',exact:true}).click();await ready();
 await page.locator('.garage-balance>summary').click();assert(await page.getByText('Reserved',{exact:true}).isVisible());assert(await page.getByText('Sample balance',{exact:true}).isVisible());await page.locator('.garage-balance>summary').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 assert(await page.locator('.garage-start').evaluate(el=>getComputedStyle(el).transitionDuration.split(',').every(s=>parseFloat(s)===0)));
 await page.emulateMedia({reducedMotion:'no-preference'});check('balance breakdown accessible and reduced motion removes movement');
 for(const mode of ['worst','empty','one','zero']){
  await page.goto(root+'/?garageData='+mode,{waitUntil:'domcontentloaded'});
  if(mode!=='empty')await ready();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await fits(mode+' '+width);await page.screenshot({path:`${out}/fixture-${mode}-${width}.png`,fullPage:true});}
  if(mode==='empty')assert(await page.getByRole('heading',{name:'No vehicles yet.'}).isVisible());
  if(mode==='one')assert.equal(await page.locator('.tier-picker button').count(),1);
  if(mode==='zero')assert.equal(await page.locator('.garage-balance strong').textContent(),'0');
  if(mode==='worst'){
   await page.setViewportSize({width:390,height:844});
   const textZoom=await page.addStyleTag({content:'html { font-size: 28px; }'});await fits('worst case 200% text');await textZoom.evaluate(el=>el.remove());
   await page.getByRole('button',{name:'T1 Preview',exact:true}).click();await ready();assert(await page.locator('.ownership-state').getByText('Owned',{exact:true}).isVisible());
   await page.getByRole('button',{name:'T2 Preview',exact:true}).click();await ready();assert(await page.getByText('Requirements met',{exact:true}).isVisible());
   await page.getByRole('button',{name:'Aktifkan tema gelap'}).click();await fits('worst dark');await page.getByRole('button',{name:'Aktifkan tema terang'}).click();
  }
 }
 check('dev-only worst/empty/one/zero fixtures: long, unbreakable and non-Latin names; large/zero balances; owned/qualified/locked; 200% text');
 await page.setViewportSize({width:1440,height:900});
 await page.goto(root,{waitUntil:'domcontentloaded'});await ready();await page.getByRole('link',{name:'Start the race',exact:true}).click();await page.waitForURL('**/play');
 await page.getByRole('button',{name:'Start practice',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.race-overlay button')?.disabled);
 await page.getByRole('button',{name:'Start practice',exact:true}).click();await page.waitForSelector('[data-phase="running"]',{timeout:30000});
 check('primary CTA opens existing practice and starts countdown/running; desktop keyboard covered separately in practice-check');
 await page.goto(root,{waitUntil:'domcontentloaded'});await ready();await page.getByRole('link',{name:'Create room',exact:true}).click();await page.waitForURL('**/room');await page.getByRole('heading',{name:'Room',exact:true}).waitFor();
 await page.goto(root,{waitUntil:'domcontentloaded'});await ready();await page.getByRole('link',{name:'Jadi penonton',exact:true}).click();await page.waitForURL('**/watch');await page.getByLabel('Room code').waitFor();assert.equal(await page.getByRole('button',{name:/Sign in with Google/}).count(),0);
 check('room and spectator links preserved; spectator remains public');
 const touch=await browser.newContext({viewport:{width:390,height:844},isCare:true,hasTouch:true});const phone=await touch.newPage();await phone.goto(root,{waitUntil:'domcontentloaded'});await phone.waitForSelector('[data-model-ready="true"][data-camera-state]');
 const canvas=phone.locator('.actual-car'),box=await canvas.boundingBox(),before=await canvas.getAttribute('data-camera-state'),cdp=await touch.newCDPSession(phone);
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+65,y:y+15}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await canvas.getAttribute('data-camera-state'),before);
 const beforePinch=await canvas.getAttribute('data-camera-state');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y,id:1},{x:x+50,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await canvas.getAttribute('data-camera-state'),beforePinch);await touch.close();
 check('emulated touch drag and pinch zoom operate on camera (physical phone not tested)');
 assert.deepEqual(errors,[],'browser errors');assert.deepEqual(warnings,[],'browser warnings');
 await writeFile(out+'/garage-report.json',JSON.stringify({status:'PASS',checks,errors,warnings,driverWarnings,loaded:[...loaded],metrics,limitations:['Headless Chromium/SwiftShader; ReadPixels capture warnings recorded separately; no hardware performance claim','Touch emulation, not a physical phone','No OAuth, purchase or testnet transactions performed']},null,2));
 console.log(JSON.stringify({status:'PASS',checks,errors,warnings,driverWarningCount:driverWarnings.length},null,2));
}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});await writeFile(out+'/garage-report.json',JSON.stringify({status:'FAIL',error:String(e),checks,errors,warnings,driverWarnings,metrics},null,2));throw e;}finally{await browser.close();}
