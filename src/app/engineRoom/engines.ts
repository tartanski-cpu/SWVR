/**
 * Her engines as her recipe installs them (the diesel module's, the stern drives', the pods':
 * `installed`, from the Shipyard's build), for the engine room to draw and to make room for.
 */
import { RECIPES } from '../../boats/library';
import type { Mount } from '../../modular/recipe';
import type { RoomEngine } from './plan';

type Installed = { model: number; size: [number, number, number]; xs: number[]; flangeY: number; flangeZ: number; angleDeg: number };

export function roomEngines(defId: string): RoomEngine[] {
  const out: RoomEngine[] = [];
  const walk = (mounts: readonly Mount[] | undefined) => {
    for (const m of mounts ?? []) {
      const inst = (m.config as { installed?: Installed } | undefined)?.installed;
      if (inst) for (const x of inst.xs) out.push({ model: inst.model, size: inst.size, x, flangeY: inst.flangeY, flangeZ: inst.flangeZ, angleDeg: inst.angleDeg });
      walk(m.modules);
    }
  };
  walk(RECIPES[defId]?.modules);
  return out;
}
