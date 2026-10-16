import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { jump, updateAir, type BodyVessel } from '../src/player/body';
import { createPlayerState } from '../src/player/playerState';
import { hullPlan, vesselWalkArea } from '../src/vessel/layout';
import { applyVesselIntent, placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { worldWalkArea } from '../src/world/landWalkArea';

const DT = 1 / 60;
const def = VESSEL_DEFS.workboat;
const g = def.layout.sideGate!;
const zMid = (g.z0 + g.z1) / 2;

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  const s = world.vessels[vesselId];
  placeVessel(s, 0, 0, -300, 0);
  const root = new THREE.Group();
  root.position.fromArray(s.position);
  root.quaternion.fromArray(s.orientation);
  root.updateMatrixWorld(true);
  const v: BodyVessel = { id: s.id, root, area: vesselWalkArea(def, def.layout), plan: hullPlan(def), state: s };
  return v;
}

function fly(p: ReturnType<typeof createPlayerState>, vessels: BodyVessel[]) {
  for (let i = 0; i < 4 / DT; i++) {
    const ev = updateAir(p, DT, new THREE.Vector3(), vessels, worldWalkArea(), []);
    if (ev) return ev;
  }
  return null;
}

describe('the working-deck gate', () => {
  it('opens and shuts with its button (the sideGate control)', () => {
    const v = boat();
    expect(v.state.controls.sideGate ?? 0).toBe(0);
    applyVesselIntent(v.state, { playerId: 'p', targetId: v.id, control: 'sideGate', value: 1 });
    expect(v.state.controls.sideGate).toBe(1);
    applyVesselIntent(v.state, { playerId: 'p', targetId: v.id, control: 'sideGate', value: 0 });
    expect(v.state.controls.sideGate).toBe(0);
  });

  it('open, you can walk out to the deck edge in the gateway (and only there)', () => {
    const v = boat();
    const edge = g.side * (v.plan.halfBeam(zMid) - 0.12);
    const deck = v.plan.deckY(zMid);
    expect(v.area.walkable(edge, zMid, deck)).toBe(false);
    expect(v.area.inBounds!(edge, zMid)).toBe(false);
    v.area.setGateOpen!(true);
    expect(v.area.walkable(edge, zMid, deck)).toBe(true);
    expect(v.area.inBounds!(edge, zMid)).toBe(true);
    // Not beside it, nor on the other side.
    expect(v.area.walkable(edge, g.z1 + 0.5, deck)).toBe(false);
    expect(v.area.walkable(-edge, zMid, deck)).toBe(false);
  });

  it('jump up at it from the skiff alongside and you are aboard; not when it is shut', () => {
    const v = boat();
    const skiffDeck = v.root.localToWorld(new THREE.Vector3(g.side * (v.plan.halfBeam(zMid) + 0.9), 0.35, zMid));
    const tryJump = () => {
      const p = createPlayerState('p', 'P');
      p.aboardVesselId = null;
      p.position = skiffDeck.toArray() as [number, number, number];
      jump(p, null, new THREE.Vector3(-g.side, 0, 0)); // facing the ship
      return { p, ev: fly(p, [v]) };
    };
    const shut = tryJump();
    expect(shut.p.aboardVesselId).toBeNull();
    v.state.controls.sideGate = 1;
    const { p, ev } = tryJump();
    expect(ev).toBe('landedDeck');
    expect(p.aboardVesselId).toBe(v.id);
    expect(p.position[0] * g.side).toBeLessThan(v.plan.halfBeam(zMid));
    expect(p.position[1]).toBeCloseTo(Math.min(...v.area.floorsAt(p.position[0], p.position[2])), 5);
  });

  it('jumping out through it from the deck, you go on over the side (not pulled back)', () => {
    const v = boat();
    v.state.controls.sideGate = 1;
    v.area.setGateOpen!(true);
    const p = createPlayerState('p', 'P');
    p.aboardVesselId = v.id;
    const x = g.side * (v.plan.halfBeam(zMid) - 0.15);
    p.position = [x, v.plan.deckY(zMid), zMid];
    jump(p, { root: v.root, state: v.state }, new THREE.Vector3(g.side, 0, 0));
    expect(fly(p, [v])).toBe('splash');
  });
});
