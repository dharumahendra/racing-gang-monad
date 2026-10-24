// Export artwork assets, not a visual QA pass. Requires a local Vite server.
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const base=process.env.NFT_RENDER_ORIGIN || 'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try {
  await mkdir('public/cars',{recursive:true});
  const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
  for(let tier=1;tier<=4;tier++){
    await page.goto(base+'/scripts/metadata-render.html?tier='+tier,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>window.exportReady||window.exportError,{},{timeout:90000});
    const error=await page.evaluate(()=>window.exportError);
    if(error)throw new Error(error);
    await page.locator('canvas').screenshot({path:'public/cars/'+tier+'.png'});
  }
} finally {await browser.close();}
