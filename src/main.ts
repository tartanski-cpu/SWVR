import { MODE, TRAINING, VOYAGE_MAP_ID } from './mode';
import { voyageMap } from './world/maps';
import { setRemotePackage, type CoastPackage } from './world/coastRegion';

declare const __CHANNEL__: string | undefined;
// A work-in-progress copy (/SWVR/next/, or a preview: /SWVR/preview/<name>/) says so in the browser tab.
const channel = typeof __CHANNEL__ === 'string' ? __CHANNEL__.toUpperCase() : '';
document.title = `Workboat World: ${MODE === 'voyage' ? `${TRAINING ? 'Training' : 'Voyage'}${channel ? ` (${channel})` : ''}` : channel || 'Career'}`;

// A coast region's ground (real coastline, tools/coast) is a mesh fetched before the world
// is built: everything that reads the ground (physics, drawing, charts) needs it from the
// start. A big Voyage map (the Clyde) brings its whole package that way too, so the world
// (regions, App) is loaded only after it: hence the imports in here, in order.
async function main(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const map = MODE === 'voyage' ? voyageMap(VOYAGE_MAP_ID) : undefined;
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;left:50%;top:45%;transform:translateX(-50%);font:16px system-ui;color:#456';
  const say = (text: string) => {
    note.textContent = text;
    if (!note.parentNode) document.body.appendChild(note);
  };
  try {
    if (map?.remote) {
      say('Loading the map...');
      const res = await fetch(`${base}regions/${map.id}/package.json`);
      if (!res.ok) throw new Error(`voyage map ${map.id}: package ${res.status}`);
      setRemotePackage((await res.json()) as CoastPackage);
    }
    // The boats first: every vessel type is built from her recipe (modular boats M6a).
    await import('./boats/library');
    const { REGIONS } = await import('./world/regions');
    if (REGIONS.some((r) => r.coast)) {
      say('Loading the coast...');
      const { loadCoastTerrains } = await import('./world/coastRegion');
      await loadCoastTerrains(REGIONS, base);
      // A chunked region: its detailed ground round the start berth before the boat is put there.
      const chunked = REGIONS.filter((r) => r.coast?.pkg.terrain.chunked);
      if (chunked.length) {
        const { startCoastStreaming } = await import('./world/coastStream');
        const streamer = startCoastStreaming(base, (id) => REGIONS.find((r) => r.id === id)!.coast!.pkg.terrain.dir);
        // (Or round where you were last time on this map: app/voyagePlace.ts.)
        const { savedPlace } = await import('./app/voyagePlace');
        const remembered = map && !new URLSearchParams(location.search).has('start') ? savedPlace(map.id) : null;
        const berth = remembered ?? chunked.flatMap((r) => r.berths).find((b) => b.id === map?.startBerth) ?? chunked[0].ports[0];
        if (berth) await streamer.preload([{ x: berth.x, z: berth.z }]);
      }
    }
  } finally {
    note.remove();
  }
  const { App } = await import('./app/App');
  const app = new App(document.body);
  app.start();
  // Handy for poking at state from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { app: typeof app }).app = app;
}
void main();
