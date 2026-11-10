# Review

- **Calls made.** Storyline A, "Pull back", of three (the other two are at the end of SPEC.md).
  The opening starts on the Empire State Building's crown rather than on anonymous windows, and
  spends its time close in. For "All five boroughs" the viewer is handed the five boroughs as
  districts (each one its neighbourhoods merged, `scripts/lib/boroughs.ts`) and draws them with
  its own district lines and name plates: the site itself outlines neighbourhoods, not boroughs,
  so this is the viewer's drawing on shapes made for the film.
  The search is for the Statue of Liberty rather than Coney Island: that is where a ferry
  comes in. The end card is the front page's own hero and sign, with one sign added for
  "Want yours next?" and the address. The fan-made places are not shown: the cards shot frames
  the six cities.
- **Measured.** `hyperframes check`: no errors; one warning kept on purpose
  (`nested_structure_needs_subcomposition` on the end card's sign, which lives in the root
  because it carries the root's `address` variable). The delivery render: 31.0 s, 1920 x 1080,
  30 fps; sound -15.2 LUFS integrated, true peak -1.0 dBTP, no clipping (the copy to post:
  -15.9 LUFS, -1.5 dBTP).
- **Looked at.** Stills of every beat in SPEC's QA line, and frame strips across the title's
  change into the search sign, the picture landing on its card, the move to the hero and the
  end sign's arrival.
- **Not checked by anyone.** The sound was measured, not heard: whether the music suits the
  film, and whether each effect sits well, needs ears.
- **Weakest shot.** The ferry (17.2-20.04): a small boat on open water. With more time: a
  closer, lower framing with the island behind it, or a route with more boats in view.
- **Text on a phone.** The film's own lines read at 360 px; the boroughs' name plates are the
  viewer's own size (22 px here) and do not, which is why the line says it too; the pitch inside the page's sign
  (the real page, about 28 px here) does not, and is not needed to follow the film.
