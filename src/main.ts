import { App } from './app/App';

const app = new App(document.body);
app.start();

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { app: App }).app = app;
