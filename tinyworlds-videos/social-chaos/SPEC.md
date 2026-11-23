# Street Walk: real New York in a browser tab

A social clip (Reddit first), 28 s at 1920 × 1080 and 30 fps: fast cuts on the beat through the
game's real mechanics in New York. Every picture is the live viewer, each shot staged
(`scripts/social/chaos-takes.ts`: a seeded city, the vehicle put in its lane, keys and sticks
held for so many frames, the camera placed); the words and the end card are the film's. No
names, logos, fonts or music of any game: a real city piece.

The bed (`assets/music/bed.mp3`, ElevenLabs Music, `scripts/social/sky-music.ts chaos`) is
120 BPM from its first beat at 0.055 s; every cut is on a beat (0.055 + 0.5 k), the explosion on
the bar.

| Film s        | Take             | Picture                                                         | Words                               |
| ------------- | ---------------- | --------------------------------------------------------------- | ----------------------------------- |
| 0–4.055       | `bike`           | A motorcycle weaving down Seventh Avenue into Times Square      | "Real New York." (tinynyc), frame 0 |
| 4.055–6.055   | `chase`          | A red supercar on the tail of a white sports car, Sixth Avenue  |                                     |
| 6.055–7.055   | `fire-a`         | A damaged sedan into a bus: it catches fire                     |                                     |
| 7.055–9.555   | `fire-a`         | You are out; the wide: the wreck burns, people run              |                                     |
| 9.555–12.055  | `fire-b`         | Eight seconds later: the explosion                              |                                     |
| 12.055–14.055 | `punch`          | Times Square, first person: one punch                           |                                     |
| 14.055–18.055 | `boat`           | A yellow speedboat up the East River, under the Brooklyn Bridge |                                     |
| 18.055–28     | `bridge`         | A taxi over the Brooklyn Bridge into Manhattan                  | "In a browser tab." 19.055–22.5     |
| 23.055–28     | end card over it | tinynyc, "Free, in your browser", the address (`link`)          |                                     |

The address is the `link` variable, given at render time; the source says example.com. Sound:
the bed, and the HyperFrames library's effects on what is seen (whooshes on the passes, a bass
hit on the crash and a bigger one on the explosion, a short hit on the punch, a pop on the end
card). The library has no engine sound; the bed carries the driving.

The words sit top left, clear of the vehicles. The edit is written from the takes' moments
(crash frame 45 of `fire-a`, explosion frame 47 of `fire-b`, the punch landing at frame 48 of
`punch`): change a take, and the `data-media-start` of its clips moves with it. Render with the
address: `npx hyperframes render --quality delivery --variables '{"link":"<host>/tinynyc/"}'`,
then H.264/AAC at -15 LUFS with `+faststart` (`out/social/walk/tinyworlds-real-new-york.mp4`).
