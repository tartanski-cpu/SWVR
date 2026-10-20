# Coast pipeline: real coastline regions from open data

Status: **milestone 1 done (Oct 2026), awaiting the owner's look.** The running record is PROGRESS.md "Real coastline regions".

The owner's brief, in short: generate playable regions of real coastline in the game's flat-shaded low-poly style from open geographic data, fast; the data designs the place and the work moves to cleaning and styling it. Offline processing only: the game never calls the data servers. The product is region files plus a standalone viewer to judge them.

## Decisions (agreed with the owner)

- **Where it lives:** in this repository under `tools/coast/` (the owner's choice over a separate repository), with its own `package.json` and tools, so the game's dependencies don't change. Its viewer is a page of the site, `coast.html` (code in `tools/coast/viewer/`), like the Shipyard and the hull study.
- **The core is read-only to the pipeline.** The game gets two small, general changes in milestone 4, agreed: a region may carry a height grid (physics, drawing and charts read it), and a credits entry for the open data.
- **The first region is Oban and its approaches** (owner's picture): Kerrera and its sound, Oban Bay, Dunollie, Ganavan, Dunstaffnage and Connel, about 11.7 x 11.1 km at **full scale**. In the game it **replaces the hand-built Sounds behind a debug toggle** to begin with.
- **Training mode is skipped for now** (it doesn't exist yet).
- **Data in practice:** OpenStreetMap from its main API in 0.05 degree tiles (Overpass and Geofabrik are blocked from the cloud environment); Copernicus GLO-30 and ESA WorldCover read as windows of their cloud GeoTIFFs; EMODnet from its coverage service. Norway's Kartverket depths when a Norwegian region comes.
- **Projection:** a local equirectangular grid in metres about the box's centre (x east, z south, the game's axes); a few centimetres of error over a 12 km box.

## The stages

1. **Fetch** (`src/fetch.ts`): downloads, cached under `data/raw/<id>/`; `sources.yaml`.
2. **Project and reconcile** (`src/reconcile.ts`): a 10 m grid. OpenStreetMap's coastline decides land and sea (its ways have land on the left: each segment seeds the cells beside it, each patch the coast encloses takes the side most seeds say, so a coast running off the box needs no closing). Land keeps the DEM's height, lifted a little at the shore (within 40 m) so the DEM can't smear it into the sea; cliffs stay (high ground is never lowered). The sea is always under water: a procedural shelf near the shore (the 115 m bathymetry misses the shallows) blending into the bathymetry over 300 m.
3. **Mesh and style** (`src/mesh.ts`): greedy-insertion triangulation (start from the coastline resampled every 20 m and the box's edges; add each triangle's worst-fitting cell; repeat to a triangle budget). Error counts on land, half in the shallows, not at all in deep water (opaque sea). Faces wholly below 3 m depth are dropped. Colours per face from WorldCover through the region theme (`src/themes.ts`): steep faces rock, low gentle ground by the water sand, open grassland shading to heather moor with height. 2 km chunks.

## Milestones (the owner's)

1. **Pipeline skeleton and the first box** (done): fetch, project, reconcile, mesh, colour; the viewer.
2. **Navigation and hazards:** seamarks to buoys, lights with characteristics, charted rocks and wrecks, the hand-placed race zone (the Falls of Lora at Connel is in the request).
3. **Harbours and buildings:** harbour kit from OSM outlines, spine roles, building blocks near harbours, the hand-edit overlay.
4. **Package and load in the game:** the height-grid region and credits in the game, distant chunks coarser, the budget report failing the build, sail in from home (the Sounds' toggle).
5. **Second and third regions:** a Norwegian fjord (Kartverket depths); the German training harbour is skipped for now.
