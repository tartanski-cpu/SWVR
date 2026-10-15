import { CONFIG } from '../config';

/**
 * Player preferences changed at runtime (VR menu, debug keys) and remembered in the
 * browser. Defaults come from config.ts. These are per-device comfort settings, not
 * simulation state, so they never go into WorldState.
 */
export interface UserSettings {
  /** 0..1, see CONFIG.comfort.motionCoupling (VR) and desktopMotionCoupling (desktop). */
  motionCoupling: number;
  desktopCoupling: number;
  /** Left-stick smooth walking (grab-the-world is always on). */
  smoothWalk: boolean;
  /** Right-stick snap-turn angle (degrees). */
  snapTurnDeg: number;
  /** Name shown over your head to other players (multiplayer). */
  playerName: string;
  /** Rain streaks: all, fewer (a slower headset), or none. */
  rainQuality: 'high' | 'low' | 'off';
  /** The boat hook telescopes out to the crate or bow eye you point it at (CONFIG.rescue.hookAutoReach). */
  hookAutoExtend: boolean;
}

/** Names to pick from in the menu (there's no comfortable way to type in VR). */
export const PLAYER_NAMES = ['Skipper', 'Mate', 'Bosun', 'Deckhand', 'Engineer', 'Cook', 'Navigator', 'Lookout', 'Coxswain', 'Pilot'];

const KEY = 'swvr.settings.v1';
/** Before v1 only the coupling was stored, under its own key. */
const LEGACY_COUPLING_KEY = 'swvr.motionCoupling.v2';

export const userSettings: UserSettings = load();

function load(): UserSettings {
  const s: UserSettings = {
    motionCoupling: CONFIG.comfort.motionCoupling,
    desktopCoupling: CONFIG.comfort.desktopMotionCoupling,
    smoothWalk: CONFIG.locomotion.smoothEnabled,
    snapTurnDeg: CONFIG.locomotion.snapTurnDeg,
    playerName: PLAYER_NAMES[Math.floor(Math.random() * PLAYER_NAMES.length)],
    rainQuality: 'high',
    hookAutoExtend: true,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<UserSettings>;
      if (typeof saved.motionCoupling === 'number' && Number.isFinite(saved.motionCoupling)) s.motionCoupling = saved.motionCoupling;
      if (typeof saved.desktopCoupling === 'number' && Number.isFinite(saved.desktopCoupling)) s.desktopCoupling = saved.desktopCoupling;
      if (typeof saved.smoothWalk === 'boolean') s.smoothWalk = saved.smoothWalk;
      if (typeof saved.snapTurnDeg === 'number' && saved.snapTurnDeg > 0) s.snapTurnDeg = saved.snapTurnDeg;
      if (typeof saved.playerName === 'string' && saved.playerName) s.playerName = saved.playerName.slice(0, 24);
      if (typeof saved.hookAutoExtend === 'boolean') s.hookAutoExtend = saved.hookAutoExtend;
      if (saved.rainQuality === 'high' || saved.rainQuality === 'low' || saved.rainQuality === 'off') s.rainQuality = saved.rainQuality;
    } else {
      const legacy = localStorage.getItem(LEGACY_COUPLING_KEY);
      if (legacy !== null && Number.isFinite(Number(legacy))) s.motionCoupling = Number(legacy);
    }
  } catch {
    /* storage unavailable or corrupt: defaults */
  }
  return s;
}

export function saveUserSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(userSettings));
  } catch {
    /* storage unavailable: settings just aren't remembered */
  }
}
