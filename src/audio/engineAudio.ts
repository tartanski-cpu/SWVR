import { gearOf } from '../boats/sims';
import { CONFIG } from '../config';
import { mixer } from './mixer';
import type { VesselState } from '../vessel/vesselState';
import { loadDieselWorklet } from './dieselWorklet';

/** How a kind of diesel sounds (CONFIG.engineVoices). */
export type EngineVoice = (typeof CONFIG.engineVoices)['inlineSix'];
export type EngineVoiceId = keyof typeof CONFIG.engineVoices;

/** What the engine is doing, for the sound. */
export interface EngineSoundInput {
  rpm: number;
  /** Fuel rack 0..1 - how hard it is working. */
  load: number;
  ratedRpm: number;
  running: boolean;
  cranking: boolean;
  /**
   * How far under water the wet-exhaust outlet is, 0 (in the air) .. 1 (well under). As the
   * stern squats or dips into a wave, the exhaust note goes muffled and burbling.
   */
  submerged?: number;
}

/**
 * Synthesised marine diesel, no audio files:
 *
 *   diesel worklet ─ ch0 exhaust pulses ─► high-pass 45 Hz ─► resonances (110, 150 Hz) ─► low-pass
 *                  │                       (opens with rpm and load) ─► soft clip ─► thump ─┬─ dry ──────────────┐
 *                  │                                                                          └─ low-pass 220 Hz ─ muffled ─┤
 *   starter motor whine (while cranking) ─────────────────────────────────────────────────────────────────────┤
 *   noise ─► band-pass (intake rush, with load) ─────────────────────────────────────────────────────────────┼─► master
 *
 * Each kind of engine has its voice (CONFIG.engineVoices: its cylinders and their rhythm,
 * its exhaust resonances, how it opens up with revs and load, a turbo or not). The
 * workboat's, the default, is a working fishing boat's naturally aspirated diesel: no turbo
 * whistle, a dark, round exhaust note with a resonant stack "pop", lumpy uneven beats, no
 * clatter or rasp: nothing above a few hundred Hz (that reads as a tinny lawnmower; owner
 * feedback). The landing craft's is a turbocharged V8: busier, with a low burble under it
 * and a faint turbo whine (the only sound above a few hundred Hz, kept very quiet).
 *
 * Wet exhaust: the outlet is in the transom just above the waterline. When it dips under
 * (stern squat, a passing wave, pitching), the note goes dull: the dry path fades and a
 * low-passed copy comes up. (There were exhaust bubbles too; taken out, owner feedback.)
 * The worklet is what makes it "meaty": real, uneven firing pulses (see dieselWorklet.ts),
 * so you hear each cylinder thump at idle and a hard, gritty bark under load. Where
 * AudioWorklet isn't available it falls back to two oscillators (the old, thinner sound).
 *
 * Built on any BaseAudioContext, so it can also be rendered offline for checking levels.
 */
export class EngineSound {
  private constructor(
    private readonly ctx: BaseAudioContext,
    readonly master: GainNode,
    private readonly worklet: AudioWorkletNode | null,
    private readonly fallback: { osc1: OscillatorNode; osc2: OscillatorNode } | null,
    private readonly bodyLp: BiquadFilterNode,
    private readonly thump: GainNode,
    private readonly starter: OscillatorNode,
    private readonly starterGain: GainNode,
    private readonly hiss: GainNode,
    private readonly dry: GainNode,
    private readonly muffled: GainNode,
    private readonly houseLp: BiquadFilterNode,
    private readonly voice: EngineVoice,
    private readonly turbo: { osc: OscillatorNode; gain: GainNode } | null,
    private readonly presence: BiquadFilterNode,
  ) {}

  /** Voiced for small speakers (CONFIG.engineSmallSpeakers): on for phones and tablets. */
  private small = false;
  set smallSpeakers(on: boolean) {
    this.small = on;
    this.presence.gain.value = on ? CONFIG.engineSmallSpeakers.presenceDb : 0;
  }

