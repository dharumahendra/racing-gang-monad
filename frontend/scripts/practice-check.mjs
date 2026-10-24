import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const root=process.env.APP_URL||'http://127.0.0.1:5179',out=process.env.BROWSER_REPORT_DIR||'test-results/garage';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[],states=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root+'/play',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Start practice',exact:true}).click({timeout:60000});
 await page.waitForSelector('[data-phase="running"]');
 const state=()=>page.locator('.race-shell').evaluate(el=>({...el.dataset}));
 states.push(await state());
 const steeringX=Number(await page.locator('.race-shell').getAttribute('data-x'));await page.keyboard.down('ArrowRight');await page.waitForFunction(initial=>Number(document.querySelector('.race-shell')?.getAttribute('data-x'))>initial,steeringX);await page.keyboard.up('ArrowRight');await page.waitForSelector('[data-steer="0"]');states.push(await state());
 await page.keyboard.down('ArrowDown');await page.waitForSelector('[data-braking="true"][data-phase="running"]');states.push(await state());
 await page.keyboard.up('ArrowDown');await page.waitForSelector('[data-braking="false"][data-phase="running"]');states.push(await state());
 assert.deepEqual(errors,[]);
 const report={status:'PASS',checks:['start and countdown','holding right moves the car; release clears steer','native keyboard down brakes','releasing down stops braking'],states,errors,scope:'Desktop Edge; local practice; no game logic changes or hardware FPS claim'};
 await writeFile(out+'/practice-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
