/**
 * The coast viewer's harbour layer (pipeline milestone 3): the harbours' kit pieces (piers,
 * pontoons, quay walls, breakwaters, slipways) as one merged mesh, bollards at the berths as
 * one instanced mesh, the buildings near the harbours merged into one mesh per 2 km chunk
 * (blocks with pitched roofs, sheds flatter), and the harbours' names with their spine roles.
 * Also answers the test boat: is a point on a piece (solid), and which berth is she at.
 */
import * as THREE from 'three';

export interface HarbourFile {
  harbours: { id: string; name: string; kind: string; x: number; z: number; berths: number; fetch: number; role?: string }[];
  blocks: { source: string; kind: 'quay' | 'pier' | 'pontoon' | 'breakwater'; x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; top: number; fendered: boolean; name?: string }[];
  berths: { id: string; source: string; x: number; z: number; headingDeg: number; shoreX: number; shoreZ: number; shoreDist: number; deckY: number }[];
  slipways: { x: number; z: number; headingDeg: number; width: number; length: number; top: number; slope: number }[];
  buildings: { x: number; z: number; width: number; depth: number; height: number; yawDeg: number; base: number; wall: number; roof: number; cladding: string }[];
}

const KIT: Record<string, { deck: number; side: number }> = {
  quay: { deck: 0x9a958a, side: 0x77726a }, // stone
  pier: { deck: 0x8a6a48, side: 0x5a4632 }, // timber deck on piles
  pontoon: { deck: 0xb8b4aa, side: 0x6a6e70 }, // grey decking on floats
  breakwater: { deck: 0x7d786e, side: 0x66625a }, // rock armour
};
const ROLE_NAMES: Record<string, string> = { 'harbour.sheltered': 'sheltered harbour', 'pier.exposed': 'exposed pier', anchorage: 'anchorage' };

/** Triangles with flat colours, for merging many boxes into one mesh. */
class Merge {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  tri(a: number[], b: number[], c: number[], hex: number): void {
    this.c.setHex(hex);
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  quad(a: number[], b: number[], c: number[], d: number[], hex: number): void {
    this.tri(a, b, c, hex);
    this.tri(a, c, d, hex);
  }
  /**
   * An oriented box: centre (x, z), long axis along compass bearing yawDeg, from y0 to y1,
   * optionally with its top sloping (rise over the length, for a slipway).
   */
  box(x: number, z: number, hl: number, hw: number, yawDeg: number, y0: number, y1: number, top: number, side: number, rise = 0): void {
    const a = (yawDeg * Math.PI) / 180;
    const ux = Math.sin(a);
    const uz = -Math.cos(a);
    const p = (s: number, t: number, y: number) => [x + ux * s - uz * t, y, z + uz * s + ux * t];
    const yt = (s: number) => y1 + (rise * s) / (2 * hl || 1);
    const c = [p(-hl, -hw, 0), p(hl, -hw, 0), p(hl, hw, 0), p(-hl, hw, 0)];
    const t = c.map((q, i) => [q[0], yt(i === 1 || i === 2 ? hl : -hl), q[2]]);
    const b = c.map((q) => [q[0], y0, q[2]]);
    this.quad(t[0], t[3], t[2], t[1], top);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(b[i], t[i], t[j], b[j], side);
    }
  }
  /** A pitched roof on a box: ridge along the long axis, gables at the ends. */
  roof(x: number, z: number, hl: number, hw: number, yawDeg: number, y: number, rise: number, hex: number, gable: number): void {
    const a = (yawDeg * Math.PI) / 180;
    const ux = Math.sin(a);
    const uz = -Math.cos(a);
    const p = (s: number, t: number, yy: number) => [x + ux * s - uz * t, yy, z + uz * s + ux * t];
    const e = 0.3; // eaves overhang
    const A = p(-hl - e, -hw - e, y), B = p(hl + e, -hw - e, y), C = p(hl + e, hw + e, y), Dd = p(-hl - e, hw + e, y); // prettier-ignore
    const R0 = p(-hl - e, 0, y + rise), R1 = p(hl + e, 0, y + rise); // prettier-ignore
    this.quad(A, R0, R1, B, hex);
    this.quad(C, R1, R0, Dd, hex);
    this.tri(p(-hl, -hw, y), p(-hl, hw, y), p(-hl, 0, y + rise), gable);
    this.tri(p(hl, hw, y), p(hl, -hw, y), p(hl, 0, y + rise), gable);
  }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

export class HarbourLayer {
  readonly root = new THREE.Group();
  readonly buildingsRoot = new THREE.Group();
  readonly labels: { text: string; pos: THREE.Vector3 }[] = [];
  readonly file: HarbourFile;
  /** Draw calls this layer adds (kit, bollards, building chunks). */
  readonly drawCalls: number;
  readonly buildingTriangles: number;

