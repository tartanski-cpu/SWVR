import { ElectricsPanel, MasterSwitch } from './electricsPanel';
import { checklistCard, KeySwitch, SelectorSwitch, WarningLamps } from './ignition';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { EnvironmentState } from '../environment/environmentState';
import { Button } from './Button';
import type { Control } from './Control';
import { InstrumentPanel } from './instruments';
import type { AssembledView } from '../modular/assemble';
import { Toggle } from './Toggle';
import { Wheel } from './Wheel';
import { Joystick } from './Joystick';
import { RadioSet } from '../rescue/radioView';
import { ChartPlotter } from '../nav/chartPlotter';
import { OverheadPanel } from './overheadPanel';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { DoorButton, WheelhouseDoor } from './WheelhouseDoor';
import { MonitorView } from '../fire/monitorView';
import { hullPlan } from '../vessel/layout';
import { RainGlass } from '../vessel/view/rainGlass';
import { Cleat, Dipstick, FenderBasket, FendersView, OilCan, EngineHatch } from './deckGear';
import { swimLadderOf } from '../player/body';
import { aFrameOf } from '../fishing/fishing';

/**
 * Builds a vessel's bridge from its config: controls, instrument dash, labels.
 * Everything is in vessel axes and is added to the vessel's root, so it rides the boat.
 */
export class Bridge {
  readonly root = new THREE.Group();
  readonly controls: Control[] = [];
  /** Engine warning lamps by the ignition. */
  private readonly lamps: WarningLamps;
  /** Voltmeter (and, later, the breakers), on boats with 12 V electrics. */
  readonly electrics: ElectricsPanel | null = null;
  /** Empty object at the centre of the instrument dash (for visibility checks). */
  readonly dashAnchor = new THREE.Object3D();
  private readonly instruments: InstrumentPanel;
  /** Overhead VHF (rescue calls). */
  readonly radio: RadioSet;
  /** Overhead chartplotter (search area, destination). */
  readonly chart: ChartPlotter;
  /** Overhead switch panel: deck lights and the FM radio. */
  readonly overhead: OverheadPanel;
  /** Rain on the front windows and the wipers (the App feeds it the weather). */
  readonly rainGlass: RainGlass;
  /** The fire monitor on the roof (boats that have one). */
  private monitor: MonitorView | null = null;
  /** The tow winch's drum (it turns while the winch runs). */
  private readonly winchDrum = new THREE.Group();
  /** The winch drum's motion this frame (+1 heaving in, -1 paying out, 0 still); set by App. */
  drumTurn = 0;
  /** The engine hatch and what's under it (the oil gear works only with it open). */
  engineHatch: EngineHatch | null = null;
  private dipstick: Dipstick | null = null;
  private oilCan: OilCan | null = null;
  /** The aft door (its push buttons on the frame open / shut it). */
  readonly door: WheelhouseDoor;
  /** The fenders over the side or stowed (boats that carry them). */
  private readonly fenders: FendersView | null = null;

