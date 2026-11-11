import { describe, expect, it } from "vitest";
import {
  blankName,
  buildQuiz,
  distinctiveWords,
  fold,
  groupOf,
  kindOf,
  levelsOf,
  pickDecoys,
  type QuizLocale,
  type QuizSight,
  type QuizText,
} from "./quiz.js";

const none: ReadonlySet<string> = new Set();

/** A sight `east` metres east of a fixed point in Manhattan. */
function at(id: string, n: string, east: number, t = "landmark"): QuizSight {
  const lat = 40.75;
  const lon = -73.98 + east / (111195 * Math.cos((lat * Math.PI) / 180));
  return { id, n, t, lon, lat };
}

describe("fold", () => {
  it("drops case and accents, one character for one", () => {
    expect(fold("Édifício São")).toBe("edificio sao");
    expect(fold("Édifício São")).toHaveLength("Édifício São".length);
  });
});

describe("distinctiveWords", () => {
  it("keeps the words that name this place and no other", () => {
    expect(distinctiveWords("Flatiron Building", none)).toEqual(["flatiron"]);
    expect(distinctiveWords("New York Life Building", new Set(["new", "york"]))).toEqual(["life"]);
    expect(distinctiveWords("One World Trade Center", none)).toEqual(["world", "trade"]);
  });

  it("takes the place words of a name that has nothing else", () => {
    const boroughs = new Set(["brooklyn", "manhattan", "new", "york"]);
    expect(distinctiveWords("Brooklyn Bridge", boroughs)).toEqual(["brooklyn"]);
    expect(distinctiveWords("New York Life Building", boroughs)).toEqual(["life"]);
  });
});

describe("blankName", () => {
  it("blanks the name with its article, and its own word wherever else it stands", () => {
    expect(
      blankName("The Flatiron Building is in the Flatiron District.", ["Flatiron Building"], none),
    ).toEqual(["", "The Flatiron Building", " is in the ", "Flatiron", " District."]);
  });

  it("takes a possessive with the word, whatever the apostrophe", () => {
    expect(
      blankName("Macy's flagship is on 34th Street; Macy’s opened it in 1902.", ["Macy's"], none),
    ).toEqual(["", "Macy's", " flagship is on 34th Street; ", "Macy’s", " opened it in 1902."]);
  });

  it("matches the name without its accents", () => {
    expect(blankName("El Edificio Telefónica es una torre.", ["Edificio Telefonica"], none)).toEqual([
      "",
      "El Edificio Telefónica",
      " es una torre.",
    ]);
  });

  it("merges blanks that only a space keeps apart", () => {
    expect(
      blankName("It stands in the rebuilt World Trade Center site.", ["3 World Trade Center"], none),
    ).toEqual(["It stands in the rebuilt ", "World Trade", " Center site."]);
  });

  it("blanks a place word that is all a name has, in another language's wording too", () => {
    expect(
      blankName(
        "Ponte de Brooklyn é uma ponte em Nova Iorque, entre Manhattan e Brooklyn.",
        ["Brooklyn Bridge", "Ponte do Brooklyn"],
        new Set(["brooklyn", "manhattan", "nova", "iorque"]),
      ),
    ).toEqual(["Ponte de ", "Brooklyn", " é uma ponte em Nova Iorque, entre Manhattan e ", "Brooklyn", "."]);
  });

  it("blanks the name's initials, as Wikipedia gives them after it", () => {
    expect(
      blankName(
        "The Stavros Niarchos Foundation Library (SNFL) is a branch.",
        ["Stavros Niarchos Foundation Library"],
        none,
      ),
    ).toEqual(["", "The Stavros Niarchos Foundation Library", " (", "SNFL", ") is a branch."]);
    expect(
      blankName("The Museum of Modern Art (MoMA) is on 53rd Street.", ["Museum of Modern Art"], none)[3],
    ).toBe("MoMA");
    expect(
      blankName(
        "The Museum of Arts and Design (MAD) collects craft.",
        ["Museum of Arts and Design"],
        none,
      )[3],
    ).toBe("MAD");
  });

  it("blanks initials that leave out only the articles", () => {
    expect(
      blankName(
        "The Museum of the Moving Image (MoMI) is in Astoria.",
        ["Museum of the Moving Image"],
        none,
      )[3],
    ).toBe("MoMI");
  });

  it("blanks a place word where it runs together with the rest of the name", () => {
    expect(
      blankName(
        "Also called the Bronx Museum of Art, it stands in the Bronx.",
        ["The Bronx Museum Of The Arts"],
        new Set(["bronx"]),
      ),
    ).toEqual(["Also called the ", "Bronx Museum", " of Art, it stands in the Bronx."]);
  });

  it("leaves a word alone that only spells the initials in small letters", () => {
    expect(
      blankName("Madison Avenue Design is not mad at all.", ["Museum of Arts and Design"], none).join("|"),
    ).not.toContain("|mad|");
  });

  it("leaves the city's own place words alone", () => {
    expect(
      blankName(
        "The New York Life Building is a tower in New York City.",
        ["New York Life Building"],
        new Set(["new", "york"]),
      ),
    ).toEqual(["", "The New York Life Building", " is a tower in New York City."]);
  });

  it("keeps the text whole: the parts join back into it", () => {
    const text = "Grand Central Terminal is a terminal at 42nd Street in Grand Central.";
    expect(blankName(text, ["Grand Central Terminal"], none).join("")).toBe(text);
  });
});

