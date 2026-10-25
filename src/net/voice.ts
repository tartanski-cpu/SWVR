import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import { CONFIG } from '../config';
import { mixer } from '../audio/mixer';

/**
 * Voice between the crew (owner request): everyone's microphone to everyone else, over the
 * same PeerJS connection the game already uses (a WebRTC audio call per pair of players; with
 * four players at most that's three calls each). Nothing goes through a server but the
 * introduction, as for the game itself.
 *
 * Each voice that arrives is heard two ways, worked out every frame from where the players
 * are (voiceRoute below, CONFIG.voice):
 *   - proximity: from the speaker's head, in 3D (a panner at their head), fading out over a
 *     couple of dozen metres. Always on: if they're near, you hear them.
 *   - the handheld VHF: while they hold the talk button, through your radio if they're within
 *     its range: no direction, narrow-band and slightly overdriven, a squelch burst at each
 *     end of the transmission, a hiss as they get towards the edge of the range.
 *
 * Who calls whom: of each pair, the one whose network id sorts first calls (shouldCall), the
 * other answers, so there's only ever one call between two players.
 */

/** How one speaker is heard by one listener: proximity loudness, and radio (0: not at all). */
export interface VoiceRoute {
  near: number;
  radio: number;
  /** 0..1: the hiss on the radio (far off). */
  hiss: number;
}

/**
 * @param dist   metres between the listener's and the speaker's heads
 * @param speakerTx  the speaker holds their radio's talk button
 * @param listenerTx the listener holds theirs (a transmitting radio doesn't receive)
 */
export function voiceRoute(dist: number, speakerTx: boolean, listenerTx: boolean, c = CONFIG.voice): VoiceRoute {
  const near = dist <= c.nearFull ? 1 : dist >= c.nearMax ? 0 : 1 - (dist - c.nearFull) / (c.nearMax - c.nearFull);
  const onAir = speakerTx && !listenerTx && dist <= c.radioRange;
  const edge = Math.max(0, dist / c.radioRange - c.staticFrom) / (1 - c.staticFrom);
  return { near, radio: onAir ? c.radioGain : 0, hiss: onAir ? Math.min(1, edge) : 0 };
}

/** Of a pair, does `me` place the call (the other answers)? */
export function shouldCall(me: string, them: string): boolean {
  return me < them;
}

/** A crew-mate as voice needs them: their network id, head (world) and talk button. */
export interface VoiceSpeaker {
  peerId: string;
  head: { x: number; y: number; z: number };
  tx: boolean;
  /** You've muted them (the Crew tab): their call stays up, their voice silent to you. */
  muted?: boolean;
}

interface Remote {
  call: MediaConnection;
  /** Chrome only plays a remote WebRTC stream into Web Audio if a media element is playing it. */
  el: HTMLAudioElement | null;
  src: MediaStreamAudioSourceNode | null;
  near: GainNode;
  panner: PannerNode;
  radio: GainNode;
  /** On the air last frame (for the squelch bursts). */
  onAir: boolean;
}

export type MicState = 'asking' | 'on' | 'none';

export class VoiceChat {
  private readonly remotes = new Map<string, Remote>();
  /** When a failed call may be tried again (s, the context's clock). */
  private readonly retryAt = new Map<string, number>();
  private out: MediaStream | null = null;
  private mic: MediaStream | null = null;
  micState: MicState = 'asking';
  private muted = false;
  private readonly bus: AudioNode;
  /** The radio's sound, shared by every voice through it: band-pass and overdrive. */
  private readonly radioIn: GainNode;
  private readonly hiss: GainNode;
  private noise: AudioBuffer | null = null;
  private closed = false;

  constructor(
    private readonly peer: Peer,
    private readonly ctx: AudioContext,
  ) {
    const c = CONFIG.voice;
    this.bus = mixer.bus(ctx, 'voice');
    // The radio: high-pass and low-pass to its narrow band, then a soft clip.
    this.radioIn = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = c.radioLowHz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = c.radioHighHz;
    const clip = ctx.createWaveShaper();
    clip.curve = softClip(c.radioDrive);
    this.radioIn.connect(hp).connect(lp).connect(clip).connect(this.bus);
    // The hiss: looping noise through the same band, silent until someone's far off.
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = this.noiseBuffer();
    hissSrc.loop = true;
    hissSrc.connect(this.hiss).connect(hp);
    hissSrc.start();

    peer.on('call', (call) => this.answer(call));
    // The microphone: echo cancellation and noise suppression on (a headset's mic hears its
    // own speakers). If it's refused (or there's none), we still hear everyone: we send silence.
    const silence = () => {
      const d = ctx.createMediaStreamDestination();
      return d.stream;
    };
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) {
      this.micState = 'none';
      this.out = silence();
      return;
    }
    md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(
      (s) => {
        if (this.closed) return s.getTracks().forEach((t) => t.stop());
        this.mic = s;
        this.out = s;
        this.micState = 'on';
        this.setMuted(this.muted);
      },
      () => {
        this.micState = 'none';
        this.out = silence();
      },
    );
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Your microphone off (you still hear everyone). */
  setMuted(m: boolean): void {
    this.muted = m;
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !m;
  }

  /** How many crew-mates we're connected to by voice. */
  get connected(): number {
    let n = 0;
    for (const r of this.remotes.values()) if (r.src) n++;
    return n;
  }

