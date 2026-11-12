# Review

## The second cut (57.6 s)

- **What changed.** At the person's ask, the middle became the history of the map: the
  thirteen real cities in the order they went up (the viewer's registry, which is the order of
  the commits that added them: New York first, Truckee last), each its hero framing cut from its
  tiles with its flyover sign and its number, the six their benefactors brought last, which is
  where they are in that order, with their real plaques. Two lines were added to the narration
  ("It started with New York.", "The newest six were paid for by the people who wanted them."),
  recorded as a second take with the same voice and settings; "Six are here because people paid
  for them." is no longer said, and the six full walls are no longer shown. A new bed, 60 s,
  driving through the history; the montage cuts on its beats (a bar from 22.555).
- **Checked.** `hyperframes check`: no errors (warnings: the end card in the root, the root's
  length, the history's dense tracks). Stills of every QA moment.
- **Not checked by anyone.** The new bed and the second take were measured, not heard: whether
  the two takes sound like one reading, and the ticks on the history's cuts.
- **No city was built between the cuts**: the live API listed the same thirteen, the same six
  brought by nine people, US$225.

## The first cut (48 s)

- **Calls made.** Storyline A, "Thirty stones", of three (`STORYLINES.md`). Dallas carries the
  story because it has everything at once: two real gifts ($10 named, $25 anonymous), lit
  buildings and the game. Its foundation is the one thing rebuilt (the site's `StoneWall`, at 5.6
  times its size, same grid, colours and marks), and the film hands it over to the real one in
  "Built, funded by their benefactors". The stones are laid one at a time to show what a dollar
  is; the two gifts each came at once. Everything else is the site: one continuous take of the
  real Dallas viewer (search, Reunion Tower lit with its Wikipedia opening, a round of Guess the
  building), and the live front page, ranking and Hall of Fame captured on 2026-11-12. London's
  first stone blinks as a place left open: nothing shows a gift that was not given. The
  fan-made places are not shown (the cities' grid and the ranking have none; the take's banner
  counts "15 more cities and worlds", as the viewer says).
- **Narration and subtitles.** ElevenLabs (`eleven_multilingual_v2`, the stock voice Eric), one
  take of the whole script cut into twelve lines, each placed on its picture; the subtitles are
  built from the same take's word times, in Tiny5 on the site's black enamel, the spoken word
  in taxi yellow.
- **Measured.** `hyperframes check`: no errors; warnings kept: the end card lives in the root
  (it carries the `address` variable, as in the showcase film), the root file's length (one
  clip per sound). Audio, contrast (30 of 30) and craft passes clean.
- **Looked at.** Stills at every QA moment of SPEC.md, the review set (each scene's start and
  middle, a strip round every cut, phone width). Fixed after looking: the tower did not light in
  the first take (the pointer's target was measured mid-move); the built and London shots
  opened with the page's margin in frame; London's card now stands in the viewer's own
  spotlight.
- **Not checked by anyone.** The sound was measured, not heard: the voice against the bed
  (0.3), and whether the ticks under the stones read as stones.
- **Weakest shot.** London's: the ranking ends at its right edge, so a band of the page's
  dimmed margin shows at the right of the frame. With more time: a capture of the ranking at a
  width where London's card sits mid-page.
- **Moments in the take worth knowing.** On the way to the tower the pointer crosses the
  George L. Allen Sr. Courthouse, which lights for half a second: the viewer's own behaviour,
  kept. The quiz's first building is fixed by seeding the page's `Math.random` (the Perot
  Museum of Nature and Science).
- **Real names on screen.** "James Creedon" (the opening's first gift) and the Hall of Fame's
  names are as the site shows them publicly. The opening's two names are the `stones`
  composition's variables `first` and `second`.
