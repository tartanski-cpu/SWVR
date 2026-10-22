/**
 * Two-browser crew check (owner, Oct 2026: "add a two browser check"). Two separate browser
 * profiles, a host and a crew-mate, join one Voyage game through the real PeerJS broker,
 * exactly as two players would, and the multi-boat features are checked end to end:
 *
 *   1. join      the host starts a game; the crew page (started in another boat, the small
 *                tug) joins with the code, and takes the host's world without reloading;
 *   2. crew      both pages list both players; the host mutes and unmutes the crew-mate;
 *   3. launch    the crew launches her own boat: she's in both worlds, owned, the crew aboard;
 *   4. tow       a barge astern of the crew's boat; the crew makes her towline fast to it
 *                from her own page: the host's world has her line, and her page shows it;
 *   5. leave     the crew leaves: her boat goes with her, and her join box is empty.
 *
 * Not a unit test: it needs the dev server running (npm run dev) and Chromium with Playwright
 * (pre-installed in the cloud work containers; elsewhere set PLAYWRIGHT to its index.mjs).
 * The headless browser runs the game far below real time, so the host's simulation is stepped
 * by hand here between the steps. Run: npm run crewcheck  (exit code 0: all passed).
 */
const PW = process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs';
const BASE = process.env.CREWCHECK_URL ?? 'https://localhost:5173';
const MAP = process.env.CREWCHECK_MAP ?? 'tayvallich';
const { chromium } = await import(PW);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const pages = {};
const errors = { host: [], crew: [] };
for (const who of ['host', 'crew']) {
  // Separate contexts: separate browser storage, as two browsers.
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 450 } });
  pages[who] = await ctx.newPage();
  pages[who].on('pageerror', (e) => errors[who].push(e.message));
}
const { host: A, crew: B } = pages;
const ready = async (p) => {
  await p.waitForFunction(() => window.app && window.app.world, null, { timeout: 240000 });
  await p.waitForTimeout(3000);
};
/** The host's simulation, `n` ticks stepped by hand with whatever the crew sent, then a snapshot out. */
const hostStep = (n = 20) =>
  A.evaluate(async (n) => {
    const a = window.app;
    const { stepWorld } = await import('/src/core/simulation.ts');
    stepWorld(a.world, a.host.takeIntents(), 1 / 20);
    for (let i = 1; i < n; i++) stepWorld(a.world, [], 1 / 20);
    a.host.tick(1);
  }, n);
/** Let the crew page send what it has and take the next snapshot. */
const settle = async (ms = 4000) => {
  await B.waitForTimeout(ms);
  await hostStep();
  await B.waitForTimeout(ms);
};

