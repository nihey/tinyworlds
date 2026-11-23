/**
 * The "Guess the building" shorts, one per real city with a game (Truckee has none): which
 * buildings each plays, when things happen, and where they sit in the picture. The take
 * (`quiz-take.ts`) and the render's rows (`quiz-render.ts`) both read this; the composition
 * (`social-quiz/index.html`) holds the same moments in its `data-start`s.
 */

/** 1080 × 1920, 30 fps, every clip the same length. */
export const CLIP = { width: 1080, height: 1920, duration: 30 };

/**
 * The film's clock, in seconds (the music's 120 BPM: a round is four bars). A round starts at
 * `rounds[r]` (the question up, the map flying there from the last one); the countdown says 3,
 * 2, 1 at +2, +3, +4; the right letter is pressed at +5 and everyone's answers go up at
 * +5.4; the next round starts eight seconds on. The game stops at `stop` and the end card
 * holds to the end.
 */
export const SCHEDULE = {
  rounds: [0, 8, 16] as const,
  flight: 1.4,
  count: [2, 3, 4] as const,
  pick: 5,
  shares: 5.4,
  stop: 24,
};

export const roundAt = (t: number): 0 | 1 | 2 =>
  t < SCHEDULE.rounds[1] ? 0 : t < SCHEDULE.rounds[2] ? 1 : 2;

/**
 * Where things are, in picture px. The apps cover the top 168 px and everything below 1330 px
 * (and a rail at the right), so every word sits between: the game's card from `cardTop` down,
 * kept `cardRight` CSS px in from the right edge (the rail); our sign at the top left; the
 * building framed in `region`, right of the sign and above the card. The viewer is filmed
 * `viewHeight` CSS px tall and cut `cut` CSS px from its top, so its tilt-shift's upper band
 * is mostly above the picture.
 */
export const LAYOUT = {
  viewHeight: 1100,
  cut: 140,
  cardTop: 504,
  cardRight: 64,
  region: { left: 432, top: 184, right: 1052, bottom: 490 },
};

export interface Pick {
  /** the three buildings, the first one the hook (rounds 2 and 3 come in the game's own order) */
  ids: [string, string, string];
  /** the game's difficulty: easy, unless the city has fewer than three easy buildings */
  level: "easy" | "medium";
  seed?: number;
  /** closer than the framing would go, per round */
  zoom?: [number, number, number];
}

export const PICKS: Record<string, Pick> = {
  tinynyc: { ids: ["b1we5bnh", "bridge:brooklyn bridge", "b1uuogys"], level: "easy", zoom: [1, 2.5, 1] },
  tinyrao: { ids: ["b1wrthdh", "b1jzptwj", "b1ajt71l"], level: "medium" },
  tinyorl: { ids: ["baiisvu", "bdbmy07", "b198i0rs"], level: "easy" },
  tinyfte: { ids: ["bow15ps", "bspcaxe", "b508kuh"], level: "medium" },
  tinyvlc: { ids: ["b1er9r4g", "ba7mnnj", "b7v2vpk"], level: "easy" },
  tinylas: { ids: ["b13wiv00", "b1abbq8h", "b1xynxd0"], level: "easy" },
  tinylax: { ids: ["b146murn", "bxpsnhy", "bovpvlx"], level: "easy" },
  tinydal: { ids: ["statue:0", "b1yl8jd6", "b1nbw1f3"], level: "easy" },
  tinycvg: { ids: ["b1g9bvxd", "bridge:roebling suspension bridge", "bd6lquu"], level: "easy" },
  tinypit: { ids: ["byuot64", "b6u49wg", "bj3vnki"], level: "easy" },
  tinyphl: { ids: ["b1x7wvfe", "bn7ql1v", "b1lurw7"], level: "easy" },
  // the Cadet Chapel is drawn as a plain block: seen whole with the Academy round it, not first
  tinycos: { ids: ["b8v6irk", "b88sn7y", "b1140ezi"], level: "easy", zoom: [1, 0.45, 1] },
  tinyaus: { ids: ["b26odal", "b1evaqxp", "b1a0qqkw"], level: "easy" },
  tinysfo: { ids: ["b1iga657", "bce6ofp", "bridge:golden gate bridge"], level: "easy" },
  tinymke: { ids: ["b1dc8meb", "statue:1", "b7wfjqh"], level: "easy" },
  tinybeth: { ids: ["b1kcirck", "b1417qwo", "bvogfn0"], level: "easy" },
};

/** Each world's colour (`accent` in tinyworlds-frontend/src/worlds/<id>.ts) and wordmark suffix. */
export const LOOKS: Record<string, { accent: string; ink: string; mark: string }> = {
  tinynyc: { accent: "#f7c21b", ink: "#1a1503", mark: "nyc" },
  tinyrao: { accent: "#ff7a3d", ink: "#1f0d03", mark: "rao" },
  tinyorl: { accent: "#3ccfc0", ink: "#04211e", mark: "orl" },
  tinyfte: { accent: "#b9a2ff", ink: "#1a1038", mark: "fte" },
  tinyvlc: { accent: "#ffa62b", ink: "#241300", mark: "vlc" },
  tinylas: { accent: "#ff4fa3", ink: "#2b0016", mark: "las" },
  tinylax: { accent: "#55aaff", ink: "#001a3a", mark: "lax" },
  tinydal: { accent: "#6ee05a", ink: "#0d2a07", mark: "dal" },
  tinycvg: { accent: "#a56bff", ink: "#14002e", mark: "cvg" },
  tinypit: { accent: "#ffd447", ink: "#2a2000", mark: "pit" },
  tinyphl: { accent: "#5b7cfa", ink: "#060d2e", mark: "phl" },
  tinycos: { accent: "#ff6b57", ink: "#2a0805", mark: "cos" },
  tinyaus: { accent: "#ef8a48", ink: "#201008", mark: "aus" },
  tinysfo: { accent: "#f07858", ink: "#210d08", mark: "sfo" },
  tinymke: { accent: "#f0c879", ink: "#241708", mark: "mke" },
  tinybeth: { accent: "#ed996c", ink: "#27140d", mark: "beth" },
};

/** The clip's own words, in the viewer's three languages. `{n}`: the round. */
export const COPY: Record<"en-US" | "pt-BR" | "es-ES", Record<string, string>> = {
  "en-US": {
    hook1: "Can you name",
    hook2: "this building?",
    round: "Round {n} of 3",
    answer: "Answer",
    end1: "How many",
    end2: "did you get?",
    comments: "Tell us in the comments",
    play: "Play the whole game at",
  },
  "pt-BR": {
    hook1: "Você sabe que",
    hook2: "prédio é este?",
    round: "Rodada {n} de 3",
    answer: "Resposta",
    end1: "Quantos",
    end2: "você acertou?",
    comments: "Conta aqui nos comentários",
    play: "Jogue o jogo inteiro em",
  },
  "es-ES": {
    hook1: "¿Sabes qué",
    hook2: "edificio es?",
    round: "Ronda {n} de 3",
    answer: "Respuesta",
    end1: "¿Cuántos",
    end2: "acertaste?",
    comments: "Cuéntalo en los comentarios",
    play: "Juega la partida entera en",
  },
};