describe("kindOf", () => {
  it("is the type for stations, bridges and museums, else a kind word in the name, else general", () => {
    expect(kindOf({ n: "Neue Galerie", t: "museum" })).toBe("museum");
    expect(kindOf({ n: "Times Square", t: "station" })).toBe("station");
    expect(kindOf({ n: "St. Patrick's Cathedral", t: "landmark" })).toBe("worship");
    expect(kindOf({ n: "Trinity Chapel", t: "landmark" })).toBe("worship");
    expect(kindOf({ n: "The Actors' Temple", t: "landmark" })).toBe("worship");
    expect(kindOf({ n: "UBS Arena", t: "landmark" })).toBe("stadium");
    expect(kindOf({ n: "Xavier High School", t: "building" })).toBe("school");
    expect(kindOf({ n: "Bank Street College of Education", t: "building" })).toBe("school");
    expect(kindOf({ n: "Lyceum Theatre", t: "building" })).toBe("venue");
    expect(kindOf({ n: "Olympic Tower", t: "building" })).toBe("general");
  });
});

describe("pickDecoys", () => {
  it("offers places of the same kind before nearer places of another", () => {
    const answer = at("m0", "Neue Galerie", 0, "museum");
    const pool = [
      answer,
      at("g1", "Olympic Tower", 100),
      at("m1", "Frick Collection", 2000, "museum"),
      at("m2", "Jewish Museum", 2100, "museum"),
      at("m3", "Cooper Hewitt", 2200, "museum"),
    ];
    expect(pickDecoys(answer, pool, [], none)).toEqual(["m1", "m2", "m3"]);
  });

  it("borrows the nearest general places when its kind has fewer than four", () => {
    const answer = at("c0", "Grace Church", 0);
    const pool = [
      answer,
      at("c1", "Trinity Church", 3000),
      at("g1", "Olympic Tower", 100),
      at("g2", "Bush Tower", 200),
      at("g3", "Barclay Tower", 300),
    ];
    expect(pickDecoys(answer, pool, [], none)).toEqual(["c1", "g1", "g2"]);
  });

  it("never offers a place sharing a word of the answer's name", () => {
    const answer = at("a", "One World Trade Center", 0);
    const pool = [
      answer,
      at("w3", "3 World Trade Center", 50),
      at("ww", "Woolworth Building", 300),
      at("bt", "Barclay Tower", 400),
      at("bu", "Bush Tower", 500),
    ];
    expect(pickDecoys(answer, pool, [], none)).toEqual(["ww", "bt", "bu"]);
  });

  it("never offers a place the question's text names", () => {
    const answer = at("f", "Flatiron Building", 0);
    const pool = [
      answer,
      at("om", "One Madison", 50),
      at("ml", "MetLife Tower", 100),
      at("ny", "New York Life Building", 200),
      at("es", "Empire State Building", 300),
    ];
    const visible = ["The  is a building across from One Madison, in New York State."];
    expect(pickDecoys(answer, pool, visible, new Set(["new", "york"]))).toEqual(["ml", "ny", "es"]);
  });

  it("never offers two places of one name, nor one named like the answer", () => {
    const answer = at("ts", "Times Square", 0, "station");
    const pool = [
      answer,
      at("s86a", "86th Street", 100, "station"),
      at("s86b", "86th Street", 150, "station"),
      at("s72", "72nd Street", 200, "station"),
      at("s59", "59th Street", 300, "station"),
    ];
    expect(pickDecoys(answer, pool, [], none)).toEqual(["s86a", "s72", "s59"]);

    const terminal = at("at1", "Atlantic Terminal", 0, "station");
    const twins = [terminal, at("at2", "Atlantic Terminal", 10, "station"), ...pool.slice(1)];
    expect(pickDecoys(terminal, twins, [], none)).not.toContain("at2");
  });

  it("gives up with fewer than three to offer", () => {
    const answer = at("a", "Olympic Tower", 0);
    expect(
      pickDecoys(answer, [answer, at("b", "Bush Tower", 10), at("c", "Barclay Tower", 20)], [], none),
    ).toBeNull();
  });
});

