/**
 * Training mode's settings (docs/TRAINING.md; src/training/): the boat, the limits each
 * exercise judges by, and the faults' weights.
 *
 * Part of CONFIG (src/config.ts joins every area's file into it): read it as CONFIG.training.
 * Speeds are in knots here, as an instructor gives them; the engine turns them into m/s.
 * Each limit says which syllabus item it comes from: the RYA Powerboat Level 2 "can" items
 * and the SBF practical's examiner criteria (DMYV/DSV guideline, Anlage 7). The game is
 * practice modelled on them, never a course or a certificate.
 */

export const TRAINING_CONFIG = {
  training: {
    /**
     * The training boat (owner, 30 Oct 2026): the fishing boat, a single shaft and rudder with
     * a right-handed propeller, so she walks her stern to port going astern (her recipe's
     * propWalkAstern 0.12): what "stop on course" and "turn in a confined space" teach.
     */
    boat: 'fishingBoat',
    /**
     * Two attempts at each exercise, as both schemes give (the SBF: every item twice; the RYA:
     * "failure at the first attempt will not necessarily result in overall failure").
     */
    attempts: 2,
    /** Speed in the harbour (kn): above it a fault. RYA L2 "control speed"; a harbour's usual limit. */
    harbourKn: 4,
    /**
     * A knock on her hull or through her fenders (kn of approach speed at the point that
     * touched, after what the fenders take up): over `faultKn` a fault (weight 2), over
     * `failKn` the run is failed at once (the plan's Examiner's Run: "a knock over 2 kn ends it").
     */
    knock: { faultKn: 1, failKn: 2 },
    /** A fault of the same kind is counted again only after this long (s): one long burst of speed is one fault, not sixty. */
    faultGapS: 10,
    /** She counts as stopped under this speed (kn). */
    stoppedKn: 0.2,
    /**
     * The instructor's lines go out over the VHF, which the page speaks aloud: each waits until
     * the one before has had time to be said, at `voiceCharsPerS` characters a second (about
     * the speech's pace) and a `voicePauseS` breath between.
     */
    voiceCharsPerS: 16,
    voicePauseS: 1,
    /** The weight of each fault (3 fails the run); the total sits under the verdict. */
    weights: { speed: 1, knock: 2, fail: 3 },

    /**
     * H5, stop on course (SBF "kursgerechtes Aufstoppen"; RYA L2 taking way off): down the lane
     * at `speedKn` (counted from `minKn`, held `holdS` s), then on the call, stopped with her
     * heading changed by less than `headingDeg`, inside the lane, the lever back in neutral.
     * The call comes once she is past `callX` (m east, the lane's middle).
     */
    stop: { speedKn: 4, minKn: 3.5, holdS: 3, callX: -40, headingDeg: 15 },
    /**
     * H6, turn in the dock (RYA L2 turning in a confined area; SBF "Wenden auf engem Raum"):
     * through 180° to within `headingDeg` of the way out, under `speedKn`, never out past the
     * dock's mouth. The wind on her bow: `windKn` from `windFrom` (deg).
     */
    turn: { headingDeg: 10, speedKn: 3, windKn: 8, windFrom: 270 },
    /**
     * H8, alongside with the wind off the quay (RYA L2 speed and angle of approach; SBF
     * "Anlegen": rudder and engine only, stopped at the berth out of gear): her speed one of her
     * lengths off under `approachKn`; her angle to the quay at first touch under `angleDeg`
     * (the RYA's 30 to 45°, coming in); the knock under `knockKn`; the lever in neutral when the
     * first line goes ashore. The wind: `windKn` from `windFrom` (deg: off the quay).
     */
    alongside: { approachKn: 1.5, angleDeg: 45, knockKn: 0.5, windKn: 8, windFrom: 180 },
    /**
     * H10, leaving ahead and astern (RYA L2 leave ahead or astern; SBF "Ablegen"): free of the
     * slot without touching, `clearLengths` of her lengths off the quay face. The wind: light,
     * `windKn` from `windFrom` (deg).
     */
    leave: { clearLengths: 2, windKn: 5, windFrom: 160 },
    /** H4, first cast-off: a gentle breeze, `windKn` from `windFrom` (deg). */
    castOff: { windKn: 6, windFrom: 200 },
  },
};