  /**
   * @param modules the boat's modules, already built from her recipe (modular boats): their
   *                controls join the bridge's, and their fixed parts are baked with the
   *                bridge's into its one merged mesh. Since M2 the throttle lever is one.
   */
  constructor(
    private readonly def: WorkboatDef,
    private readonly modules: AssembledView,
  ) {
    const b = def.bridge;
    this.root.name = 'bridge';
    for (const m of modules.modules) this.root.add(m.root);

    const wheel = new Wheel('wheel', b.wheel);
    wheel.root.position.fromArray(b.wheel.position);
    wheel.root.rotation.x = (-b.wheel.tiltDeg * Math.PI) / 180;

    // Diesel ignition: hold HEAT (glow plugs), hold START; the key switches it all on/off.
    const start = new Button('start', 'start', 'START (hold)', 'momentary', 0x3aa04a, (s) => s.engine.phase === 'running');
    start.root.position.fromArray(b.startButton.position);
    const heat = new Button('heat', 'heat', 'HEAT: glow plugs (hold)', 'momentary', 0xe07020);
    heat.root.position.fromArray(b.heatButton.position);
    const key = new KeySwitch();
    key.root.position.fromArray(b.keySwitch.position);
    this.lamps = new WarningLamps(b.warningLamps);
    this.root.add(this.lamps.root, checklistCard(b.checklistCard));

    const horn = new Button('horn', 'horn', 'Horn', 'momentary', 0xe0b020);
    horn.root.position.fromArray(b.hornButton.position);

    const nav = new Toggle('navLights', 'navLights', 'Navigation lights', (s) => s.controls.navLights);
    nav.root.position.fromArray(b.navLightsSwitch.position);

    const anchor = new Toggle('anchor', 'anchor', 'Anchor: let go / heave in', (s) => s.controls.anchor);
    anchor.root.position.fromArray(b.anchorSwitch.position);

    const cabin = new Toggle('cabinLight', 'cabinLight', 'Cabin light: off / white / red (night)', (s) => s.controls.cabinLight, 3);
    cabin.root.position.fromArray(b.cabinLightSwitch.position);

    const spot = new Toggle('spotlight', 'spotlight', 'Searchlight on/off', (s) => s.controls.spotlight);
    spot.root.position.fromArray(b.spotlightSwitch.position);
    const wipers = new Toggle('wipers', 'wipers', 'Windscreen wipers', (s) => s.controls.wipers);
    wipers.root.position.fromArray(b.wipersSwitch.position);
    const joy = new Joystick('spotJoystick', def.spotlight);
    joy.root.position.fromArray(b.spotJoystick.position);

    this.radio = new RadioSet(b.radio, def.layout.wheelhouse.roofY);
    this.root.add(this.radio.root);
    this.chart = new ChartPlotter(b.chart, def.layout.wheelhouse.roofY);
    this.root.add(this.chart.root);
    this.overhead = new OverheadPanel(def);
    this.root.add(this.overhead.root);
    this.controls.push(wheel, ...modules.controls, start, heat, key, horn, nav, anchor, cabin, spot, wipers, joy, this.radio.handset, ...this.overhead.controls);
    // Fire monitor (fire missions): the FIRE PUMP switch, its joystick (red knob) and the
    // monitor itself on the roof.
    const extraLabels: Label[] = [];
    const extraFixed: THREE.BufferGeometry[] = [];
    if (def.fireMonitor) {
      const m = def.fireMonitor;
      const pump = new Toggle('firePump', 'firePump', 'FIRE PUMP (needs the engine running)', (s) => s.controls.firePump);
      pump.root.position.fromArray(m.pumpSwitch);
      const monJoy = new Joystick('monJoystick', m, { pan: 'monPan', tilt: 'monTilt' }, 'Fire monitor joystick', 0xd8301a);
      monJoy.root.position.fromArray(m.joystick);
      this.controls.push(pump, monJoy);
      this.monitor = new MonitorView(m);
      this.root.add(this.monitor.root);
      extraLabels.push(['FIRE PUMP', m.pumpSwitch], ['MONITOR', m.joystick]);
    }
    // Fishing: the TRAWL switch (up: shoot the net; down: haul it).
    if (def.fishing) {
      const trawl = new Toggle('trawl', 'trawl', 'TRAWL: shoot / haul the net', (s) => s.controls.trawl);
      trawl.root.position.fromArray(def.fishing.trawlSwitch);
      this.controls.push(trawl);
      extraLabels.push(['TRAWL', def.fishing.trawlSwitch]);
      // By hand on the A-frame: PAY OUT / HAUL (hold-to-run) on a control box built onto
      // the starboard leg's inboard side at waist height, read from inboard facing the leg
      // (PAY OUT forward, HAUL aft).
      const af = aFrameOf(def);
      if (af) {
        const t = (af.buttonY - af.deck) / (af.top - af.deck);
        const legZ = af.footZ + (af.headZ - af.footZ) * t;
        const x0 = af.x - 0.06; // the leg's inboard face
        extraFixed.push(part(new THREE.BoxGeometry(0.32, 0.2, 0.4).translate(x0 - 0.16, af.buttonY - 0.1, legZ), 0xb8261a));
        extraFixed.push(part(new THREE.BoxGeometry(0.3, 0.012, 0.38).translate(x0 - 0.16, af.buttonY + 0.006, legZ), 0x3a4148));
        const bx = x0 - 0.21;
        const y = af.buttonY + 0.012;
        const out = new Button('netOut', 'netOut', 'Trawl net: PAY OUT (hold)', 'momentary', 0xe0a020);
        out.root.position.set(bx, y, legZ - 0.09);
        const haul = new Button('netIn', 'netIn', 'Trawl net: HAUL (hold)', 'momentary', 0x3a9a4a);
        haul.root.position.set(bx, y, legZ + 0.09);
        this.controls.push(out, haul);
        extraLabels.push(['PAY OUT', [bx, y, legZ - 0.09], false, -Math.PI / 2], ['HAUL', [bx, y, legZ + 0.09], false, -Math.PI / 2]);
      }
    }
    // The tow winch just forward of the transom (the line leads aft over the stern roller): a small drum (it turns while it runs)
    // between two cheeks, driven from a gearbox housing on its starboard end, with HEAVE IN /
    // PAY OUT (hold-to-run) on the housing's top. You stand forward of it facing aft: the
    // winch, the post and the tow beyond.
    const tw = def.towWinch;
    if (tw) {
      const plan = hullPlan(def);
      const dy = plan.deckY(tw.z);
      const r = tw.drumRadius;
      const hw = tw.drumWidth / 2;
      const axle = dy + 0.18 + r; // tow/tow.ts winchLeadLocal matches this
      const hs = tw.housing;
      const hx0 = hw + 0.095;
      const hx = hx0 + hs.width / 2;
      extraFixed.push(part(new THREE.BoxGeometry(tw.drumWidth + 0.2 + hs.width, 0.1, 0.5).translate(hs.width / 2, dy + 0.05, tw.z), 0x5a5f64)); // bed
      for (const s of [-1, 1]) extraFixed.push(part(new THREE.BoxGeometry(0.05, axle + 0.12 - dy, 0.34).translate(s * (hw + 0.07), (axle + 0.12 + dy) / 2, tw.z), 0x5a5f64));
      extraFixed.push(part(new THREE.BoxGeometry(hs.width, hs.height, 0.4).translate(hx, dy + hs.height / 2, tw.z), 0x5a5f64)); // gearbox housing
      extraFixed.push(part(new THREE.BoxGeometry(hs.width - 0.02, 0.012, 0.38).translate(hx, dy + hs.height + 0.006, tw.z), 0x3a4148)); // its control panel
      const drum = new THREE.Mesh(
        mergeParts([
          part(new THREE.CylinderGeometry(r, r, tw.drumWidth, 14).rotateZ(Math.PI / 2), 0x2a2a2a), // wire wound on it
          ...[-1, 1].map((s) => part(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.035, 14).rotateZ(Math.PI / 2).translate(s * hw, 0, 0), 0xb8261a)),
          part(new THREE.BoxGeometry(tw.drumWidth, 0.03, 0.03).translate(0, r, 0), 0xd8d8d0), // a stripe: you see it turn
        ]),
        flatVertexColorMaterial(),
      );
      drum.name = 'towWinchDrum';
      this.winchDrum.position.set(0, axle, tw.z);
      this.winchDrum.add(drum);
      this.root.add(this.winchDrum);
      // Facing aft, HEAVE IN is on your left (outboard), PAY OUT on your right.
      const top = dy + hs.height + 0.012;
      const heave = new Button('winchHeave', 'winchHeave', 'Tow winch: HEAVE IN (hold)', 'momentary', 0x3a9a4a);
      heave.root.position.set(hx + 0.095, top, tw.z + 0.06);
      const payOut = new Button('winchPayOut', 'winchPayOut', 'Tow winch: PAY OUT (hold)', 'momentary', 0xe0a020);
      payOut.root.position.set(hx - 0.095, top, tw.z + 0.06);
      this.controls.push(heave, payOut);
      // Read facing aft: the labels lie forward of the buttons, toward you.
      extraLabels.push(['HEAVE IN', [hx + 0.095, top, tw.z + 0.06], false, Math.PI], ['PAY OUT', [hx - 0.095, top, tw.z + 0.06], false, Math.PI]);
    }
    // The skiff crane's console button belongs to the crane (controls/TenderCraneView.ts);
    // its label goes with the others.
    if (def.tenderCrane) extraLabels.push(['SKIFF CRANE', b.craneButton]);
    const wh = def.layout.wheelhouse;
    this.door = new WheelhouseDoor(wh.doorWidth, wh.doorHeight);
    this.door.root.position.set(0, wh.floorY, wh.aft + 0.03);
    this.root.add(this.door.root);
    // Its push buttons, on the starboard door post inside and out (the panel slides to port).
    const db = def.layout.doorButtons;
    const inside = new DoorButton('doorIn');
    inside.root.position.set(db.x, wh.floorY + db.height, wh.aft - wh.wall);
    inside.root.rotation.x = -Math.PI / 2; // facing forward, into the wheelhouse
    const outside = new DoorButton('doorOut');
    outside.root.position.set(db.x, wh.floorY + db.height, wh.aft);
    outside.root.rotation.set(-Math.PI / 2, Math.PI, 0, 'YXZ'); // the same, turned to face aft
    this.controls.push(inside, outside);
    this.rainGlass = new RainGlass(def);
    this.root.add(this.rainGlass.root);
    // Mooring cleats on the bulwark tops, forward and aft each side (they replace the DOCK
    // button): port forward, starboard forward, port aft, starboard aft.
    {
      const plan = hullPlan(def);
      const mo = def.mooring;
      [mo.cleatFwdZ, mo.cleatFwdZ, mo.cleatAftZ, mo.cleatAftZ].forEach((z, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const cleat = new Cleat(i);
        cleat.root.position.set(side * (plan.halfBeam(z) - 0.03), plan.deckY(z) + def.layout.bulwarkHeight, z);
        this.controls.push(cleat);
      });
    }
    // Fenders: the basket on the aft deck, and the six fenders themselves.
    if (def.fenders) {
      const plan = hullPlan(def);
      const basket = new FenderBasket();
      const [fx, fz] = def.fenders.basket;
      basket.root.position.set(fx, plan.deckY(fz), fz);
      this.controls.push(basket);
      this.fenders = new FendersView(def.fenders.z, plan);
      this.root.add(this.fenders.mesh);
    }
    // The NAV / WIND display's housing (its screen is in the instrument mesh) and the
    // bracket up to the roof.
    {
      const n = b.navDisplay;
      const t = (n.tiltDeg * Math.PI) / 180;
      extraFixed.push(part(new THREE.BoxGeometry(n.width + 0.04, n.height + 0.04, 0.05).translate(0, 0, -0.03).rotateX(t).translate(n.position[0], n.position[1], n.position[2]), 0x1a1d1c));
      const roof = def.layout.wheelhouse.roofY;
      extraFixed.push(part(new THREE.BoxGeometry(0.04, roof - n.position[1], 0.04).translate(n.position[0], (roof + n.position[1]) / 2, n.position[2] - 0.06), 0x2a2d2c));
    }
    // Swim ladder over the starboard side: two stainless rails hooked over the bulwark top,
    // down past the waterline, with flat treads (see player/body.ts climbOut).
    if (def.swimLadder) {
      const lad = swimLadderOf({ plan: hullPlan(def), state: { defId: def.id } as VesselState })!;
      const steel = 0xc8ccd0;
      const len = lad.top - lad.bottom;
      for (const dz of [-lad.width / 2, lad.width / 2]) {
        extraFixed.push(part(new THREE.CylinderGeometry(0.016, 0.016, len, 6).translate(lad.x, lad.bottom + len / 2, lad.z + dz), steel));
        // The hook over the bulwark top, back to the deck side.
        extraFixed.push(part(new THREE.BoxGeometry(lad.x - lad.deckX - 0.45, 0.03, 0.03).translate((lad.x + lad.deckX + 0.45) / 2, lad.top + 0.02, lad.z + dz), steel));
      }
      for (let y = lad.bottom + 0.15; y < lad.top - 0.1; y += 0.3) {
        extraFixed.push(part(new THREE.BoxGeometry(0.08, 0.025, lad.width).translate(lad.x + 0.02, y, lad.z), 0x9aa0a6));
      }
    }
    // The engine, under the hatch in the wheelhouse floor (aft starboard): open the hatch to
    // see it, pull the dipstick on its inboard side, top up from the can on the shelf.
    const mt = def.maintenance;
    const eh = def.layout.engineHatch;
    if (mt && eh) {
      const fy = def.layout.wheelhouse.floorY;
      const box = (ax: number, bx: number, ay: number, by: number, az: number, bz: number, col: number) =>
        part(new THREE.BoxGeometry(bx - ax, by - ay, bz - az).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), col);
      const e = mt.engine;
      const top = fy - 0.12; // the rocker cover's top, just under the floor
      const x0 = e.x - e.width / 2;
      const x1 = e.x + e.width / 2;
      const z0 = e.z - e.length / 2;
      const z1 = e.z + e.length / 2;
      const base = top - e.height;
      const GREEN = 0x2f6b4a; // engine paint
      // Bearers, sump, block, head, rocker cover.
      for (const bx of [x0 + 0.04, x1 - 0.04]) extraFixed.push(box(bx - 0.03, bx + 0.03, fy - eh.pitDepth, base + 0.05, z0 - 0.08, z1 + 0.08, 0x3a3f44));
      extraFixed.push(box(x0 + 0.05, x1 - 0.05, base, base + 0.12, z0 + 0.04, z1 - 0.04, 0x2a2e32));
      extraFixed.push(box(x0, x1, base + 0.12, top - 0.16, z0, z1, GREEN));
      extraFixed.push(box(x0 + 0.03, x1 - 0.03, top - 0.16, top - 0.07, z0 + 0.02, z1 - 0.02, GREEN));
      extraFixed.push(box(x0 + 0.06, x1 - 0.06, top - 0.07, top, z0 + 0.06, z1 - 0.06, 0x3f8a5f)); // rocker cover
      // The air filter on the forward end of the cover, and the fuel filter on the inboard side.
      extraFixed.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14).translate(e.x, top - 0.035, z0 + 0.03), 0x2a2e32));
      extraFixed.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10).translate(x0 - 0.035, top - 0.22, z1 - 0.15), 0xd8d8d0));
      // Exhaust manifold along the outboard side, the riser going aft; the alternator and
      // belt on the forward end; the flywheel housing aft.
      extraFixed.push(box(x1, x1 + 0.06, top - 0.2, top - 0.12, z0 + 0.06, z1 - 0.06, 0x6a5a4a));
      extraFixed.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10).translate(x1 + 0.03, top - 0.32, z1 + 0.02), 0x6a5a4a));
      extraFixed.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12).rotateZ(Math.PI / 2).translate(x0 + 0.05, top - 0.24, z0 - 0.05), 0xb0b4b8));
      extraFixed.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14).rotateX(Math.PI / 2).translate(e.x, base + 0.24, z0 - 0.015), 0x2a2e32));
      extraFixed.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16).rotateX(Math.PI / 2).translate(e.x, base + 0.22, z1 + 0.04), 0x2a2e32));
      // The oil filler cap on the rocker cover (yellow, like the dipstick ring).
      extraFixed.push(part(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12).translate(mt.filler[0], top + 0.015, mt.filler[1]), 0xe8c020));
      // The oil can's shelf on the engine space's outboard wall.
      const shelfY = fy - mt.shelfDrop;
      extraFixed.push(box(mt.oilCan[0] - 0.09, eh.x1, shelfY - 0.02, shelfY, mt.oilCan[1] - 0.1, mt.oilCan[1] + 0.1, 0x8a9096));
      const dip = new Dipstick();
      dip.root.position.set(mt.dipstick[0], top - 0.2, mt.dipstick[1]); // its ring well under the shut hatch
      const can = new OilCan();
      can.root.position.set(mt.oilCan[0], shelfY, mt.oilCan[1]);
      can.root.rotation.y = Math.PI / 2; // spout inboard, toward the filler
      can.root.scale.setScalar(0.85);
      this.dipstick = dip;
      this.oilCan = can;
      const hatch = new EngineHatch(eh.x1 - eh.x0, eh.z1 - eh.z0);
      hatch.root.position.set(eh.x1, fy, (eh.z0 + eh.z1) / 2);
      this.engineHatch = hatch;
      this.controls.push(hatch, dip, can);
      extraLabels.push(['ENGINE', [eh.x0 + 0.2, fy + 0.002, eh.z1 - 0.1], false, -Math.PI / 2]);
    }
    // 12 V: battery master on the aft wall by the door, voltmeter panel by the helm.
    const el = def.electrics;
    if (el) {
      const master = new MasterSwitch();
      master.root.position.fromArray(el.masterSwitch.position);
      master.root.rotation.y = Math.PI; // face forward, into the wheelhouse
      const selector = new SelectorSwitch();
      selector.root.position.fromArray(el.selectorSwitch.position);
      selector.root.rotation.y = Math.PI;
      this.controls.push(master, selector);
      this.electrics = new ElectricsPanel(el.panel);
      this.root.add(this.electrics.root);
      this.controls.push(...this.electrics.controls);
    }
    for (const c of this.controls) if (!c.root.parent) this.root.add(c.root);

    // Instrument dash: a box across the front of the console with the displays on its face.
    const d = b.dash;
    const dash = part(
      new THREE.BoxGeometry(d.halfWidth * 2, d.top - d.bottom, d.aft - d.front).translate(0, (d.top + d.bottom) / 2, (d.front + d.aft) / 2),
      0x30363b,
    );
    // Throttle pedestal: from the console's aft face back to under the lever, floor to console top.
    const ped = b.lever.pedestal;
    const lp = b.lever.position;
    const floorY = def.layout.wheelhouse.floorY;
    const pedFront = lp[2] - 0.25; // overlaps into the console body
    const pedestalAt = (x: number) =>
      part(
        new THREE.BoxGeometry(ped.halfWidth * 2, lp[1] - 0.01 - floorY, ped.aft - pedFront).translate(x, (lp[1] - 0.01 + floorY) / 2, (ped.aft + pedFront) / 2),
        0x3c4248,
      );
    // The throttle's pedestal, and its mirror image to port for the searchlight joystick.
    const pedestal = pedestalAt(lp[0]);
    const spotPedestal = pedestalAt(b.spotJoystick.position[0]);
    if (def.fireMonitor) extraFixed.push(pedestalAt(def.fireMonitor.joystick[0]));
    this.instruments = new InstrumentPanel(b);
    this.dashAnchor.position.set(0, (d.top + d.bottom) / 2, d.aft);
    // Group plates under the switch row (see consoleGroups), a coloured strip along the
    // forward edge of each, its title on the strip.
    // On the flat panel behind the console's raised front (vessel/view/hullMesh.ts).
    const wh2 = def.layout.wheelhouse;
    const top = floorY + wh2.consoleHeight + 0.005;
    const plateFront = wh2.front + wh2.wall + wh2.consoleDepth * 0.45 + 0.005;
    const plateAft = wh2.front + wh2.wall + wh2.consoleDepth - 0.05;
    for (const g of b.consoleGroups) {
      const [x0, x1] = g.x;
      extraFixed.push(part(new THREE.BoxGeometry(x1 - x0, 0.004, plateAft - plateFront).translate((x0 + x1) / 2, top + 0.002, (plateFront + plateAft) / 2), 0x3b434a));
      extraFixed.push(part(new THREE.BoxGeometry(x1 - x0, 0.005, 0.028).translate((x0 + x1) / 2, top + 0.0025, plateFront + 0.014), g.color));
      extraLabels.push([g.title, [(x0 + x1) / 2, top + 0.004, plateFront + 0.014 - LABEL_OFFSET], true]);
    }
    this.root.add(bakeFixedParts(this.root, [dash, pedestal, spotPedestal, this.overhead.body, ...extraFixed, ...modules.staticParts]), this.instruments.mesh, buildLabels(b, extraLabels), this.dashAnchor);
  }

  /** The mounted modules, as "socket: module id" (debug overlay). */
  get moduleList(): string[] {
    return this.modules.modules.map((m) => `${m.path}: ${m.id}`);
  }

  /**
   * Visuals from authoritative state (controls skip this while locally held).
   * @param displaysInView false when nobody can see the dash: the instrument canvas then
   *                       skips its redraw and texture upload (the costly part on Quest).
   */
  update(state: VesselState, dt: number, displaysInView = true, env: EnvironmentState | null = null): void {
    for (const c of this.controls) {
      c.sync(state);
      c.tick(dt);
    }
    this.modules.update(state, dt);
    if (displaysInView) this.instruments.update(state, this.def, dt, env);
    this.door.sync(state);
    // Under the floor, the dipstick and the oil can are only within reach with the hatch open.
    const hatchOpen = (state.controls.engineHatch ?? 0) > 0.5;
    if (this.dipstick) this.dipstick.enabled = hatchOpen;
    if (this.oilCan) this.oilCan.enabled = hatchOpen;
    this.overhead.update(state);
    this.electrics?.update(state, dt);
    this.lamps.update(state, this.def);
    this.fenders?.update(state);
    // The winch drum turns only while it really runs (hydraulic pressure, and line or net
    // actually coming in or going out): App sets `drumTurn` each frame (+1 in, -1 out, 0 still).
    if (this.drumTurn) this.winchDrum.rotation.x += this.drumTurn * 2.5 * dt;
    this.monitor?.update(state);
  }
}

