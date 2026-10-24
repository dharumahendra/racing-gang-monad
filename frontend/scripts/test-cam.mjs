import {chromium} from 'playwright';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader']
});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
await page.goto('http://127.0.0.1:5173', {waitUntil: 'domcontentloaded'});
await page.waitForSelector('[data-model-ready="true"]');
await page.waitForTimeout(1000);

// Let's get the bounding box of the car and camera position
const camInfo = await page.evaluate(() => {
  const stage = document.querySelector('.actual-car');
  return {
    cameraState: stage?.getAttribute('data-camera-state')
  };
});
console.log('Current camera state:', camInfo);

await browser.close();
