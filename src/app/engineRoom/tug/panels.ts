/**
 * The faces of the tug's engine room: what's drawn on its screens, gauges and signs. Two
 * canvases, so the room's panels are two draw calls however many there are:
 *
 *   live    redrawn a few times a second from her state: the engine control room's three
 *           screens (the engines' mimic with each Z-drive's heading, power and tanks, the alarm
 *           list), its row of brass-rimmed gauges, and each engine's local operating panel;
 *   fixed   drawn once: the main switchboard's face, the tool board, the safety signs.
 *
 * Each panel is a rectangle on one of them (`Region`, in pixels); room.ts puts a quad for it
 * where it goes, with its corners' texture coordinates on that rectangle.
 */
import { CONFIG } from '../../../config';
import { busLive, startupSteps } from '../../../plant/plant';
import type { VesselState, EngineState } from '../../../vessel/vesselState';
import { fuelTankL } from '../../../vessel/fuelTank';

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The live canvas's panels. */
export const LIVE = {
  size: [1024, 1024] as const,
  mimic: { x: 0, y: 0, w: 512, h: 320 },
  power: { x: 512, y: 0, w: 512, h: 320 },
  alarms: { x: 0, y: 320, w: 512, h: 320 },
  board: { x: 512, y: 320, w: 512, h: 160 },
  lopPort: { x: 0, y: 640, w: 384, h: 256 },
  lopStbd: { x: 384, y: 640, w: 384, h: 256 },
};

/** The fixed canvas's panels. */
export const FIXED = {
  size: [1024, 1536] as const,
  msb: { x: 0, y: 0, w: 1024, h: 384 },
  tools: { x: 0, y: 384, w: 512, h: 256 },
  signEars: { x: 512, y: 384, w: 512, h: 128 },
  signRotating: { x: 512, y: 512, w: 512, h: 128 },
  signEcr: { x: 0, y: 640, w: 512, h: 128 },
  signThruster: { x: 512, y: 640, w: 512, h: 128 },
  signFire: { x: 0, y: 768, w: 512, h: 128 },
  signStop: { x: 512, y: 768, w: 512, h: 128 },
  /** The start-up checklist card on the control room's inboard wall (portrait, about A3). */
  card: { x: 0, y: 896, w: 480, h: 640 },
};

const SCREEN_BG = '#0c1a22';
const SCREEN_LINE = '#2f5466';
const GREEN = '#58d26b';
const AMBER = '#f0b030';
const RED = '#e5483c';
const TEXT = '#d8e4ea';
const BRASS = '#b88a3a';

/** The port and starboard engines' states (a twin worked separately has the starboard's own). */
function engines(v: VesselState): [EngineState, EngineState] {
  return [v.engine, v.engine.stbd ?? v.engine];
}

const deg = (rad: number | undefined) => ((((rad ?? 0) * 180) / Math.PI) % 360 + 360) % 360;

