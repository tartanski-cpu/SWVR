/**
 * A clock for a hidden host page (App.onVisibility): a background tab's own timers are slowed
 * to about once a second (Chrome, the Quest Browser), so the crew saw its world move one step a
 * second (owner, 26 Oct 2026: "like 1 frame per second" aboard a desktop host's tug). A
 * worker's timers aren't slowed that way: this one ticks the page at the rate it's asked for.
 */
let timer: ReturnType<typeof setInterval> | null = null;
self.onmessage = (e: MessageEvent<number>) => {
  if (timer) clearInterval(timer);
  timer = e.data > 0 ? setInterval(() => self.postMessage(0), e.data) : null;
};
