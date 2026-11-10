# Review: the tour of tinywesteros

What was checked on the delivery render (`out/westeros/tinywesteros.mp4`, 2026-11-10).

## The file

- 1920 × 1080, 30 fps, H.264 + AAC, 35.0 s (the root's `data-duration`), 1,050 frames of take.
- Sound: −15.2 LUFS integrated, peak −3.9 dBFS; the lighter copy −15.8 LUFS, −4.6 dBFS. Music
  only. **Measured, not heard**: whether the march suits the pictures is for someone with ears.
- `hyperframes check`: passes, with the one warning these projects keep
  (`nested_structure_needs_subcomposition`: the end card is in the root because its address is
  a root variable, as in the showcase film).

## The pictures

Twenty-eight frames looked at, the flights above all:

- **Every flight is whole in every frame.** The first take had blurred frames in the long
  flights (Braavos to Valyria, Valyria to Meereen, Meereen to Asshai, and leaving King's
  Landing): the viewer was fading tiles in, and dropping the ones loaded ahead. Two things
  fixed it: each frame's tiles are asked for nine frames early (`AHEAD`), and the viewer may
  keep 900 tiles while it is filmed (`TILES_KEPT`). What softness is left at the top and
  bottom of the picture is the viewer's own tilt-shift.
- **The names** sit clear of their places; "The Seven Kingdoms" stands over the sea at the top
  right, because Westeros fills the left of that picture down to Dorne. No name is on screen
  during a flight.
- **The kingdoms** are outlined at 12.6 s, with the name, on the band's entrance in the music
  (measured in the bed at 13.1 s, the film starting 0.5 s into it). The viewer names eight of
  the regions of Westeros at that scale; the Westerlands and the Iron Islands are outlined but
  have no room for a plate.
- **The end card** stands in the band under the map, 23 px clear of it, inside the title-safe
  area; its smallest line is 28 px.
- **The map's edge never shows** before the end, where it is meant to: the kingdoms picture is
  as far west as the view goes without it.

## Known and left

- The music keeps no steady tempo (asked for 80 BPM, it does not hold it), so only two moments
  are tied to it. The places change every 3 s regardless.
- The first frame is Castle Black in the snow: mostly white. If a feed shows the first frame
  as the picture for the post, a later one (the kingdoms, 13 s) would serve better.
