/**
 * "Your city": a vertical short per real city, for the city's own subreddit, where locals spot
 * the places they know. The whole city with a line on it, four flights to the landmarks a local
 * names first (each named on a sign as the view lands), the last one lit under the pointer, then
 * "Find your street" over the whole city again. One music bed for the series
 * (social-city/assets/music/bed.mp3, 100 BPM, its first downbeat at 0.035 s): every moment below
 * is on its grid, and so is the composition (social-city/index.html).
 *
 * Names are the map's own (places.json, sights.json), the way locals will check them.
 */

/** A spot to look at: where, how close (CSS px per map px), and how far the view is lifted. */
export interface Spot {
  lon: number;
  lat: number;
  scale: number;
  /** metres the view is lifted, to centre something tall */
  rise?: number;
  /** CSS px the subject stands right of the middle (a tall one, clear of the sign at the top left) */
  dx?: number;
}

export interface Stop extends Spot {
  /** the sign: the place as the map names it */
  name: string;
  /** the small line over it: its part of town */
  area: string;
  /** the sight lit under the pointer (the last stop only), an id of sights.json */
  sight?: string;
}

export interface Opening {
  /** the city's width shown across the frame: 1 fits it exactly, more crops its ends */
  fit: number;
  /** where the middle is, as a share of the content's box (0.5, 0.5: its middle) */
  cx?: number;
  cy?: number;
}

export interface CityPlan {
  world: string;
  /** the viewer's language and the words' */
  lang: "en-US" | "pt-BR" | "es-ES";
  open: Opening;
  stops: [Stop, Stop, Stop, Stop];
  /** the hook, on screen from the first frame: a big line ("\n" where it should break) and a smaller one */
  hook: [string, string];
}

/** The words that are the same for every city in a language. */
export const WORDS: Record<CityPlan["lang"], { find: string; note: string }> = {
  "en-US": { find: "Find your street", note: "Free to explore. No account." },
  "pt-BR": { find: "Encontre sua rua", note: "Grátis. Sem cadastro." },
  "es-ES": { find: "Encuentra tu calle", note: "Gratis. Sin registro." },
};

/** The bed: 100 BPM, a beat every 0.6 s, the first downbeat 0.035 s in. */
export const BEAT = 0.6;
const ONE = 0.035;
export const bar = (k: number): number => +(ONE + 4 * BEAT * k).toFixed(3);

/** The moments, in seconds of the film. */
export const AT = {
  /** the whole city, then down to the first place */
  dive: bar(1),
  /** the view lands on each place on a downbeat */
  land: [bar(2), bar(3), bar(4), bar(5)],
  /** and leaves it on the bar's third beat */
  leave: [bar(2) + 2 * BEAT, bar(3) + 2 * BEAT, bar(4) + 2 * BEAT],
  /** the last place: the pointer comes in and the building lights up */
  lit: +(bar(5) + 2 * BEAT).toFixed(3),
  /** the pointer leaves and the view goes back out to the whole city */
  out: bar(7),
  back: +(bar(7) + 3 * BEAT).toFixed(3),
  /** the bed's last chord */
  crash: bar(8),
  end: 20.8,
};

