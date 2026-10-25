/**
 * The TV (owner, Oct 2026: a TV "added on the furniture step to any wall", showing "another
 * browser tab ... only for desktop users, but the screen should be visible for all users"):
 * placed on a wall in the Shipyard, a screen to press in the game, and the world saying who is
 * showing a tab on which TV (modules/furniture/tv*.ts). The picture itself goes player to player
 * (tvCast.ts), which needs browsers: checked by hand.
 */
import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { hullFormOf } from '../src/modular/hull';
import { FURNITURE } from '../src/modules/furniture';
import { TvScreen } from '../src/modules/furniture/tvScreen';
import { tvLoudness } from '../src/modules/furniture/tvCast';
import { tvKey } from '../src/modules/furniture/tvState';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, furnitureCell, type ShipDesign } from '../src/shipyard/design';
import { createPlayerState } from '../src/player/playerState';

afterAll(() => useDesign(DEFAULT_DESIGN));

const CAT = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
/** The catamaran with a saloon, and pins `fromAft` m forward of the wheelhouse's aft wall. */
function cat(pins: (at: (x: number, fromAft: number) => number) => Partial<ShipDesign>): ShipDesign {
  const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[CAT].defaults, hull: CAT, saloon: 3.0 };
  const b = buildDesign(base);
  const tr = hullFormOf(b.hull.form).stations[0].z;
  const aft = b.hull.layout.wheelhouse!.aft;
  return { ...base, ...pins((x, fromAft) => furnitureCell(x, tr - (aft - fromAft))) };
}

describe('a TV on the wall', () => {
  it('goes on the nearest wall, its screen at seated eye height, facing into the room; over a settee too', () => {
    const b = buildDesign(cat((at) => ({ setteeAt: at(-1.5, 2), tvAt: at(-1.5, 2), tvAt2: at(1.5, 2.5) })));
    expect(b.warnings).toEqual([]);
    const tv = b.hull.sockets.find((s) => s.id === 'furniture.tv')!;
    const tv2 = b.hull.sockets.find((s) => s.id === 'furniture.tv2')!;
    const settee = b.hull.sockets.find((s) => s.id === 'furniture.settee')!;
    expect(tv.label).toMatch(/against the port wall: the TV$/);
    // Pulled back to its wall isn't "moved along the wall to fit".
    expect(b.placed.tvAt).toMatchObject({ moved: false });
    expect(tv2.label).toMatch(/against the starboard wall/);
    expect(tv.transform.rotationDeg![1]).toBe(-90);
    // Over the settee, the same wall and place.
    expect(Math.abs(tv.transform.position[2] - settee.transform.position[2])).toBeLessThan(0.3);
    const m = b.recipe.modules.find((x) => x.socket === 'furniture.tv')!;
    expect(m.config).toMatchObject({ kind: 'tv', height: CONFIG.modules.furniture.tv.centre });
    // A recipe the game will build (the module takes it).
    expect(FURNITURE.validateConfig!(m.config as never)).toEqual([]);
  });

  it('not in a doorway: the aft door\'s way is kept clear (it slides along to fit)', () => {
    const b = buildDesign(cat((at) => ({ tvAt: at(0, 0.05) })));
    const tv = b.hull.sockets.find((s) => s.id === 'furniture.tv')!;
    expect(Math.abs(tv.transform.position[0])).toBeGreaterThan(CONFIG.shipyard.furniture.doorWay.halfWidth);
  });

  it('nowhere to walk round (no footprint); its screen is a press, its channel names the TV', () => {
    const c = { kind: 'tv' as const, length: 0.76, depth: 0.1, height: 1.35 };
    expect(FURNITURE.footprints!(c, {} as never, (p) => [p[0], p[1], p[2]])).toEqual([]);
    const v = FURNITURE.view!.build({ config: c, keys: { door: 'furniture.headDoor' }, socket: { id: 'furniture.tv2', type: 'cabin.furniture', transform: { position: [0, 0, 0] } } } as never);
    const tv = v.controls.find((x): x is TvScreen => x instanceof TvScreen)!;
    expect(tv.channel).toBe('tvCast.furniture.tv2');
    expect(tv.kind).toBe('press');
    // Its screen's middle at its height, out from the wall (the wall at +z, the room at -z).
    const p = tv.centre(new THREE.Vector3());
    expect(p.y).toBeCloseTo(1.35, 6);
    expect(p.z).toBeLessThan(-0.04);
  });

  it('a picture keeps its shape: a wide one fills the width, a tall one the height', () => {
    const tv = new TvScreen('furniture.tv', 0.73, 0.4, 1.35, -0.05);
    const tex = new THREE.Texture();
    const mesh = tv.root.children[0] as THREE.Mesh;
    tv.show(tex, 21 / 9);
    expect(mesh.scale.x).toBe(1);
    expect(mesh.scale.y).toBeLessThan(1);
    tv.show(tex, 4 / 3);
    expect(mesh.scale.y).toBe(1);
    expect(mesh.scale.x).toBeLessThan(1);
    tv.show(null);
    expect(mesh.scale.x).toBe(1);
  });

  it('its sound: full near it, fading to nothing a dozen metres off', () => {
    const s = CONFIG.tv.sound;
    expect(tvLoudness(1)).toBe(s.gain);
    expect(tvLoudness((s.nearFull + s.nearMax) / 2)).toBeCloseTo(s.gain / 2, 6);
    expect(tvLoudness(s.nearMax + 1)).toBe(0);
  });
});

describe('who is showing a tab on which TV', () => {
  it('a press shows yours (taking it over from another), only you stop it, and it goes dark when you leave', () => {
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'workboat');
    world.players.p2 = createPlayerState('p2', 'Two');
    const key = tvKey(vesselId, 'furniture.tv');
    const send = (playerId: string, value: number) => stepWorld(world, [{ playerId, targetId: vesselId, control: 'tvCast', value, ref: 'furniture.tv' }], 1 / 60);
    send(localPlayerId, 1);
    expect(world.tv!.casts[key]).toBe(localPlayerId);
    // Another player shows theirs: it's theirs now; our stop doesn't stop theirs.
    send('p2', 1);
    expect(world.tv!.casts[key]).toBe('p2');
    send(localPlayerId, 0);
    expect(world.tv!.casts[key]).toBe('p2');
    // They leave the game: dark.
    delete world.players.p2;
    stepWorld(world, [], 1 / 60);
    expect(world.tv!.casts[key]).toBeUndefined();
    // Not a boat: nothing.
    stepWorld(world, [{ playerId: localPlayerId, targetId: 'nobody', control: 'tvCast', value: 1, ref: 'furniture.tv' }], 1 / 60);
    expect(Object.keys(world.tv!.casts)).toEqual([]);
  });
});
