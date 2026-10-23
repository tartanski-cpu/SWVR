/**
 * The fast rescue boat's recipe (owner, Oct 2026; her hull: ribHull.ts). Built here rather
 * than kept as JSON because her outboard's settings are worked out from the main boats'
 * outboard's (CONFIG.vessels.rib.motor over CONFIG.modules.outboard).
 *
 *   tubes      her orange tubes (CONFIG.modules.tubes.rib)
 *   console    the centre console and the leaning post (deck.rib-console)
 *   helm       on the console's top: a small dash with the speed and rev screens, the wheel
 *              on its aft face, the throttle to starboard, the key and START to port
 *   outboards  one 150 hp outboard (propulsion.outboard, one unit), her tank and battery
 *              in the console; her bow and stern cleats, as the skiff's
 */
import { CONFIG } from '../config';
import { ribOutboard } from './ribHull';

const ENGINE = 0x5cc46c;

export const RIB_RECIPE = {
  id: 'vessel.rib',
  version: 1,
  name: 'Rescue boat',
  hull: 'hull.rib-6',
  modules: [
    { socket: 'tubes', module: 'hull.tubes', config: CONFIG.modules.tubes.rib },
    { socket: 'console', module: 'deck.rib-console' },
    {
      socket: 'helm',
      module: 'console.standard',
      config: {
        instrumentsAmps: 1,
        dash: { front: -0.6, aft: -0.36, bottom: 0, top: 0.2, halfWidth: 0.34 },
        leanDeg: 25,
        pedestals: { x: [], halfWidth: 0.1, front: 0, aft: 0.1, floor: -1 },
        groups: [{ title: 'ENGINE', x: [-0.34, -0.02], color: ENGINE }],
        plates: { front: -0.3, aft: -0.04 },
        slots: {
          wheel: { position: [0, -0.16, 0.06], rotationDeg: [-35, 0, 0] },
          throttle: { position: [0.24, 0.01, -0.14] },
          key: { position: [-0.28, 0.01, -0.18] },
          start: { position: [-0.14, 0.01, -0.18] },
          speed: { position: [-0.15, 0.1, -0.35] },
          rpm: { position: [0.15, 0.1, -0.35] },
        },
      },
      modules: [
        { socket: 'wheel', module: 'control.wheel' },
        { socket: 'throttle', module: 'control.throttle-lever' },
        { socket: 'key', module: 'control.key-switch' },
        { socket: 'start', module: 'control.push-button', config: { label: 'START (hold)', engrave: 'START', color: '#3aa04a', lit: { key: 'propulsion.state', is: 'running' } }, bind: { press: 'ignition.start' } },
        { socket: 'speed', module: 'instrument.screen', config: { screen: 'speed' } },
        { socket: 'rpm', module: 'instrument.screen', config: { screen: 'rpm' } },
      ],
    },
    { socket: 'outboards', module: 'propulsion.outboard', config: ribOutboard() },
    { socket: 'fuelTank', module: 'fuel.tank', config: { tankL: CONFIG.vessels.rib.motor.tankL, startL: Math.round(CONFIG.vessels.rib.motor.tankL * 0.75) } },
    { socket: 'batteries', module: 'electrical.battery-bank' },
    { socket: 'bowCleat', module: 'deck.boat-cleat', config: { end: 'bow', inshore: CONFIG.vessels.rib.cleats.inshore } },
    { socket: 'sternCleat', module: 'deck.boat-cleat', config: { end: 'stern', inshore: CONFIG.vessels.rib.cleats.inshore } },
  ],
};
