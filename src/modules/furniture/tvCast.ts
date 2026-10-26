/**
 * Showing a browser tab on a TV (owner, Oct 2026: "the TV should enable streaming of another
 * browser tab into the TV screen. So only for desktop users, but the screen should be visible
 * for all users").
 *
 * The picture never goes through the game's simulation. On a desktop the browser's own picker
 * (getDisplayMedia) gives us the tab's picture and sound as a stream; we draw it on the TV
 * (a video texture) and play its sound from the TV, in 3D. The world only says who is showing
 * a tab on which TV (tvState.ts), so each crew-mate knows. The one showing it sends it straight
 * to each of them over the same PeerJS link voice chat uses (a WebRTC video call per crew-mate,
 * marked `{ tv: <the TV> }` so voice chat leaves it alone); nothing goes through a server but
 * the introduction. Each crew-mate draws what arrives on that TV.
 *
 * What it costs: the one showing sends a copy to each crew-mate (CONFIG.tv.capture keeps it to
 * 720p at 30 frames a second); a viewer decodes it and uploads each new frame to the GPU, only
 * while the TV is within CONFIG.tv.showWithin and in view (a texture off screen isn't uploaded).
 *
 * The browser decides what can be shown: a tab playing protected video (most paid streaming
 * services) shows black.
 */
import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { mixer } from '../../audio/mixer';
import type { TvScreen } from './tvScreen';

/** A picture being drawn: its stream, played by a video element into a texture, its sound from its TV. */
interface Picture {
  video: HTMLVideoElement;
  tex: THREE.VideoTexture;
  gain: GainNode | null;
  panner: PannerNode | null;
  src: MediaStreamAudioSourceNode | null;
  used: boolean;
}

/** A crew-mate's tab for a TV, as it comes in: the call, its stream once it arrives, since when (ms). */
interface Incoming {
  call: MediaConnection;
  stream: MediaStream | null;
  since: number;
}

/** A crew-mate as the TV needs them: their network id. */
export interface TvCrew {
  peerId: string;
}

/** How loud a TV is from `dist` m (0..1 of CONFIG.tv.sound.gain): full near it, fading to nothing. */
export function tvLoudness(dist: number, c = CONFIG.tv.sound): number {
  return c.gain * (dist <= c.nearFull ? 1 : dist >= c.nearMax ? 0 : 1 - (dist - c.nearFull) / (c.nearMax - c.nearFull));
}

/** Can this browser show a tab (a desktop browser can; the Quest's can't)? */
export const canShowTab = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

export class TvCast {
  /** The tab we're showing, on which TV, and since when (ms; the world takes a moment to say so). */
  private mine: { key: string; stream: MediaStream; since: number } | null = null;
  private asking = false;
  /** Our tab, sent to each crew-mate (by their network id). */
  private readonly out = new Map<string, MediaConnection>();
  /** When a failed call to a crew-mate may be tried again (ms). */
  private readonly retryAt = new Map<string, number>();
  /** What crew-mates send us, by TV. */
  private readonly incoming = new Map<string, Incoming>();
  private readonly pictures = new Map<MediaStream, Picture>();
  private peer: Peer | null = null;
  /** The links we listen on for crew-mates' calls (once each). */
  private readonly heard = new WeakSet<Peer>();
  private readonly v = new THREE.Vector3();
  /** Our tab stopped by the browser (its "Stop sharing" bar): the app tells the world. */
  onStopped: (key: string) => void = () => {};

  constructor(private readonly audio: () => AudioContext | null) {}

  /** The TV we're showing a tab on, if any. */
  get showing(): string | null {
    return this.mine?.key ?? null;
  }