  /** @param ratedRpm the engine's rated speed (its pulses lengthen below it) */
  static async create(ctx: BaseAudioContext, destination: AudioNode, voice: EngineVoice = CONFIG.engineVoices.inlineSix, ratedRpm = 1800): Promise<EngineSound> {
    const master = ctx.createGain();
    master.gain.value = 0;
    // Heard from inside the wheelhouse: the high end goes first (see set's `lp`).
    const houseLp = ctx.createBiquadFilter();
    houseLp.type = 'lowpass';
    houseLp.frequency.value = 20000;
    houseLp.Q.value = 0.5;
    // Small speakers (a phone, earbuds) can't play the beat's fundamental (30-120 Hz): this
    // lifts its harmonics they can play, and the ear hears the deep beat from them (see
    // smallSpeakers). Flat (0 dB) otherwise: the VR and desktop sound are untouched.
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = CONFIG.engineSmallSpeakers.presenceHz;
    presence.Q.value = 0.8;
    presence.gain.value = 0;
    master.connect(presence).connect(houseLp).connect(destination);

    // ── Combustion: body resonance, low-pass, a little saturation ──
    const dcBlock = ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    // Headset speakers can't play the 30 Hz idle fundamental: cut below ~45 Hz and push the
    // harmonics around 110 and 220 Hz (exhaust resonances) that carry the "meat" instead.
    dcBlock.frequency.value = 45;
    dcBlock.Q.value = 0.7;
    // A second high-pass: the cylinder imbalance makes a half-firing line (~22 Hz at 900
    // rpm) that a hull and real speakers don't pass (absent in the reference recording).
    const dcBlock2 = ctx.createBiquadFilter();
    dcBlock2.type = 'highpass';
    dcBlock2.frequency.value = 36;
    dcBlock2.Q.value = 0.7;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = voice.body.freq;
    body.Q.value = voice.body.q;
    body.gain.value = voice.body.gain;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking';
    // Exhaust stack resonance: the hollow "pop" of each beat.
    body2.frequency.value = voice.stack.freq;
    body2.Q.value = voice.stack.q;
    body2.gain.value = voice.stack.gain;
    const bodyLp = ctx.createBiquadFilter();
    bodyLp.type = 'lowpass';
    bodyLp.Q.value = 0.7;
    bodyLp.frequency.value = 300;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(voice.drive);
    shaper.oversample = '2x';
    const thump = ctx.createGain();
    thump.gain.value = 0;
    dcBlock.connect(dcBlock2).connect(body).connect(body2).connect(bodyLp).connect(shaper).connect(thump);
    // Exhaust in the air (dry) or under water (muffled): crossfaded by `submerged`.
    const dry = ctx.createGain();
    dry.gain.value = 1;
    thump.connect(dry).connect(master);
    const underLp = ctx.createBiquadFilter();
    underLp.type = 'lowpass';
    underLp.frequency.value = 220;
    underLp.Q.value = 0.5;
    const muffled = ctx.createGain();
    muffled.gain.value = 0;
    thump.connect(underLp).connect(muffled).connect(master);

    let worklet: AudioWorkletNode | null = null;
    let fallback: { osc1: OscillatorNode; osc2: OscillatorNode } | null = null;
    if (await loadDieselWorklet(ctx)) {
      const { cylinders, strength, jitter, pulseTau, pulseTauLow } = voice;
      worklet = new AudioWorkletNode(ctx, 'diesel', {
        numberOfInputs: 0,
        outputChannelCount: [1],
        processorOptions: { cylinders, strength, jitter, pulseTau, pulseTauLow, ratedRpm, grit: voice.grit },
      });
      worklet.connect(dcBlock);
      // Mechanical clatter riding on each firing (a voice with `mech`): the pulses' rasp in
      // its band (`mechBand`), beside the low-passed tone, to the same level control.
      if (voice.mech) {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = voice.mechBand?.[0] ?? 400;
        hp.Q.value = 0.7;
        const top = ctx.createBiquadFilter();
        top.type = 'lowpass';
        top.frequency.value = voice.mechBand?.[1] ?? 1400;
        top.Q.value = 0.5;
        const mech = ctx.createGain();
        mech.gain.value = voice.mech;
        worklet.connect(hp).connect(top).connect(mech).connect(thump);
      }
    } else {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      const sub = ctx.createGain();
      sub.gain.value = 0.35;
      osc1.connect(dcBlock);
      osc2.connect(sub).connect(dcBlock);
      osc1.start();
      osc2.start();
      fallback = { osc1, osc2 };
    }

    // ── Starter motor ──
    const starter = ctx.createOscillator();
    starter.type = 'sawtooth';
    starter.frequency.value = 160;
    const starterBp = ctx.createBiquadFilter();
    starterBp.type = 'bandpass';
    starterBp.frequency.value = 700;
    starterBp.Q.value = 0.8;
    const starterGain = ctx.createGain();
    starterGain.gain.value = 0;
    starter.connect(starterBp).connect(starterGain).connect(master);
    starter.start();

    // ── Intake / exhaust rush ──
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.6;
    const hiss = ctx.createGain();
    hiss.gain.value = 0;
    noise.connect(band).connect(hiss).connect(master);
    noise.start();

    // ── Turbocharger whine (a turbo engine's voice only): a soft sine, pitch with boost ──
    let turbo: { osc: OscillatorNode; gain: GainNode } | null = null;
    if (voice.turbo) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = voice.turbo.idleHz;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      turbo = { osc, gain };
    }