describe("buildQuiz", () => {
  const sights = [
    at("a", "Alpha Tower", 0),
    at("b", "Bravo Tower", 100),
    at("c", "Charlie Tower", 200),
    at("d", "Delta Tower", 300),
  ];
  const long = (name: string) =>
    `The ${name} is a tall office building on a quiet corner, finished long ago by its builders.`;
  const texts = (lang: string, short?: string): Record<string, QuizText> =>
    Object.fromEntries(
      sights.map((s) => [
        s.id,
        { title: s.n, text: s.id === short ? `The ${s.n} is tall.` : long(s.n), lang },
      ]),
    );
  const all: Record<QuizLocale, Record<string, QuizText>> = {
    "en-US": texts("en"),
    "pt-BR": texts("pt"),
    "es-ES": texts("en", "a"),
  };

  it("asks the same four names in every language", () => {
    const { files } = buildQuiz(sights, all, []);
    const decoys = (locale: QuizLocale) => files[locale].questions.find((q) => q.id === "b")?.decoys;
    expect(decoys("en-US")).toEqual(["a", "c", "d"]);
    expect(decoys("pt-BR")).toEqual(decoys("en-US"));
    expect(decoys("es-ES")).toEqual(decoys("en-US"));
  });

  it("blanks an article title without its qualifier in brackets", () => {
    const stations = [
      at("s1", "181st Street", 0, "station"),
      at("s2", "Dyckman Street", 100, "station"),
      at("s3", "190th Street", 200, "station"),
      at("s4", "207th Street", 300, "station"),
    ];
    const text =
      "181st Street station is a local station on the IRT Broadway–Seventh Avenue Line of the subway, near the bridge.";
    const titled = Object.fromEntries(
      stations.map((s) => [
        s.id,
        { title: `${s.n} station (IRT Broadway–Seventh Avenue Line)`, text, lang: "en" },
      ]),
    );
    const { files } = buildQuiz(stations, { "en-US": titled, "pt-BR": {}, "es-ES": {} }, []);
    const parts = files["en-US"].questions[0].parts;
    expect(parts.filter((_, i) => i % 2 === 1)).toEqual(["181st Street station"]);
  });

  it("leaves a question out only where too little is left to read, and says so", () => {
    const { files, report } = buildQuiz(sights, all, []);
    expect(files["en-US"].questions.map((q) => q.id)).toEqual(["a", "b", "c", "d"]);
    expect(files["es-ES"].questions.map((q) => q.id)).toEqual(["b", "c", "d"]);
    expect(report.short["es-ES"]).toEqual(["Alpha Tower"]);
    expect(report.questions).toBe(4);
  });

  it("keeps the text's own language", () => {
    const { files } = buildQuiz(sights, all, []);
    expect(files["pt-BR"].questions[0].lang).toBe("pt");
    expect(files["en-US"].questions[0].parts.join("")).toBe(long("Alpha Tower"));
  });
});

