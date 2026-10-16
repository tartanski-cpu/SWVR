// Draw calls and the boat's drawn parts at four fixed viewpoints aboard, by day (cold boat)
// and at night (everything lit). The modular rebuild's baseline: every milestone is
// measured the same way and must not be worse (docs/MODULAR_BOATS.md, Part C).
//
// Needs the dev server running (npm run dev) and Playwright's library, which isn't a
// project dependency:  npm i --no-save playwright-core && node scripts/measureDraws.mjs [screenshotDir]
// Headless Chromium uses SwiftShader, so CPU times mean little; the counts are exact.
import { chromium } from 'playwright-core';

const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto('https://localhost:5173/');
await page.waitForFunction(() => window.app && window.app.world, null, { timeout: 60000 });
await page.waitForTimeout(3000);

// Feet position (vessel axes) and facing (rad, 0 = forward, + turns to port).
const VIEWS = {
  helm: [[0, 1.2, -0.75], 0],
  chartTable: [[-0.3, 1.2, 0.6], Math.PI / 2],
  aftDeckFwd: [[0, 1.0, 4.0], 0],
  aftDeckAft: [[0, 1.0, 4.0], Math.PI],
};
const results = {};
for (const mode of ['day', 'night-lit']) {
  await page.evaluate((mode) => {
    const a = window.app;
    a.overlay.visible = true;
    a.world.environment.timeOfDay = mode === 'day' ? 12 : 23;
    if (mode !== 'day') {
      const v = a.world.vessels[a.testVesselId];
      v.electrics.master = 1;
      for (const k of Object.keys(v.electrics.breakers)) v.electrics.breakers[k] = 1;
      Object.assign(v.controls, { navLights: 1, cabinLight: 1, deckFore: 1, deckAft: 1, railLights: 1, spotlight: 1 });
    }
  }, mode);
  for (const [name, [pos, yaw]] of Object.entries(VIEWS)) {
    await page.evaluate(([pos, yaw]) => {
      const a = window.app;
      const me = a.world.players[a.localPlayerId];
      Object.assign(me, { aboardVesselId: a.testVesselId, mode: 'walk', position: pos.slice(), yaw });
    }, [pos, yaw]);
    await page.waitForTimeout(1500);
    results[`${mode} ${name}`] = await page.evaluate(() => {
      const a = window.app;
      return { drawCalls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles, parts: a.boatPartsLine(1).trim() };
    });
    if (shots) await page.screenshot({ path: `${shots}/${mode}-${name}.png` });
  }
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