    return new EngineSound(ctx, master, worklet, fallback, bodyLp, thump, starter, starterGain, hiss, dry, muffled, houseLp, voice, turbo, presence);
  }

  /** Stop it and unhook it (the boat changed engines). */
  dispose(): void {
    this.master.disconnect();
    this.worklet?.disconnect();
    this.turbo?.osc.stop();
    this.starter.stop();
  }

  private lastSub = 0;
  private lastBoost = 0;

  /**
   * @param level overall level (distance attenuation, the wheelhouse etc.)
   * @param lp    low-pass on everything (Hz): 20000 on deck, lower through the wheelhouse
   * @param t     schedule time (default now)
   */
  set(e: EngineSoundInput, level: number, lp = 20000, t = this.ctx.currentTime): void {
    this.houseLp.frequency.setTargetAtTime(lp, t, 0.15);
    const smooth = 0.06;
    const rpm = Math.max(0, e.rpm);
    const rpmFrac = Math.min(1, rpm / e.ratedRpm);
    const turning = e.running || e.cranking || rpm > 20;
    const load = e.running ? e.load : 0;

    if (this.worklet) {
      const p = this.worklet.parameters;
      p.get('rpm')!.setTargetAtTime(rpm, t, smooth);
      p.get('load')!.setTargetAtTime(load, t, 0.1);
      // (An electric motor, `cylinders` 0: nothing fires.)
      p.get('firing')!.setValueAtTime(e.running && this.voice.cylinders > 0 ? 1 : 0, t);
    } else if (this.fallback) {
      const fire = (rpm * this.voice.cylinders) / 120;
      this.fallback.osc1.frequency.setTargetAtTime(Math.max(1, fire), t, smooth);
      this.fallback.osc2.frequency.setTargetAtTime(Math.max(1, fire / 2), t, smooth);
    }
    // Brighter and harder as it revs and digs in.
    // Darker than before (it topped out near 900 Hz): the bark stays under ~450 Hz.
    const v = this.voice;
    const lpLift = this.small ? CONFIG.engineSmallSpeakers.lpLiftHz : 0;
    this.bodyLp.frequency.setTargetAtTime(v.lp.base + lpLift + v.lp.rpm * rpmFrac + v.lp.load * load, t, smooth);
    this.thump.gain.setTargetAtTime(turning ? v.thump.base + v.thump.rpm * rpmFrac + v.thump.load * load : 0, t, 0.1);
    // Wet exhaust: dry bark in the air, dull under water. Under goes fast (the
    // outlet floods), back out a little slower (the water has to clear).
    const sub = Math.min(1, Math.max(0, e.submerged ?? 0));
    const k = sub > this.lastSub ? 0.04 : 0.12;
    this.lastSub = sub;
    this.dry.gain.setTargetAtTime(1 - 0.8 * sub, t, k);
    this.muffled.gain.setTargetAtTime(1.1 * sub, t, k);
    this.starter.frequency.setTargetAtTime(120 + rpm * 1.4, t, 0.05);
    this.starterGain.gain.setTargetAtTime(e.cranking ? 0.06 : 0, t, 0.04);
    this.hiss.gain.setTargetAtTime(e.running ? v.hiss.base + v.hiss.load * load * rpmFrac : 0, t, 0.2);
    // The turbo spools up with boost (load at revs) and down slowly (its rotor's inertia).
    if (this.turbo && v.turbo && !v.cylinders) {
      // An electric motor's whine (its voice's `turbo`): pitch with its speed, silent at rest.
      this.turbo.osc.frequency.setTargetAtTime(v.turbo.idleHz + (v.turbo.boostHz - v.turbo.idleHz) * rpmFrac, t, smooth);
      this.turbo.gain.gain.setTargetAtTime(e.running ? v.turbo.gain * Math.min(1, rpmFrac * 5) * (0.5 + 0.5 * load) : 0, t, 0.1);
    } else if (this.turbo && v.turbo) {
      const boost = e.running ? Math.sqrt(load * rpmFrac) : 0;
      const k2 = boost > this.lastBoost ? 0.5 : 1.2;
      this.lastBoost = boost;
      this.turbo.osc.frequency.setTargetAtTime(v.turbo.idleHz + (v.turbo.boostHz - v.turbo.idleHz) * boost, t, k2);
      // Under water, the exhaust side's whine goes too.
      this.turbo.gain.gain.setTargetAtTime(e.running ? v.turbo.gain * (0.15 + 0.85 * boost) * (1 - 0.7 * sub) : 0, t, k2);
    }
    this.master.gain.setTargetAtTime(level, t, 0.1);
  }
}