describe("questions that must not answer themselves (review)", () => {
  const text = (title: string, body: string, url = `https://en.wikipedia.org/wiki/${title}`) => ({
    title,
    text: body,
    lang: "en",
    url,
  });
  const quiz = (
    sights: QuizSight[],
    en: Record<string, QuizText>,
    aliases: Record<string, string[]> = {},
    placeWords: string[] = [],
  ) => buildQuiz(sights, { "en-US": en, "pt-BR": {}, "es-ES": {} }, placeWords, aliases).files["en-US"];
  const blanks = (parts: string[]) => parts.filter((_, i) => i % 2 === 1);
  const filler = " It is a well known place that many people visit every single year.";

  it("asks one question per article, and never offers a building against its own twin", () => {
    const stations = [
      at("j1", "Avenue J", 0, "station"),
      at("j2", "Avenue J station", 10, "station"),
      at("m", "Avenue M", 300, "station"),
      at("u", "Avenue U", 600, "station"),
      at("x", "Avenue X", 900, "station"),
    ];
    const shared = text("Avenue J station", "Avenue J is a station on the Brighton Line." + filler);
    const en = {
      j1: shared,
      j2: shared,
      m: text("Avenue M station", "Avenue M is a station on the Brighton Line." + filler),
      u: text("Avenue U station", "Avenue U is a station on the Brighton Line." + filler),
      x: text("Avenue X station", "Avenue X is a station on the Culver Line." + filler),
    };
    const { questions } = quiz(stations, en);
    expect(questions.map((q) => q.id)).not.toContain("j2");
    expect(questions.find((q) => q.id === "j1")?.decoys).not.toContain("j2");
  });

  it("never offers two names that differ only by what they are", () => {
    const answer = at("a", "Olympic Tower", 0);
    const pool = [
      answer,
      at("c1", "Carnegie Hall", 10),
      at("c2", "Carnegie Hall Tower", 20),
      at("b", "Bush Tower", 30),
      at("w", "Woolworth Building", 40),
    ];
    const decoys = pickDecoys(answer, pool, [], none) ?? [];
    expect(decoys.filter((d) => d === "c1" || d === "c2")).toHaveLength(1);
  });

  it("blanks a name with nothing distinctive without what it is", () => {
    expect(
      blanks(
        blankName(
          "Avenue J is a station on the line, located on Avenue J at East 16th Street.",
          ["Avenue J station"],
          none,
        ),
      ),
    ).toEqual(["Avenue J", "Avenue J"]);
  });

  it("blanks a place word of the building's own area in its name", () => {
    const sights = [
      { ...at("s", "Statue of Liberty", 0, "landmark"), b: "Liberty Island" },
      { ...at("e", "Ellis Island Museum", 500, "landmark"), b: "Ellis Island" },
      at("c", "Castle Clinton", 900),
      at("p", "Pier A Harbor House", 1200),
    ];
    const en = Object.fromEntries(
      sights.map((s) => [
        s.id,
        text(s.n, `The ${s.n} is a colossal sculpture on Liberty Island in the harbor.` + filler),
      ]),
    );
    const statue = quiz(sights, en).questions.find((q) => q.id === "s")!;
    expect(statue.parts.filter((_, i) => i % 2 === 0).join("")).not.toMatch(/Liberty/);
  });

  it("blanks the aliases a city gives a name", () => {
    const sights = [
      at("met", "Metropolitan Museum of Art", 0, "museum"),
      at("g", "Guggenheim Museum", 300, "museum"),
      at("f", "Frick Collection", 600, "museum"),
      at("n", "Neue Galerie", 900, "museum"),
    ];
    const en = Object.fromEntries(
      sights.map((s) => [
        s.id,
        text(s.n, `The ${s.n}, colloquially referred to as the Met, is an art museum.` + filler),
      ]),
    );
    const met = quiz(sights, en, { "metropolitan museum of art": ["the Met"] }).questions.find(
      (q) => q.id === "met",
    )!;
    expect(blanks(met.parts)).toContain("the Met");
  });

  it("never takes the English 'as' or 'a' for an article", () => {
    expect(
      blanks(
        blankName("It was once known as Fuller Building, a Fuller Building icon.", ["Fuller Building"], none),
      ),
    ).toEqual(["Fuller Building", "Fuller Building"]);
  });

  it("blanks initials that leave out a number word", () => {
    expect(
      blanks(blankName("It is also known as One WTC downtown.", ["One World Trade Center"], none)),
    ).toEqual(["WTC"]);
  });

  it("never offers an address the question's own address rules out", () => {
    const answer = at("t", "Trump Tower", 0);
    const pool = [
      answer,
      at("712", "712 Fifth Avenue", 10),
      at("b", "Bush Tower", 20),
      at("w", "Woolworth Building", 30),
      at("o", "Olympic Tower", 40),
    ];
    const visible = ["The  is a skyscraper at 721–725 Fifth Avenue in Midtown."];
    expect(pickDecoys(answer, pool, visible, none)).toEqual(["b", "w", "o"]);
  });

  it("reads 5th and Fifth as one street", () => {
    const answer = at("f", "Fred F. French Building", 0);
    const pool = [
      answer,
      at("520", "520 5th Avenue", 10),
      at("b", "Bush Tower", 20),
      at("w", "Woolworth Building", 30),
      at("o", "Olympic Tower", 40),
    ];
    const visible = ["The  is an office building at 551 Fifth Avenue."];
    expect(pickDecoys(answer, pool, visible, none)).toEqual(["b", "w", "o"]);
  });

  it("takes what a building is from its opening before its name", () => {
    expect(
      kindOf({ n: "Carnegie Hall", t: "landmark" }, "Carnegie Hall is a concert venue in Midtown."),
    ).toBe("venue");
    expect(kindOf({ n: "Lyceum Theatre", t: "building" }, "The Lyceum Theatre is a Broadway theater.")).toBe(
      "venue",
    );
    expect(kindOf({ n: "Carnegie Hall Tower", t: "building" }, "Carnegie Hall Tower is a skyscraper.")).toBe(
      "general",
    );
    expect(
      kindOf({ n: "New York Hall of Science", t: "landmark" }, "It is a science museum in Queens."),
    ).toBe("museum");
    expect(kindOf({ n: "Masonic Hall", t: "building" })).toBe("general");
    expect(kindOf({ n: "Times Square", t: "station" }, "It is a museum of trains.")).toBe("station");
  });
});