/** Her alarms as the monitoring system would list them, from her state. */
export function alarms(v: VesselState): { text: string; level: 'alarm' | 'warn' }[] {
  const out: { text: string; level: 'alarm' | 'warn' }[] = [];
  // Her start-up (plant/plant.ts): what's still shut, stopped or low.
  const p = v.plant;
  if (p) {
    if (!busLive(p)) out.push({ text: p.gen === 'starting' ? 'GENERATOR RUNNING UP' : p.gen === 'running' ? 'NO MAIN POWER - GENERATOR BREAKER OPEN' : 'DEAD SHIP - GENERATOR STOPPED', level: p.gen === 'starting' ? 'warn' : 'alarm' });
    if (!p.fuelPump) out.push({ text: 'FUEL SUPPLY PUMP STOPPED', level: 'warn' });
    if (!p.airValve) out.push({ text: 'START AIR MAIN VALVE SHUT', level: 'warn' });
    if (p.airBar < CONFIG.plant.airStartMinBar) out.push({ text: `START AIR PRESSURE LOW  ${p.airBar.toFixed(0)} bar`, level: 'alarm' });
    if (p.place !== 2) out.push({ text: p.place === 0 ? 'ENGINE CONTROL AT LOCAL' : 'ENGINE CONTROL AT CONTROL ROOM', level: 'warn' });
  }
  engines(v).forEach((e, i) => {
    const n = i === 0 ? 'PORT ME' : 'STBD ME';
    if (p && !p.dayValve[i]) out.push({ text: `${n} DAY TANK VALVE SHUT`, level: 'warn' });
    if (p && !p.sea[i]) out.push({ text: `${n} SEA SUCTION SHUT`, level: 'warn' });
    if (p && e.phase === 'off' && p.lubeBar[i] < CONFIG.plant.lubeStartBar) out.push({ text: `${n} LUB OIL PRESSURE LOW  ${p.lubeBar[i].toFixed(1)} bar`, level: 'alarm' });
    if (e.coolantC > 95) out.push({ text: `${n} JACKET WATER TEMP HIGH  ${Math.round(e.coolantC)} °C`, level: 'alarm' });
    if (e.oilC > 115) out.push({ text: `${n} LUB OIL TEMP HIGH  ${Math.round(e.oilC)} °C`, level: 'alarm' });
    if ((e.oil ?? 1) < 0.35) out.push({ text: `${n} LUB OIL LEVEL LOW`, level: 'warn' });
    if (e.coolingFault) out.push({ text: `${n} SEA WATER PUMP FAULT`, level: 'alarm' });
    if (!p && e.key > 0 && e.phase === 'off') out.push({ text: `${n} LUB OIL PRESSURE LOW (STOPPED)`, level: 'warn' });
  });
  const tank = fuelTankL(v);
  if (tank && v.engine.fuelL / tank < 0.15) out.push({ text: 'FUEL DAY TANK LEVEL LOW', level: 'warn' });
  return out;
}

export class TugPanels {
  readonly live = document.createElement('canvas');
  readonly fixed = document.createElement('canvas');

  constructor(private readonly name: string) {
    [this.live.width, this.live.height] = LIVE.size;
    [this.fixed.width, this.fixed.height] = FIXED.size;
    this.drawFixed();
  }

