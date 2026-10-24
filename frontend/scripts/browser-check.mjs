import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const root = process.env.APP_URL || 'http://127.0.0.1:5173';
const out = process.env.BROWSER_REPORT_DIR || 'test-results';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args:['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; const warnings = []; const checks = [];
const loadedModels=new Set();let frameRate=null;
page.on('response',r=>{if(r.url().endsWith('.glb')&&r.ok())loadedModels.add(r.url().split('/').pop());});
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); if (msg.type() === 'warning') warnings.push(msg.text()); });
async function fits(label) { assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: horizontal overflow`); checks.push(label); }
try {
  await page.goto(root); await page.getByRole('heading', { name: /Your Garage/ }).waitFor();
  assert(await page.getByText('MODE CONTOH', { exact: true }).isVisible());
  assert(await page.getByRole('button', { name: /Sign in with Google/ }).isDisabled());
  await page.waitForSelector('[data-model-ready="true"]');
  await page.getByRole('button', { name: 'T2 Pratinjau' }).click();
  assert(await page.getByRole('heading', { name: 'Tier 2', exact: true }).isVisible());
  await page.waitForSelector('[data-model-ready="true"]');
  for(const tier of [1,3,4]) {await page.getByRole('button',{name:`T${tier} Pratinjau`}).click();await page.waitForSelector('[data-model-ready="true"]');}
  await page.getByRole('button', { name: 'S Starter' }).click();await page.waitForSelector('[data-model-ready="true"]');await fits('desktop garage and five original Quaternius models');
  await page.screenshot({ path: `${out}/garage-desktop.png`, fullPage: true });
  await page.goto(`${root}/watch`); await page.getByLabel('Room code').waitFor();
  assert.equal(await page.getByRole('button', { name: /Sign in with Google/ }).count(), 0);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByRole('alert').waitFor(); assert(await page.getByText(/Joinkan 6 karakter/).isVisible());
  await page.getByLabel('Room code').fill('ab7k2m'); await page.getByLabel(/^Name/).fill('Raka');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.waitForURL('**/watch/AB7K2M?nick=Raka');
  await page.getByRole('button', { name: '4', exact: true }).click(); assert.equal(await page.getByRole('button', { name: '4', exact: true }).getAttribute('aria-pressed'), 'true');
  assert(await page.getByRole('button', { name: /Leftm red zone/ }).isDisabled()); checks.push('public join, validation, code normalization, lane selection, no fake disruption');
  await page.setViewportSize({ width: 390, height: 844 }); await fits('mobile spectator');
  await page.screenshot({ path: `${out}/watch-mobile.png`, fullPage: true });
  await page.goto(root); await page.getByRole('heading', { name: /Your Garage/ }).waitFor(); await fits('mobile garage');
  await page.screenshot({ path: `${out}/garage-mobile.png`, fullPage: true });
  for (const [route, heading] of [['/room', 'Room'], ['/run/demo', 'Trip proof.'], ['/watch/INVALID', 'Invalid code.'], ['/missing', 'Route not found.']]) {
    await page.goto(`${root}${route}`); await page.getByRole('heading', { name: heading, exact: true }).waitFor(); await fits(`deep link ${route}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${root}/dev/golden`);
  await page.waitForFunction(()=>document.querySelectorAll('[data-golden-result="PASS"]').length===3);
  assert.equal(await page.locator('[data-golden-result="FAIL"]').count(),0);checks.push('three official golden fixtures replay identically in browser');
  await page.screenshot({path:`${out}/golden-browser.png`,fullPage:true});
  await page.goto(`${root}/play`);await page.getByRole('heading',{name:'Practice Mode',exact:true}).waitFor();
  const start=page.getByRole('button',{name:'Start practice',exact:true});await start.waitFor();
  await page.waitForFunction(()=>document.querySelector('.race-overlay button')?.disabled===false);
  await page.screenshot({path:`${out}/practice-ready.png`,fullPage:true});
  await start.click();await page.waitForSelector('[data-phase="countdown"]');
  await page.waitForSelector('[data-phase="running"]');
  const steeringX=Number(await page.locator('.race-shell').getAttribute('data-x'));await page.keyboard.down('ArrowRight');await page.waitForFunction(initial=>Number(document.querySelector('.race-shell')?.getAttribute('data-x'))>initial,steeringX);await page.keyboard.up('ArrowRight');await page.waitForSelector('[data-steer="0"]');
  await page.keyboard.down('ArrowDown');await page.waitForSelector('[data-braking="true"]');await page.keyboard.up('ArrowDown');await page.waitForSelector('[data-braking="false"]');
  await page.screenshot({path:`${out}/practice-running.png`,fullPage:true});
  frameRate=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();let count=0;const frame=()=>{count++;if(performance.now()-start>=1500)resolve(Math.round(count*1000/(performance.now()-start)));else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  await fits('practice countdown, held keyboard steering and brake in real WebGL browser');
  assert(loadedModels.size>=7,`Expected seven actual models, loaded ${loadedModels.size}`);
  assert.deepEqual(errors, [], 'browser console errors'); assert.deepEqual(warnings, [], 'browser console warnings');
  await writeFile(`${out}/browser-report.json`, JSON.stringify({ checks, errors, warnings,loadedModels:[...loadedModels],headlessFrameRate:frameRate }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks, errors, warnings,loadedModels:[...loadedModels],headlessFrameRate:frameRate }, null, 2));
} finally { await browser.close(); }
