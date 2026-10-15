import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { climbOut, jump, setAirborne, swimArea, swimLadderOf, updateAir, updateSwim, type BodyVessel } from '../src/player/body';
import { createPlayerState } from '../src/player/playerState';
import { hullPlan, vesselWalkArea } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { landFloor, worldWalkArea } from '../src/world/landWalkArea';
import { nearestBlockEdge, standingHeight } from '../src/world/geography';

const DT = 1 / 60;
const world = worldWalkArea();
const noOffset = new THREE.Vector3();

function boat(x: number, z: number, headingDeg = 0) {
  const { world: w, vesselId } = createWorld(new IdFactory());
  const s = w.vessels[vesselId];
  placeVessel(s, x, 0, z, headingDeg);
  const def = VESSEL_DEFS[s.defId];
  const root = new THREE.Group();
  root.position.fromArray(s.position);
  root.quaternion.fromArray(s.orientation);
  root.updateMatrixWorld(true);
  const v: BodyVessel = { id: s.id, root, area: vesselWalkArea(def, def.layout), plan: hullPlan(def), state: s };
  return v;
}

function fly(p: ReturnType<typeof createPlayerState>, vessels: BodyVessel[], maxS = 4) {
  for (let i = 0; i < maxS / DT; i++) {
    const ev = updateAir(p, DT, noOffset, vessels, world, []);
    if (ev) return ev;
  }
  return null;
}

