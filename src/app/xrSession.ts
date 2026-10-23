import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from '../config';

/**
 * WebXR setup: 'local-floor' space, framebuffer scale, the Enter VR button (and straight into
 * VR when the browser carries a session over from the page before), and on session start
 * foveation plus the preferred refresh rate (Quest 3: 72 / 90 / 120 Hz).
 */
export function setupXR(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
  const xr = renderer.xr;
  xr.enabled = true;
  xr.setReferenceSpaceType('local-floor');
  // Must be set before the session starts; it can't change mid-session.
  xr.setFramebufferScaleFactor(CONFIG.xr.framebufferScale);
  const button = VRButton.createButton(renderer);
  document.body.appendChild(button);
  // Back in VR without a press, coming from another page that was in VR (the timber camp,
  // voyage/metaverse.ts), where the browser hands the session across (WebXR navigation: a
  // `sessiongranted` event). The button presses itself if that came before it was made; this
  // catches one that comes after. A moment's wait first, so the two never both press it (a
  // second press would end the session the first one started).
  navigator.xr?.addEventListener('sessiongranted', () => {
    setTimeout(() => {
      if (!xr.isPresenting && !xr.getSession()) button.click();
    }, CONFIG.xr.grantedEnterDelayMs);
  });

  xr.addEventListener('sessionstart', () => {
    xr.setFoveation(CONFIG.xr.foveation);
    const session = xr.getSession() as (XRSession & {
      supportedFrameRates?: Float32Array;
      updateTargetFrameRate?: (rate: number) => Promise<void>;
    }) | null;
    const rates = session?.supportedFrameRates;
    if (rates && session?.updateTargetFrameRate && Array.from(rates).includes(CONFIG.xr.targetFrameRate)) {
      session.updateTargetFrameRate(CONFIG.xr.targetFrameRate).catch(() => {});
    }
    // The headset now owns the camera pose relative to the rig.
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
  });
}

/** One-line description of the running XR session for the debug overlay. */
export function xrSessionInfo(renderer: THREE.WebGLRenderer): string {
  const xr = renderer.xr;
  const session = xr.getSession() as (XRSession & { frameRate?: number }) | null;
  if (!session) return 'presenting';
  // three.js uses a projection layer where WebXR Layers exist (Quest), else an XRWebGLLayer.
  const layer = xr.getBaseLayer() as unknown as { textureWidth?: number; textureHeight?: number; framebufferWidth?: number; framebufferHeight?: number } | null;
  const w = layer?.textureWidth ?? layer?.framebufferWidth;
  const h = layer?.textureHeight ?? layer?.framebufferHeight;
  const res = w && h ? `${w}x${h}` : '?';
  const hz = session.frameRate ? ` ${Math.round(session.frameRate)} Hz` : '';
  return `presenting ${res}${hz}  fov ${CONFIG.xr.foveation}  scale ${CONFIG.xr.framebufferScale}`;
}
