// Film a "Guess the building" short's take on the live site: three rounds of the viewer's own
// game, then the map on its own for the end card. One take per world, 1080 × 1920, on the
// film's clock (SCHEDULE), into social-quiz/assets/takes/<world>.mp4 with its marks (.json).
//   SITE_URL=… npm exec -- tsx scripts/social/quiz-take.ts <world> [--stills]
import fs from "node:fs";
import path from "node:path";
import type { KeyInput, Page } from "puppeteer-core";
import { FPS, chrome, flight, jump, openReel, settle, sleep, type Cam } from "../lib/film.js";
import { liveOrigin, openLive } from "../lib/live.js";
import { ROOT } from "../lib/world.js";
import {
  ANSWERED,
  CHOICES,
  HAS_INVITE,
  HELD,
  OPEN_GAME,
  PRESS_START,
  START_READY,
  TALLIED,
  cardStyle,
  langOf,
  quizStorage,
  poll,
  blankMap,
  rectOf,
  step,
  until,
} from "./quiz-lib.js";
import { CLIP, LAYOUT, PICKS, SCHEDULE, roundAt } from "./quiz-worlds.js";

const world = process.argv[2] ?? "tinyphl";
const stills = process.argv.includes("--stills");
const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pick = PICKS[world];
if (!pick) throw new Error(`no picks for ${world}`);
const lang = langOf(world);

/** The viewer is filmed taller than the picture and cut: its tilt-shift's top band falls above it. */
const VIEW = { width: 540, height: LAYOUT.viewHeight, dpr: 2 };
const CUT = LAYOUT.cut; // CSS px of the viewer above the picture's top edge

interface Question {
  id: string;
  parts: string[];
  level: number;
  sets: Record<string, { all: string[] }>;
}
interface Sight {
  id: string;
  n: string;
  rings: number[][];
  anchor: [number, number];
}

const origin = liveOrigin();
const quiz = (await (await fetch(`${origin}/${world}/data/quiz.${lang}.json`)).json()) as {
  questions: Question[];
};
const sights = (await (await fetch(`${origin}/${world}/data/sights.json`)).json()) as { sights: Sight[] };
const sightById = new Map(sights.sights.map((s) => [s.id, s]));
const inLevel = quiz.questions.filter((q) => q.sets?.[pick.level]);
for (const id of pick.ids)
  if (!inLevel.some((q) => q.id === id)) throw new Error(`${world}: ${id} is not a ${pick.level} question`);
// every other building of the level counts as played, so the game asks the three first
const played = inLevel.map((q) => q.id).filter((id) => !pick.ids.includes(id));

/**
 * The answers' tally waits in the page until the take lets it through, so the shares go up on
 * the frame the schedule says however long the API takes (and never time out: the request is
 * read whole first, then held). A tally nobody has added to yet (no answers among the four names
 * on offer) is not handed over: a visitor never sees one, their own answer counts, and a column
 * of 0% reads as broken. The page gets what it gets when the API does not answer, and ends the
 * round the viewer's way: the name revealed, the text whole, no shares and no "N people" line.
 */
const TALLY_GATE = `(() => {
  const real = window.fetch.bind(window);
  window.__tally = { arrived: 0, gate: 0, empty: [] };
  window.fetch = async (input, init) => {
    const body = init && typeof init.body === "string" ? init.body : "";
    if (!body.includes("answerQuiz")) return real(input, init);
    const res = await real(input, Object.assign({}, init, { signal: undefined }));
    const text = await res.text();
    const n = ++window.__tally.arrived;
    let empty = false;
    try {
      const t = JSON.parse(text).data.answerQuiz;
      empty = t.answers === 0 || t.picks.reduce((sum, p) => sum + p.count, 0) === 0;
    } catch {}
    if (empty) window.__tally.empty.push(n);
    await new Promise((resolve) => {
      const wait = () => (window.__tally.gate >= n ? resolve() : setTimeout(wait, 15));
      wait();
    });
    if (empty) return new Response("", { status: 503 });
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  };
})();`;