try {
  // ── 1. Join ──
  await A.goto(`${BASE}/voyage.html?map=${MAP}&start`, { timeout: 240000 });
  await ready(A);
  await A.evaluate(() => window.app.menuHost().hostGame());
  let code = '';
  for (let i = 0; i < 40 && !code; i++) {
    await A.waitForTimeout(1000);
    code = await A.evaluate(() => window.app.hostCode || '');
  }
  check('the host starts a game and gets a code', /^\d{5}$/.test(code), code);
  await B.goto(`${BASE}/voyage.html?map=${MAP}&start&boat=smallTug`, { timeout: 240000 });
  await ready(B);
  const crewBoatBefore = await B.evaluate(() => window.app.world.vessels[window.app.testVesselId]?.defId);
  // A mark on the page itself: gone if the page reloads (the game writes the code into the
  // address when you join, a navigation in the browser's eyes but not a reload).
  await B.evaluate(() => (window.__crewCheck = 'same page'));
  await B.evaluate((code) => {
    const h = window.app.menuHost();
    for (const d of code) h.typeDigit(d);
    h.joinGame();
  }, code);
  let status = '';
  for (let i = 0; i < 60 && status !== 'connected'; i++) {
    await B.waitForTimeout(1000);
    status = await B.evaluate(() => window.app.client?.status ?? '');
  }
  check('the crew joins with the code', status === 'connected', status);
  await settle();
  const joined = await B.evaluate(() => {
    const a = window.app;
    const me = a.world.players[a.localPlayerId];
    return { home: a.world.vessels[a.world.homeVesselId]?.defId, aboard: me?.aboardVesselId ?? null, homeId: a.world.homeVesselId };
  });
  const hostHome = await A.evaluate(() => window.app.world.vessels[window.app.world.homeVesselId]?.defId);
  check("the crew page took the host's world (her own start boat was another type)", joined.home === hostHome && crewBoatBefore !== hostHome, `crew started in ${crewBoatBefore}, host's boat ${hostHome}, crew now sees ${joined.home}`);
  const samePage = await B.evaluate(() => window.__crewCheck === 'same page');
  check('without reloading the page', samePage);

  // ── 2. Crew list and mute ──
  const listA = await A.evaluate(() => [0, 1, 2].map((i) => window.app.menuHost().crewMember(i)));
  const listB = await B.evaluate(() => [0, 1, 2].map((i) => window.app.menuHost().crewMember(i)));
  check('the host lists both players, herself first, as host', listA[0]?.you && listA[0]?.host && listA[1] && !listA[1].you && !listA[2], JSON.stringify(listA.map((m) => m?.name)));
  check('the crew lists both players, the host marked', listB[0]?.you && listB[1] && listB[1].host, JSON.stringify(listB.map((m) => m && `${m.name}${m.host ? ' (host)' : ''}`)));
  await A.evaluate(() => window.app.menuHost().toggleCrewMute(1));
  const muted = await A.evaluate(() => window.app.menuHost().crewMember(1)?.muted);
  await A.evaluate(() => window.app.menuHost().toggleCrewMute(1));
  const unmuted = await A.evaluate(() => !window.app.menuHost().crewMember(1)?.muted);
  check('the host mutes and unmutes the crew-mate', muted && unmuted);

  // ── 3. Launch ──
  await B.evaluate(() => window.app.menuHost().launchBoat('smallTug'));
  // Her page sees her new boat, then asks to board her: two round trips.
  await settle();
  await settle();
  const crewId = await A.evaluate(() => Object.keys(window.app.world.players).find((id) => id !== window.app.localPlayerId));
  const launched = await A.evaluate((crewId) => {
    const v = Object.values(window.app.world.vessels).find((o) => o.owner === crewId);
    return v ? { id: v.id, defId: v.defId } : null;
  }, crewId);
  check("the crew's launch reaches the host: her own boat in the host's world", !!launched, launched?.id);
  const crewSees = await B.evaluate(() => ({ my: window.app.menuHost().myBoat(), aboard: window.app.world.players[window.app.localPlayerId]?.aboardVesselId }));
  check('the crew sees her boat and is aboard her', !!launched && crewSees.aboard === launched.id && !crewSees.my.startsWith('None'), crewSees.my);

  // ── 4. Tow ──
  if (launched) {
    // A barge just astern of her (the debug tow, put there on the host).
    await A.evaluate(async (id) => {
      const { applyTowIntent } = await import('/src/tow/tow.ts');
      const a = window.app;
      a.world.tow.job = null;
      applyTowIntent(a.world, { playerId: a.localPlayerId, targetId: id, control: 'towDebugNear', value: 1, ref: 'barge' });
    }, launched.id);
    await settle();
    await B.evaluate(() => window.app.menuHost().towToggle());
    await settle();
    const hostLine = await A.evaluate((id) => window.app.world.tow?.lines?.[id]?.target ?? null, launched.id);
    check("the crew makes her towline fast from her page: the host's world has her line", !!hostLine?.startsWith('v:'), hostLine ?? 'no line');
    const crewLine = await B.evaluate((id) => window.app.world.tow?.lines?.[id]?.target ?? null, launched.id);
    check("the crew's page has her line too (the snapshot carries it)", crewLine && crewLine === hostLine, crewLine ?? 'no line');
    const homeLine = await A.evaluate(() => window.app.world.tow?.lines?.[window.app.world.homeVesselId] ?? null);
    check("the host's boat has no line of her own (each boat's line is hers)", !homeLine);
  }

  // ── 5. Leave ──
  await B.evaluate(() => window.app.menuHost().leaveGame());
  await B.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) await hostStep();
  const after = await A.evaluate((crewId) => ({ players: Object.keys(window.app.world.players).length, boat: Object.values(window.app.world.vessels).some((v) => v.owner === crewId) }), crewId);
  check('the crew leaves: the host sees one player, and her boat went with her', after.players === 1 && !after.boat, JSON.stringify(after));
  const box = await B.evaluate(() => window.app.menuHost().joinCode());
  check("the crew's join box is empty for the next game", box === '', JSON.stringify(box));
} catch (e) {
  check('ran to the end', false, String(e).split('\n')[0]);
}
check('no errors in either page', !errors.host.length && !errors.crew.length, [...errors.host, ...errors.crew].slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
