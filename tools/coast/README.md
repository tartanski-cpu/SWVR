# Coast pipeline

Offline tooling: real coastline regions for Workboat World from open geographic data. Not part of the game build. The plan and decisions are in [`docs/COAST_PIPELINE.md`](../../docs/COAST_PIPELINE.md).

```
cd tools/coast
npm install                 # its own tools (geotiff, delaunator, js-yaml), not the game's
node src/fetch.ts oban      # 1. download into data/raw/oban/ (cached; --force to fetch again)
node src/reconcile.ts oban  # 2-3. project onto a 10 m grid; coast, land and sea made to agree
node src/nav.ts oban        # 6. seamarks, lights, rocks and skerries, farms, race zones -> nav.json
node src/harbours.ts oban   # 7-8. harbour kit, berths, spine roles, buildings -> harbours.json
node src/mesh.ts oban       # 4-5. low-poly mesh in a triangle budget, coloured, chunked (last: it carves the harbours' basins)
```

`npm run build` runs them all in that order. Hand edits to the harbours go in `requests/<id>.edits.yaml` (see the file for the syntax); they are applied every run, so re-running never loses them.

A region is asked for in `requests/<id>.yaml`. The product goes to `public/regions/<id>/` (`region.json`, `terrain.bin`, `nav.json`, `harbours.json`, `report.json`, `sources.yaml`), where the coast viewer (`coast.html`, code in `viewer/`) and later the game read it. `data/` (downloads and work files) is not committed: re-run the stages to rebuild it.

Needs Node 22 (it runs the TypeScript directly) and internet access for stage 1. From the cloud environment the public Overpass servers and Geofabrik are blocked, so OpenStreetMap comes from its main API in small tiles.

**Licences.** Region data derived from OpenStreetMap is under the Open Database License (ODbL) 1.0: attribution in the game's credits, and the region files shared alike if published. Copernicus DEM, EMODnet and ESA WorldCover (CC BY 4.0) need attribution too. Each region's `sources.yaml` records what was used and when; `region.json` carries the credits line.