  /** The live panels from her state (`time`: world seconds, for the clock and a blinking alarm). */
  drawLive(v: VesselState, time: number): void {
    const g = this.live.getContext('2d');
    if (!g) return;
    const [pe, se] = engines(v);
    // ── Screen 1: the engines' mimic ──
    this.screen(g, LIVE.mimic, 'MAIN ENGINES & PROPULSION', time);
    [pe, se].forEach((e, i) => {
      const x0 = LIVE.mimic.x + 16 + i * 248;
      const y0 = LIVE.mimic.y + 48;
      const run = e.phase === 'running';
      g.strokeStyle = run ? GREEN : e.phase === 'cranking' ? AMBER : SCREEN_LINE;
      g.lineWidth = 3;
      g.strokeRect(x0, y0, 120, 70);
      g.fillStyle = TEXT;
      g.font = 'bold 16px sans-serif';
      g.fillText(i === 0 ? 'PORT ME' : 'STBD ME', x0 + 8, y0 + 22);
      g.font = 'bold 26px monospace';
      g.fillStyle = run ? GREEN : TEXT;
      g.fillText(`${Math.round(e.rpm)}`, x0 + 8, y0 + 56);
      g.font = '12px sans-serif';
      g.fillText('RPM', x0 + 86, y0 + 56);
      // Load (the governor's rack) as a bar.
      g.strokeStyle = SCREEN_LINE;
      g.strokeRect(x0, y0 + 80, 120, 14);
      g.fillStyle = e.rack > 0.85 ? AMBER : GREEN;
      g.fillRect(x0 + 1, y0 + 81, 118 * Math.min(1, e.rack), 12);
      g.fillStyle = TEXT;
      g.fillText(`LOAD ${Math.round(e.rack * 100)} %`, x0, y0 + 110);
      g.fillText(`JW ${Math.round(e.coolantC)} °C   LO ${Math.round(e.oilC)} °C`, x0, y0 + 128);
      g.fillText(`CLUTCH ${e.gear === 0 ? 'OUT' : 'IN'}`, x0, y0 + 146);
      // The Z-drive: a circle with its thrust direction.
      const cx = x0 + 186;
      const cy = y0 + 80;
      g.strokeStyle = SCREEN_LINE;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, 44, 0, Math.PI * 2);
      g.stroke();
      const a = e.azimuth ?? 0;
      g.strokeStyle = run && e.gear !== 0 ? GREEN : TEXT;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.sin(a) * 38, cy - Math.cos(a) * 38);
      g.stroke();
      g.font = '12px sans-serif';
      g.fillStyle = TEXT;
      g.fillText(`Z-DRIVE ${Math.round(deg(e.azimuth))}°`, cx - 44, cy + 64);
    });
    // ── Screen 2: her start-up until she's handed to the bridge, then power and tanks ──
    const steps = startupSteps(v);
    if (steps.length && steps.some((s) => !s.done)) this.startupPage(g, steps, time);
    else this.powerPage(g, v, pe, se, time);
    this.alarmPage(g, v, time);
    this.boardAndLops(g, pe, se);
  }

  /**
   * The START-UP page (owner, 27 Oct 2026; plant/plant.ts): her steps from dead ship to the
   * bridge, each ticked from her state, the next one marked (blinking), with how it stands.
   */
  private startupPage(g: CanvasRenderingContext2D, steps: ReturnType<typeof startupSteps>, time: number): void {
    const R = LIVE.power;
    this.screen(g, R, 'START-UP FROM DEAD SHIP', time);
    const next = steps.findIndex((s) => !s.done);
    const blink = Math.floor(time * 2) % 2 === 0;
    steps.forEach((st, i) => {
      const y = R.y + 56 + i * 27;
      const here = i === next;
      if (here) {
        g.fillStyle = blink ? '#1f3f4e' : '#183340';
        g.fillRect(R.x + 8, y - 17, R.w - 16, 25);
      }
      g.font = 'bold 15px monospace';
      g.fillStyle = st.done ? GREEN : here ? AMBER : '#6d8693';
      g.fillText(st.done ? '✓' : here ? '▶' : String(i + 1), R.x + 16, y);
      g.font = '14px sans-serif';
      g.fillStyle = st.done ? '#9fb7c2' : here ? TEXT : '#7f97a3';
      g.fillText(st.what, R.x + 40, y);
      g.textAlign = 'right';
      g.font = '12px sans-serif';
      g.fillStyle = here ? AMBER : '#5d7a88';
      g.fillText(here && st.note ? st.note : st.done ? '' : st.where, R.x + R.w - 14, y);
      g.textAlign = 'left';
    });
  }

  /** The POWER & TANKS page (screen 2 once she's started and handed over). */
  private powerPage(g: CanvasRenderingContext2D, v: VesselState, pe: EngineState, se: EngineState, time: number): void {
    this.screen(g, LIVE.power, 'POWER & TANKS', time);
    const tank = fuelTankL(v);
    const fuel = tank ? v.engine.fuelL / tank : 0;
    this.tankBar(g, LIVE.power.x + 24, LIVE.power.y + 56, 'FUEL DAY TANK', fuel, `${Math.round(v.engine.fuelL)} L`, fuel < 0.15);
    const flow = pe.fuelFlowLph + (se !== pe ? se.fuelFlowLph : 0);
    g.fillStyle = TEXT;
    g.font = '14px sans-serif';
    g.fillText(`FUEL FLOW  ${flow.toFixed(0)} L/h`, LIVE.power.x + 24, LIVE.power.y + 140);
    const soc = v.electrics?.soc ?? [0, 0];
    soc.slice(0, 2).forEach((s, i) => this.tankBar(g, LIVE.power.x + 270, LIVE.power.y + 56 + i * 64, i === 0 ? 'START BATTERY' : 'HOUSE BATTERY', s, `${(23 + 2.6 * s).toFixed(1)} V`, s < 0.3));
    g.fillStyle = TEXT;
    g.fillText(`DC MAIN SWITCH  ${v.electrics?.master ? 'ON' : 'OFF'}`, LIVE.power.x + 270, LIVE.power.y + 200);
  }

  private alarmPage(g: CanvasRenderingContext2D, v: VesselState, time: number): void {
    // ── Screen 3: alarms ──
    this.screen(g, LIVE.alarms, 'ALARM MONITORING', time);
    const list = alarms(v);
    g.font = '15px monospace';
    if (!list.length) {
      g.fillStyle = GREEN;
      g.fillText('NO ACTIVE ALARMS', LIVE.alarms.x + 20, LIVE.alarms.y + 70);
    }
    list.slice(0, 9).forEach((al, i) => {
      const on = al.level === 'warn' || Math.floor(time * 2) % 2 === 0;
      g.fillStyle = al.level === 'alarm' ? (on ? RED : '#7a2620') : AMBER;
      g.fillText(`${al.level === 'alarm' ? 'ALARM' : 'WARN '}  ${al.text}`, LIVE.alarms.x + 16, LIVE.alarms.y + 70 + i * 24);
    });
  }

  private boardAndLops(g: CanvasRenderingContext2D, pe: EngineState, se: EngineState): void {
    // ── The brass gauge board ──
    const B = LIVE.board;
    g.fillStyle = '#2b2118';
    g.fillRect(B.x, B.y, B.w, B.h);
    const dials: [string, number, number, number][] = [
      ['PORT RPM', pe.rpm, 2000, 1700],
      ['STBD RPM', se.rpm, 2000, 1700],
      ['PORT JW °C', pe.coolantC, 120, 95],
      ['STBD JW °C', se.coolantC, 120, 95],
    ];
    dials.forEach(([label, val, hi, red], i) => this.dial(g, B.x + 64 + i * 128, B.y + 70, 52, label, val, hi, red, true));
    // ── Each engine's local panel ──
    [[LIVE.lopPort, pe, 'PORT MAIN ENGINE'], [LIVE.lopStbd, se, 'STBD MAIN ENGINE']].forEach(([r, e, label]) => {
      const R = r as Region;
      const E = e as EngineState;
      g.fillStyle = '#20262a';
      g.fillRect(R.x, R.y, R.w, R.h);
      g.fillStyle = TEXT;
      g.font = 'bold 18px sans-serif';
      g.fillText(label as string, R.x + 14, R.y + 26);
      this.dial(g, R.x + 70, R.y + 120, 52, 'RPM', E.rpm, 2000, 1700, false);
      this.dial(g, R.x + 192, R.y + 120, 52, 'JW °C', E.coolantC, 120, 95, false);
      this.dial(g, R.x + 314, R.y + 120, 52, 'LO °C', E.oilC, 140, 115, false);
      // Its lamps: running, and alarm.
      const lamp = (x: number, on: boolean, colour: string, text: string) => {
        g.fillStyle = on ? colour : '#3a3f42';
        g.beginPath();
        g.arc(x, R.y + 222, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = TEXT;
        g.font = '13px sans-serif';
        g.fillText(text, x + 16, R.y + 227);
      };
      lamp(R.x + 30, E.phase === 'running', GREEN, 'RUN');
      lamp(R.x + 130, E.coolantC > 95 || E.oilC > 115 || !!E.coolingFault, RED, 'ALARM');
      lamp(R.x + 250, E.gear !== 0, AMBER, 'CLUTCH IN');
    });
  }

  private screen(g: CanvasRenderingContext2D, r: Region, title: string, time: number): void {
    g.fillStyle = SCREEN_BG;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#16303c';
    g.fillRect(r.x, r.y, r.w, 32);
    g.fillStyle = TEXT;
    g.font = 'bold 16px sans-serif';
    g.fillText(title, r.x + 12, r.y + 22);
    const t = Math.floor(time);
    const clock = `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    g.font = '14px monospace';
    g.fillText(clock, r.x + r.w - 84, r.y + 22);
    g.fillStyle = '#5d7a88';
    g.font = '11px sans-serif';
    g.fillText(this.name, r.x + 12, r.y + r.h - 10);
  }

  private tankBar(g: CanvasRenderingContext2D, x: number, y: number, label: string, f: number, value: string, low: boolean): void {
    g.fillStyle = TEXT;
    g.font = '13px sans-serif';
    g.fillText(label, x, y);
    g.strokeStyle = SCREEN_LINE;
    g.lineWidth = 2;
    g.strokeRect(x, y + 8, 200, 22);
    g.fillStyle = low ? RED : '#3c9bd0';
    g.fillRect(x + 2, y + 10, 196 * Math.max(0, Math.min(1, f)), 18);
    g.fillStyle = TEXT;
    g.fillText(`${Math.round(f * 100)} %   ${value}`, x, y + 48);
  }

  /** A round gauge: its face, a red arc from `red` up, its needle; brass-rimmed or black. */
  private dial(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, value: number, hi: number, red: number, brass: boolean): void {
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const at = (v: number) => a0 + sweep * Math.min(1, Math.max(0, v / hi));
    g.fillStyle = brass ? BRASS : '#111';
    g.beginPath();
    g.arc(cx, cy, r + 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = brass ? '#efe6cf' : '#f2efe6';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c0392b';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, r - 7, at(red), a0 + sweep);
    g.stroke();
    g.strokeStyle = '#222';
    g.lineWidth = 2;
    for (let k = 0; k <= 10; k++) {
      const a = a0 + (sweep * k) / 10;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      g.lineTo(cx + Math.cos(a) * (r - (k % 5 ? 9 : 14)), cy + Math.sin(a) * (r - (k % 5 ? 9 : 14)));
      g.stroke();
    }
    const a = at(value);
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    g.stroke();
    g.fillStyle = brass ? BRASS : '#555';
    g.beginPath();
    g.arc(cx, cy, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.font = '10px sans-serif';
    g.textAlign = 'center';
    g.fillText(label, cx, cy + r * 0.45);
    g.fillText(String(Math.round(value)), cx, cy + r * 0.7);
    g.textAlign = 'left';
  }

  private drawFixed(): void {
    const g = this.fixed.getContext('2d');
    if (!g) return;
    // ── The main switchboard's face: cubicles, meters, breakers, labels ──
    const M = FIXED.msb;
    g.fillStyle = '#a9b0ae';
    g.fillRect(M.x, M.y, M.w, M.h);
    const cubicles = ['GEN 1', 'GEN 2', 'BUS TIE', 'SHORE', '400 V DIST', '230 V DIST', '24 V DC'];
    const cw = M.w / cubicles.length;
    cubicles.forEach((name, i) => {
      const x = M.x + i * cw;
      g.strokeStyle = '#6f7674';
      g.lineWidth = 3;
      g.strokeRect(x + 3, M.y + 3, cw - 6, M.h - 6);
      g.fillStyle = '#222';
      g.fillRect(x + 12, M.y + 12, cw - 24, 26);
      g.fillStyle = '#f2efe6';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      g.fillText(name, x + cw / 2, M.y + 31);
      // Two square meters, a selector and a breaker handle.
      for (let k = 0; k < 2; k++) {
        g.fillStyle = '#f2efe6';
        g.fillRect(x + 14 + k * ((cw - 28) / 2 + 2), M.y + 56, (cw - 32) / 2, 54);
        g.strokeStyle = '#111';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x + 14 + k * ((cw - 28) / 2 + 2) + (cw - 32) / 4, M.y + 104);
        g.lineTo(x + 18 + k * ((cw - 28) / 2 + 2) + (cw - 32) / 4 + 10 * (k ? -1 : 1), M.y + 70);
        g.stroke();
      }
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(x + cw / 2, M.y + 150, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a3f42';
      g.fillRect(x + cw / 2 - 26, M.y + 200, 52, 90);
      g.fillStyle = i < 2 ? '#b52a20' : '#26292b';
      g.fillRect(x + cw / 2 - 10, M.y + 220, 20, 40);
      g.fillStyle = i < 3 ? '#58d26b' : '#3a3f42';
      g.beginPath();
      g.arc(x + cw / 2, M.y + 320, 8, 0, Math.PI * 2);
      g.fill();
    });
    g.textAlign = 'left';
    // ── The tool board: pegboard and spanners ──
    const T = FIXED.tools;
    g.fillStyle = '#c9b48a';
    g.fillRect(T.x, T.y, T.w, T.h);
    g.fillStyle = '#9c8762';
    for (let y = T.y + 12; y < T.y + T.h; y += 18) for (let x = T.x + 12; x < T.x + T.w; x += 18) g.fillRect(x, y, 3, 3);
    g.fillStyle = '#5a6066';
    for (let i = 0; i < 8; i++) {
      const x = T.x + 30 + i * 30;
      const len = 80 + i * 12;
      g.fillRect(x, T.y + 30, 8, len);
      g.beginPath();
      g.arc(x + 4, T.y + 30, 11, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#b52a20' : '#e2b21c';
      g.fillRect(T.x + 290 + i * 52, T.y + 40, 14, 70);
      g.fillStyle = '#5a6066';
      g.fillRect(T.x + 293 + i * 52, T.y + 110, 8, 70);
    }
    // ── Signs ──
    const sign = (r: Region, bg: string, fg: string, text: string, sub?: string) => {
      g.fillStyle = bg;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = fg;
      g.lineWidth = 6;
      g.strokeRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
      g.fillStyle = fg;
      g.font = `bold ${sub ? 30 : 38}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(text, r.x + r.w / 2, r.y + (sub ? 56 : 78));
      if (sub) {
        g.font = 'bold 24px sans-serif';
        g.fillText(sub, r.x + r.w / 2, r.y + 96);
      }
      g.textAlign = 'left';
    };
    sign(FIXED.signEars, '#1d5fa8', '#ffffff', 'EAR DEFENDERS', 'MUST BE WORN');
    sign(FIXED.signRotating, '#f0c419', '#111111', 'DANGER', 'ROTATING MACHINERY');
    sign(FIXED.signEcr, '#1f6b3a', '#ffffff', 'ENGINE CONTROL ROOM');
    sign(FIXED.signThruster, '#f0c419', '#111111', 'THRUSTER ROOM', 'KEEP DOOR CLOSED');
    sign(FIXED.signFire, '#b52a20', '#ffffff', 'FIRE PUMP', 'FIFI 1');
    sign(FIXED.signStop, '#b52a20', '#ffffff', 'EMERGENCY STOP', 'MAIN ENGINES');
    this.drawCard(g);
  }

  /**
   * The start-up checklist card on the wall by the control room's door (owner, 27 Oct 2026): a
   * laminated card, the steps of plant/plant.ts in order, where each control is.
   */
  private drawCard(g: CanvasRenderingContext2D): void {
    const C = FIXED.card;
    g.fillStyle = '#f4f1e6';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.fillStyle = '#1d5fa8';
    g.fillRect(C.x, C.y, C.w, 74);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.font = 'bold 30px sans-serif';
    g.fillText('START-UP', C.x + C.w / 2, C.y + 34);
    g.font = 'bold 19px sans-serif';
    g.fillText('FROM DEAD SHIP', C.x + C.w / 2, C.y + 62);
    g.textAlign = 'left';
    const steps: [string, string][] = [
      ['Battery master ON', 'switchboard, in the control room'],
      ['Generator: fuel valve OPEN, START', 'port generator, aft; wait to 400 V'],
      ['Generator breaker CLOSE', 'switchboard: the lights come up'],
      ['Day tank valves OPEN, fuel pump ON', 'fuel tanks fwd stbd; switchboard'],
      ['Sea suction valves OPEN', 'strainers, port side'],
      ['Pre-lube pumps ON', 'each engine\'s stand; wait for 1 bar'],
      ['Compressor ON, air valve OPEN', 'fwd stbd; the air bottle; 12 bar+'],
      ['START each engine', 'its stand'],
      ['ENGINE CONTROL to BRIDGE', 'switchboard'],
    ];
    steps.forEach(([what, where], i) => {
      const y = C.y + 116 + i * 54;
      g.fillStyle = '#1d5fa8';
      g.beginPath();
      g.arc(C.x + 34, y - 7, 15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 17px sans-serif';
      g.textAlign = 'center';
      g.fillText(String(i + 1), C.x + 34, y - 1);
      g.textAlign = 'left';
      g.fillStyle = '#151a1d';
      g.font = 'bold 19px sans-serif';
      g.fillText(what, C.x + 60, y - 6);
      g.fillStyle = '#56616b';
      g.font = '15px sans-serif';
      g.fillText(where, C.x + 60, y + 14);
    });
    g.fillStyle = '#b52a20';
    g.font = 'bold 15px sans-serif';
    g.fillText('Alarms list what\'s missing: ALARM screen.', C.x + 24, C.y + C.h - 24);
    g.strokeStyle = '#c9c4b2';
    g.lineWidth = 4;
    g.strokeRect(C.x + 2, C.y + 2, C.w - 4, C.h - 4);
  }
}
