# How a city is made

```text
GOAL:    A stranger on r/dataisbeautiful, r/gis, r/proceduralgeneration or r/gamedev sees open
         map data turn into a pixel-art city, layer by layer, believes it is the real pipeline
         (it is), and opens the map.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, H.264 + AAC
TIME:    34 s x 30 = 1020 frames; the bed at 100 BPM, 18 frames a beat, 72 a bar, first beat
         at 0.035 s. Sections of the bed: A 0-9.6 (sparse), B 9.6-19.2 (layers join),
         C 19.2-29.5 (opens wide), D 29.5-36 (settles); peak 28.87.
LOOK:    The site. Ground: the page's fog #e9e6df. Signs: black enamel #15171a, 20 px
         corners, the site's shadow; paper #f4f2ec, paper-dim #b4b1a8. Accent: tinypit's
         #ffd447 (the scan bar, the step numbers, the arrow, "pit", the address).
         Archivo 600 at 56 px for a sign's line, 88 px for the title, -1% tracking; Archivo 500
         at 30 px for the source line. Tiny5 for the numbers and the wordmark.
         Medium: the pipeline's own renderer (ChunkRenderer) on tinypit's real scene, a
         3840 x 2160 plate per layer, shown at 2 map px a pixel down to 1:1; then the real tiles.
OBJECTS: the Point and its fountain, the Allegheny and the Monongahela meeting, the Fort Pitt
         and Fort Duquesne bridges, PNC Park, downtown's towers (PPG Place's dark glass), the
         whole city between its three rivers.
MOTION:  Camera: one push in octaves from 2 to 1 map px a pixel over 0-18.6 s, u = (1 - cos πx²)/2
         (lingers wide while the ground is laid, closes in for the buildings), then dead still at
         1:1 on whole pixels, on Point State Park's trees and Gateway Center's towers. A layer
         arrives by a scan: the accent bar crosses the frame left to right in 12 frames, linear,
         the layer behind it; the bar is mid-frame on the beat. Heights rise in 18 steps of 2 frames (15 fps, ease-out heights): pixels
         do not ease. Signs: steps(3), 6 frames in from 42 px below, 5 out 28 px up.
         Pull-back: the tiles, scale in octaves, cubic in-out, 7.2 s.
SHOTS:   0.00-2.43   HOOK, frame 0 = thumbnail: the opening framing split at x 900, left the
                     data (layer 3, streets on land use on land), right the finished map, the
                     accent bar between. Title sign "Open data [arrow] pixel art", "Pittsburgh,
                     built layer by layer". Click on the cut.
         2.43-4.83   1 Land and water (Overture Maps, from OpenStreetMap). Hard cut on the bar.
         4.83-7.23   2 Parks and land use. Scan + whoosh.
         7.23-9.63   3 Streets and bridges, 70 km of them here. Scan + whoosh.
         9.63-12.03  4 Building footprints, 503 here. Scan + whoosh.
         12.03-14.43 5 Heights: the buildings and the decks rise (18 renders). Whoosh.
                     36% mapped, the rest guessed from size and use.
         14.43-16.83 6 Trees. Scan + whoosh.
         16.83-19.23 7 Windows, roofs, shadows. Scan + whoosh. Arrives at 1:1 at 18.6.
         19.23-26.43 PULL-BACK on the bed's opening: out to the whole city, cut from the tiles.
                     "Exactly the live map, pixel for pixel" 19.83 (verify: 0 of 8,294,400
                     pixels differ; the live tiles are the same files); "All of Pittsburgh:
                     3,606 tiles" 24.03.
                     Whoosh, then a riser.
         26.43-34.0  the whole city, still. 28.83 END CARD on the peak (impact): the tinypit
                     wordmark, "Free to explore in your browser", the address. Bed fades 1.5 s.
BANNED:  a redrawn map; a crossfade between layers; eased signs; a dark void; glow; gradients;
         a docked logo; the address in this folder (it is the `address` variable);
         emojis; everything centred.
QA:      0 split + title readable; 3.5 water only; 6 parks; 8.4 streets and the bridges flat
         across the rivers; 10.8 footprints; 12.5 half-risen; 14 heights; 16 trees; 18.4 windows
         and shadows at 1:1; 19.2/19.27 no jump at the seam; 22 mid pull-back;
         27 whole city; 30 end card with the address.
```