describe("choices: levels, groups, areas and decoy sets", () => {
  it("groups what a place is into the four kinds a player can pick", () => {
    expect(groupOf("general")).toBe("buildings");
    expect(groupOf("hotel")).toBe("buildings");
    expect(groupOf("library")).toBe("museums");
    expect(groupOf("venue")).toBe("landmarks");
    expect(groupOf("monument")).toBe("landmarks");
    expect(groupOf("station")).toBe("stations");
    expect(
      kindOf({ n: "Statue of Liberty", t: "landmark" }, "It is a colossal sculpture on an island."),
    ).toBe("monument");
  });

  it("puts the most read quarter in easy, up to three fifths in medium, the rest in hard", () => {
    expect(levelsOf([9, 1, 5, 3, 7, 2, 8, 4])).toEqual([1, 3, 2, 3, 2, 3, 1, 2]);
  });

  // a small city: Manhattan with towers, museums, bridges and stations; the Bronx; one lone tower
  const rows: [string, string, string, string, number, number][] = [
    // id, name, type, area, metres east, views
    ["t1", "Alpha Tower", "building", "Manhattan", 0, 1_000_000],
    ["m1", "Cobalt Museum", "museum", "Manhattan", 300, 900_000],
    ["l1", "Echo Bridge", "bridge", "Manhattan", 600, 800_000],
    ["s1", "Dune Street", "station", "Manhattan", 900, 700_000],
    ["bt1", "Bronze Tower", "building", "Bronx", 20_000, 600_000],
    ["bm1", "Birch Museum", "museum", "Bronx", 20_300, 500_000],
    ["t2", "Bravo Tower", "building", "Manhattan", 100, 90_000],
    ["t3", "Charlie Tower", "building", "Manhattan", 200, 80_000],
    ["m2", "Coral Museum", "museum", "Manhattan", 400, 70_000],
    ["m3", "Crimson Museum", "museum", "Manhattan", 500, 60_000],
    ["l2", "Ember Bridge", "bridge", "Manhattan", 700, 50_000],
    ["s2", "Delta Street", "station", "Manhattan", 1000, 40_000],
    ["bt2", "Basalt Tower", "building", "Bronx", 20_100, 30_000],
    ["bs1", "Bay Avenue", "station", "Bronx", 20_500, 20_000],
    ["t4", "Delta Tower", "building", "Manhattan", 150, 900],
    ["t5", "Echo Tower", "building", "Manhattan", 250, 800],
    ["m4", "Cyan Museum", "museum", "Manhattan", 450, 700],
    ["l3", "Elm Bridge", "bridge", "Manhattan", 750, 600],
    ["s3", "Dove Street", "station", "Manhattan", 1100, 500],
    ["bt3", "Beryl Tower", "building", "Bronx", 20_200, 400],
    ["bs2", "Bluff Avenue", "station", "Bronx", 20_600, 300],
    ["x", "Lone Tower", "building", "Staten Island", 40_000, 200],
    ["t6", "Foxtrot Tower", "building", "Manhattan", 350, 100],
  ];
  const sights: QuizSight[] = rows.map(([id, n, t, b, east]) => ({ ...at(id, n, east, t), b }));
  const views = Object.fromEntries(rows.map(([id, , , , , v]) => [id, v]));
  const opening = (n: string, t: string) =>
    t === "museum"
      ? `The ${n} is an art museum with a long history and many visitors who come every single year.`
      : `The ${n} is a ${t === "station" ? "station" : t === "bridge" ? "bridge" : "skyscraper"} with a long history and many visitors who come every single year.`;
  const en = Object.fromEntries(
    sights.map((x) => [
      x.id,
      { title: x.n, text: opening(x.n, x.t), lang: "en", url: `https://en.wikipedia.org/wiki/${x.id}` },
    ]),
  );
  const built = buildQuiz(
    sights,
    { "en-US": en, "pt-BR": {}, "es-ES": {} },
    [],
    {},
    {
      views,
      areas: ["Manhattan", "Bronx", "Staten Island"],
    },
  );
  const qs = built.files["en-US"].questions;
  const byId = new Map(sights.map((x) => [x.id, x]));
  const q = (id: string) => qs.find((x) => x.id === id)!;
  const setOf = (id: string, level: "easy" | "medium" | "hard", scope: "all" | "area" | "group" | "both") => {
    const sets = q(id).sets[level]!;
    return sets[scope] ?? sets.all!;
  };
  const groupOfId = (id: string) => q(id).group;

  it("gives each question its level, group and area", () => {
    expect(q("t1")).toMatchObject({ level: 1, group: "buildings", area: "Manhattan" });
    expect(q("m1")).toMatchObject({ level: 1, group: "museums" });
    expect(q("l1").group).toBe("landmarks");
    expect(q("s1").group).toBe("stations");
    expect(q("t6").level).toBe(3);
  });

  it("gives a famous question every difficulty's sets, an obscure one only hard's", () => {
    expect(Object.keys(q("t1").sets).sort()).toEqual(["easy", "hard", "medium"]);
    expect(Object.keys(q("t6").sets)).toEqual(["hard"]);
  });

  it("keeps hard's set for all as the decoys an older page reads", () => {
    for (const x of qs) expect(x.decoys).toEqual(x.sets.hard!.all);
  });

  it("takes a borough game's wrong answers from that borough", () => {
    for (const x of qs.filter((x) => x.area === "Manhattan"))
      for (const level of Object.keys(x.sets) as ("easy" | "medium" | "hard")[])
        for (const d of setOf(x.id, level, "area"))
          expect(byId.get(d)!.b, `${x.id} ${level}`).toBe("Manhattan");
  });

  it("takes a kind game's wrong answers of that kind", () => {
    for (const id of ["t2", "m2", "t4", "m4", "s2"])
      for (const d of setOf(id, "hard", "group")) expect(groupOfId(d), id).toBe(groupOfId(id));
    for (const d of setOf("m2", "hard", "both")) {
      expect(groupOfId(d)).toBe("museums");
      expect(byId.get(d)!.b).toBe("Manhattan");
    }
  });

  it("makes easy's wrong answers plainly other kinds of place, each a different one", () => {
    const groups = setOf("t1", "easy", "all").map(groupOfId);
    expect(groups).not.toContain("buildings");
    expect(new Set(groups).size).toBe(3);
  });

  it("spreads easy's wrong answers over the famous ones instead of the same three", () => {
    const names = new Set(qs.filter((x) => x.level === 1).flatMap((x) => setOf(x.id, "easy", "all")));
    expect(names.size).toBeGreaterThan(3);
  });

  it("borrows from outside a borough too small to give three, and says so", () => {
    const lone = setOf("x", "hard", "area");
    expect(lone).toHaveLength(3);
    expect(built.report.borrowed.hard).toBeGreaterThan(0);
  });
});

