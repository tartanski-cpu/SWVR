import { AlarmAudio } from '../audio/alarmAudio';
import { AnchorAudio } from '../audio/anchorAudio';
import { watchVoices } from '../audio/babble';
import { ContactAudio } from '../audio/contactAudio';
import { ElectricMotorAudio } from '../audio/electricMotorAudio';
import { EngineAudio } from '../audio/engineAudio';
import { FireAudio } from '../audio/fireAudio';
import { HandsetAudio } from '../audio/handsetAudio';
import { HornAudio } from '../audio/hornAudio';
import { HydraulicsAudio } from '../audio/hydraulicsAudio';
import { PaperAudio } from '../audio/paperAudio';
import { RadioAudio } from '../audio/radioAudio';
import { RescueSounds } from '../audio/rescueSounds';
import { ShipHorn } from '../audio/shipHorn';
import { WaterAudio } from '../audio/waterAudio';
import { WhistleAudio } from '../audio/whistleAudio';
import { FmRadio } from '../audio/fmRadio';
import { WildlifeAudio } from '../audio/wildlifeAudio';
import { WindAudio } from '../audio/windAudio';
import { RaceAudio } from '../audio/raceAudio';
import { SurfAudio } from '../audio/surfAudio';
import { BoatVoices } from '../audio/boatVoices';
import { PlantAudio } from '../audio/plantAudio';

/**
 * The game's sound systems in one place (split out of App). Each makes its own sounds; the
 * engine's owns the shared AudioContext, which a browser only allows after a user gesture,
 * so `unlock()` (first click, key press, or entering VR) starts it and hands it to the rest.
 * Volumes go through the mixer (audio/mixer.ts); App feeds each one every frame.
 */
export class SoundBoard {
  /** The diesel (and the shared AudioContext). */
  readonly engine = new EngineAudio();
  /** A tender's engine (the rescue boat's outboard: your own boat's engine is `engine`). */
  readonly tenderEngine = new EngineAudio();
  /** The electric horn and the console alarm. */
  readonly horn = new HornAudio();
  readonly alarm = new AlarmAudio();
  /** Hull contact (bumps and grinding), water past the hull and bow slams, splashes. */
  readonly contact = new ContactAudio();
  readonly water = new WaterAudio();
  /** The VHF (voice and squelch) and the survivors' whistle. */
  readonly radio = new RadioAudio();
  readonly whistle = new WhistleAudio();
  /** Your handheld VHF's talk button (player/radioHandset.ts). */
  readonly handset = new HandsetAudio();
  /** Rescue cues: shouts, the cheer, the tick when a duty's done. */
  readonly rescue = new RescueSounds();
  /** The skiff's electric outboard. */
  readonly motor = new ElectricMotorAudio();
  /** Wind in the rigging, rain on the roof, thunder. */
  readonly wind = new WindAudio();
  /** The chart table: pencil, paper, dividers. */
  readonly paper = new PaperAudio();
  /** Passing ships' horns. */
  readonly shipHorn = new ShipHorn();
  /** A fire's roar and the monitor's jet; the anchor chain; birds and seals. */
  readonly fire = new FireAudio();
  readonly anchor = new AnchorAudio();
  /** The deck hydraulics: tender crane, tow winch, net drum. */
  readonly hydraulics = new HydraulicsAudio();
  readonly wildlife = new WildlifeAudio();
  /** The FM set's stream, from the set under the wheelhouse roof. */
  readonly fm = new FmRadio();
  /** A tidal race's roar (regions). */
  readonly race = new RaceAudio();
  /** Surf on the shore, with your engine off (world/surf.ts). */
  readonly surf = new SurfAudio();
  /** The other players' boats: their engines, the rush of water and their horns, in 3D. */
  readonly boats = new BoatVoices();
  /** The harbour tug's engine room machinery: generator, fans, compressor, starting air (audio/plantAudio.ts). */
  readonly plant = new PlantAudio();

  /** On a user gesture: start audio (again harmless). */
  unlock(): void {
    this.engine.unlock();
    const ctx = this.engine.context;
    this.tenderEngine.attach(ctx);
    for (const s of [this.horn, this.alarm, this.contact, this.water, this.radio, this.whistle, this.handset, this.shipHorn, this.rescue, this.motor, this.wind, this.paper, this.fire, this.anchor, this.hydraulics, this.wildlife, this.fm, this.race, this.surf, this.boats, this.plant]) s.attach(ctx);
    watchVoices();
  }
}
