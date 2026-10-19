/**
 * The Narrows (regions, milestone 6): the narrows and the strongest race, Twin Fang Rock
 * (a boat swept onto it grounds; the skiff floats over), Spruce Channel through the flats
 * (deep along its line, a metre either side, buoyed red to port going in), the spine (the
 * cannery's buyer, the wharf, the weed anchorage), Signal Peak's mast and light, morning
 * fog, the goods and the jobs.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { spawnCargo } from '../src/cargo/cargo';
import { createEnvironment } from '../src/environment/environmentState';
import { createWeather, setWeatherPreset } from '../src/environment/weather';
import { startTowCall } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { CURRENTS, LIGHTS, MARKS, PORTS } from '../src/world/archipelago';
import { bottomAt, standingHeight } from '../src/world/geography';
import { regionAt } from '../src/world/regions';
import { NARROWS } from '../src/world/regions/narrows';
import { SOUNDS } from '../src/world/regions/sounds';
import { arcShelter, shelterFactor } from '../src/world/shelter';
import { groundHeight } from '../src/world/terrain';
import { summitNear } from '../src/world/view/terrainMesh';

const port = (id: string) => PORTS.find((p) => p.id === id)!;
const SPRUCE = NARROWS.channels!.find((c) => c.name === 'Spruce Channel')!;

function game() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat');
  const v = world.vessels[vesselId];
  world.environment.waves = [];
  return { world, v };
}

/** Points along the channel's line every `step` m, with the leg's direction (unit x, z). */
function along(step: number): { x: number; z: number; dx: number; dz: number }[] {
  const out: { x: number; z: number; dx: number; dz: number }[] = [];
  const p = SPRUCE.points;
  for (let i = 0; i + 1 < p.length; i++) {
    const [ax, az] = p[i];
    const [bx, bz] = p[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += step) out.push({ x: ax + ((bx - ax) * s) / L, z: az + ((bz - az) * s) / L, dx: (bx - ax) / L, dz: (bz - az) / L });
  }
  return out;
}