/** The credit line shows whatever else is hidden: the data's attribution is part of every picture. */
const CREDIT = `html .map-root div.fixed.flex-col.items-end > .sign.sign-in { opacity: 1 !important; animation: none !important; }`;

/**
 * The building's name sign (the viewer's own, up once a round is answered) kept inside the picture:
 * the viewer keeps it on its screen, which runs on above the picture's top edge and under the
 * apps' top bar; it is held down to the band where words are read. Run after each frame is drawn.
 */
const SIGN_IN_PICTURE = `(() => {
  const top = ${CUT + LAYOUT.region.top / 2};
  for (const el of document.querySelectorAll(".sign.fixed.top-0.left-0")) {
    const m = /translate\\((-?[\\d.]+)px, (-?[\\d.]+)px\\)/.exec(el.style.transform);
    if (m && Number(m[2]) < top) el.style.transform = "translate(" + m[1] + "px, " + top + "px)";
  }
})()`;

/** A building's box on the map (map px), from its outline. */
function boxOf(s: Sight) {
  const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const ring of s.rings)
    for (let i = 0; i + 1 < ring.length; i += 2) {
      b.left = Math.min(b.left, ring[i]);
      b.right = Math.max(b.right, ring[i]);
      b.top = Math.min(b.top, ring[i + 1]);
      b.bottom = Math.max(b.bottom, ring[i + 1]);
    }
  return b;
}

/**
 * The view that puts a building in the part of the picture the signs leave it (LAYOUT.region).
 * A tower much taller than wide shows its top: the region holds its upper part, the rest goes
 * on down behind the card, as on a phone.
 */
function framing(s: Sight, limits: { min: number; max: number }, zoom = 1): Cam {
  const b = boxOf(s);
  const r = LAYOUT.region; // picture px; the viewer's CSS px are half
  const w = (r.right - r.left) / 2;
  const h = (r.bottom - r.top) / 2;
  const bw = b.right - b.left;
  const bh = b.bottom - b.top;
  const tall = bh / bw >= 1.8;
  let scale =
    (tall ? Math.min((0.9 * w) / bw, (2.1 * h) / bh) : Math.min((0.9 * w) / bw, (0.9 * h) / bh)) * zoom;
  // the pixel art is crispest at whole steps: settle on one when it is near below
  for (const nice of [2, 1, 0.5]) if (scale >= nice && scale < nice * 1.3) scale = nice;
  scale = Math.min(Math.max(scale, limits.min), Math.min(limits.max, 2));
  const cx = (r.left + r.right) / 4; // CSS px across the viewer
  const cy = (r.top + r.bottom) / 4 + CUT;
  // a tall one hangs from the region's top; the others sit in its middle
  const my = tall ? b.top + (h * 0.5 - 10) / scale : (b.top + b.bottom) / 2;
  return {
    x: (b.left + b.right) / 2 + (VIEW.width / 2 - cx) / scale,
    y: my + (VIEW.height / 2 - cy) / scale,
    scale,
  };
}

async function shot(page: Page): Promise<Buffer> {
  return Buffer.from(
    await page.screenshot({
      type: "png",
      optimizeForSpeed: true,
      clip: { x: 0, y: CUT, width: VIEW.width, height: 960 },
    }),
  );
}

const keyFor = (choices: string[], name: string): string | null => {
  const i = choices.findIndex((c) => c.slice(1).trim() === name);
  return i >= 0 ? "ABCD"[i] : null;
};

