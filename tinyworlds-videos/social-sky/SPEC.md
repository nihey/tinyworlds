# From the sky to the sidewalk

A social clip (Reddit first), 26.4 s at 1920 × 1080 and 30 fps: one continuous move from all of
San Francisco on the map down to the Golden Gate Bridge, the little person carried out of the
tools and dropped on its deck, and the Street Walk that opens there, driving north under the
south tower and its cables. Every picture is the live viewer (`scripts/social/sky-takes.ts`);
the words and the end card are the film's.

The bed (`assets/music/bed.mp3`, ElevenLabs Music, `scripts/social/sky-music.ts sky`) enters at
1.0 s of its file, so its beats fall at 0.235 + 0.6 k film seconds; its swell lands on the drop.

| Film s      | Picture                                                                                              | Words                                        |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 0–3.24      | The whole city on the map (frame 0 is the thumbnail), a slow push                                    | "All of San Francisco" (tinysfo)             |
| 3.24–8.0    | Down in octaves to the Golden Gate                                                                   | "Every street" 3.835–7.1                     |
| 6.75–9.833  | The tools fade in; the person is picked up (7.4), carried over the water, let go on the deck         |                                              |
| 9.833       | The map opens like an iris from the drop point onto the walk, seen from above the deck (`drop-iris`) |                                              |
| 9.833–12.7  | Craning down behind the red car                                                                      |                                              |
| 12.7–15.835 | Low chase towards the south tower's portal                                                           | "And you can drive it" 12.235–15.6, top left |
| 15.835–26.4 | Cut on the beat, past the tower: beside the deck, drawing back over the span                         | (take from 8.834 s)                          |
| 21.835–26.4 | End card over it: tinysfo, "Free, in your browser", the address (`link`)                             |                                              |

The address is the `link` variable, given at render time (`--variables '{"link":"…/tinysfo/"}'`);
the source says example.com. Sound: the bed, a pop on the pick-up, a whoosh on the drop, a short
whoosh on the cut at the tower, a pop on the end card (HyperFrames library, `assets/sfx/`, not
committed). `assets/takes/map-last.png` is the map take's last frame (ffmpeg `-sseof`), for the iris.

Render with the address: `npx hyperframes render --quality delivery --variables
'{"link":"<host>/tinysfo/"}'`, then H.264/AAC at -15 LUFS with `+faststart`
(`out/social/walk/tinyworlds-sky-to-sidewalk.mp4`).