describe('the geography', () => {
  it('one gap out from the Sounds, to the north-west', () => {
    expect(regionAt(-4250, -6400).id).toBe('narrows');
    let gap = Infinity;
    // Between real islands (the passage rocks lie in the gap on purpose).
    const big = (i: { radius: number }) => i.radius >= 100;
    for (const a of SOUNDS.islands.filter(big)) for (const b of NARROWS.islands.filter(big)) gap = Math.min(gap, Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius);
    expect(gap).toBeGreaterThan(2500);
    expect(gap).toBeLessThan(4500);
  });

  it('the narrows: about 300 m of deep water between walls, the strongest race in the game', () => {
    let w = 0;
    for (let x = -4800; x <= -3700; x += 1) if (groundHeight(x, -6400) < 0) w += 1;
    expect(w).toBeGreaterThan(250);
    expect(w).toBeLessThan(380);
    expect(groundHeight(-4500, -6400)).toBeGreaterThan(150);
    expect(groundHeight(-3950, -6400)).toBeGreaterThan(50);
    const race = CURRENTS.find((c) => c.id === 'cutter-narrows')!;
    expect(race.peakKn).toBe(Math.max(...CURRENTS.map((c) => c.peakKn)));
    expect(race.peakKn).toBe(12);
  });

  it('Otter Cove: a narrow mouth with the islet across it, a 9 m basin behind, a beach at its head', () => {
    // The mouth at the shore: about 100 m of water, no more.
    let mouth = 0;
    for (let x = -5150; x <= -4850; x += 1) if (groundHeight(x, -5380) < -2) mouth += 1;
    expect(mouth).toBeGreaterThan(60);
    expect(mouth).toBeLessThan(140);
    // The islet stands across it, a little way out: no straight line in from the south.
    expect(groundHeight(-5000, -5225)).toBeGreaterThan(10);
    for (let x = -5040; x <= -4960; x += 10) expect(groundHeight(x, -5260), `${x}`).toBeGreaterThan(0);
    // Deep passages either side of the islet, and the basin.
    expect(groundHeight(-5070, -5320)).toBeLessThan(-6);
    expect(groundHeight(-4930, -5320)).toBeLessThan(-6);
    expect(groundHeight(-5000, -5490)).toBeCloseTo(-9, 0);
    // The beach at the head: shallow, then the cabin's level.
    expect(groundHeight(-5000, -5600)).toBeGreaterThan(-3);
    expect(groundHeight(-5000, -5600)).toBeLessThan(0);
    expect(groundHeight(-5000, -5625)).toBeCloseTo(1.5, 1);
  });

  it('Twin Fang Rock: two pinnacles 0.6 m under, deep water all round, marked', () => {
    for (const [x, z] of [[-4230, -6420], [-4290, -6350]]) {
      expect(groundHeight(x, z)).toBeCloseTo(-0.6, 1);
      expect(groundHeight(x + 30, z)).toBeLessThan(-10);
      expect(groundHeight(x - 30, z)).toBeLessThan(-10);
    }
    expect(MARKS.find((m) => m.name === 'Twin Fang Rock')?.kind).toBe('isolated');
  });

  it('Spruce Channel: 9 m along its line, a metre or so on the flats either side', () => {
    const pts = along(40);
    for (const p of pts) expect(groundHeight(p.x, p.z), `${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeLessThan(-8.5);
    // Between its mouth in the open sea (the first 450 m) and the cannery's basin (the last 300 m):
    for (const p of pts.slice(Math.ceil(450 / 40), pts.length - Math.ceil(300 / 40))) {
      // 90 m to either side, on the flats (or, near the island and the cannery, ashore): never deep.
      for (const s of [-1, 1]) {
        const h = groundHeight(p.x + p.dz * 90 * s, p.z - p.dx * 90 * s);
        expect(h, `${s > 0 ? 'left' : 'right'} of ${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeGreaterThan(-2.5);
      }
    }
  });

  it('its buoys: red to port and green to starboard going in from the sea, in the channel', () => {
    const lateral = NARROWS.marks.filter((m) => m.kind === 'port' || m.kind === 'stbd');
    expect(lateral.length).toBeGreaterThanOrEqual(14);
    const pts = along(10);
    for (const m of lateral) {
      const p = pts.reduce((a, b) => (Math.hypot(b.x - m.x, b.z - m.z) < Math.hypot(a.x - m.x, a.z - m.z) ? b : a));
      // Left of the direction of travel (x east, z south): (dz, -dx).
      const left = (m.x - p.x) * p.dz + (m.z - p.z) * -p.dx;
      expect(Math.sign(left), m.name).toBe(m.kind === 'port' ? 1 : -1);
      expect(Math.hypot(m.x - p.x, m.z - p.z), m.name).toBeLessThan(35);
    }
  });

  it('a workboat swept onto Twin Fang Rock by the race at peak grounds; clear of it she drives through', () => {
    const run = (x: number) => {
      const { world, v } = game();
      world.environment.raceOverride = 'peak';
      // 120 m south of the southern pinnacle (z grows southward), heading north, engine off.
      placeVessel(v, x, 0, -6300, 0);
      let hit = 0;
      for (let i = 0; i < 40 * 60; i++) {
        stepWorld(world, [], 1 / 60);
        hit = Math.max(hit, v.contact.force);
      }
      return { hit, z: v.position[2] };
    };
    const onRock = run(-4230);
    expect(onRock.hit).toBeGreaterThan(0);
    const clear = run(-4170); // 60 m east of the rock, still in the channel
    expect(clear.hit).toBe(0);
    expect(clear.z).toBeLessThan(-6300 - 150); // carried north by the race
  });
});