/**
 * Bake every control part marked `fixed` (bases, housings, plates) plus `extra` parts into
 * one vertex-coloured mesh: one draw call instead of one per part. The original meshes are
 * hidden but kept, so the pointer ray (which ignores visibility) still hits them.
 */
function bakeFixedParts(root: THREE.Object3D, extra: THREE.BufferGeometry[]): THREE.Mesh {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const parts = [...extra];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.userData.fixed) return;
    const geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld.clone().premultiply(toRoot));
    parts.push(part(geo, (o.material as THREE.MeshLambertMaterial).color.getHex()));
    o.visible = false;
  });
  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'bridgeFixed';
  return mesh;
}

/**
 * A label: its text, the control it names (it lies just aft of it), dark-on-light (a group
 * title), and its yaw (rad; default 0: read facing forward. It is turned, and moved round
 * the control, to be read facing another way - PI: facing aft).
 */
type Label = [string, [number, number, number], boolean?, number?];
/** How far aft of its control a label lies (m). */
const LABEL_OFFSET = 0.085;

/** Small engraved labels on the console top in front of each control (one draw call). */
function buildLabels(b: WorkboatDef['bridge'], extra: Label[] = []): THREE.Mesh {
  const labels: Label[] = [
    ['AHEAD ▲  ▼ ASTERN', b.lever.position],
    ['START', b.startButton.position],
    ['HEAT', b.heatButton.position],
    ['KEY', b.keySwitch.position],
    ['HORN', b.hornButton.position],
    ['NAV LIGHTS', b.navLightsSwitch.position],
    ['ANCHOR', b.anchorSwitch.position],
    ['CABIN', b.cabinLightSwitch.position],
    ['SPOT', b.spotlightSwitch.position],
    ['WIPERS', b.wipersSwitch.position],
    ['SEARCHLIGHT', b.spotJoystick.position],
    ...extra,
  ];
  const slotW = 512;
  const slotH = 64;
  const canvas = document.createElement('canvas');
  canvas.width = slotW;
  canvas.height = slotH * labels.length;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e8e2cc';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  labels.forEach(([text, , title], i) => {
    g.fillStyle = title ? '#101418' : '#e8e2cc';
    g.fillText(text, slotW / 2, slotH * i + slotH / 2);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const planes = labels.map(([, pos, , yaw = 0], i) => {
    const plane = new THREE.PlaneGeometry(0.16, 0.02);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) {
      const v0 = 1 - (i + 1) / labels.length;
      uv.setXY(k, uv.getX(k), v0 + uv.getY(k) / labels.length);
    }
    plane.rotateX(-Math.PI / 2).rotateY(yaw);
    plane.translate(pos[0] + Math.sin(yaw) * LABEL_OFFSET, pos[1] + 0.002, pos[2] + Math.cos(yaw) * LABEL_OFFSET);
    return plane;
  });
  const mesh = new THREE.Mesh(mergeGeometries(planes), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.name = 'bridgeLabels';
  return mesh;
}