export const PLANS: CityPlan[] = [
  {
    world: "tinypit",
    lang: "en-US",
    open: { fit: 1.5, cx: 0.45 },
    hook: ["All of Pittsburgh", "every building"],
    stops: [
      { name: "Point State Park", area: "Downtown", lon: -80.0128, lat: 40.4417, scale: 0.45 },
      { name: "PNC Park", area: "North Side", lon: -80.0056, lat: 40.4469, scale: 0.55 },
      { name: "PPG Place", area: "Downtown", lon: -80.0038, lat: 40.44, scale: 0.7, rise: 40 },
      {
        name: "Cathedral of Learning",
        area: "Oakland",
        lon: -79.9532,
        lat: 40.4443,
        scale: 0.62,
        rise: 70,
        sight: "byuot64",
      },
    ],
  },
  {
    world: "tinynyc",
    lang: "en-US",
    open: { fit: 1.3, cx: 0.47 },
    hook: ["All five boroughs", "every building"],
    stops: [
      {
        name: "Statue of Liberty",
        area: "Liberty Island",
        lon: -74.0445,
        lat: 40.6892,
        scale: 1.0,
        rise: 40,
      },
      { name: "Brooklyn Bridge", area: "East River", lon: -73.9969, lat: 40.7061, scale: 0.42, rise: 25 },
      { name: "Central Park", area: "Manhattan", lon: -73.9654, lat: 40.7829, scale: 0.13 },
      {
        name: "Empire State Building",
        area: "Midtown Manhattan",
        lon: -73.9857,
        lat: 40.7484,
        scale: 0.34,
        rise: 150,
        dx: 120,
        sight: "b1we5bnh",
      },
    ],
  },
  {
    world: "tinyrao",
    lang: "pt-BR",
    open: { fit: 1.35 },
    hook: ["Ribeirão Preto\ninteira", "prédio por prédio"],
    stops: [
      {
        name: "USP Ribeirão Preto",
        area: "Cidade Universitária",
        lon: -47.85664,
        lat: -21.16197,
        scale: 0.22,
      },
      {
        name: "Bosque Municipal Fábio Barreto",
        area: "Zona Norte",
        lon: -47.80072,
        lat: -21.17287,
        scale: 0.4,
      },
      {
        name: "Estádio Santa Cruz",
        area: "Zona Leste",
        lon: -47.79014,
        lat: -21.20212,
        scale: 0.55,
        rise: 8,
      },
      {
        name: "Theatro Pedro II",
        area: "Centro",
        lon: -47.80983,
        lat: -21.17435,
        scale: 1.2,
        rise: 10,
        sight: "b1wrthdh",
      },
    ],
  },
  {
    world: "tinyorl",
    lang: "en-US",
    open: { fit: 1.45 },
    hook: ["All of Orlando", "every building"],
    stops: [
      { name: "Lake Eola Park", area: "Downtown", lon: -81.3725, lat: 28.54388, scale: 0.4 },
      {
        name: "Orlando International Airport (MCO)",
        area: "Southeast Orlando",
        lon: -81.3089,
        lat: 28.4294,
        scale: 0.2,
      },
      { name: "Spaceship Earth", area: "EPCOT", lon: -81.5494, lat: 28.37529, scale: 0.8, rise: 25 },
      {
        name: "Disney's Contemporary Resort",
        area: "Walt Disney World",
        lon: -81.57444,
        lat: 28.41524,
        scale: 0.7,
        rise: 25,
        sight: "baiisvu",
      },
    ],
  },
  {
    world: "tinyfte",
    lang: "es-ES",
    open: { fit: 1.6, cx: 0.6 },
    hook: ["Todo El Calafate", "casa por casa"],
    stops: [
      { name: "Reserva Laguna Nimez", area: "Lago Argentino", lon: -72.26875, lat: -50.32498, scale: 0.3 },
      {
        name: "Centro de Interpretación Histórica",
        area: "El Calafate",
        lon: -72.26508,
        lat: -50.33142,
        scale: 1.1,
        rise: 5,
      },
      {
        name: "Centro de El Calafate",
        area: "Avenida del Libertador",
        lon: -72.2648,
        lat: -50.3379,
        scale: 0.5,
      },
      {
        name: "Glaciarium · Museo del Hielo Patagónico",
        area: "Ruta Provincial 11",
        lon: -72.33977,
        lat: -50.33666,
        scale: 1.3,
        rise: 6,
        sight: "bow15ps",
      },
    ],
  },
  {
    world: "tinyvlc",
    lang: "es-ES",
    open: { fit: 1.5, cx: 0.55 },
    hook: ["Toda Valencia", "edificio a edificio"],
    stops: [
      { name: "Platja de la Malva-rosa", area: "Poblats Marítims", lon: -0.32372, lat: 39.47894, scale: 0.3 },
      { name: "Mestalla", area: "València CF", lon: -0.35831, lat: 39.47471, scale: 0.55, rise: 15 },
      {
        name: "Catedral de València",
        area: "Ciutat Vella",
        lon: -0.37507,
        lat: 39.4756,
        scale: 1.0,
        rise: 25,
      },
      {
        name: "L'Hemisfèric",
        area: "Ciutat de les Arts i les Ciències",
        lon: -0.35388,
        lat: 39.45668,
        scale: 0.75,
        rise: 10,
        sight: "b1er9r4g",
      },
    ],
  },
  {
    world: "tinylas",
    lang: "en-US",
    open: { fit: 1.2 },
    hook: ["Vegas,\nblock by block", "every building"],
    stops: [
      { name: "Harry Reid International Airport", area: "Paradise", lon: -115.153, lat: 36.084, scale: 0.12 },
      {
        name: "Allegiant Stadium",
        area: "West of the Strip",
        lon: -115.18333,
        lat: 36.09073,
        scale: 0.45,
        rise: 15,
      },
      { name: "Sphere", area: "East of the Strip", lon: -115.16207, lat: 36.12124, scale: 0.7, rise: 50 },
      {
        name: "Eiffel Tower",
        area: "Paris Las Vegas",
        lon: -115.17214,
        lat: 36.11247,
        scale: 0.8,
        rise: 40,
        dx: 110,
        sight: "bfkro2m",
      },
    ],
  },
  {
    world: "tinylax",
    lang: "en-US",
    open: { fit: 1.6, cx: 0.55 },
    hook: ["The whole LA basin", "every building"],
    stops: [
      { name: "Santa Monica Pier", area: "Santa Monica", lon: -118.49737, lat: 34.00901, scale: 0.5 },
      { name: "Hollywood Sign", area: "Mount Lee", lon: -118.32173, lat: 34.13416, scale: 0.8 },
      {
        name: "Griffith Observatory",
        area: "Griffith Park",
        lon: -118.30035,
        lat: 34.11825,
        scale: 0.8,
        rise: 10,
      },
      {
        name: "U.S. Bank Tower",
        area: "Downtown",
        lon: -118.25442,
        lat: 34.05107,
        scale: 0.38,
        rise: 130,
        dx: 100,
        sight: "b1fnc481",
      },
    ],
  },
  {
    world: "tinydal",
    lang: "en-US",
    open: { fit: 1.4, cx: 0.55 },
    hook: ["Dallas,\nblock by block", "every building"],
    stops: [
      { name: "White Rock Lake", area: "East Dallas", lon: -96.71945, lat: 32.835, scale: 0.1 },
      { name: "Fair Park", area: "South Dallas", lon: -96.75971, lat: 32.77862, scale: 0.25 },
      {
        name: "Margaret Hunt Hill Bridge",
        area: "Trinity River",
        lon: -96.82243,
        lat: 32.77993,
        scale: 0.6,
        rise: 40,
      },
      {
        name: "Reunion Tower",
        area: "Downtown",
        lon: -96.80894,
        lat: 32.77535,
        scale: 0.6,
        rise: 80,
        sight: "statue:0",
      },
    ],
  },
  {
    world: "tinycvg",
    lang: "en-US",
    open: { fit: 1.6 },
    hook: ["Cincy,\nblock by block", "every building"],
    stops: [
      {
        name: "Cincinnati Union Terminal",
        area: "Queensgate",
        lon: -84.5378,
        lat: 39.11,
        scale: 0.8,
        rise: 20,
      },
      {
        name: "Cincinnati Music Hall",
        area: "Over-the-Rhine",
        lon: -84.51919,
        lat: 39.10939,
        scale: 0.7,
        rise: 15,
      },
      {
        name: "Roebling Suspension Bridge",
        area: "Ohio River",
        lon: -84.50986,
        lat: 39.09288,
        scale: 0.5,
        rise: 20,
      },
      {
        name: "Carew Tower",
        area: "Downtown",
        lon: -84.51329,
        lat: 39.10084,
        scale: 0.7,
        rise: 80,
        dx: 60,
        sight: "bd6lquu",
      },
    ],
  },
  {
    world: "tinyphl",
    lang: "en-US",
    open: { fit: 1.35 },
    hook: ["Philly,\nblock by block", "every building"],
    stops: [
      {
        name: "Philadelphia Museum of Art",
        area: "Fairmount Park",
        lon: -75.18152,
        lat: 39.96557,
        scale: 0.6,
        rise: 15,
      },
      {
        name: "Lincoln Financial Field",
        area: "South Philadelphia",
        lon: -75.16749,
        lat: 39.90091,
        scale: 0.5,
        rise: 10,
      },
      {
        name: "Ben Franklin Bridge",
        area: "Delaware River",
        lon: -75.13277,
        lat: 39.95267,
        scale: 0.35,
        rise: 30,
      },
      {
        name: "Philadelphia City Hall",
        area: "Center City",
        lon: -75.16299,
        lat: 39.9524,
        scale: 0.55,
        rise: 75,
        sight: "bn7ql1v",
      },
    ],
  },
  {
    world: "tinycos",
    lang: "en-US",
    open: { fit: 1.0, cx: 0.55 },
    hook: ["All of\nColorado Springs", "every building"],
    stops: [
      {
        name: "United States Air Force Academy",
        area: "Air Force Academy",
        lon: -104.888,
        lat: 39.009,
        scale: 0.35,
        rise: 10,
      },
      { name: "Garden of the Gods", area: "Colorado Springs", lon: -104.8824, lat: 38.8744, scale: 0.35 },
      { name: "Weidner Field", area: "Downtown", lon: -104.82839, lat: 38.82625, scale: 0.7, rise: 8 },
      {
        name: "The Broadmoor",
        area: "Broadmoor",
        lon: -104.85062,
        lat: 38.79126,
        scale: 0.6,
        rise: 15,
        sight: "b8v6irk",
      },
    ],
  },
  {
    world: "tinytkf",
    lang: "en-US",
    open: { fit: 1.9, cx: 0.45 },
    hook: ["All of Truckee", "every building"],
    stops: [
      { name: "Donner Lake", area: "Truckee", lon: -120.26917, lat: 39.32285, scale: 0.12 },
      {
        name: "Pioneer Monument",
        area: "Donner Memorial State Park",
        lon: -120.23104,
        lat: 39.32383,
        scale: 2.0,
        rise: 6,
      },
      { name: "Truckee Tahoe Airport", area: "Truckee", lon: -120.14501, lat: 39.31938, scale: 0.18 },
      {
        name: "Truckee station",
        area: "Commercial Row",
        lon: -120.1856,
        lat: 39.32749,
        scale: 1.0,
        rise: 5,
        sight: "bjcc9ds",
      },
    ],
  },
  {
    world: "tinyaus",
    lang: "en-US",
    open: { fit: 1.25 },
    hook: ["All of Austin", "every building"],
    stops: [
      {
        name: "Pennybacker Bridge",
        area: "Lake Austin",
        lon: -97.79703,
        lat: 30.34991,
        scale: 0.45,
        rise: 15,
      },
      { name: "Barton Springs Pool", area: "Zilker Park", lon: -97.77144, lat: 30.26394, scale: 0.9 },
      { name: "UT Tower", area: "University of Texas", lon: -97.7395, lat: 30.2863, scale: 0.75, rise: 45 },
      {
        name: "Texas State Capitol",
        area: "Downtown",
        lon: -97.74035,
        lat: 30.27466,
        scale: 0.6,
        rise: 40,
        sight: "b1om4sj4",
      },
    ],
  },
  {
    world: "tinysfo",
    lang: "en-US",
    open: { fit: 1.2 },
    hook: ["All of\nSan Francisco", "every building"],
    stops: [
      { name: "Golden Gate Park", area: "Golden Gate Park", lon: -122.48218, lat: 37.76937, scale: 0.1 },
      { name: "Golden Gate Bridge", area: "Presidio", lon: -122.47856, lat: 37.81976, scale: 0.22, rise: 60 },
      {
        name: "Alcatraz Island",
        area: "San Francisco Bay",
        lon: -122.42276,
        lat: 37.82672,
        scale: 0.6,
        rise: 10,
      },
      {
        name: "Transamerica Pyramid",
        area: "Chinatown and Nob Hill",
        lon: -122.40279,
        lat: 37.79519,
        scale: 0.5,
        rise: 120,
        sight: "b1iga657",
      },
    ],
  },
  {
    world: "tinymke",
    lang: "en-US",
    open: { fit: 1.4, cx: 0.55 },
    hook: ["Milwaukee,\nblock by block", "every building"],
    stops: [
      {
        name: "American Family Field",
        area: "Story Hill",
        lon: -87.9721,
        lat: 43.02806,
        scale: 0.5,
        rise: 20,
      },
      {
        name: "Mitchell Park Domes",
        area: "Menomonee Valley",
        lon: -87.94541,
        lat: 43.02638,
        scale: 0.8,
        rise: 8,
      },
      {
        name: "Milwaukee Art Museum",
        area: "Lakefront",
        lon: -87.89699,
        lat: 43.03928,
        scale: 0.6,
        rise: 10,
      },
      {
        name: "Milwaukee City Hall",
        area: "Downtown",
        lon: -87.90975,
        lat: 43.04171,
        scale: 0.7,
        rise: 50,
        sight: "b1dc8meb",
      },
    ],
  },
  {
    world: "tinybeth",
    lang: "en-US",
    open: { fit: 1.4 },
    hook: ["All of Bethlehem", "every building"],
    stops: [
      {
        name: "Central Moravian Church Sanctuary",
        area: "Central Bethlehem",
        lon: -75.38164,
        lat: 40.61904,
        scale: 1.3,
        rise: 15,
      },
      {
        name: "Hill to Hill Bridge",
        area: "Lehigh River",
        lon: -75.38463,
        lat: 40.61551,
        scale: 0.5,
        rise: 5,
      },
      {
        name: "Packer Memorial Church",
        area: "Lehigh University",
        lon: -75.37766,
        lat: 40.60775,
        scale: 1.2,
        rise: 20,
      },
      {
        name: "Bethlehem Steel Blast Furnaces",
        area: "SteelStacks",
        lon: -75.36751,
        lat: 40.61524,
        scale: 0.6,
        rise: 35,
        sight: "statue:0",
      },
    ],
  },
];

export const planOf = (world: string): CityPlan => {
  const plan = PLANS.find((p) => p.world === world);
  if (!plan) throw new Error(`No plan for ${world}. Known: ${PLANS.map((p) => p.world).join(", ")}`);
  return plan;
};
