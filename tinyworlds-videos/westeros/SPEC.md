# The known world: a tour of tinywesteros

For a fan community: people who know every place on this map by name. 1920 × 1080, 30 fps, 35 s.
One continuous take of the real viewer; nothing is redrawn.

## The shots

A place a bar (3 s): the way there takes 1.4 s, the rest is spent on the place, closing in by
3.5 %. Times in seconds.

| From | Picture                                                                                                                               | Name on screen                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0    | Castle Black, close (scale 1.05), backing out along the Wall (0.3) by 2.4                                                             | The Wall, 0.5 to 2.95                                                   |
| 3    | Winterfell (0.72)                                                                                                                     | Winterfell, 4.3 to 5.95                                                 |
| 6    | King's Landing (0.5)                                                                                                                  | King's Landing, 7.3 to 8.95                                             |
| 9    | All of Westeros with the Narrow Sea (0.024), two bars. At 12.6 the viewer's own region lines come on: the kingdoms outlined and named | The Seven Kingdoms, 12.6 to 14.95, top right                            |
| 15   | Braavos (0.8)                                                                                                                         | Braavos, 16.3 to 17.95                                                  |
| 18   | Valyria (0.72)                                                                                                                        | Valyria, 19.3 to 20.95                                                  |
| 21   | Meereen (0.5)                                                                                                                         | Meereen, 22.3 to 23.95                                                  |
| 24   | Asshai (0.5)                                                                                                                          | Asshai, 25.3 to 26.95                                                   |
| 27   | Out to the whole map by 29.8, set high in the picture; region lines on at 29.6                                                        |                                                                         |
| 30   | The end card, in the band under the map, to 35                                                                                        | wordmark, "The known world, pocket-sized", the address, the small print |

## In numbers

- **A flight** (`flight` in `scripts/lib/film.ts`) climbs until the whole way is about 1.2
  screens wide, covers ground fastest where the view is widest, and is eased at both ends.
- **Names**: Archivo 600, 76 px, on the site's black sign (radius 20 px) with a 6 px line of the
  world's gold (`#d9b45a`) along its top; 96 px from the left and bottom edges. They arrive and
  leave in steps (0.2 s in, 0.17 s out), as signs do in the other film. No second line, no
  region above the name.
- **The end card**: one sign, centred, its top at 760 px: the wordmark in the pixel face
  (448 × 56 px) beside three lines (46, 36 and 28 px: nothing under 28 px, which is what a
  phone can read). Stamped on at 30.0.
- **Music**: an original march for a small early-music band (`npm run sound -- --for westeros`),
  never a likeness of the series' music. It opens on a drum 0.5 s in, so the film starts
  there; the band's entrance is the moment the kingdoms are outlined. No sound effects.

## Not in it

No pointer, no search, none of the viewer's own signs: the tilt-shift and the ships are all of
the viewer that shows. No voice. Nothing claims to be official: the small print on the end card
says fan-made, and names no one as endorsing it.
