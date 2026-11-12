# Thirty stones

Storyline A of `STORYLINES.md` (the other two are there). This is its second cut: the middle is
the history of the map, every real city in the order it went up (the first cut showed the
thirteen as the front page's grid, then the six full walls).

```text
GOAL:    A stranger learns that thirteen real cities are free to explore and to learn from, that
         six exist because people paid US$30 for them, stone by stone, and that the next city's
         first stone, with their name on it for good, is theirs to lay.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    57.6 s x 30 = 1728 frames. Narrated: the voice is the clock (assets/voice/lines.json:
         thirteen lines said, each its own clip, placed by PLACES in scripts/recap.ts). Bed 96
         BPM, a beat every 0.625 s from 0.065, a bar from 22.555; sections A 0-10.05, B -20.05,
         C -50.7 (peak 30.06), D the held chord to 60.
LOOK:    The site itself. Ground: the page's fog #e9e6df. Signs: black enamel #15171a, paper
         #f4f2ec, paper-dim #a4a6a1, 10 px corners at the site's size (x the film's scale), the
         site's own shadow. Accent: taxi yellow #f7c21b, ink #1a1503: laid stones, the spoken
         word, "Funded in full", the address. Gold #7a5d0c / #2a2311 only where the site uses it
         (the plaques). Type: Archivo 600 for the film's own lines, Tiny5 (the wordmark's pixel
         face) for the subtitles and the wordmark. Medium: the real viewer filmed at twice its
         size (960 x 540 CSS px, its tilt blur); the real pages captured at three times theirs.
OBJECTS: Dallas's foundation (the site's StoneWall: 30 stones, 15 a row, 3 px gaps at 18 px
         stones, the first and the last marked with a dark diamond, laid = taxi with a 2 px
         bottom shade, empty = white at 8 %); the whole map of Dallas; the viewer's search sign,
         Reunion Tower lit with its Wikipedia sign, the Guess the building card; the front page's
         thirteen city cards, each playing its loop; the six built cards with full walls; the
         Hall of Fame's figures and names; London's card at $0 of $30; the wordmark.
MOTION:  Pixels do not ease: signs, subtitles, stones and the wordmark arrive in steps (3-4
         steps, 5-7 frames). Camera over a page: power2.inOut, 0.5-0.8 s moves, then hold while
         the voice speaks. The take's camera is its own (through(), the viewer's flyTo). The
         keystone opens into the map on power3.inOut, 15 frames.
SUBTITLES: Tiny5 at 54 px, paper on a black enamel plate (16 px padding, the site's shadow),
         centred, 92 px above the bottom; one group of 2-5 words at a time; the word being said
         turns taxi yellow on its first frame; a group steps in (3 steps, 4 frames) and is cut.
SHOTS:   0.00-7.25   THE FOUNDATION. Dallas's wall fills the frame's width (1560 px). Frame 0:
                     three stones of the first gift already down, its tag "James Creedon $10".
                     Gift one ends at 0.9; "Anonymous $25" at 1.35, its stones one at a time to
                     29 by 5.1, the counter "N of 30 stones laid" with them. VO1 0.30, VO2 2.55.
                     The keystone drops on "laid" (6.73, a beat): "30 of 30", "Funded in full".
                     Ticks under the stones, a bass hit on the keystone.
         7.00-23.0   THE TAKE (one continuous take of the real viewer, assets/takes/dallas.mp4).
                     7.25-7.75 the keystone opens into the whole map of Dallas ("Dallas went up").
                     8.4-11.1 down into downtown, VO4. 11.1 the viewer's signs; VO5 11.55 as
                     "reunion tower" is typed (click 11.85, keys from 12.0, result 13.5) and the
                     map flies there. VO6 14.95: the pointer on the tower (15.3), it lights up and
                     its Wikipedia sign opens. VO7 18.25: Guess the building (18.0), start (18.7),
                     the right name picked (20.7), the answer whole.
         22.555-35.055 THE HISTORY: every real city in the order it went up (the viewer's
                     registry), its hero framing cut from its tiles drifting one way across the
                     cuts, its flyover sign (the pipeline's sign.ts) top left, "No. N" top right.
                     New York two beats (VO13 22.65 "It started with New York."), Ribeirão Preto
                     to Los Angeles a beat each, then the six their benefactors brought, two
                     beats each with their real plaque from the front page (VO14 27.75). A tick
                     on each cut, a pop on each plaque.
         35.055-39.43 THIRTEEN CITIES: the front page's Cities, every card playing its loop, down
                     the grid. VO8 35.25. Riser into a hit on the cut.
         39.43-44.43 THE HALL OF FAME: the cities with the names under their plaques, out to the
                     title and $225, 9, 6 as it is named. VO10 39.6.
         44.43-51.0  LONDON: its card at $0 of $30 in the viewer's own spotlight, "The First Stone
                     is still unclaimed". VO11 44.63. VO12 47.6: the first stone's outline blinks
                     in taxi, a place left open. Nothing is laid: no gift is shown that was not
                     given.
         51.0-57.6   END CARD: the wordmark laid letter by letter like stones, "Which city should
                     we build next?", the address in taxi, the site's own "Fund a city" button;
                     all down by 52.8, held. The bed's held chord fades 56.1-57.6. Pop on the
                     address.
BANNED:  a dark void; glow, particles; gradients; fades and slide-ups on signs and subtitles
         (they step); a mockup of anything the site has (pages are captured, the map is filmed;
         only the stone wall is rebuilt, from its component; the real ones are the ranking's);
         a gift, name, number or city that the site does not have; the fan-made places (they stay
         out of what promotes the project); the address in this folder; a docked logo; three
         cards in a row as a layout of the film's own; emojis.
QA:      0.0 three stones down, the tag, nothing blank. 6.8 the keystone down, "30 of 30".
         7.5 the window opening on the map. 10.5 downtown. 12.9 "reunion tower" typed. 16.5
         the tower lit with its sign. 20.0 the quiz card with blanks. 21.5 the answer. 22.7 New
         York, No. 1. 26.0 Valencia, No. 5. 28.2 Dallas with its plaque, No. 8. 34.3 Truckee,
         No. 13. 35.6 the city cards alive. 41.0 the hall's names. 46.0 London's empty wall.
         48.1 the first stone blinking. 54.5 the end card whole, with the address.
```
