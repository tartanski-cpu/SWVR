// The boats first: every vessel type is built from her recipe (modular boats M6a).
import './boats/library';
import { App } from './app/App';

declare const __CHANNEL__: string | undefined;
// The work-in-progress copy (/SWVR/next/) says so in the browser tab.
if (typeof __CHANNEL__ === 'string' && __CHANNEL__ === 'next') document.title = 'Workboat World: NEXT';

const app = new App(document.body);
app.start();

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
