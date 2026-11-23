# Review: How a city is made

## Creative calls

- **Pittsburgh's Point**, not Lower Manhattan: three rivers meeting, two bridges and a park in
  one frame read as a place at a glance, and its scene is small (18 MB) to move to the render
  machine.
- **Frame 0 is a before/after**: the left of the frame is layer 3 (land, land use, streets: a
  map), the right is the finished map, the accent bar between, the title "Open data → pixel
  art" over it. The thumbnail shows the payoff; the film then starts again from bare land.
- **Seven layers, one a bar** of a 100 BPM bed composed to add an instrument a bar, so the
  music is built the way the map is. Each layer comes in behind the accent bar's scan, which
  is mid-frame on the beat; the heights rise in eighteen renders instead (15 fps, ease-out
  heights).
- **The camera lingers wide while the ground is laid** (the whole Point in frame through the
  streets), then closes in on Gateway Center and the Point's park at 1:1, so the trees and
  then the windows read.
- **"Pixel for pixel"** is a measured claim: `made.ts verify` finds 0 of 8,294,400 pixels
  differing between the last layer and the tiles, and the tiles on the live site are the same
  files (the same build id, three tiles compared by hash).
- The pull-back starts on the bed's opening section and the end card lands on its peak.

## Measured

- `npx hyperframes check --json`: ok; no errors in runtime, layout, motion, contrast, craft or
  audio. Lint warnings kept on purpose: `nested_structure_needs_subcomposition` on the end card
  and the credit (the end card reads the root's `address` variable, as the showcase film's
  does), `duplicate_media_discovery_risk` (the hook shows layers 3 and 7, which come back
  later), `composition_file_too_large` and `timeline_track_too_dense` on build.html (26 plates
  share one camera script; a scene file cannot move another's elements).
- The seam into the pull-back: no offset (best shift 0, 0); the difference is the source
  video's 4:2:0 chroma at colour edges.
- Sound, on the delivered file: −15.3 LUFS integrated, true peak −1.0 dBTP, no clipping; the bed
  alone is −15 LUFS. Measured, not heard.
- The delivered file (`out/social/made/tinypit-made.mp4`): 34.0 s, 1920 × 1080, 30 fps, H.264
  High yuv420p, AAC 48 kHz stereo, faststart, 45.3 MB (crf 18 under a 20 Mb/s ceiling; the
  render itself, at crf 14, was 135 MB). Against the render, frames differ by 0.7 to 1.3 levels
  on average on the build and about 3 mid pull-back.

## Looked at

Stills at 0, 2.4, 3.5, 4.75, 4.85, 6, 8.4, 9, 10.8, 12.2, 12.4, 13.5, 14, 15.6, 16, 18.7,
19.2, 19.24, 22, 27, 30.5 s, a sheet of the pull-back, and on the rendered file: a sheet of
fourteen frames, the rise frame by frame (12.0 to 13.3 s), the last scan (16.7 to 17.1 s), and
1:1 crops of the delivered file at 18.5 s.

## Weakest shot, and what more time would change

- Trees (6) is the quietest change: downtown has few. The camera now ends on the Point's park
  for that reason; a camera that swings over the park for that one bar would show it better.
- The build's plates are scaled by the browser while the camera moves (between 2 and 1 map px a
  pixel), which softens the pixels a little mid-push; at rest on 1:1 they are exact.