async function open(seed: number) {
  const stage = await openLive(world, {
    view: VIEW,
    seed,
    prefs: { lang },
    init: quizStorage(world, pick.level, played) + "\n" + TALLY_GATE,
    // on a busy machine a picture now and then comes back without its map (GPU or CPU alike):
    // blankMap below takes it again; QUIZ_CPU=1 draws the canvases on the CPU
    args: process.env.QUIZ_CPU ? ["--disable-gpu"] : [],
  });
  const { page } = stage;
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 160)) : undefined,
  );
  await chrome(page, 0);
  await page.addStyleTag({
    content: cardStyle({ top: LAYOUT.cardTop / 2 + CUT, right: LAYOUT.cardRight }) + CREDIT,
  });
  await until(page, HAS_INVITE);
  const limits = (await page.evaluate("window.tinyworld.getScaleLimits()")) as { min: number; max: number };
  // already over the first pick, so the round's own flight goes nowhere
  await jump(page, framing(sightById.get(pick.ids[0])!, limits));
  await page.evaluate(OPEN_GAME);
  await until(page, START_READY);
  await page.evaluate(PRESS_START);
  await until(page, `(${HELD}) !== null && ${CHOICES}.length === 4`, 300);
  return { ...stage, limits };
}

// the first round is the hook: try seeds until the game opens on the first pick
let seed = pick.seed ?? 7;
let stage = await open(seed);
for (let tries = 0; (await stage.page.evaluate(HELD)) !== pick.ids[0]; tries++) {
  await stage.browser.close();
  if (tries > 30) throw new Error(`${world}: no seed opens on ${pick.ids[0]}`);
  seed++;
  stage = await open(seed);
}
console.log(`take ${world}: seed ${seed}`);
const { browser, page, limits } = stage;

const takes = path.join(ROOT, "social-quiz/assets/takes");
fs.mkdirSync(takes, { recursive: true });
const stillsDir = path.join(ROOT, "out/social/quiz/stills", world);
if (stills) fs.mkdirSync(stillsDir, { recursive: true });

interface RoundMark {
  id: string;
  name: string;
  key: string;
  choices: string[];
  tally: boolean;
  /** nobody had answered it: the round ends without the shares */
  empty?: boolean;
  card: { asking: unknown; answered: unknown };
  readableBottom?: number;
}
const marks: { world: string; seed: number; lang: string; fps: number; frames: number; rounds: RoundMark[] } =
  {
    world,
    seed,
    lang,
    fps: FPS,
    frames: Math.round(CLIP.duration * FPS),
    rounds: [],
  };

// the views: each round's building (known when its round starts: the game orders rounds two
// and three), the flights between them, the way out at the end
const cams: Cam[] = [framing(sightById.get(pick.ids[0])!, limits, pick.zoom?.[0] ?? 1)];
const ways: ((u: number) => Cam)[] = [];
const toRound = (r: number, id: string) => {
  cams[r] = framing(sightById.get(id)!, limits, pick.zoom?.[pick.ids.indexOf(id)] ?? 1);
  ways[r] = flight(cams[r - 1], cams[r], VIEW.width * 1.2);
};
// the end: out to the world's own first view (its downtown), behind the end card
const start = (await page.evaluate(
  `(() => { const e = window.tinyworld; const s = e.manifest.start; const p = e.projection.toMap(s.lon, s.lat); return { x: p.x, y: p.y, scale: s.scale }; })()`,
)) as Cam;
let out: ((u: number) => Cam) | null = null;
const camAt = (t: number): Cam => {
  const r = roundAt(t);
  const t0 = SCHEDULE.rounds[r];
  if (t >= SCHEDULE.stop) {
    const to = { ...start, scale: Math.min(start.scale, cams[2].scale / 2) };
    out ??= flight(cams[2], to, VIEW.width * 1.2);
    return out((t - SCHEDULE.stop) / (CLIP.duration - SCHEDULE.stop));
  }
  if (r > 0 && t < t0 + SCHEDULE.flight) return ways[r]((t - t0) / SCHEDULE.flight);
  return cams[r];
};

// a little pre-roll on the first view, so the first frame is whole
await jump(page, camAt(0));
for (let i = 0; i < 12; i++) {
  await step(page);
  await jump(page, camAt(0));
  await settle(page);
}

