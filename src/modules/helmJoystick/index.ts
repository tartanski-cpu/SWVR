/**
 * Module control.helm-joystick (owner, Oct 2026: "press a button and it goes on to vector
 * mode... undock the ship by simply pressing left on the joystick"): the pod drives' helm
 * joystick and its JOYSTICK button, side by side on the console.
 *
 *   JOYSTICK   (a push button, lit while it's on) hands the pods to the stick, or back to the
 *              wheel and throttle ('pods.joystickMode'). It only holds with the throttle in
 *              neutral: moving the throttle hands them back (modules/pods).
 *   the stick  (controls/HelmJoystick.ts) sideways, fore and aft and twisted, each -1..1,
 *              0 when let go ('joystick.x', 'joystick.y', 'joystick.twist'). Desktop: click it,
 *              then W A S D and Q / E; Space presses JOYSTICK.
 *
 * Draw calls: the stick's base is merged with the boat's fixed parts; its moving parts are a
 * handful of meshes; the button cap is the boat's shared button caps.
 */
import { Button } from '../../controls/Button';
import { CONFIG } from '../../config';
import { HelmJoystick, TwistKey } from '../../controls/HelmJoystick';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface HelmJoystickConfig {
  label: string;
  /** Where the JOYSTICK button is from the stick (m, the console's axes: x to starboard, z aft). */
  button: [number, number];
}

export const HELM_JOYSTICK: ModuleDefinition<HelmJoystickConfig> = {
  id: 'control.helm-joystick',
  version: 1,
  fits: ['panel.slot'],
  defaults: { label: 'Helm joystick: lean it to crab or creep, twist it to turn', button: CONFIG.shipyard.helm.podJoystick.button },
  ports: {
    x: { dir: 'write', key: 'joystick.x' },
    y: { dir: 'write', key: 'joystick.y' },
    r: { dir: 'write', key: 'joystick.twist' },
    mode: { dir: 'write', key: 'pods.joystickMode' },
  },
  view: {
    build({ config, keys, socket, share }) {
      const stick = new HelmJoystick(socket.id, { x: keys.x, y: keys.y, r: keys.r }, config.label, (s) => {
        const bus = busOf(s);
        return { x: bus.num(keys.x), y: bus.num(keys.y), r: bus.num(keys.r) };
      });
      const button = new Button(`${socket.id}Mode`, keys.mode, 'JOYSTICK: hand the pods to the joystick (throttle in neutral), or back to the wheel', 'pulse', 0x2f6fd0, (s) => !!busOf(s).get('pods.joystick'));
      button.root.position.set(config.button[0], 0, config.button[1]);
      share(button.cap, 'buttonCap');
      stick.keyExtras = [
        { code: 'KeyQ', key: 'Q', does: 'twist anticlockwise', target: new TwistKey(stick, -1) },
        { code: 'KeyE', key: 'E', does: 'twist clockwise', target: new TwistKey(stick, 1) },
        { code: 'Space', key: 'Space', does: 'JOYSTICK on / off', target: button },
      ];
      return {
        staticParts: [],
        movingParts: [],
        controls: [stick, button],
        labels: [{ text: 'JOYSTICK', at: [config.button[0], 0, config.button[1] + 0.045] }],
        update: () => {},
      };
    },
  },
};