describe('body: jumping, swimming, climbing out', () => {
  it('a jump off a moving boat keeps her speed (moving frame), and you land in the sea', () => {
    const v = boat(0, -300);
    v.state.linearVelocity = [0, 0, -3]; // 3 m/s ahead (north)
    const p = createPlayerState('p', 'P');
    p.aboardVesselId = v.id;
    p.position = [0, 1.2, 4];
    jump(p, { root: v.root, state: v.state }, new THREE.Vector3(1, 0, 0)); // looking to starboard
    expect(p.aboardVesselId).toBeNull();
    expect(p.mode).toBe('air');
    expect(p.velocity![2]).toBeCloseTo(-3, 5);
    expect(p.velocity![0]).toBeGreaterThan(2);
    expect(p.velocity![1]).toBeGreaterThan(3);
    expect(fly(p, [])).toBe('splash');
    expect(p.mode).toBe('swim');
  });

  it('jumping straight up on deck lands back on the deck, in the boat frame', () => {
    const v = boat(0, -300, 90);
    const p = createPlayerState('p', 'P');
    p.aboardVesselId = v.id;
    p.position = [0.5, 1.2, 4];
    p.yaw = 0.3;
    const deck = Math.min(...v.area.floorsAt(0.5, 4));
    p.position[1] = deck;
    jump(p, { root: v.root, state: v.state }, new THREE.Vector3(0, 1, 0));
    expect(p.yaw).toBeCloseTo(0.3 - Math.PI / 2, 3); // boat heading east = yaw -90°
    expect(fly(p, [v])).toBe('landedDeck');
    expect(p.aboardVesselId).toBe(v.id);
    expect(p.position[0]).toBeCloseTo(0.5, 2);
    expect(p.position[2]).toBeCloseTo(4, 2);
    expect(p.position[1]).toBeCloseTo(deck, 3);
    expect(p.yaw).toBeCloseTo(0.3, 3);
  });

  it('jumping from a boat alongside the quay lands you on the quay', () => {
    const edge = nearestBlockEdge(716, 652, 30)!; // Calder Haven quay, near the cargo stack
    const top = standingHeight(edge.x, edge.z);
    const p = createPlayerState('p', 'P');
    setAirborne(p, new THREE.Vector3(edge.x, top + 0.4, edge.z), new THREE.Vector3(0, 1, 0));
    expect(fly(p, [])).toBe('landedLand');
    expect(p.position[1]).toBeCloseTo(top, 3);
  });

  it('swimming: you float with your head just above the water and walk out on a beach', () => {
    const area = swimArea();
    expect(area.walkable(0, -300, 0)).toBe(true);
    const p = createPlayerState('p', 'P');
    p.mode = 'swim';
    p.position = [0, -1.5, -300];
    const body = new THREE.Vector3(0, 0, -300);
    for (let i = 0; i < 120; i++) updateSwim(p, DT, body, 1.6, [], world, []);
    expect(p.position[1] + 1.6).toBeCloseTo(0.15, 2); // head 15 cm above flat water
    // Selkie Bay beach: shallow enough to stand.
    expect(landFloor(-162, 1301)).not.toBeNull();
    const ev = updateSwim(p, DT, new THREE.Vector3(-162, 0, 1301), 1.6, [], world, []);
    expect(ev).toBe('landedLand');
    expect(p.mode).toBe('walk');
  });

  it("swimmers are pushed clear of the hull, and climb aboard by the gunwale or with the jump button", () => {
    const v = boat(0, -300);
    const p = createPlayerState('p', 'P');
    p.mode = 'swim';
    p.position = [0.3, -1.4, -297];
    updateSwim(p, DT, new THREE.Vector3(0.3, 0, -297), 1.6, [v], world, []);
    const hb = v.plan.halfBeam(3);
    expect(p.position[0]).toBeGreaterThan(hb); // pushed out to starboard of the hull
    // A hand on the starboard gunwale near the stern hauls you aboard.
    const hand = v.root.localToWorld(new THREE.Vector3(v.plan.halfBeam(4) + 0.1, v.plan.deckY(4), 4));
    expect(climbOut(p, new THREE.Vector3(p.position[0], 0, p.position[2]), hand, [v], [])).toBe(true);
    expect(p.aboardVesselId).toBe(v.id);
    expect(p.mode).toBe('walk');
    expect(v.area.walkable(p.position[0], p.position[2], p.position[1])).toBe(true);
    // Out in open water, the jump button does nothing.
    const q = createPlayerState('q', 'Q');
    q.mode = 'swim';
    expect(climbOut(q, new THREE.Vector3(30, 0, -300), null, [v], [])).toBe(false);
  });

  it('the swim ladder: a hand on a low rung (well below the gunwale) gets you aboard at its head', () => {
    const v = boat(0, -300);
    const lad = swimLadderOf(v)!;
    expect(lad).toBeTruthy();
    expect(lad.bottom).toBeLessThan(0); // its foot is in the water
    const p = createPlayerState('p', 'P');
    p.mode = 'swim';
    p.position = [lad.x + 0.6, -1.4, lad.z];
    // Just above the water: far too low for the gunwale, fine for the ladder.
    const hand = v.root.localToWorld(new THREE.Vector3(lad.x, 0.1, lad.z + 0.1));
    expect(climbOut(p, v.root.localToWorld(new THREE.Vector3(lad.x + 0.6, 0, lad.z)), hand, [v], [])).toBe(true);
    expect(p.aboardVesselId).toBe(v.id);
    expect(p.position[0]).toBeCloseTo(lad.deckX, 5);
    expect(v.area.walkable(p.position[0], p.position[2], p.position[1])).toBe(true);
    // Desktop: the jump button within reach of it does the same.
    const q = createPlayerState('q', 'Q');
    q.mode = 'swim';
    expect(climbOut(q, v.root.localToWorld(new THREE.Vector3(lad.x + 1.5, 0, lad.z + 0.5)), null, [v], [])).toBe(true);
    expect(q.position[2]).toBeCloseTo(lad.z, 5);
  });

  it('you can climb out onto a quay from the water beside it', () => {
    const edge = nearestBlockEdge(716, 652, 30)!;
    const p = createPlayerState('p', 'P');
    p.mode = 'swim';
    // A point in the water just off the quay face: step outward from the edge point until clear.
    const near = nearestBlockEdge(edge.x, edge.z, 2)!;
    expect(near).not.toBeNull();
    let x = edge.x;
    for (let i = 0; i < 40 && standingHeight(x, edge.z) > 0; i++) x += 0.25;
    if (standingHeight(x, edge.z) > 0) for (x = edge.x; standingHeight(x, edge.z) > 0; ) x -= 0.25;
    expect(climbOut(p, new THREE.Vector3(x, 0, edge.z), null, [], [])).toBe(true);
    expect(p.mode).toBe('walk');
    expect(p.position[1]).toBeGreaterThan(0.5);
  });
});
