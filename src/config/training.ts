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
     * The recording (training/recording.ts; docs/TRAINING.md section 6): a sample `hz` times a
     * second (her pose, motion, controls, machinery, the trainee), the whole world every
     * `keyframeS` s, a touch noted as an event over `touchKn` (at most every `touchGapS` s).
     * The page keeps the last `keepRuns` runs (runStore.ts), listed `menuRows` at a time in
     * the Training tab's Runs.
     */
    record: { hz: 10, keyframeS: 30, touchKn: 0.25, touchGapS: 1, keepRuns: 40, menuRows: 5 },
    /**
     * The review (training/review.ts): played back `playRates` times real time (the button
     * steps through them), the track coloured from slow to `fastKn` and over.
     */
    review: { playRates: [1, 4, 10], fastKn: 6 },
    /**
     * Badges for a pass (trainingRuns.ts; the plan's "a weighted fault total sits underneath
     * for the badge"): gold with faults weighing `gold` or less, silver up to `silver`, else
     * bronze. Kept per exercise in this browser; they mean nothing in the Career (owner's
     * default, 30 Oct 2026). A course's badge is its worst exercise's, once all have one.
     */
    badges: { gold: 0, silver: 2 },
    /** The Training tab shows this many exercises of a course at a time (a scrolling list). */
    menuRows: 8,

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

    // ── Milestone 3: the rest of Harbour practice, Rescue practice, the Examiner's Run ──

    /**
     * The horn as an examiner hears it (training.ts trackHorn; COLREG rules 34 and 35): a
     * press up to `shortS` s is a short blast, from `prolongedS` s a prolonged one; blasts
     * with gaps under `gapS` s make one signal.
     */
    horn: { shortS: 2, prolongedS: 4, gapS: 2.5 },
    /** H1, start her up: she idles `idleS` s before the shut-down is called. */
    startUp: { idleS: 30 },
    /** H2, fuel her up: the tank starts at `startShare` full, and is full at `fullShare`. */
    fuel: { startShare: 0.35, fullShare: 0.95 },
    /**
     * H7, hold off the mark (RYA L2 holding off): her bow within a length of the mark for
     * `seconds`, off it no more than `excursions` times, never closer than `touchM` m; the
     * wind `windKn` from `windFrom` (deg) setting her off it.
     */
    holdOff: { seconds: 90, excursions: 2, touchM: 1.5, windKn: 10, windFrom: 0 },
    /**
     * H9, alongside with the wind on (SBF: "drifting onto the berth is not allowed"): `windKn`
     * from `windFrom`; in neutral with no helm for more than `driftS` s before the touch is
     * drifting on (a fault). The other limits are H8's (`alongside`).
     */
    windOn: { windKn: 12, windFrom: 0, driftS: 8 },
    /**
     * H11, anchoring (three bottoms): she starts `startM` m short of the anchorage; the wind
     * (kn) on each bottom; way off (under `letGoKn` ahead) and within `headDeg` of head to wind
     * to let go; a scope of at least `minScope`:1 (`weedScope`:1 in weed, which holds poorly);
     * held `holdS` s; dragged past `dragM` m fails; the lever over `overChainLever` ahead with
     * the chain out is motoring hard over it.
     */
    anchor: { startM: 130, windKn: { sand: 10, mud: 12, weed: 18 }, letGoKn: 0.5, headDeg: 30, minScope: 3, weedScope: 5, holdS: 60, dragM: 3, overChainLever: 0.35 },
    /** H12, horn and lights: after sunset (`hour`); a turn of `turnDeg` is an alteration; `asternKn` sternway is going astern. */
    signals: { hour: 20.75, turnDeg: 20, asternKn: 0.3 },
    /** H13, the slalom: under `speedKn`; a mark passed more than `gateM` m off is missed. */
    slalom: { speedKn: 3, gateM: 25 },
    /** H14, springing off: `windKn` from `windFrom` (onto the quay); her stern out `swingDeg` before she backs away. */
    springOff: { windKn: 12, windFrom: 0, swingDeg: 30 },
    /**
     * H15, picking up a mooring: `windKn` from ahead; arriving with the buoy within `atM` m of
     * her bow under `arriveKn`; lying to it `lieS` s; in gear with it within `gearM` m of the
     * bow is a fault (the pennant in the propeller).
     */
    mooring: { windKn: 8, atM: 4, arriveKn: 1, lieS: 20, gearM: 6 },
    /**
     * R1 and R2, man overboard (RYA L2 both methods; SBF: out of gear at once, stern away,
     * stopped by the casualty with the propeller stopped): east at `speedKn` (the skiff at
     * `skiffKn`) with `windKn` from `windFrom`; the casualty `dropOut` m off her port quarter;
     * out of gear within `neutralS` s; her bow turned `awayDeg` toward their side within
     * `awayS` s (her stern away); into wind within `approachDeg`, under `arriveKn`, within a
     * length; drifting down from `driftLengths` lengths upwind, beam on within `beamDeg`; in
     * gear within `guardM` m of them fails the run.
     */
    mob: { speedKn: 6, skiffKn: 3, windKn: 10, windFrom: 0, dropOut: 1.5, neutralS: 3, awayS: 5, awayDeg: 10, approachDeg: 30, arriveKn: 1, driftLengths: [2, 4] as [number, number], beamDeg: 30, guardM: 5 },
    /** R3, the tow: a `kind` (tow/tow.ts) adrift at z `atZ` in `windKn` from the north; up to her within `nearM` m; under `speedKn` towing; a pull over `snatchN` N is a snatch. */
    tow: { kind: 'dory', atZ: -480, windKn: 8, nearM: 40, speedKn: 5, snatchN: 15000 },
    /** R4, the fire: a boat ablaze at `at` (x, z); within `nearM` m to fight it, closer than `tooCloseM` m too close. */
    fire: { at: [60, -260] as [number, number], nearM: 80, tooCloseM: 15 },
    /** R5, fog: a prolonged blast at least every `blastS` s under way, under `speedKn`; out past z `outZ`. */
    fog: { blastS: 120, speedKn: 4, outZ: -150 },
    /** R6, the engine alarm: her coolant starts at `startC` (°C) with the impeller failed; the lever under `easedLever` within `reactS` s of the TEMP alarm. */
    alarm: { startC: 90, easedLever: 0.1, reactS: 20 },
    /**
     * R7, the search: an expanding square from the datum, each leg [course, metres]; the
     * casualty `offset` (x, z m) from the datum (drifting); sighted within `sightM` m; at the
     * datum within `atM` m; a leg steered within `headingDeg` on average.
     */
    search: { legs: [[0, 100], [90, 100], [180, 200], [270, 200], [0, 300], [90, 300]] as [number, number][], offset: [-90, -150] as [number, number], sightM: 60, atM: 25, headingDeg: 15 },
    /**
     * Course 3, Coast practice (M4), outside the breakwater; each start is [x, z, heading].
     *   steer (C1, SBF "Steuern nach Kompass")  up to `speedKn`, then each leg [course, metres]:
     *              within `withinDeg` for `share` of it once she's first on it; the turn begun
     *              (`beganDeg` off the old heading) within `beginS` s of the call, the right way
     *   forMark (C2)  steering for the mark: its bearing within `withinDeg` of her head for
     *              `share` of the way, `settleS` after the call; there within `arriveM`; then on
     *              the leading line (x `lineX`, 180°) north of z `joinZ`, and over the last
     *              `lastM` m to the entrance within `offM` m of it for `share` of the way
     *   fix (C3)   a bearing within `bearingDeg` of the true one (a charted mark or light within
     *              `matchDeg` of it counts as the one meant); the two at least `cutDeg` apart;
     *              the fix within `fixM` m of where she was at the second bearing
     *   fastSlalom (C4)  the RIB above `planeKn` for `share` of the run, each mark passed within
     *              `laneM` m and no closer than `clearM`; under `entranceKn` within `entranceM`
     *              m of the entrance
     *   marks (C5, C7)  inside the wreck's `wreckM` or the rock's `rockM` circle fails; a
     *              cardinal passed within `passM` m is judged on its side
     *   stream (C6)  the line between the marks, from `insideM` m inside each: within `offM` m of
     *              it for `share` of each crossing, at the far end within `arriveM`
     *   night (C7)  the hour it starts
     *   capKn   the speed limit outside (kn)
     */
    coast: {
      capKn: 8,
      windKn: 6,
      windFrom: 220,
      steer: { start: [-150, -900, 90] as [number, number, number], speedKn: 6, legs: [[60, 300], [120, 300], [90, 300]] as [number, number][], withinDeg: 5, share: 0.8, beganDeg: 3, beginS: 10 },
      forMark: { start: [-450, -700, 90] as [number, number, number], mark: 'Datum', withinDeg: 10, share: 0.8, settleS: 10, arriveM: 40, lineX: 0, joinZ: -300, lastM: 200, offM: 5 },
      fix: { start: [-450, -150, 90] as [number, number, number], bearingDeg: 3, matchDeg: 8, cutDeg: 45, fixM: 50 },
      fastSlalom: { start: [-600, -120, 0] as [number, number, number], planeKn: 14, share: 0.8, laneM: 60, clearM: 3, entranceKn: 6, entranceM: 150, capKn: 45 },
      marks: { start: [560, -700, 225] as [number, number, number], nightStart: [600, -560, 250] as [number, number, number], wreckM: 40, rockM: 25, passM: 100 },
      stream: { start: [-790, 150, 90] as [number, number, number], insideM: 20, offM: 10, share: 0.8, arriveM: 10 },
      night: { hour: 23 },
    },
  },
};
