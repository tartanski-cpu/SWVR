# Testing a new boat: the sea-trials lab

The project has a small test tank built in. You give a vessel definition (hull stations, mass, CG, machinery). Then you get:

1. **Hydrostatics** from the same station polygons the game floats.
   - Upright particulars: displacement, draft, LCB/LCF, Awp, wetted surface, KB, BMt, KMt, KG, GMt.
   - A **GZ curve** at fixed trim with free sinkage, plus maximum GZ and the angle of vanishing stability.
2. **Free-decay "inclining-style" experiments** in calm water, run on the live simulation.
   - Heave, pitch and roll natural periods.
   - Roll decay from 10° and the damping ratio from the logarithmic decrement.
   - A dynamic **inclining test**: a known heeling moment is applied, the heel is read off, and GM is back-calculated.
3. **Sea trials** in calm water, on the live simulation with the same intents a player sends.
   - Speed against lever setting and RPM, plus time to 90 % of top speed.
   - Turning circle: advance, transfer, tactical and steady diameter, speed loss.
   - Crash stop, coast-down and astern speed.

The tests cross-check the model. **GM is computed three independent ways** (KB + BM − KG, small-angle GZ, and the dynamic inclining test), and the three must agree. If they don't, the dynamics and the hydrostatics have drifted apart.

## Run it

```bash
npm run trials                    # every vessel type
VESSEL=workboat npm run trials    # one vessel (Windows PowerShell: $env:VESSEL="workboat"; npm run trials)
```

You can also run it in the game: press **T** to show the same report for the boat in the scene, and **L** to toggle flat calm / moderate sea. **R** drops the boat from 4 m and **K** heels her 20° and lets go. **V** shows the stations, the per-station buoyancy arrows and the CG.

## Add a new boat

1. **Copy the config block.** In `src/config.ts`, duplicate `vessels.workboat` as, for example, `vessels.pilot`.
   - The structure is the type `VesselConfig`, so TypeScript tells you if anything is missing.
2. **Shape the hull** in `hull`: length, beams at deck and chine, keel depth, chine and sheer heights fore and aft, and the number of stations.
   - The section shape is generated in `src/vessel/hullForm.ts`. Each station is a 5-point hard-chine polygon: port deck, port chine, keel, starboard chine, starboard deck.
   - For a different family of hull, write another generator that returns the same `HullForm` (stations with polygons). Everything downstream works unchanged, so a round-bilge or catamaran section is just a different polygon list.
3. **Register it.** Add one line to `VESSEL_DEFS` in `src/vessel/vesselDef.ts`:
   ```ts
   pilot: fromConfig('pilot', CONFIG.vessels.pilot),
   ```
4. **Make her float on her lines.** Run `VESSEL=pilot npm run trials`. Then:
   - Set `mass` to the reported displacement at your intended DWL.
   - Set `cg[2]` (LCG) to the reported LCB. The report flags `LCG-LCB` if she will trim.
   - Set `cg[1]` (VCG, relative to the DWL) for the GM you want.
5. **Tune motions and handling** with the report:
   - Roll damping: `damping.roll`, aiming for about 5–15 % of critical for a hull without bilge keels.
   - Radii of gyration: `gyradius`.
   - Added mass: `addedMass`.
   - Resistance curve: `resistance`. The `waveB`/`waveKnee` pair sets where the "hull speed wall" is.
   - Propeller: `propeller.kt0` sets bollard pull, and `j0` is roughly the pitch ratio.
   - Rudder: `rudder.area`, `liftSlope`, `washMaxFraction`.
   - Hull lift: `damping.lateralLift`, which mostly sets the turning diameter.
6. **Look at her in the game.** Set `testScene.vesselDefId: 'pilot'` in `src/config.ts`, then `npm run dev`.

The assertions in `tests/seaTrials.test.ts` are broad "sensible 12 m displacement workboat" ranges. For a very different boat (a fast RIB or a 30 m tug), adjust or parameterise them. The printed report is the real output.

## What the model is (and isn't)

- **Hydrostatics:** strip method on the stations. Each tick, each station's polygon is clipped at the local wave surface, sampled at port chine, centreline and starboard chine. That gives Froude–Krylov at the hydrostatic level in waves.
- **Hydrodynamics:** frequency-independent added mass per axis, scaled by immersion. Vertical damping is linear plus a quadratic water-entry term. Hull lift is linear in U·v per station, with crossflow drag quadratic. All of it uses velocity **relative to the wave orbital velocity**.
- **Resistance:** ITTC-57 friction with a form factor, plus an empirical Fn wave term. It is not a Holtrop–Mennen regression.
- **Propeller and rudder:** linearised K_T(J) ahead and astern. The rudder uses a normal-force model in hull flow plus a momentum-theory slipstream, capped at a fraction of thrust.
- **Not modelled:** radiation and diffraction memory effects, planing or dynamic lift, propeller torque and engine power limits (the engine is RPM-governed), prop walk, wind, shallow water, and slamming beyond the water-entry drag term.
