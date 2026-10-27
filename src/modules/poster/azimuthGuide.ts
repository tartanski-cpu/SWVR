/**
 * The harbour tug's driving guide, painted as a poster (owner, Oct 2026: "add the driving guide
 * as a poster somewhere inside the wheelhouse of the tug"): the same content as the guide page
 * (the levers, how one works, the six moves in plan view, bow up), drawn on a 2D canvas.
 * Port red, starboard green, the way she goes in amber. Numbers are the game's own (half power,
 * measured in the simulation; see docs/progress/modules.md, the azimuth drives' entry).
 */

const INK = '#18222c';
const MUTED = '#5b6874';
const PAPER = '#f3f5f7';
const HULL = '#dbe3ea';
const EDGE = '#6f7f8c';
const PORT = '#c8352a';
const STBD = '#1f8a4c';
const MOVE = '#d08000';
const RAD = Math.PI / 180;

/** Her plan (m): the drives 2.94 m either side, about 9.7 m aft of amidships. */
const HALF_L = 12.5;
const HALF_B = 5.25;
const DX = 2.94;
const DZ = 9.7;

type G = CanvasRenderingContext2D;

function arrow(g: G, x1: number, y1: number, x2: number, y2: number, colour: string, w: number, head: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L;
  const uy = dy / L;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  g.strokeStyle = colour;
  g.fillStyle = colour;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(bx, by);
  g.stroke();
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(bx - uy * head * 0.55, by + ux * head * 0.55);
  g.lineTo(bx + uy * head * 0.55, by - ux * head * 0.55);
  g.fill();
}

/** A curved arrow round (cx, cy): dir +1 clockwise (bow to starboard), -1 anticlockwise. */
function turnArrow(g: G, cx: number, cy: number, r: number, dir: number, sweepDeg: number, colour: string, w: number): void {
  const a0 = (-90 - (dir * sweepDeg) / 2) * RAD;
  const a1 = (-90 + (dir * sweepDeg) / 2) * RAD;
  g.strokeStyle = colour;
  g.lineWidth = w;
  g.beginPath();
  g.arc(cx, cy, r, a0, a1 - dir * 0.12, dir < 0);
  g.stroke();
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(a1 - dir * 0.12);
  const [x2, y2] = p(a1 + dir * 0.04);
  arrow(g, x1, y1, x2, y2, colour, w, w * 3.2);
}

/** The way a drive at `deg` pushes her, in the drawing (x to starboard, y aft). */
const push = (deg: number): [number, number] => [Math.sin(deg * RAD), -Math.cos(deg * RAD)];

/** The tug from above, bow up, centred on (cx, cy), `s` px a metre; her drives' pushes. */
function tug(g: G, cx: number, cy: number, s: number, a1: number, p1: number, a2: number, p2: number): { X: (m: number) => number; Y: (m: number) => number } {
  const X = (m: number) => cx + m * s;
  const Y = (m: number) => cy + m * s;
  g.fillStyle = HULL;
  g.strokeStyle = EDGE;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(X(0), Y(-HALF_L));
  g.quadraticCurveTo(X(HALF_B), Y(-HALF_L), X(HALF_B), Y(-6));
  g.lineTo(X(HALF_B), Y(10.5));
  g.quadraticCurveTo(X(HALF_B), Y(HALF_L), X(3.6), Y(HALF_L));
  g.lineTo(X(-3.6), Y(HALF_L));
  g.quadraticCurveTo(X(-HALF_B), Y(HALF_L), X(-HALF_B), Y(10.5));
  g.lineTo(X(-HALF_B), Y(-6));
  g.quadraticCurveTo(X(-HALF_B), Y(-HALF_L), X(0), Y(-HALF_L));
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#b9c6d1';
  g.fillRect(X(-2.6), Y(-5.5), 5.2 * s, 6.5 * s);
  g.strokeRect(X(-2.6), Y(-5.5), 5.2 * s, 6.5 * s);
  for (const [x, a, p, c] of [
    [-DX, a1, p1, PORT],
    [DX, a2, p2, STBD],
  ] as const) {
    const px = X(x);
    const py = Y(DZ);
    g.fillStyle = PAPER;
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px, py, 0.9 * s, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    const [ux, uy] = push(a);
    const L = (2.2 + 6 * p) * s;
    arrow(g, px, py, px + ux * L, py + uy * L, c, 4, 13);
  }
  return { X, Y };
}