const reel = openReel(path.join(takes, `${world}.mp4`), ROOT);
const frameOf = (s: number) => Math.round(s * FPS);
const total = Math.min(marks.frames, Number(flagValue("--frames") ?? marks.frames));
let retakes = 0;
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  const r = roundAt(t);
  const t0 = SCHEDULE.rounds[r];
  await step(page);

  if (f === frameOf(t0 + SCHEDULE.pick) && t < SCHEDULE.stop) {
    const held = (await page.evaluate(HELD)) as string;
    const name = sightById.get(held)?.n ?? "";
    const choices = (await page.evaluate(CHOICES)) as string[];
    const key = keyFor(choices, name);
    if (!key) throw new Error(`${world} round ${r + 1}: "${name}" is not among ${choices.join(" | ")}`);
    if (!pick.ids.includes(held))
      throw new Error(`${world} round ${r + 1}: the game asks ${held}, not a pick`);
    const asking = await rectOf(page, ".quiz-card");
    await page.keyboard.press(key as KeyInput);
    await poll(page, ANSWERED);
    marks.rounds.push({ id: held, name, key, choices, tally: false, card: { asking, answered: null } });
  }
  if (f === frameOf(t0 + SCHEDULE.shares) && t < SCHEDULE.stop) {
    await page.evaluate("window.__tally.gate++");
    const mark = marks.rounds[r];
    mark.empty = (await page.evaluate(`window.__tally.empty.includes(${r + 1})`)) as boolean;
    if (mark.empty) {
      // nothing will show: give the page a moment to end the round without the shares
      await sleep(300);
    } else {
      mark.tally = await poll(page, TALLIED, 6000).then(
        () => true,
        () => false,
      );
      if (!mark.tally) console.warn(`${world} round ${r + 1}: no tally from the API`);
    }
  }
  if (f === frameOf(t0 + SCHEDULE.shares + 0.5) && t < SCHEDULE.stop) {
    const mark = marks.rounds[r];
    mark.card.answered = await rectOf(page, ".quiz-card");
    // the last answer's foot: everything to read sits above it
    mark.readableBottom = (await page.evaluate(
      `(() => { const b = [...document.querySelectorAll(".quiz-card button")].filter((b) => b.querySelector(".font-pixel")).at(-1); return b ? (b.getBoundingClientRect().bottom - ${CUT}) * 2 : null; })()`,
    )) as number;
  }
  if (r > 0 && f === frameOf(t0)) {
    // the next building: the game's own button (N), then the flight there
    const was = marks.rounds[r - 1].id;
    await page.keyboard.press("n");
    await poll(page, `(${HELD}) !== null && (${HELD}) !== ${JSON.stringify(was)} && ${CHOICES}.length === 4`);
    toRound(r, (await page.evaluate(HELD)) as string);
  }
  if (f === frameOf(SCHEDULE.stop)) await page.keyboard.press("Escape");

  await jump(page, camAt(t));
  await settle(page);
  await page.evaluate(SIGN_IN_PICTURE);
  await sleep(20);
  let frame = await shot(page);
  for (let again = 0; (await blankMap(frame)) && again < 12; again++) {
    // draw it again: the map is asked to repaint where it is
    retakes++;
    await jump(page, camAt(t));
    await settle(page);
    await page.evaluate(SIGN_IN_PICTURE);
    await sleep(40 * (again + 1));
    frame = await shot(page);
    if (again === 11) console.warn(`${world}: frame ${f} still has no map`);
  }
  await reel.write(frame);
  if (stills && f % 15 === 0) fs.writeFileSync(path.join(stillsDir, `t${t.toFixed(1)}.png`), frame);
  if (f % 90 === 0) console.log(`take ${world}: ${f}/${total} (${retakes} frames drawn again)`);
}
await reel.close();
fs.writeFileSync(path.join(takes, `${world}.json`), JSON.stringify(marks, null, 2) + "\n");
await browser.close();
for (const m of marks.rounds)
  console.log(
    `  ${m.key} ${m.name}${m.empty ? " (nobody yet: no shares)" : m.tally ? "" : " (no tally)"}; readable to ${Math.round(m.readableBottom ?? 0)} px`,
  );
console.log(`take: social-quiz/assets/takes/${world}.mp4, ${total} frames`);
