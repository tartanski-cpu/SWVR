// The boats first: every vessel type is built from her recipe (modular boats M6a).
import './boats/library';
import { App } from './app/App';
import { MODE } from './mode';
import { REGIONS } from './world/regions';
import { loadCoastTerrains } from './world/coastRegion';

declare const __CHANNEL__: string | undefined;
// The work-in-progress copy (/SWVR/next/) says so in the browser tab.
const next = typeof __CHANNEL__ === 'string' && __CHANNEL__ === 'next';
document.title = `Workboat World: ${MODE === 'voyage' ? `Voyage${next ? ' (NEXT)' : ''}` : next ? 'NEXT' : 'Career'}`;

// A coast region's ground (real coastline, tools/coast) is a mesh fetched before the world
// is built: everything that reads the ground (physics, drawing, charts) needs it from the start.
async function main(): Promise<void> {
  if (REGIONS.some((r) => r.coast)) {
    const note = document.createElement('div');
    note.textContent = 'Loading the coast...';
    note.style.cssText = 'position:fixed;left:50%;top:45%;transform:translateX(-50%);font:16px system-ui;color:#456';
    document.body.appendChild(note);
    try {
      await loadCoastTerrains(REGIONS, import.meta.env.BASE_URL);
    } finally {
      note.remove();
    }
  }
  const app = new App(document.body);
  app.start();
  // Handy for poking at state from the browser console during development.
  if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
}
void main();
