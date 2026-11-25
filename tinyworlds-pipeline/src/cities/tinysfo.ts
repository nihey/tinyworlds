import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { SOCAL } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { sectioned } from "./sections.js";
import { CURATED } from "./tinysfo.places.js";
import type { City } from "./types.js";

const NEIGHBORHOODS = "neighborhoods.geojson";
const GOLDEN_GATE = "Golden Gate Bridge";
const EAST_SIDEWALK = "Golden Gate Bridge East Sidewalk";
const BAY_BRIDGE = "San Francisco–Oakland Bay Bridge";

/** DataSF's analysis areas grouped into parts of the peninsula for search context and quiz rounds. */
export const SECTIONS: Record<string, readonly string[]> = {
  Downtown: ["Financial District/South Beach", "Tenderloin"],
  "Chinatown and Nob Hill": ["Chinatown", "Nob Hill"],
  "Northern Waterfront": ["North Beach", "Russian Hill", "Marina"],
  SoMa: ["South of Market", "Mission Bay", "Potrero Hill"],
  Presidio: ["Presidio", "Presidio Heights", "Pacific Heights"],
  Richmond: ["Inner Richmond", "Outer Richmond", "Lone Mountain/USF", "Lincoln Park", "Seacliff"],
  "Golden Gate Park": ["Golden Gate Park"],
  Sunset: ["Inner Sunset", "Sunset/Parkside", "Lakeshore"],
  "Western Addition": ["Western Addition", "Japantown", "Hayes Valley", "Haight Ashbury"],
  "Castro and Twin Peaks": ["Castro/Upper Market", "Twin Peaks", "West of Twin Peaks", "Noe Valley"],
  Mission: ["Mission", "Bernal Heights"],
  "Southern Neighborhoods": [
    "Excelsior",
    "Glen Park",
    "McLaren Park",
    "Oceanview/Merced/Ingleside",
    "Outer Mission",
    "Portola",
    "Visitacion Valley",
  ],
  Bayview: ["Bayview Hunters Point"],
  "Treasure Island": ["Treasure Island"],
};