describe('the spine', () => {
  it('a cannery with fuel and the best fish buyer, an exposed wharf, a weed anchorage behind an islet', () => {
    expect(port('ashby').kind).toBe('harbour');
    expect(port('ashby').fuel).toBeDefined();
    const best = (k: 'fish' | 'shellfish') => Math.max(...PORTS.map((p) => p.economy?.buys?.[k] ?? 1));
    expect(port('ashby').economy!.buys!.fish).toBe(best('fish'));
    expect(port('ashby').economy!.buys!.fish).toBeGreaterThan(1.4);
    expect(port('kestrel').kind).toBe('pier');
    expect(shelterFactor(-3518, -5420)).toBe(1);
    expect(port('otter').kind).toBe('anchorage');
    expect(bottomAt(-5000, -5490)).toBe('weed');
    // Sheltered from a sea out of the north-east (travelling south-west), open where their gaps are.
    const SW = [-Math.SQRT1_2, Math.SQRT1_2] as const;
    expect(arcShelter(-5000, -5490, SW[0], SW[1])).toBeLessThan(0.2);
    expect(arcShelter(-4710, -7395, SW[0], SW[1])).toBeLessThan(0.2);
    // Only a sea from dead south gets in, past the islet, and only a little of it (the cut-down mouth).
    expect(arcShelter(-5000, -5490, -Math.SQRT1_2, -Math.SQRT1_2)).toBeLessThan(0.2); // from the south-east
    expect(arcShelter(-5000, -5490, Math.SQRT1_2, -Math.SQRT1_2)).toBeLessThan(0.2); // from the south-west
    for (const b of NARROWS.berths) {
      expect(groundHeight(b.x, b.z), b.id).toBeLessThan(-4);
      expect(standingHeight(b.x + b.shoreX * (b.shoreDist + 1), b.z + b.shoreZ * (b.shoreDist + 1)), b.id).toBeCloseTo(b.deckY, 1);
    }
  });

  it('buildings stand ashore, lights on the ground, potting grounds at 6-25 m, stacks ashore', () => {
    for (const b of NARROWS.buildings) {
      const h = standingHeight(b.x, b.z);
      expect(h, `${b.x},${b.z}`).toBeGreaterThan(0.5);
      expect(h, `${b.x},${b.z}`).toBeLessThan(15);
    }
    for (const l of NARROWS.lights) expect(l.y - standingHeight(l.x, l.z), l.name).toBeGreaterThan(2);
    for (const g of NARROWS.pottingGrounds) {
      const d = -groundHeight(g.x, g.z);
      expect(d, g.id).toBeGreaterThan(6);
      expect(d, g.id).toBeLessThan(25);
    }
    for (const p of NARROWS.ports) expect(standingHeight(p.cargo.stackX, p.cargo.stackZ), p.id).toBeGreaterThan(0.5);
  });

  it('Signal Peak: the mast on the summit, its red light at the top', () => {
    const mast = NARROWS.landmarks.find((l) => l.kind === 'mast')!;
    const top = summitNear(mast.x, mast.z);
    expect(Math.hypot(top.x - mast.x, top.z - mast.z)).toBeLessThan(15);
    const light = LIGHTS.find((l) => l.name.startsWith('Signal Peak'))!;
    expect(light.color).toBe('red');
    expect(light.y).toBeCloseTo(top.h + CONFIG.regions.mastHeight, 0);
  });
});

describe('weather, goods, jobs', () => {
  it('morning fog: a change due in the morning is mostly to fog; in the afternoon seldom', () => {
    const env = createEnvironment();
    env.timeScale = 0;
    const share = (hour: number) => {
      env.timeOfDay = hour;
      const w = createWeather('Overcast', 0);
      let fog = 0;
      for (let i = 0; i < 100; i++) {
        setWeatherPreset(w, 'Overcast', 1000 * i, false, env, NARROWS.weather);
        if (w.next.preset === 'Fog') fog++;
      }
      return fog / 100;
    };
    expect(share(7)).toBeGreaterThan(0.5);
    expect(share(15)).toBeLessThan(0.3);
  });

  it('cargo: canned fish out of the cannery; groceries and fuel drums from the wharf to the cannery or the cove', () => {
    const { world } = game();
    for (const id of Object.keys(world.cargo)) delete world.cargo[id];
    for (let i = 0; i < 500; i++) if (!spawnCargo(world)) break;
    const items = Object.values(world.cargo);
    const kind = (i: (typeof items)[number]) => CONFIG.cargo.kinds[i.kind].name;
    const fromAshby = items.filter((i) => i.from === 'ashby');
    expect(fromAshby.length).toBeGreaterThan(0);
    for (const i of fromAshby) expect(kind(i)).toBe('Canned fish');
    for (const i of items.filter((i) => i.from === 'kestrel')) {
      expect(['Groceries', 'Oil drum']).toContain(kind(i));
      if (kind(i) === 'Groceries') expect(['ashby', 'otter']).toContain(i.to);
    }
  });

  it('the log boom section is a tow at its spot south of the narrows, in deep water', () => {
    const { world, v } = game();
    placeVessel(v, -4250, 0, -4900, 0);
    const tpl = NARROWS.jobs!.tows![0];
    const job = startTowCall(world, v, tpl.kind, { name: tpl.name, at: tpl.at });
    const t = world.vessels[job.vesselId];
    expect(t.defId).toBe('logRaft');
    expect(Math.hypot(t.position[0] - tpl.at!.x, t.position[2] - tpl.at!.z)).toBeLessThanOrEqual(tpl.at!.r + 1);
    expect(groundHeight(t.position[0], t.position[2])).toBeLessThan(-CONFIG.tow.minDepth);
    expect(world.rescue?.radio?.text).toContain('log boom');
  });
});
