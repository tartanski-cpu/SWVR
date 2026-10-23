/**
 * The Workboat x Timber handoff (voyage/metaverse.ts, voyage/timber.ts; docs/metaverse-contract.md):
 * the envelope, the site's place on the Oban map, ids consumed once, the hotspot prompt, the
 * log barge brought back on the line, and the sale.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config';
import type { Envelope } from '../src/voyage/metaverse';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const envelope = (o: Partial<Envelope> = {}): Envelope => ({
  v: 1,
  id: 'abc123',
  from: 'workboat',
  site: 'loch-timber-1',
  return: 'https://tartanski-cpu.github.io/SWVR/voyage.html?map=oban',
  boat: { id: 'pilotBoat', name: 'Pilot boat' },
  pos: { lat: 56.4117, lon: -5.50156, hdg: 240 },
  time: { hour: 14.5 },
  status: 'none',
  cargo: { logs: 0 },
  ...o,
});

describe('the handoff envelope', () => {
  it('round-trips as base64url with no padding; malformed or the wrong version is ignored', async () => {
    const m = await import('../src/voyage/metaverse');
    const e = envelope({ boat: { id: 'x', name: 'Kelpie ✓' } });
    const text = m.encodeEnvelope(e);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(m.decodeEnvelope(text)).toEqual(e);
    expect(m.decodeEnvelope('not base64 !!')).toBeNull();
    expect(m.decodeEnvelope(m.encodeEnvelope({ ...e, v: 2 as 1 }))).toBeNull();
    expect(m.decodeEnvelope(null)).toBeNull();
    // A load that isn't a whole number of logs: tidied.
    expect(m.decodeEnvelope(m.encodeEnvelope({ ...e, cargo: { logs: -3 } }))!.cargo.logs).toBe(0);
  });

  it('taken off the address (the rest kept), and the outbound address carries it', async () => {
    const m = await import('../src/voyage/metaverse');
    const e = envelope({ from: 'timber', status: 'barge_ready', cargo: { logs: 20 } });
    const href = `https://host/SWVR/voyage.html?map=oban&mv=${m.encodeEnvelope(e)}`;
    const { envelope: got, clean } = m.takeEnvelope(href);
    expect(got).toEqual(e);
    expect(clean).toBe('https://host/SWVR/voyage.html?map=oban');
    expect(m.takeEnvelope('https://host/voyage.html?map=oban').clean).toBeNull();
    const out = new URL(m.outboundUrl(m.SITES[0], e));
    expect(out.origin + out.pathname).toBe(m.SITES[0].targetUrl);
    expect(m.decodeEnvelope(out.searchParams.get('mv'))).toEqual(e);
  });

  it('a returning id counts once, and only if we issued it', async () => {
    const m = await import('../src/voyage/metaverse');
    const store = memStore();
    const back = envelope({ from: 'timber', id: 'zz9zz9' });
    expect(m.consumeReturn(back, store)).toBeNull(); // never issued
    m.issueId('zz9zz9', store);
    expect(m.consumeReturn(envelope({ id: 'zz9zz9' }), store)).toBeNull(); // not from Timber
    expect(m.consumeReturn(back, store)).toEqual(back);
    expect(m.consumeReturn(back, store)).toBeNull(); // already consumed
    expect(m.newHandoffId()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("the map's geography matches the coast pipeline's request and the region's place", async () => {
    const m = await import('../src/voyage/metaverse');
    const yaml = readFileSync('tools/coast/requests/oban.yaml', 'utf8');
    const bbox = yaml.match(/^bbox:\s*\[([^\]]+)\]/m)![1].split(',').map(Number);
    expect(bbox).toEqual(m.MAP_GEO.oban.bbox);
    const region = readFileSync('src/world/regions/oban.ts', 'utf8');
    expect(Number(region.match(/\bx: (-?\d+),/)![1])).toBe(m.MAP_GEO.oban.at.x);
    expect(Number(region.match(/\bz: (-?\d+),/)![1])).toBe(m.MAP_GEO.oban.at.z);
    // The projection and its inverse agree; the box's corners land on the package's edges (to a cell).
    const s = m.SITES[0];
    const w = m.worldOf('oban', s.lat, s.lon)!;
    const back = m.latLonOf('oban', w.x, w.z)!;
    expect(back.lat).toBeCloseTo(s.lat, 9);
    expect(back.lon).toBeCloseTo(s.lon, 9);
    const pkg = JSON.parse(readFileSync('src/world/regions/oban.coast.json', 'utf8')) as { box: { x0: number; z1: number } };
    const corner = m.worldOf('oban', bbox[1], bbox[0])!;
    expect(Math.abs(corner.x - m.MAP_GEO.oban.at.x - pkg.box.x0)).toBeLessThan(10);
    expect(Math.abs(corner.z - m.MAP_GEO.oban.at.z - pkg.box.z1)).toBeLessThan(10);
  });
});

describe('the timber run on the Oban map', () => {
  async function oban() {
    vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
    vi.resetModules();
    // The map's ground: its mesh, as the page fetches it.
    const regions = await import('../src/world/regions');
    const coast = await import('../src/world/coastTerrain');
    const c = regions.regionById('oban')!.coast!;
    const tt = c.pkg.terrain;
    if (tt.chunked) throw new Error('whole-mesh map expected');
    const bin = readFileSync(`public/${tt.dir}${tt.file}`);
    coast.registerCoastTerrain('oban', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, tt, c.pkg.box, c.x, c.z);
    const world = await import('../src/core/world');
    const ids = await import('../src/core/ids');
    const sim = await import('../src/core/simulation');
    const t = await import('../src/voyage/timber');
    const m = await import('../src/voyage/metaverse');
    const terrain = await import('../src/world/terrain');
    const control = await import('../src/vessel/vesselControl');
    const { world: w, vesselId } = world.createWorld(new ids.IdFactory(), 'pilotBoat');
    w.environment.waves = [];
    return { w, v: w.vessels[vesselId], sim, t, m, terrain, control };
  }

  it('the hotspot is in the water of Ardantrive Bay, and so is the barge spawn', async () => {
    const { t, m, terrain } = await oban();
    const s = m.SITES[0];
    const at = t.hotspotAt(s)!;
    expect(terrain.groundHeight(at.x, at.z)).toBeLessThan(-3);
    const b = m.worldOf('oban', s.bargeSpawn.lat, s.bargeSpawn.lon)!;
    expect(terrain.groundHeight(b.x, b.z)).toBeLessThan(-2);
  });

  it('anchored in the bay, stopped, for 3 s: ashore, no prompt; an anchor already set as the page loads (back from the camp) does not send her straight back', async () => {
    const { v, t, m, control } = await oban();
    const s = m.SITES[0];
    const at = t.hotspotAt(s)!;
    control.placeVessel(v, at.x + 10, 0, at.z, 0);
    v.linearVelocity = [0, 0, 0];
    // Loaded anchored there (back from the camp): nothing, however long she lies.
    v.anchor = { ...v.anchor, phase: 'set' };
    const back = new t.HotspotWatch();
    expect(back.update(v, [s], 30)).toBeNull();
    // Weigh and let go again: then it goes.
    v.anchor = { ...v.anchor, phase: 'weighing' };
    back.update(v, [s], 1);
    v.anchor = { ...v.anchor, phase: 'set' };
    expect(back.update(v, [s], 2)).toBeNull();
    expect(back.update(v, [s], 1.5)!.id).toBe(s.id);
    // Sailing in and anchoring: stowed first, then set.
    const watch = new t.HotspotWatch();
    v.anchor = { ...v.anchor, phase: 'stowed' };
    expect(watch.update(v, [s], 5)).toBeNull();
    v.anchor = { ...v.anchor, phase: 'set' };
    expect(watch.update(v, [s], 3.5)!.id).toBe(s.id);
    expect(watch.update(v, [s], 1, false)).toBeNull(); // not with crew aboard
    // Moving, or outside the radius: no.
    v.linearVelocity = [0.5, 0, 0];
    expect(watch.update(v, [s], 5)).toBeNull();
    v.linearVelocity = [0, 0, 0];
    control.placeVessel(v, at.x + s.radiusM + 30, 0, at.z, 0);
    expect(watch.update(v, [s], 5)).toBeNull();
  });

  it('back from the camp: a barge of logs on the line, heavier for her load; sold at Oban for logs x price', async () => {
    const { w, v, sim, t, m, control } = await oban();
    const s = m.SITES[0];
    const at = t.hotspotAt(s)!;
    // Anchored at the far side of the hotspot: the barge comes in to where the line reaches.
    control.placeVessel(v, at.x - 50, 0, at.z + 20, 0);
    const id = t.bargeFromCamp(w, s, v, 20)!;
    expect(w.tow!.lines[v.id].target).toBe(`v:${id}`);
    expect(w.timber!.barges[id].logs).toBe(20);
    const b = w.vessels[id];
    expect(Math.hypot(b.position[0] - v.position[0], b.position[2] - v.position[2])).toBeLessThanOrEqual(CONFIG.voyage.timber.bargeOffM + 0.01);
    const pay = await import('../src/cargo/cargo');
    expect(pay.payloadOf(w, id)[0].mass).toBeCloseTo(20 * CONFIG.voyage.timber.logKg, 6);
    // Floats on: a few seconds of sim with the logs aboard.
    for (let i = 0; i < 60; i++) sim.stepWorld(w, [], 1 / 20);
    expect(w.vessels[id]).toBeTruthy();
    // The sale: alongside the merchant's quay, stopped.
    const berths = await import('../src/world/berths');
    const berth = berths.berthWithId('oban-cargo')!;
    control.placeVessel(b, berth.x, 0, berth.z, berth.headingDeg);
    control.placeVessel(v, berth.x + 30, 0, berth.z + 30, 0);
    b.linearVelocity = [0, 0, 0];
    v.linearVelocity = [0, 0, 0];
    const offer = t.saleOffer(w, v, 'oban')!;
    expect(offer.logs).toBe(20);
    expect(offer.total).toBe(20 * CONFIG.voyage.timber.pricePerLog);
    const before = w.career!.money;
    expect(t.sellBarge(w, offer.bargeId, offer.merchant)).toBe(offer.total);
    expect(w.career!.money).toBe(before + offer.total);
    expect(w.vessels[id]).toBeUndefined();
    expect(w.tow!.lines[v.id]).toBeUndefined();
    expect(t.saleOffer(w, v, 'oban')).toBeNull();
  });

  it('kept with the save: where she lies, her load, and on the line again', async () => {
    const { w, v, t, m, control } = await oban();
    const at = t.hotspotAt(m.SITES[0])!;
    control.placeVessel(v, at.x, 0, at.z, 0);
    t.bargeFromCamp(w, m.SITES[0], v, 30);
    const saved = t.bargesToSave(w, v.id, () => 90);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ logs: 30, towed: true });
    const back = t.parseBarges(JSON.stringify([...saved, { x: 'no' }]));
    expect(back).toHaveLength(1);
    const fresh = await oban();
    fresh.control.placeVessel(fresh.v, at.x, 0, at.z, 0);
    fresh.t.restoreBarges(fresh.w, back, fresh.v);
    const id = Object.keys(fresh.w.timber!.barges)[0];
    expect(fresh.w.tow!.lines[fresh.v.id].target).toBe(`v:${id}`);
    expect(t.parseBarges('garbage')).toEqual([]);
  });
});