describe("easy's wrong answers do not repeat round after round (review)", () => {
  // 44 famous places (towers, three hotels, nine museums, two stations), interleaved in fame,
  // and 132 obscure towers elsewhere so that the famous ones are the easy quarter
  const famous: [string, string, string][] = [];
  for (let i = 0; i < 44; i++) {
    const kind = i % 15 === 7 ? "hotel" : i % 5 === 2 ? "museum" : i === 20 || i === 40 ? "station" : "tower";
    famous.push([
      `f${i}`,
      `${["Zeta", "Kappa", "Sigma", "Omega"][i % 4]}${i} ${kind === "hotel" ? "Hotel" : kind === "museum" ? "Museum" : kind === "station" ? "Street" : "Tower"}`,
      kind,
    ]);
  }
  const sights: QuizSight[] = [
    ...famous.map(([id, n, kind], i) => ({
      ...at(id, n, i * 50, kind === "museum" ? "museum" : kind === "station" ? "station" : "building"),
      b: "Manhattan",
    })),
    ...Array.from({ length: 132 }, (_, i) => ({
      ...at(`o${i}`, `Obscure${i} Tower`, 50_000 + i * 50, "building"),
      b: "Brooklyn",
    })),
  ];
  const kindOfRow = new Map(famous.map(([id, , kind]) => [id, kind]));
  const views = Object.fromEntries(
    sights.map((s, i) => [s.id, s.id.startsWith("f") ? 1_000_000 - i * 1000 : 100 - (i % 90)]),
  );
  const text = (s: QuizSight) => {
    const k = kindOfRow.get(s.id) ?? "tower";
    const is =
      k === "hotel"
        ? "a hotel"
        : k === "museum"
          ? "an art museum"
          : k === "station"
            ? "a station"
            : "a skyscraper";
    return `The ${s.n} is ${is} with a long history and many visitors who come every single year.`;
  };
  const en = Object.fromEntries(
    sights.map((s) => [
      s.id,
      { title: s.n, text: text(s), lang: "en", url: `https://en.wikipedia.org/wiki/${s.id}` },
    ]),
  );
  const { files } = buildQuiz(
    sights,
    { "en-US": en, "pt-BR": {}, "es-ES": {} },
    [],
    {},
    { views, areas: ["Manhattan", "Brooklyn"] },
  );
  const easy = files["en-US"].questions.filter((q) => q.level === 1);
  /** The share of these questions' sets the most used name appears in. */
  const mostUsed = (qs: typeof easy, scope: "all" | "group") => {
    const uses = new Map<string, number>();
    for (const q of qs)
      for (const d of q.sets.easy![scope] ?? q.sets.easy!.all!) uses.set(d, (uses.get(d) ?? 0) + 1);
    return Math.max(...uses.values()) / qs.length;
  };

  it("are the famous quarter", () => {
    expect(easy).toHaveLength(44);
  });

  it("spread over the kind's famous places when the kind is chosen", () => {
    const buildings = easy.filter((q) => q.group === "buildings");
    expect(mostUsed(buildings, "group")).toBeLessThanOrEqual(0.4);
  });

  it("do not force a kind with only a couple of famous places into every round", () => {
    expect(mostUsed(easy, "all")).toBeLessThanOrEqual(0.5);
  });
});

