/**
 * Twin engines worked separately are heard separately (owner, Oct 2026: "one of the engines
 * doesn't have sounds ... the key on and start button, it doesn't make any sounds. And then
 * when you throttle up or down one of the engines, it doesn't make any sounds"): the second
 * engine sound follows the starboard engine (EngineState.stbd), not the port one's.
 */
import { afterAll, expect, it } from 'vitest';
import { EngineAudio } from '../src/audio/engineAudio';
import { useDesign } from '../src/boats/sims';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { starboardEngine } from '../src/vessel/physics/propulsion';

afterAll(() => useDesign(DEFAULT_DESIGN));

it('each sound of a twin worked separately follows its own engine', () => {
  const CAT = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
  useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[CAT].defaults, hull: CAT });
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  const heard: { rpm: number; running: boolean; cranking: boolean }[][] = [[], []];
  const fake = (k: number) => ({ set: (e: { rpm: number; running: boolean; cranking: boolean }) => heard[k].push(e), dispose() {} });
  const audio = new EngineAudio() as unknown as { ctx: unknown; sound: unknown; sound2: unknown; built: string; update: EngineAudio['update'] };
  audio.ctx = { currentTime: 0 };
  (audio as unknown as { building: boolean }).building = true; // no real sounds built here
  audio.sound = fake(0);
  audio.sound2 = fake(1);
  audio.update(v, 2); // learns her voice and that she's a twin
  audio.built = (audio as unknown as { wantedKey: string }).wantedKey;
  // Port running at 1200 rpm, starboard cranking.
  v.engine.phase = 'running';
  v.engine.rpm = 1200;
  const s = (v.engine.stbd ??= starboardEngine(v.engine));
  s.phase = 'cranking';
  s.rpm = 150;
  audio.update(v, 2);
  const [port, stbd] = [heard[0].at(-1)!, heard[1].at(-1)!];
  expect(port).toMatchObject({ running: true, cranking: false, rpm: 1200 });
  expect(stbd).toMatchObject({ running: false, cranking: true });
  expect(stbd.rpm).toBeCloseTo(150, 0);
});
