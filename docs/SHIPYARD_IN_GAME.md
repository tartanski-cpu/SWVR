# The Shipyard inside the game: feasibility and a plan

Owner, 24 Oct 2026: "is it possible to render the whole shipyard web page in the 3D environment so that you can actually create and upgrade ships using the same shipyard app instead of using a separate menu? Not too sure if the resolution would be high enough, but assess the feasibility of that and come up with a plan." Also: "you can drop the multiplayer on the shipyard page if it's used in this way."

This is a plan only; nothing is built. The Shipyard's own files (`src/shipyard/`, `shipyard.html`) are the Shipyard chat's. The game's side (the shed door, the handoff, the career's money) is the main game chat's.

## What the Shipyard page is

A full desktop web page: about 4,000 lines of page code, 31 sliders, drop-downs and text boxes, picture tiles, charts, its own 3D view of the boat with handles you drag, and a background worker running the sea trials. It's built from the browser's own page elements (HTML), with one WebGL canvas for the 3D view.

## Can the page itself be drawn in VR?

**Not as the live page.** Three things stand in the way:

1. **A browser won't draw a web page into a 3D scene.** WebGL can only draw pictures and canvases. For privacy reasons, no browser lets a page turn its own live HTML into a texture.
   - The WebXR "DOM overlay" that does put HTML in front of you only exists for phone AR, not for a headset in VR.
   - The Quest's sharp "layers" (compositor layers) still need a picture we draw ourselves.
2. **Copying the page into a picture** (libraries such as html2canvas re-create the page's layout in a canvas) is slow and only approximate:
   - hundreds of milliseconds a copy, far too slow at 90 Hz;
   - it misses the 3D view and the charts;
   - nothing in the copy can be clicked. Every slider, drop-down and text box would need re-making by hand to work by laser pointer.
3. **Resolution.** The Quest 3 shows about 25 pixels per degree.
   - The page is laid out for a screen about 1,600 pixels wide. Shown as a big panel 60° across (1.2 m wide at 1 m), that's one page pixel per headset pixel.
   - Its 12-14 px text would be about half a degree tall: at the edge of legible, and blurred by the lenses unless drawn on a compositor layer.
   - It could be read on a cinema-sized screen, but fine work (the handles, the small figures) would be hard going.

So "the whole page in the 3D world" is not worth building. There are two good ways to get what you're after.

## Option A: walk into the shed, the Shipyard opens as a flat window (recommended first)

The Quest Browser already shows any web page crisply as a flat window, at full resolution, worked with the controller's pointer. The game already hands you between pages and back: the timber run does it. So:

1. **In the game:** a door or board on the boatyard shed, **Open the Shipyard**. In the career these are the yards at Calder Haven and Loch Tarsk; in Voyage, a yard building at a harbour (one per map, placed with the Map chat).
2. **Leaving:**
   - The game saves (the career as ever; Voyage its place, and its session money, carried in the handoff since Voyage doesn't keep money).
   - You come out of VR, and the Shipyard opens in the Quest's window, **on your own boat's design**, in a refit mode.
3. **In the Shipyard, refit mode:**
   - The same app, on its own: no shared multiplayer session (per the owner).
   - It shows your money, and the price of what you change (the new design's price less your boat's, plus a yard fee, to be agreed).
   - The gear the career yard sells now (radar, AIS, bigger tank, towing post, trawl gear, skiff and so on) becomes choices in the Shipyard, priced the same.
   - A new boat can be designed and bought too, if you have the money (trade-in to be agreed).
4. **Back to sea:**
   - **Back to the boat** returns you to the game with the new design.
   - The career pays for the refit; Voyage pays from the session's money.
   - She lies at the yard's berth. You press Enter VR to go back in. The Quest only re-enters VR by itself between two VR pages, and the Shipyard isn't one.
5. **Playing together:** as with the timber run, only when you're alone, or hosting with no crew aboard. A crew can't wait in the game while their host is in the Shipyard.

**What it reuses:**
- the timber handoff (`voyage/metaverse.ts`, `voyagePlace.ts`);
- the design code a boat already starts from (`?design=`);
- the Shipyard as it is, plus a refit mode.

**Cost:** about one change set for the game side, and one or two for the Shipyard's refit mode and its prices.

**To check first:** that the Shipyard page runs smoothly in the Quest Browser itself (its 3D view and trial worker). Desktop is known; the headset isn't yet.

## Option B: a Shipyard built in the 3D world (later, if wanted)

The same Shipyard logic (`design.ts`, `build.ts`, `trial.ts`, the parts), with a new front end made for VR:

- your boat on the slip in the shed at full size, to walk round;
- the handles grabbed by hand on the real hull;
- big panels for the choices, drawn the way the game's menu and the yard board are.

**Upsides:** it's the best fit for VR, and you never leave the game, so the crew can stay aboard.

**Downsides:** it's a second front end for the Shipyard, about as big a job as the page was. It would come in stages, starting with refits on the slip. It's also heavier on the Quest: a full-size editable boat in the shed while the harbour is drawn.

## Recommendation

**A first.** It gives you the real Shipyard, sharp and complete, from inside the game, soon. It also replaces the yard board and the menu chandlery (one place for boats).

Later, B for the parts that are better at full size. A's refit mode and its prices carry straight over.

## Questions for the owner

1. **Refit prices:** the difference in price between the old design and the new, plus a fee? Or a fixed price per change?
2. **A new boat:** can a career buy a whole new boat at the yard, and does the old one trade in?
3. **Voyage:** a shipyard building on each map? And is Voyage's session money spent there? It isn't saved, so it's carried to the Shipyard and back.
4. **The yard boards in the career** (Calder Haven, Loch Tarsk): replaced by the door into the Shipyard, or kept for quick buys alongside it?