describe("a question's area where context lines are neighbourhoods", () => {
  // Cincinnati's sights say "Downtown" or "Riverfront"; here the river is 400 m east of the start
  const sights: QuizSight[] = [
    { ...at("a", "Alder Tower", 0, "building"), b: "Downtown" },
    { ...at("b", "Birch Tower", 200, "building"), b: "Riverfront" },
    { ...at("c", "Cedar Tower", 600, "building"), b: "Covington" },
    { ...at("d", "Dogwood Tower", 800, "building") },
  ];
  const en = Object.fromEntries(
    sights.map((x) => [
      x.id,
      {
        title: x.n,
        text: `The ${x.n} is a skyscraper with a long history and many visitors who come every single year.`,
        lang: "en",
        url: `https://en.wikipedia.org/wiki/${x.id}`,
      },
    ]),
  );
  const river = at("", "", 400).lon;
  const areas = (districtAt?: (lon: number, lat: number) => string) =>
    buildQuiz(
      sights,
      { "en-US": en, "pt-BR": {}, "es-ES": {} },
      [],
      {},
      { areas: ["Cincinnati", "Covington"], districtAt },
    ).files["en-US"].questions.map((q) => [q.id, q.area]);

  it("is the district the sight stands in, unless its context line is one", () => {
    const districtAt = (lon: number) => (lon < river ? "Cincinnati" : "Covington");
    expect(areas(districtAt)).toEqual([
      ["a", "Cincinnati"],
      ["b", "Cincinnati"],
      ["c", "Covington"],
      ["d", "Covington"],
    ]);
  });

  it("is only a context line that is one, without districts", () => {
    expect(areas()).toEqual([
      ["a", undefined],
      ["b", undefined],
      ["c", "Covington"],
      ["d", undefined],
    ]);
  });
});