/** San Francisco, the Golden Gate and the islands just offshore. */
export const tinysfo: City = {
  id: "tinysfo",
  title: "San Francisco",
  origin: { lon: -122.4194, lat: 37.7749 },
  // 51.4% of the Financial District's mapped street lengths cluster within half a degree of this grid.
  gridDeg: -9.1,
  k: 2,
  bbox: { west: -122.529, south: 37.699, east: -122.338, north: 37.842 },
  start: { lon: -122.4002, lat: 37.7943, scale: 0.85 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Analysis Neighborhoods: City and County of San Francisco, DataSF (PDDL)",
  ],
  sources: [
    overture,
    overtureAreas({ landUse: ["Alcatraz Island"] }),
    publishedAreas({
      name: "san-francisco-neighborhoods",
      url: "https://data.sf.gov/resource/j2bu-swwd.geojson?$limit=100",
      file: NEIGHBORHOODS,
    }),
  ],
  accent: "#f07858",
  card: { lon: -122.4781, lat: 37.8188, shrink: 6 },
  limits: {
    kind: "built-up",
    parks: [
      "Alcatraz Island",
      "Golden Gate Park",
      "Presidio of San Francisco",
      "Lands End",
      "Lincoln Park",
      "Lake Merced Park",
      "John McLaren Park",
      "Glen Canyon Park",
      "Mount Davidson Park",
      "Candlestick Point State Recreation Area",
    ],
  },
  fog: { start: 1300, end: 2300 },
  areas(rawDir) {
    return sectioned({
      neighbourhoods: readAreas(path.join(rawDir, NEIGHBORHOODS)),
      nameOf: ({ properties }) => String(properties.nhood),
      sections: SECTIONS,
      fallback: "San Francisco",
      towns: readAreas(path.join(rawDir, "areas.geojson")).filter(
        ({ properties }) => properties.kind === "locality" && properties.name !== "San Francisco",
      ),
      bbox: tinysfo.bbox,
    });
  },
  heights: { storey: 3.4, raster: false },
  style: SOCAL,
  landmarks: {
    "salesforce tower": { wall: R.glassSilver, roof: R.roofSilver, pattern: Pattern.Curtain },
    "transamerica pyramid": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Tall },
    "181 fremont tower": { wall: R.glassBlue, roof: R.glassSilver, pattern: Pattern.Curtain },
    "555 california street": { wall: R.brownstone, roof: R.roofBrown, pattern: Pattern.Tall },
    "san francisco ferry building": { wall: R.cream, roof: R.roofSlate },
    "san francisco city hall": { wall: R.limestone, roof: R.roofCopper },
    "coit tower": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.None },
    "palace of fine arts": { wall: R.rose, roof: R.roofSlate },
    "grace cathedral": { wall: R.greyStone, roof: R.roofSlate },
    "conservatory of flowers": { wall: R.whiteBrick, roof: R.roofWhite },
    "de young museum": { wall: R.roofBrown, roof: R.roofBrown },
    "california academy of sciences": { wall: R.glassSilver, roof: R.roofGreen },
    "legion of honor": { wall: R.limestone, roof: R.roofWhite },
    "fort point": { wall: R.brickDark, roof: R.roofTar },
    "main prison": { wall: R.greyStone, roof: R.roofGravel },
    "alcatraz island lighthouse": { wall: R.whiteBrick, roof: R.roofSlate },
    "oracle park": { wall: R.brickRed, roof: R.sidingSage },
    "chase center": { wall: R.glassSilver, roof: R.roofWhite },
    "old mission dolores": { wall: R.whiteBrick, roof: R.roofTerracotta },
  },
  statues: [],
  colors: { roofRed: "#bf4e3b" },
  bridgeStyles: {
    [GOLDEN_GATE]: {
      roads: [GOLDEN_GATE, EAST_SIDEWALK, "Golden Gate Bridge West Sidewalk"],
      elevated: true,
      wall: R.roofRed,
      // Golden Gate Bridge District's 220-ft clearance, with a tapered approach in the flat map.
      towerDeck: 67,
    },
    [BAY_BRIDGE]: { roads: ["Dwight D. Eisenhower Highway"], westOf: -122.3642 },
  },
  suspensions: [
    {
      // Centers of the two Overture towers. The cable ends are 1,125 feet beyond each tower.
      a: [-122.4778912, 37.8140142],
      b: [-122.4792335, 37.8255024],
      top: 225,
      side: 343,
      halfWidth: 13.7,
      mappedTowers: true,
      bridge: GOLDEN_GATE,
      painted: true,
    },
    {
      // The pair west of the center anchorage, Overture's W2 and W3.
      a: [-122.3858231, 37.7907531],
      b: [-122.3806476, 37.7955881],
      top: 158,
      sides: [280, 379],
      mappedTowers: true,
    },
    {
      // W5 and W6, from the center anchorage to the tunnel on Yerba Buena Island.
      a: [-122.3750797, 37.8007874],
      b: [-122.3698998, 37.8056223],
      top: 158,
      sides: [379, 300],
      mappedTowers: true,
    },
  ],
  walk: true,
  // Overture designates foot and bicycle access here; the bridge district directs pedestrians east.
  walkCycleways: [EAST_SIDEWALK],
  sights: {
    placeWords: ["San Francisco", "California", "Bay Area"],
    areaByDistrict: true,
    wikipedia: {
      "181 fremont": "181 Fremont",
      "alcatraz federal penitentiary": "Alcatraz Federal Penitentiary",
      "alcatraz island lighthouse": "Alcatraz Island Lighthouse",
      "asian art museum": "Asian Art Museum (San Francisco)",
      "cable car museum": "San Francisco Cable Car Museum",
      "cathedral of saint mary of the assumption":
        "Cathedral of Saint Mary of the Assumption (San Francisco)",
      "cliff house": "Cliff House, San Francisco",
      "columbus tower": "Columbus Tower (San Francisco)",
      "davies symphony hall": "Louise M. Davies Symphony Hall",
      "fort point": "Fort Point National Historic Site",
      "grace cathedral": "Grace Cathedral, San Francisco",
      "legion of honor": "Legion of Honor (museum)",
      "mission dolores": "Mission San Francisco de Asís",
      "mission dolores basilica": null,
      "mission high school": "Mission High School (San Francisco)",
      "new mission theater": "New Mission Theater (San Francisco)",
      "old saint mary's cathedral": "Old St. Mary's Cathedral",
      "palace hotel": "Palace Hotel, San Francisco",
      "san francisco–oakland bay bridge": "San Francisco–Oakland Bay Bridge",
      "san francisco maritime museum": "San Francisco Maritime National Historical Park",
      "saints peter and paul church": "Saints Peter and Paul Church, San Francisco",
    },
    aliases: {
      "alcatraz federal penitentiary": ["Alcatraz", "The Rock", "Alcatraz Island", "Alcatraz Prison"],
      "alcatraz island lighthouse": ["Alcatraz Light", "Alcatraz Lighthouse"],
      "181 fremont": ["181 Fremont Tower"],
      "225 bush street": ["Standard Oil Building"],
      "350 mission street": ["Salesforce East"],
      "555 california street": ["Bank of America Center", "Bank of America Building"],
      "650 california street": ["Hartford Building"],
      "bayview opera house": ["South San Francisco Opera House", "Ruth Williams Memorial Theatre"],
      "bill graham civic auditorium": ["San Francisco Civic Auditorium"],
      "cable car museum": ["Cable Car Powerhouse and Barn", "Washington–Mason Powerhouse"],
      "chase center": ["Warriors Arena"],
      "coit tower": ["Lillian Coit Memorial Tower", "Lillian Hitchcock Coit Memorial Tower"],
      "columbus tower": ["Sentinel Building", "Golden Coin Building"],
      "davies symphony hall": ["Louise M. Davies Symphony Hall"],
      "de young museum": ["M. H. de Young Memorial Museum", "M. H. de Young"],
      "first market tower": ["525 Market Street"],
      "fort point": ["Castillo de San Joaquín", "Fort Winfield Scott", "Fort Point National Historic Site"],
      "hall of justice": ["Thomas J. Cahill Hall of Justice"],
      "jpmorgan chase building": ["JPMorganChase Center", "JPMorgan Chase Center"],
      "legion of honor": ["California Palace of the Legion of Honor", "Palace of the Legion of Honor"],
      "millennium tower": ["301 Mission Street"],
      "mission dolores": ["Mission San Francisco de Asís", "Old Mission Dolores"],
      "moscone center": ["George R. Moscone Convention Center"],
      "new mission theater": ["Alamo Drafthouse Cinema", "New Mission Theatre"],
      "omni san francisco hotel": ["Financial Center Building", "Edificio del Centro Financiero"],
      "one front street": ["Shaklee Terraces", "444 Market"],
      "one sansome street": ["Citigroup Center"],
      "oracle park": ["Pacific Bell Park", "Pac Bell Park", "SBC Park", "AT&T Park"],
      "palace hotel": ["Sheraton-Palace Hotel"],
      "salesforce tower": ["Transbay Tower"],
      "salesforce transit center": ["Transbay Transit Center", "Transbay Terminal"],
      "san francisco–oakland bay bridge": ["Bay Bridge", "San Francisco-Oakland Bay Bridge"],
      "san francisco armory": ["San Francisco National Guard Armory and Arsenal"],
      "san francisco museum of modern art": ["SFMOMA"],
      "san francisco peace pagoda": ["Peace Pagoda"],
      "spreckels temple of music": ["bandshell"],
      "sutro tower": ["Sutro"],
      "the westin st. francis": ["St. Francis Hotel"],
      "third baptist church": ["First Colored Baptist Church"],
      "transamerica pyramid": ["Transamerica Pyramid Center"],
      "uss pampanito": ["SS-383"],
      "warfield theatre": ["The Warfield", "Loews Warfield", "Warfield Theater"],
    },
  },
  roofs: { waterTanks: false },
  trees: { street: { spacing: 14, chance: 0.24 } },
  flora: "temperate",
  ground: {},
  curated: CURATED,
  flights: [],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    skip: /^Palace of Fine Arts, Marina District, SF$/i,
    namedBuildings: {
      minHeight: 40,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
      skip: /^(?:building|tower|garage) (?:[a-z]|\d+)$/i,
    },
  },
};