  constructor(file: HarbourFile) {
    this.file = file;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // The kit: fixed pieces stand down to the seabed (drawn to 4 m under), pontoons float.
    const kit = new Merge();
    for (const b of file.blocks) {
      const c = KIT[b.kind];
      const y0 = b.kind === 'pontoon' ? b.top - 0.8 : -4;
      kit.box(b.x, b.z, b.halfLength, b.halfWidth, b.yawDeg, y0, b.top, c.deck, c.side);
    }
    for (const s of file.slipways) {
      // Up the slip along its heading, from below the water to its top.
      const low = s.top - s.slope * s.length;
      kit.box(s.x, s.z, s.length / 2, s.width / 2, s.headingDeg, Math.min(low, -1) - 0.5, (s.top + low) / 2, 0x8f8a80, 0x6f6a62, s.top - low);
    }
    this.root.add(kit.mesh(mat));
    // Bollards: one at each berth, on the deck edge (one instanced mesh).
    const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }), file.berths.length);
    const m = new THREE.Matrix4();
    file.berths.forEach((b, i) => {
      m.makeTranslation(b.x + b.shoreX * (b.shoreDist + 0.4), b.deckY + 0.3, b.z + b.shoreZ * (b.shoreDist + 0.4));
      bollards.setMatrixAt(i, m);
    });
    this.root.add(bollards);
    // Buildings: one merged mesh per 2 km chunk (one material for them all).
    const chunks = new Map<string, Merge>();
    for (const b of file.buildings) {
      const key = `${Math.floor(b.x / 2000)},${Math.floor(b.z / 2000)}`;
      const mg = chunks.get(key) ?? new Merge();
      chunks.set(key, mg);
      const top = b.base + b.height;
      mg.box(b.x, b.z, b.depth / 2, b.width / 2, b.yawDeg, b.base - 1, top, b.roof, b.wall);
      const shed = b.cladding === 'sheet';
      mg.roof(b.x, b.z, b.depth / 2, b.width / 2, b.yawDeg, top, b.width * (shed ? 0.12 : 0.35), b.roof, b.wall);
    }
    let tris = 0;
    for (const mg of chunks.values()) {
      tris += mg.pos.length / 9;
      this.buildingsRoot.add(mg.mesh(mat));
    }
    this.buildingTriangles = tris;
    this.root.add(this.buildingsRoot);
    this.drawCalls = 2 + chunks.size;
    for (const h of file.harbours) {
      const role = h.role ? ` (${ROLE_NAMES[h.role] ?? h.role})` : '';
      this.labels.push({ text: `${h.name}${role}`, pos: new THREE.Vector3(h.x, 14, h.z) });
    }
    // The anchorage: a ring on the water.
    for (const h of file.harbours.filter((h) => h.kind === 'anchorage')) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(55, 60, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40c0ff }));
      ring.position.set(h.x, 0.3, h.z);
      this.root.add(ring);
    }
  }

  /** The deck height of the piece at (x, z), or null if there's none (pontoons too: a boat can't pass through them). */
  pieceAt(x: number, z: number): number | null {
    for (const b of this.file.blocks) {
      const a = (b.yawDeg * Math.PI) / 180;
      const ux = Math.sin(a);
      const uz = -Math.cos(a);
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.abs(dx * ux + dz * uz) <= b.halfLength && Math.abs(-dx * uz + dz * ux) <= b.halfWidth) return b.top;
    }
    return null;
  }

  /** The nearest berth within `reach` m of (x, z), and the harbour it belongs to. */
  berthNear(x: number, z: number, reach: number): { berth: HarbourFile['berths'][number]; harbour: string } | null {
    let best: HarbourFile['berths'][number] | null = null;
    let bd = reach;
    for (const b of this.file.berths) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) (bd = d), (best = b);
    }
    if (!best) return null;
    const near = [...this.file.harbours].sort((p, q) => Math.hypot(p.x - best!.x, p.z - best!.z) - Math.hypot(q.x - best!.x, q.z - best!.z))[0];
    return { berth: best, harbour: near?.name ?? '' };
  }
}
