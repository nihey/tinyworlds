import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES } from "@/i18n";
import { DEFAULT_WORLD, HOME, IS_HOME, resolveWorld, WORLD, WORLDS } from "..";

describe("resolveWorld", () => {
  it("defaults to tinynyc", () => {
    expect(DEFAULT_WORLD).toBe("tinynyc");
    expect(resolveWorld(undefined).id).toBe("tinynyc");
    expect(resolveWorld("  ").id).toBe("tinynyc");
    expect(WORLD.id).toBe("tinynyc");
  });

  it("picks a world by id", () => {
    expect(resolveWorld("tinyrao").id).toBe("tinyrao");
    expect(resolveWorld("tinyrao").homeLocale).toBe("pt-BR");
    expect(resolveWorld("tinynyc").homeLocale).toBe("en-US");
    expect(resolveWorld("tinyorl").id).toBe("tinyorl");
    expect(resolveWorld("tinyorl").homeLocale).toBe("en-US");
    expect(resolveWorld("tinyfte").id).toBe("tinyfte");
    expect(resolveWorld("tinyfte").homeLocale).toBe("es-ES");
    expect(resolveWorld("tinyvlc").id).toBe("tinyvlc");
    expect(resolveWorld("tinyvlc").homeLocale).toBe("es-ES");
    for (const id of [
      "tinylas",
      "tinylax",
      "tinydal",
      "tinycvg",
      "tinypit",
      "tinyphl",
      "tinycos",
      "tinytkf",
      "tinywinterfell",
      "tinykingslanding",
    ]) {
      expect(resolveWorld(id).id).toBe(id);
      expect(resolveWorld(id).homeLocale).toBe("en-US");
    }
  });

  it("lists the worlds in the order the front page shows them", () => {
    expect(Object.keys(WORLDS)).toEqual([
      "tinynyc",
      "tinyrao",
      "tinyorl",
      "tinyfte",
      "tinyvlc",
      "tinylas",
      "tinylax",
      "tinydal",
      "tinycvg",
      "tinypit",
      "tinyphl",
      "tinycos",
      "tinytkf",
      "tinywinterfell",
      "tinykingslanding",
      "tinywesteros",
    ]);
  });

  it("stops on an id it does not know, naming the ones it does", () => {
    expect(() => resolveWorld("tinysp")).toThrow(/tinysp.*tinynyc, tinyrao.*home/);
  });

  it("keeps the front page apart: it is a build target, not a world", () => {
    expect(HOME).toBe("home");
    expect(WORLDS[HOME]).toBeUndefined();
    expect(IS_HOME).toBe(false);
  });
});