  /**
   * Ask the browser for a tab to show on a TV (from a click: the browser wants one). Resolves
   * whether one was picked.
   */
  async start(key: string): Promise<boolean> {
    if (this.asking || !canShowTab()) return false;
    this.asking = true;
    try {
      const c = CONFIG.tv.capture;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: c.width }, height: { max: c.height }, frameRate: { max: c.fps } },
        // Its sound, if they tick "share tab audio": heard from the TV, not from the tab (Chrome).
        audio: { suppressLocalAudioPlayback: true } as MediaTrackConstraints,
        // Tabs first, not this game's own tab (Chrome; others ignore these).
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
      this.stop();
      const mine = { key, stream, since: performance.now() };
      this.mine = mine;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (this.mine !== mine) return;
        this.stop();
        this.onStopped(key);
      });
      return true;
    } catch {
      return false;
    } finally {
      this.asking = false;
    }
  }

  /** Stop showing our tab. */
  stop(): void {
    for (const call of this.out.values()) call.close();
    this.out.clear();
    for (const t of this.mine?.stream.getTracks() ?? []) t.stop();
    this.mine = null;
  }

  /** The game's network link (null: solo): crew-mates' pictures come in on it. */
  attach(peer: Peer | null): void {
    if (peer === this.peer) return;
    this.peer = peer;
    for (const call of this.out.values()) call.close();
    this.out.clear();
    if (!peer || this.heard.has(peer)) return;
    this.heard.add(peer);
    peer.on('call', (call) => this.answer(call));
  }

  /**
   * Every frame: send our tab to the crew, and put on each TV what's showing on it.
   * @param casts   who is showing a tab on which TV (the world's)
   * @param me      our player id
   * @param crew    the crew-mates in the game (not us)
   * @param tvs     every TV in the scene, by its name in the world (tvState.tvKey)
   * @param viewer  our head (world)
   */
  update(casts: Record<string, string>, me: string, crew: TvCrew[], tvs: Map<string, TvScreen>, viewer: THREE.Vector3): void {
    const now = performance.now();
    // Ours: the world no longer says so (someone else took the TV over, or we left the boat
    // game), once it's had time to hear of it.
    if (this.mine && casts[this.mine.key] !== me && now - this.mine.since > CONFIG.tv.confirmS * 1000) this.stop();
    // Our tab to each crew-mate: a call each, made once (again a while after one fails).
    const mine = this.mine;
    const present = new Set(crew.map((c) => c.peerId));
    for (const [id, call] of this.out) {
      if (present.has(id)) continue;
      call.close();
      this.out.delete(id);
    }
    if (mine && this.peer?.id) {
      for (const { peerId } of crew) {
        if (this.out.has(peerId) || now < (this.retryAt.get(peerId) ?? 0)) continue;
        const call = this.peer.call(peerId, mine.stream, { metadata: { tv: mine.key } });
        if (!call) continue;
        this.out.set(peerId, call);
        const failed = () => {
          if (this.out.get(peerId) !== call) return;
          this.out.delete(peerId);
          this.retryAt.set(peerId, performance.now() + CONFIG.tv.retryS * 1000);
        };
        call.on('close', failed);
        call.on('error', failed);
      }
    }
    // What a crew-mate sent for a TV that's gone dark: hung up (a new one may come in a
    // moment before the world says they're showing it).
    for (const [key, inc] of this.incoming) {
      if ((casts[key] && casts[key] !== me) || now - inc.since < CONFIG.tv.confirmS * 1000) continue;
      inc.call.close();
      this.incoming.delete(key);
    }
    // Each TV: our tab, a crew-mate's, or dark.
    for (const p of this.pictures.values()) p.used = false;
    for (const [key, tv] of tvs) {
      const who = casts[key];
      const stream = !who ? null : who === me ? (mine?.key === key ? mine.stream : null) : (this.incoming.get(key)?.stream ?? null);
      const pic = stream ? this.picture(stream) : null;
      if (!pic) {
        tv.show(null);
        continue;
      }
      pic.used = true;
      const at = tv.centre(this.v);
      const dist = at.distanceTo(viewer);
      tv.show(dist <= CONFIG.tv.showWithin ? pic.tex : null, pic.video.videoWidth / pic.video.videoHeight || 16 / 9);
      // Its sound from the TV (direction from the panner, loudness from tvLoudness).
      if (pic.panner && pic.gain) {
        const t = pic.panner.context.currentTime;
        if (pic.panner.positionX) {
          pic.panner.positionX.setTargetAtTime(at.x, t, 0.05);
          pic.panner.positionY.setTargetAtTime(at.y, t, 0.05);
          pic.panner.positionZ.setTargetAtTime(at.z, t, 0.05);
        } else pic.panner.setPosition(at.x, at.y, at.z);
        pic.gain.gain.setTargetAtTime(tvLoudness(dist), t, 0.05);
      }
    }
    for (const [stream, p] of this.pictures) if (!p.used) this.drop(stream, p);
  }

  /** A crew-mate's call: their tab for a TV (voice calls are voice chat's). */
  private answer(call: MediaConnection): void {
    const key = (call.metadata as { tv?: unknown } | undefined)?.tv;
    if (typeof key !== 'string') return;
    this.incoming.get(key)?.call.close();
    const inc: Incoming = { call, stream: null, since: performance.now() };
    this.incoming.set(key, inc);
    call.answer(); // we send nothing back
    call.on('stream', (s) => {
      inc.stream = s;
    });
    const gone = () => {
      if (this.incoming.get(key) === inc) this.incoming.delete(key);
    };
    call.on('close', gone);
    call.on('error', gone);
  }

  /** A stream's picture (and sound), made the first time it's shown. */
  private picture(stream: MediaStream): Picture {
    let p = this.pictures.get(stream);
    if (p) return p;
    const video = document.createElement('video');
    video.playsInline = true;
    // Volume 0, not muted: Chrome only lets Web Audio hear a call's sound while an element
    // plays it (as voice chat). The sound is heard from the TV, through Web Audio.
    video.volume = 0;
    video.srcObject = stream;
    void video.play().catch(() => {});
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    p = { video, tex, gain: null, panner: null, src: null, used: true };
    const ctx = this.audio();
    if (ctx && stream.getAudioTracks().length) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      gain.connect(panner).connect(mixer.bus(ctx, 'music'));
      const pic = p;
      Object.assign(pic, { gain, panner });
      // Into Web Audio once it's really playing (a source made sooner can stay silent: Chrome).
      const hookUp = () => {
        if (pic.src || this.pictures.get(stream) !== pic) return;
        pic.src = ctx.createMediaStreamSource(stream);
        pic.src.connect(gain);
      };
      video.addEventListener('playing', () => setTimeout(hookUp, 300), { once: true });
    }
    this.pictures.set(stream, p);
    return p;
  }

  private drop(stream: MediaStream, p: Picture): void {
    this.pictures.delete(stream);
    p.src?.disconnect();
    p.gain?.disconnect();
    p.panner?.disconnect();
    p.video.pause();
    p.video.srcObject = null;
    p.tex.dispose();
  }

  close(): void {
    this.stop();
    for (const inc of this.incoming.values()) inc.call.close();
    this.incoming.clear();
    for (const [s, p] of this.pictures) this.drop(s, p);
  }
}
