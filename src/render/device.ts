/**
 * What the game is running on, for detail that a desktop graphics card can afford and a
 * standalone headset can't (the trees' reach, world/view/treesView.ts). A standalone headset
 * (Meta Quest, Pico, any Android browser) renders on the headset's own phone-class chip; a
 * desktop browser, in VR through a cable or Air Link too, renders on the PC's graphics card.
 * Judged from the browser's user-agent string, which names the Quest's browser.
 */
export function isStandaloneHeadset(ua: string = globalThis.navigator?.userAgent ?? ''): boolean {
  return /OculusBrowser|Quest|Pico|Android|Mobile VR/i.test(ua);
}