describe("worlds", () => {
  it("are filed under their own id and have a dictionary", () => {
    for (const [key, world] of Object.entries(WORLDS)) {
      expect(world.id).toBe(key);
      expect(DICTIONARIES[world.homeLocale]).toBeDefined();
      expect(world.wordmark).toMatch(/^[a-z]+$/);
      expect(world.accent.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(world.accent.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("say everything about themselves in every language, with the same shape", () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(shape)
        : typeof value === "object" && value !== null
          ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
          : typeof value;
    const texts = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value
          ? Object.values(value).flatMap(texts)
          : [];
    for (const world of Object.values(WORLDS)) {
      const home = shape(world.copy[world.homeLocale]);
      for (const locale of LOCALES) {
        const copy = world.copy[locale];
        expect(copy, `${world.id} ${locale}`).toBeDefined();
        // same keys, and the same number of notes under the About text
        expect(shape(copy), `${world.id} ${locale}`).toEqual(home);
        for (const text of texts(copy)) expect(text.trim(), `${world.id} ${locale}`).not.toBe("");
        expect(copy.title.startsWith(`tiny${world.wordmark} · `), `${world.id} ${locale}`).toBe(
          true,
        );
      }
    }
  });

  it("call their districts what the city calls them", () => {
    expect(LOCALES.map((locale) => WORLDS.tinynyc.copy[locale].borough)).toEqual([
      "Borough",
      "Distrito",
      "Distrito",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyrao.copy[locale].borough)).toEqual([
      "Region",
      "Região",
      "Región",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyrao.copy[locale].hoodLines.label)).toEqual([
      "Sub-sectors",
      "Subsetores",
      "Subsectores",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinynyc.copy[locale].hoodLines.label)).toEqual([
      "Neighbourhood lines",
      "Linhas dos bairros",
      "Límites de barrios",
    ]);
    // Orlando's districts are the municipalities around it
    expect(LOCALES.map((locale) => WORLDS.tinyorl.copy[locale].borough)).toEqual([
      "City",
      "Cidade",
      "Ciudad",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyorl.copy[locale].hoodLines.label)).toEqual([
      "Neighborhood lines",
      "Linhas dos bairros",
      "Límites de barrios",
    ]);
    // a town has parts, a Spanish city has districts
    expect(LOCALES.map((locale) => WORLDS.tinyfte.copy[locale].borough)).toEqual([
      "Area",
      "Zona",
      "Zona",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyvlc.copy[locale].borough)).toEqual([
      "District",
      "Distrito",
      "Distrito",
    ]);
    for (const id of ["tinyfte", "tinyvlc"])
      expect(LOCALES.map((locale) => WORLDS[id].copy[locale].hoodLines.label)).toEqual([
        "Neighbourhood lines",
        "Linhas dos bairros",
        "Límites de barrios",
      ]);
    // Las Vegas' districts are the municipalities of the valley, as in Orlando
    expect(LOCALES.map((locale) => WORLDS.tinylas.copy[locale].borough)).toEqual([
      "City",
      "Cidade",
      "Ciudad",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinylas.copy[locale].hoodLines.label)).toEqual([
      "Neighborhood lines",
      "Linhas dos bairros",
      "Límites de barrios",
    ]);
    // Los Angeles' districts are the cities of the basin; its outlines, the communities
    expect(LOCALES.map((locale) => WORLDS.tinylax.copy[locale].borough)).toEqual([
      "City",
      "Cidade",
      "Ciudad",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinylax.copy[locale].hoodLines.label)).toEqual([
      "Neighborhood lines",
      "Linhas dos bairros",
      "Límites de barrios",
    ]);
    // Dallas' and Cincinnati's districts are the cities on the map (Highland Park; Covington and
    // Newport across the river); Pittsburgh's, Philadelphia's and Colorado Springs' are their parts
    // of town (Downtown, the North Side; Center City; the Old North End) and the towns round them;
    // all five outline the neighborhoods
    for (const id of ["tinydal", "tinycvg", "tinypit", "tinyphl", "tinycos"]) {
      expect(LOCALES.map((locale) => WORLDS[id].copy[locale].borough)).toEqual(
        id === "tinydal" || id === "tinycvg"
          ? ["City", "Cidade", "Ciudad"]
          : ["Area", "Região", "Zona"],
      );
      expect(LOCALES.map((locale) => WORLDS[id].copy[locale].hoodLines.label)).toEqual([
        "Neighborhood lines",
        "Linhas dos bairros",
        "Límites de barrios",
      ]);
    }
    // Truckee's one district is the town itself, and it outlines nothing
    expect(LOCALES.map((locale) => WORLDS.tinytkf.copy[locale].borough)).toEqual([
      "Town",
      "Município",
      "Municipio",
    ]);
    // a castle has areas, a walled capital has quarters; both are outlined as districts
    expect(LOCALES.map((locale) => WORLDS.tinywinterfell.copy[locale].borough)).toEqual([
      "Area",
      "Área",
      "Zona",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinykingslanding.copy[locale].borough)).toEqual([
      "Quarter",
      "Bairro",
      "Barrio",
    ]);
    for (const id of ["tinywinterfell", "tinykingslanding"])
      expect(LOCALES.map((locale) => WORLDS[id].copy[locale].hoodLines.label)).toEqual([
        "Districts",
        "Distritos",
        "Distritos",
      ]);
  });

  it("mark the places that do not exist, and say so in every language", () => {
    const imagined = Object.values(WORLDS).filter((world) => world.fictional);
    expect(imagined.map((world) => world.id)).toEqual([
      "tinywinterfell",
      "tinykingslanding",
      "tinywesteros",
    ]);
    for (const world of imagined) {
      for (const locale of LOCALES) {
        const { about, description } = world.copy[locale];
        const said = [about.intro, ...about.notes].join(" ");
        // whose story it is, and that neither its author nor the series stands behind this map
        expect(said, `${world.id} ${locale}`).toMatch(/George R\. R\. Martin/);
        expect(said, `${world.id} ${locale}`).toMatch(/HBO/);
        // nothing here comes from open data, and nothing may claim it does
        expect(`${said} ${description}`, `${world.id} ${locale}`).not.toMatch(
          /open data|dados abertos|datos abiertos|OpenStreetMap/i,
        );
      }
      expect(world.copy["en-US"].about.notes[0]).toMatch(/unofficial, fan-made/);
      expect(world.copy["en-US"].about.notes[1]).toMatch(/invented for this map/);
      expect(world.credit).not.toMatch(/OpenStreetMap|Overture/);
    }
    // and every other world is a real place drawn from real data
    for (const world of Object.values(WORLDS).filter((w) => !w.fictional))
      expect(world.credit).toMatch(/OpenStreetMap/);
  });

  it("are named in each language the way that language names the city", () => {
    expect(LOCALES.map((locale) => WORLDS.tinykingslanding.copy[locale].city)).toEqual([
      "King's Landing",
      "Porto Real",
      "Desembarco del Rey",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinylas.copy[locale].tagline)).toEqual([
      "Las Vegas, pocket-sized",
      "Las Vegas, em miniatura",
      "Las Vegas, en miniatura",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinylax.copy[locale].city)).toEqual([
      "Los Angeles",
      "Los Angeles",
      "Los Ángeles",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyvlc.copy[locale].city)).toEqual([
      "Valencia",
      "Valência",
      "Valencia",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyfte.copy[locale].tagline)).toEqual([
      "El Calafate, pocket-sized",
      "El Calafate, em miniatura",
      "El Calafate, en miniatura",
    ]);
  });

  it("say truthfully where each city's building heights come from", () => {
    // Orlando's are on record; Ribeirão Preto's and El Calafate's are read off satellite imagery
    expect(WORLDS.tinyorl.copy["en-US"].about.notes[0]).toMatch(/come from the map data/);
    expect(WORLDS.tinyorl.copy["en-US"].about.notes[0]).not.toMatch(/no height on record/);
    expect(WORLDS.tinyfte.copy["en-US"].about.notes[0]).toMatch(/satellite/);
    expect(WORLDS.tinyvlc.copy["en-US"].about.notes[0]).toMatch(/number of floors/);
    expect(WORLDS.tinylas.copy["en-US"].about.notes[0]).toMatch(/come from the map data/);
    expect(WORLDS.tinylax.copy["en-US"].about.notes[0]).toMatch(/come from the map data/);
    expect(WORLDS.tinydal.copy["en-US"].about.notes[0]).toMatch(/come from the map data/);
    expect(WORLDS.tinycvg.copy["en-US"].about.notes[0]).toMatch(/number of floors/);
    // Pittsburgh has about half its buildings measured, Philadelphia nearly all
    expect(WORLDS.tinypit.copy["en-US"].about.notes[0]).toMatch(/about half/);
    expect(WORLDS.tinyphl.copy["en-US"].about.notes[0]).toMatch(/nearly every building/);
    // Colorado Springs' heights are estimates that read tall buildings low: the floors decide
    expect(WORLDS.tinycos.copy["en-US"].about.notes[0]).toMatch(/estimated height.*floors decide/);
    // Truckee's come with the data too, but every one was estimated from imagery, none measured
    expect(WORLDS.tinytkf.copy["en-US"].about.notes[0]).toMatch(/estimated from aerial imagery/);
    expect(WORLDS.tinytkf.copy["en-US"].about.notes[0]).toMatch(/not measured/);
  });

  it("light up their buildings, and play Guess the building only where they do", () => {
    const lit = Object.values(WORLDS).filter((world) => world.sights);
    expect(lit.map((world) => world.id)).toEqual([
      "tinynyc",
      "tinydal",
      "tinycvg",
      "tinypit",
      "tinyphl",
      "tinycos",
      "tinytkf",
    ]);
    // the game is played on the lit buildings: no quiz without sights, and none in a made-up place
    for (const world of Object.values(WORLDS)) {
      if (world.quiz) expect(world.sights, world.id).toBe(true);
      if (world.fictional) expect(world.sights ?? false, world.id).toBe(false);
    }
    // every lit city plays but Truckee: a small town with six Wikipedia articles is no game
    expect(lit.filter((world) => !world.quiz).map((world) => world.id)).toEqual(["tinytkf"]);
  });

  it("write search aliases the way queries are normalised: lower case, no accents", () => {
    for (const world of Object.values(WORLDS)) {
      for (const [short, long] of Object.entries(world.search.abbreviations)) {
        expect(short).toMatch(/^[a-z0-9]+$/);
        for (const word of long) expect(word).toMatch(/^=?[a-z0-9]+$/);
      }
    }
  });
});

/** The relative luminance and contrast ratio of WCAG 2. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("accent colours", () => {
  const SIGN = "#15171a";
  const SIGN_DUSK = "#1b1e22";

  it("carry their ink, and read on the signs, at WCAG AA or better", () => {
    for (const world of Object.values(WORLDS)) {
      expect(contrast(world.accent.color, world.accent.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(world.accent.color, SIGN)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(world.accent.color, SIGN_DUSK)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