/** A lever's head seen from above: the ring, its arrow (the way it pushes), the bar across it. */
function leverDial(g: G, cx: number, cy: number, r: number, deg: number, p: number, colour: string, label: string): void {
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#c9d3dc';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.fill();
  g.stroke();
  for (let k = 0; k < 4; k++) {
    const a = k * 90 * RAD;
    g.strokeStyle = k === 0 ? INK : MUTED;
    g.lineWidth = k === 0 ? 4 : 2;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r * 0.8, cy - Math.cos(a) * r * 0.8);
    g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
    g.stroke();
  }
  const [ux, uy] = push(deg);
  // The bar, across the arrow, leaned forward along it as far as its power.
  const bx = cx + ux * r * 0.32 * p;
  const by = cy + uy * r * 0.32 * p;
  g.strokeStyle = INK;
  g.lineWidth = r * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(bx - uy * r * 0.55, by + ux * r * 0.55);
  g.lineTo(bx + uy * r * 0.55, by - ux * r * 0.55);
  g.stroke();
  arrow(g, cx, cy, cx + ux * r * 0.85, cy + uy * r * 0.85, colour, Math.max(3, r * 0.09), r * 0.28);
  if (label) {
    g.fillStyle = colour;
    g.font = `bold ${Math.round(r * 0.42)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(label, cx, cy + r + 6);
  }
}

/** Wrapped text from (x, y), `w` wide, `lh` a line; returns the y under it. */
function wrapText(g: G, text: string, x: number, y: number, w: number, lh: number): number {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

interface Move {
  name: string;
  a1: number;
  a2: number;
  set: string;
  say: string;
  /** Which way she goes: straight (x, y in the drawing), and / or turning (+1 to starboard). */
  line?: [number, number];
  atStern?: boolean;
  turn?: number;
}

const MOVES: Move[] = [
  { name: 'AHEAD', a1: 0, a2: 0, set: 'both 0°', say: 'Both pointers forward, push both bars. About 12 knots flat out.', line: [0, -1] },
  { name: 'ASTERN', a1: 180, a2: 180, set: 'both 180°', say: 'Twist both round to point aft at idle (it takes 15 s), then push.', line: [0, 1] },
  { name: 'TURN ON THE SPOT', a1: 0, a2: 180, set: 'port 0°, stbd 180°', say: 'Her bow swings to starboard and she stays put. Swap them to turn to port.', turn: 1 },
  { name: 'SWING THE STERN', a1: 90, a2: 90, set: 'both +90°', say: 'Her stern goes to starboard, her bow to port. Strong: use a little power.', turn: -1, line: [0.8, 0.2], atStern: true },
  { name: 'WALK SIDEWAYS', a1: 15, a2: 165, set: 'port +15°, stbd +165°', say: 'She walks to starboard. Bow swinging to port? Bring both nearer fore-and-aft. Mirror it for port.', line: [1, 0] },
  { name: 'TRANSIT', a1: -35, a2: -35, set: 'TRANSIT on, wheel to stbd', say: 'For steaming: the wheel swings both drives as rudders (35°); the levers set the power.', turn: 1, line: [0, -1] },
];

/** Paint the poster onto `g`, `W` x `H` px (landscape, about 1.42 : 1). */
export function paintAzimuthGuide(g: G, W: number, H: number): void {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  // The header band.
  const head = H * 0.12;
  g.fillStyle = INK;
  g.fillRect(0, 0, W, head);
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(head * 0.46)}px system-ui, sans-serif`;
  g.fillText('DRIVING THE HARBOUR TUG', W * 0.025, head * 0.5);
  g.font = `${Math.round(head * 0.24)}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText('azimuth stern drives', W * 0.975, head * 0.5);

  // Left column: how one lever works.
  const colW = W * 0.27;
  const x0 = W * 0.025;
  let y = head + H * 0.04;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = INK;
  g.font = `bold ${Math.round(H * 0.032)}px system-ui, sans-serif`;
  g.fillText('ONE LEVER EACH DRIVE', x0, y);
  y += H * 0.055;
  const dr = colW * 0.2;
  leverDial(g, x0 + colW * 0.25, y + dr, dr, 40, 0.6, PORT, 'PORT');
  leverDial(g, x0 + colW * 0.72, y + dr, dr, -150, 0.6, STBD, 'STBD');
  y += 2 * dr + H * 0.065;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = `${Math.round(H * 0.024)}px system-ui, sans-serif`;
  const lh = H * 0.032;
  const notes = [
    'The arrow (on the lever, its white pointer) is the way that drive pushes her.',
    'VR: grab the bar, twist your WRIST to turn it; that hand\'s THUMBSTICK forward / back is the power. Click the stick in: both throttles together.',
    'Desktop: drag it, or click it and A / D, W / S. Upright is idle.',
    'The drives follow at 12° a second: 15 s from ahead to astern. Point them first.',
    'ENGINE screen: the arrow is where each drive is, the ring where its lever asks.',
  ];
  for (const n of notes) {
    g.fillStyle = MOVE;
    g.fillRect(x0, y + lh * 0.3, 6, 6);
    g.fillStyle = INK;
    y = wrapText(g, n, x0 + 16, y, colW - 16, lh) + lh * 0.25;
  }

  // The moves: three across, two down.
  const gx = W * 0.32;
  const gw = W - gx - W * 0.02;
  const gy = head + H * 0.03;
  const gh = H - gy - H * 0.025;
  const cw = gw / 3;
  const ch = gh / 2;
  MOVES.forEach((m, i) => {
    const cx = gx + (i % 3) * cw;
    const cy = gy + Math.floor(i / 3) * ch;
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#c9d3dc';
    g.lineWidth = 2;
    g.fillRect(cx + 6, cy + 6, cw - 12, ch - 12);
    g.strokeRect(cx + 6, cy + 6, cw - 12, ch - 12);
    g.fillStyle = INK;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `bold ${Math.round(ch * 0.062)}px system-ui, sans-serif`;
    g.fillText(m.name, cx + 18, cy + 16);
    // The tug, the drives, which way she goes (top left); the levers beside her; the words under.
    const s = (ch * 0.38) / (2 * HALF_L);
    const tx = cx + cw * 0.3;
    const ty = cy + ch * 0.35;
    const T = tug(g, tx, ty, s, m.a1, 0.5, m.a2, 0.5);
    if (m.line) {
      const [lx, ly] = m.line;
      if (m.atStern) arrow(g, T.X(5.5), T.Y(6), T.X(5.5) + lx * s * 5, T.Y(6) + ly * s * 5, MOVE, 5, 16);
      else arrow(g, T.X(0) - lx * s, T.Y(-1) - ly * s, T.X(0) + lx * s * 8, T.Y(-1) + ly * s * 8, MOVE, 6, 18);
    }
    if (m.turn) turnArrow(g, T.X(0), T.Y(-1), s * 9, m.turn, 75, MOVE, 5);
    // The levers' settings beside her, port above starboard.
    const lr = Math.min(cw * 0.1, ch * 0.075);
    leverDial(g, cx + cw * 0.76, cy + ch * 0.25, lr, m.a1, 0.5, PORT, '');
    leverDial(g, cx + cw * 0.76, cy + ch * 0.47, lr, m.a2, 0.5, STBD, '');
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = MUTED;
    g.font = `${Math.round(ch * 0.042)}px system-ui, sans-serif`;
    g.fillText(m.set, cx + 18, cy + ch * 0.655);
    g.fillStyle = INK;
    g.font = `${Math.round(ch * 0.048)}px system-ui, sans-serif`;
    wrapText(g, m.say, cx + 18, cy + ch * 0.72, cw - 36, ch * 0.058);
  });
}
