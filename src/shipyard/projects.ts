/**
 * The Shipyard's projects (owner, Oct 2026: "the concept of a savable session [is] missing"):
 * the whole of a piece of design work, kept by name in this browser, so you can start a new
 * design and come back to this one.
 *
 * A project is everything the page holds while you work (variants.ts YardDoc): her brief,
 * the main design and its variants, and each one's pins and sketches. A favourite
 * (favourites.ts) is just one design's code; a project is the work round it.
 *
 * Saved under `swvr.yard.projects`, in this browser on this device, like the favourites.
 * Sketches are pictures, so a project can be a few hundred kB: at most MAX_PROJECTS are
 * kept, and if the browser's storage is full the save says so.
 */
import { cleanDoc, type YardDoc } from './variants';
import type { Store } from './favourites';

export interface Project {
  name: string;
  /** When saved (ms since 1970). */
  savedAt: number;
  /** A small JPEG of her main design, as a data URL ('' if none). */
  picture: string;
  /** One line to tell them apart, e.g. "Workboat 12.0 m · 2 variants · 3 pins". */
  summary: string;
  doc: YardDoc;
}

export const PROJECTS_KEY = 'swvr.yard.projects';
export const MAX_PROJECTS = 20;

/** The saved list, newest first. Anything unreadable is skipped, never thrown. */
export function readProjects(store: Store | null): Project[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store?.getItem(PROJECTS_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Project[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string') continue;
    const doc = cleanDoc(p.doc);
    if (!doc) continue;
    out.push({ name: p.name, savedAt: Number(p.savedAt) || 0, picture: typeof p.picture === 'string' ? p.picture : '', summary: typeof p.summary === 'string' ? p.summary : '', doc });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** Write the list. False if the browser wouldn't take it (storage full or switched off). */
export function writeProjects(store: Store | null, list: Project[]): boolean {
  try {
    store?.setItem(PROJECTS_KEY, JSON.stringify(list));
    return !!store;
  } catch {
    return false;
  }
}

/** The list with `p` at the top; one of the same name is replaced (saving again updates it). */
export function addProject(list: Project[], p: Project): Project[] {
  const others = list.filter((x) => x.name.toLowerCase() !== p.name.toLowerCase());
  return [p, ...others].slice(0, MAX_PROJECTS);
}

/** The list without the one saved at `savedAt` called `name`. */
export function removeProject(list: Project[], name: string, savedAt: number): Project[] {
  return list.filter((p) => !(p.name === name && p.savedAt === savedAt));
}

/**
 * Save `p` as the project this work is (owner, Oct 2026: projects save themselves as you
 * work). Renamed (her name changed at the top), the project called `was` becomes `p`: it
 * isn't left behind under its old name.
 */
export function saveAs(list: Project[], p: Project, was: string): Project[] {
  const rest = was && was.toLowerCase() !== p.name.toLowerCase() ? list.filter((x) => x.name.toLowerCase() !== was.toLowerCase()) : list;
  return addProject(rest, p);
}

/**
 * The work a browser left on the table, kept when the Shipyard opens afresh (owner, Oct
 * 2026: it opens with no project, not the last design). If it was a project (`was`), that
 * project takes it (it may have changed since it was last saved); else it's kept as a new
 * project, "Unsaved work (date)", so nothing is lost.
 */
export function keepLeftWork(list: Project[], doc: YardDoc, was: string, now: number, summary: string): Project[] {
  const old = was ? list.find((x) => x.name === was) : undefined;
  if (old) return addProject(list, { ...old, doc, savedAt: now });
  const when = new Date(now).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return addProject(list, { name: `Unsaved work (${when})`, savedAt: now, picture: '', summary, doc });
}