/**
 * The boat's engine sound, on the shared AudioContext. Browsers only allow audio after a
 * user gesture; `unlock()` is called from the first click/key press and from entering VR.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private sound: EngineSound | null = null;
  /** Twin engines: the second engine's own sound (null with one engine). */
  private sound2: EngineSound | null = null;
  /** The voice, rated rpm and number of engines the sound was built for, and those wanted (her engines'). */
  private built: string | null = null;
  private wanted: EngineVoiceId = 'inlineSix';
  private ratedRpm = 1800;
  private twin = false;
  /** How many engines she has (outboards: 2 to 4, heard as two voices, louder with more). */
  private count = 1;
  private get wantedKey(): string {
    return `${this.wanted}|${this.ratedRpm}|${this.twin ? 2 : 1}`;
  }
  private building = false;
  /** Voice it for small speakers (phones, tablets, earbuds; the touch controls set it). */
  smallSpeakers = false;

  /** The shared AudioContext (null until a user gesture has unlocked audio). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.build();
  }

  /** Play on another sound's context (a second engine: the rescue boat's, beside our boat's own). */
  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.build();
  }

  /**
   * (Re)build the sound in the wanted voice (and rated rpm, which shapes its pulses), one per
   * engine; the old one is stopped once the new is ready.
   */
  private build(): void {
    const ctx = this.ctx;
    if (!ctx || this.building) return;
    this.building = true;
    const key = this.wantedKey;
    const make = () => EngineSound.create(ctx, mixer.bus(ctx, 'engine'), CONFIG.engineVoices[this.wanted], this.ratedRpm);
    void Promise.all([make(), this.twin ? make() : Promise.resolve(null)]).then(([s, s2]) => {
      this.sound?.dispose();
      this.sound2?.dispose();
      for (const x of [s, s2]) if (x) x.smallSpeakers = this.smallSpeakers;
      this.sound = s;
      this.sound2 = s2;
      this.built = key;
      this.building = false;
    });
  }

  /**
   * @param distance  metres from the listener to the engine room
   * @param submerged how far under water the exhaust outlet is, 0..1 (see App)
   * @param house     level factor and low-pass (Hz) for where you are: 1 / 20000 on deck,
   *                  less inside the wheelhouse (CONFIG.wheelhouseSound)
   */
  update(v: VesselState | undefined, distance: number, submerged = 0, house = 1, lp = 20000): void {
    if (!v) return;
    // Her engine's voice: a boat with another kind of engine gets its own sound.
    const diesel = gearOf(v, 'diesel');
    this.wanted = diesel?.voice ?? 'inlineSix';
    this.ratedRpm = diesel?.engine.ratedRpm ?? 1800;
    this.twin = !!diesel?.twin;
    this.count = diesel?.units?.length ?? (this.twin ? 2 : 1);
    if (this.sound && this.built !== this.wantedKey) this.build();
    if (!this.sound) return;
    const e = v.engine;
    const input = { rpm: e.rpm, load: e.rack, ratedRpm: this.ratedRpm, running: e.phase === 'running', cranking: e.phase === 'cranking', submerged };
    const level = (0.42 / (1 + distance / 8)) * house;
    if (!this.sound2) {
      this.sound.set(input, level, lp);
      return;
    }
    // Twin engines: two sounds, together ~+3 dB (each at engineTwinLevel / sqrt 2: two
    // unrelated sources add in power). The second runs a slowly wandering share off the
    // first's revs (CONFIG.engineTwinDrift), so their beats drift in and out of step: the drone.
    // (Three or four outboards: two voices still, each as loud as half of them together: +1.8 / +3 dB.)
    // Twin engines worked separately (a lever and a START each, EngineState.stbd): the second
    // sound is the starboard engine's own, its revs, load and starter, so each is heard
    // starting, stopping and throttling on its own.
    const each = ((level * CONFIG.engineTwinLevel) / Math.SQRT2) * Math.sqrt(Math.max(2, this.count) / 2);
    const dr = CONFIG.engineTwinDrift;
    const t = this.ctx!.currentTime;
    const drift = dr.share * (0.6 * Math.sin((2 * Math.PI * t) / dr.periodsS[0]) + 0.4 * Math.sin((2 * Math.PI * t) / dr.periodsS[1]));
    const s = e.stbd;
    const input2 = s ? { rpm: s.rpm, load: s.rack, ratedRpm: this.ratedRpm, running: s.phase === 'running', cranking: s.phase === 'cranking', submerged } : input;
    this.sound.set(input, each, lp);
    this.sound2.set({ ...input2, rpm: input2.rpm * (1 + drift) }, each, lp);
  }
}

/** Shared looping white-noise buffer. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** tanh soft-clip curve: adds harmonics (grit) to loud pulses without hard clipping. */
function softClip(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}