  /**
   * Every frame: call those we should and haven't, drop those gone, and set how each voice is
   * heard from where we are (the listener itself is set in world axes by the sound board).
   */
  update(me: { head: { x: number; y: number; z: number }; tx: boolean }, speakers: VoiceSpeaker[]): void {
    const myId = this.peer.id;
    const now = this.ctx.currentTime;
    const present = new Set(speakers.map((s) => s.peerId));
    for (const [id, r] of this.remotes) if (!present.has(id)) this.drop(id, r);
    let hiss = 0;
    for (const s of speakers) {
      let r = this.remotes.get(s.peerId);
      if (!r && myId && this.out && shouldCall(myId, s.peerId) && now >= (this.retryAt.get(s.peerId) ?? 0)) {
        r = this.track(this.peer.call(s.peerId, this.out));
      }
      if (!r) continue;
      const dist = Math.hypot(s.head.x - me.head.x, s.head.y - me.head.y, s.head.z - me.head.z);
      const route = voiceRoute(dist, s.tx, me.tx);
      const p = r.panner;
      if (p.positionX) {
        p.positionX.setTargetAtTime(s.head.x, now, 0.05);
        p.positionY.setTargetAtTime(s.head.y, now, 0.05);
        p.positionZ.setTargetAtTime(s.head.z, now, 0.05);
      } else p.setPosition(s.head.x, s.head.y, s.head.z);
      r.near.gain.setTargetAtTime(s.muted ? 0 : route.near, now, 0.05);
      r.radio.gain.setTargetAtTime(s.muted ? 0 : route.radio, now, 0.02);
      const onAir = !s.muted && route.radio > 0;
      if (onAir !== r.onAir) this.squelch();
      r.onAir = onAir;
      if (!s.muted) hiss = Math.max(hiss, route.hiss);
    }
    this.hiss.gain.setTargetAtTime(hiss * CONFIG.voice.staticMax, now, 0.1);
  }

  private answer(call: MediaConnection): void {
    // A crew-mate's browser tab for a TV (modules/furniture/tvCast.ts answers those), not their voice.
    if ((call.metadata as { tv?: unknown } | undefined)?.tv !== undefined) return;
    if (this.closed) return call.close();
    const old = this.remotes.get(call.peer);
    if (old) this.drop(call.peer, old);
    const go = () => {
      if (this.closed) return call.close();
      if (this.out) {
        call.answer(this.out);
        this.track(call);
      } else setTimeout(go, 200); // still asking for the mic: answer once we know
    };
    go();
  }

  /** Hook a call's voice up to its proximity and radio paths (once its stream arrives). */
  private track(call: MediaConnection): Remote {
    const ctx = this.ctx;
    const near = ctx.createGain();
    near.gain.value = 0;
    // Direction only: the loudness with distance is `near` (voiceRoute), not the panner's.
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'linear';
    panner.rolloffFactor = 0;
    near.connect(panner).connect(this.bus);
    const radio = ctx.createGain();
    radio.gain.value = 0;
    radio.connect(this.radioIn);
    const r: Remote = { call, el: null, src: null, near, panner, radio, onAir: false };
    this.remotes.set(call.peer, r);
    call.on('stream', (stream) => {
      if (r.el || this.closed) return;
      // Played (silently) by an element so the browser decodes it; heard through Web Audio.
      // Volume 0 rather than muted: a muted element doesn't pull the call's sound in Chrome.
      const el = new Audio();
      el.volume = 0;
      el.srcObject = stream;
      r.el = el;
      // Into Web Audio once the sound is really arriving: a source made the moment the call
      // comes in can stay silent for good (Chrome), so wait for the element to be playing.
      const hookUp = () => {
        if (r.src || this.closed || this.remotes.get(call.peer) !== r) return;
        r.src = ctx.createMediaStreamSource(stream);
        r.src.connect(near);
        r.src.connect(radio);
      };
      el.addEventListener('playing', () => setTimeout(hookUp, 300), { once: true });
      void el.play().catch(() => setTimeout(hookUp, 1000));
    });
    const failed = () => {
      if (this.remotes.get(call.peer) !== r) return;
      this.drop(call.peer, r);
      this.retryAt.set(call.peer, this.ctx.currentTime + CONFIG.voice.retryS);
    };
    call.on('close', failed);
    call.on('error', failed);
    return r;
  }

  private drop(id: string, r: Remote): void {
    this.remotes.delete(id);
    r.src?.disconnect();
    r.near.disconnect();
    r.panner.disconnect();
    r.radio.disconnect();
    if (r.el) r.el.srcObject = null;
    r.call.close();
  }

  /** The burst of noise as a transmission opens or closes. */
  private squelch(): void {
    const ctx = this.ctx;
    const c = CONFIG.voice;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(c.squelchGain, t);
    g.gain.linearRampToValueAtTime(0, t + c.squelchS);
    src.connect(g).connect(this.radioIn);
    src.start(t, Math.random(), c.squelchS + 0.02);
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const n = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }

  close(): void {
    this.closed = true;
    for (const [id, r] of this.remotes) this.drop(id, r);
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.hiss.disconnect();
    this.radioIn.disconnect();
  }
}

/** A waveshaper curve: tanh(drive x), scaled so full input stays full. */
function softClip(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / k;
  }
  return curve;
}
