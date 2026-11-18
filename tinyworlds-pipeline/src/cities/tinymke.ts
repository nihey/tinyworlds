import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { makeGeo, makeProjection, turnGrid } from "../projection.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { OHIO_RIVER } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { sectioned } from "./sections.js";
import { CURATED } from "./tinymke.places.js";
import type { City, Statue, StatuePiece } from "./types.js";

const NEIGHBORHOODS = "neighborhoods.geojson";
const GRID_DEG = -4.5;
const SECTIONS = {
  Downtown: ["Juneau Town", "Kilbourn Town", "Yankee Hill"],
  "Historic Third Ward": ["Historic Third Ward"],
  "Walker's Point": ["Walker's Point", "Harbor View"],
  "Menomonee Valley": ["Menomonee River Valley", "Mitchell Park", "Veterans Affairs"],
  "Story Hill": ["Story Hill"],
  "Near West Side": [
    "Avenues West",
    "Cold Spring Park",
    "Concordia",
    "Marquette",
    "Martin Drive",
    "Merrill Park",
    "Miller Valley",
    "The Valley/Pigsville",
    "Valley Forge",
  ],
  "Lower East Side": ["Lower East Side"],
  "East Side": [
    "Downer Woods",
    "Lake Park",
    "Murray Hill",
    "Northpoint",
    "Riverside Park",
    "Upper East Side",
  ],
  "Brewer's Hill": ["Brewer's Hill"],
  Riverwest: ["Riverwest", "Williamsburg"],
  "North Side": [
    "Amani",
    "Arlington Heights",
    "Borchert Field",
    "Franklin Heights",
    "Grover Heights",
    "Halyard Park",
    "Harambee",
    "Haymarket",
    "Hillside",
    "King Park",
    "Metcalfe Park",
    "Midtown",
    "North Division",
    "Park View",
    "Roosevelt Grove",
    "Rufus King",
    "Schlitz Park",
    "Sherman Park",
    "Triangle North",
    "Walnut Hill",
    "Washington Park",
  ],
  "South Side": [
    "Baran Park",
    "Burnham Park",
    "Clarke Square",
    "Clock Tower Acres",
    "Forest Home Hills",
    "Historic Mitchell Street",
    "Layton Park",
    "Lincoln Village",
    "Muskego Way",
    "Polonia",
    "Silver City",
  ],
  "Bay View": ["Bay View"],
  "Jones Island": ["Jones' Island"],
};

/** The pavilion's open wings, drawn over the two mapped Burke Brise Soleil footprints. */
function quadracciWings(): Statue {
  const pieces: StatuePiece[] = [];
  // Calatrava's sunscreen spans 66 m. The paired fins sweep up from the mast and shorten at either end.
  // https://mam.org/info/architecture/quadracci-pavilion/
  for (let fin = 0; fin < 12; fin++) {
    const length = 12 + 21 * Math.sin((Math.PI * (fin + 1)) / 14);
    const root = -16 + fin * 2.8;
    const rootHeight = 17 + fin * 0.95;
    for (const side of [-1, 1]) {
      for (let span = 0; span <= length; span += 2) {
        const f = span / length;
        const [dp, dq] = turnGrid(root - 10 * f * f, side * span, GRID_DEG);
        const height = rootHeight + 7 * f + 5 * f * f;
        pieces.push({ dp, dq, from: height - 1.25, to: height, hp: 1.15, hq: 1.2, ramp: "white" });
      }
    }
  }
  return { lon: -87.896992, lat: 43.039284, base: 0, pieces };
}

/** The County's three 85-foot glass conoids, centered on the mapped dome footprints. */
function mitchellDomes(): Statue {
  const lon = -87.945414;
  const lat = 43.026378;
  const proj = makeProjection(makeGeo(lon, lat, GRID_DEG, 2));
  const pieces: StatuePiece[] = [];
  for (const [centerLon, centerLat] of [
    [-87.945697, 43.026621], // Desert
    [-87.9457, 43.026159], // Tropical
    [-87.946339, 43.026655], // Floral Show
  ]) {
    const [dp, dq] = proj.toGrid(centerLon, centerLat);
    for (let from = 5; from < 26; from += 1.5) {
      const f = (from - 4.25) / (26 - 4.25);
      const r = 21.3 * (1 - f ** 1.8) ** 0.72;
      pieces.push({ dp, dq, from, to: from + 1.5, r, ramp: "white" });
    }
  }
  return { lon, lat, base: 0, pieces };
}

export const tinymke: City = {
  id: "tinymke",
  title: "Milwaukee",
  origin: { lon: -87.908, lat: 43.0415 },
  // East Town and the Historic Third Ward share this alignment, measured from the mapped street lengths.
  gridDeg: GRID_DEG,
  k: 2,
  bbox: { west: -88.005, south: 42.995, east: -87.855, north: 43.091 },
  start: { lon: -87.9045, lat: 43.0394, scale: 0.43 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "City of Milwaukee DCD and ITMD-GIS (CC BY)",
  ],
  sources: [
    overture,
    overtureAreas({ maxArea: 0.25 }),
    publishedAreas({
      name: "milwaukee-neighborhoods",
      url: "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/planning/special_districts/MapServer/4/query?where=1%3D1&outFields=NEIGHBORHD&outSR=4326&f=geojson",
      file: NEIGHBORHOODS,
    }),
  ],
  accent: "#f0c879",
  card: { lon: -87.9009, lat: 43.039, shrink: 3 },
  limits: {
    kind: "built-up",
    parks: [
      "Bradford Beach",
      "Forest Home Cemetery",
      "Juneau Park",
      "Lake Park",
      "Lakeshore State Park",
      "McKinley Park",
      "Mitchell Park",
      "Riverside Park",
      "Three Bridges Park",
      "Veterans Park",
      "Washington Park",
    ],
  },
  fog: { start: 800, end: 1650 },
  areas(rawDir) {
    return sectioned({
      neighbourhoods: readAreas(path.join(rawDir, NEIGHBORHOODS)),
      nameOf: ({ properties }) =>
        properties.NEIGHBORHD.toLowerCase().replace(/(^|[\s/])[a-z]/g, (c) => c.toUpperCase()),
      sections: SECTIONS,
      fallback: "Milwaukee",
      towns: readAreas(path.join(rawDir, "areas.geojson")).filter(
        ({ properties }) =>
          properties.kind === "locality" && !["Highland Park", "Milwaukee"].includes(properties.name),
      ),
      bbox: tinymke.bbox,
    });
  },
  heights: { storey: 3.5, raster: false, floorsFirst: true },
  style: OHIO_RIVER,
  landmarks: {
    "milwaukee city hall": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Tall },
    "quadracci pavilion": {
      wall: R.cream,
      roof: R.roofSilver,
      glass: R.glassSilver,
      pattern: Pattern.Curtain,
    },
    "discovery world science + technology center": {
      wall: R.cream,
      roof: R.roofSilver,
      pattern: Pattern.Curtain,
    },
    "milwaukee county war memorial center": { wall: R.concrete, roof: R.roofGravel },
    "u.s. bank center": { wall: R.cream, roof: R.roofSilver, glass: R.glassDark, pattern: Pattern.Tall },
    "northwestern mutual tower and commons": {
      wall: R.glassSilver,
      roof: R.roofSilver,
      pattern: Pattern.Curtain,
    },
    "the couture": { wall: R.glassBlue, roof: R.roofSilver, pattern: Pattern.Curtain },
    "100 east wisconsin": { wall: R.limestone, roof: R.roofSlate, glass: R.glassDark, pattern: Pattern.Tall },
    "wisconsin gas building": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Tall },
    "fiserv forum": { wall: R.roofBrown, roof: R.roofSilver, glass: R.glassDark, pattern: Pattern.Ribbon },
    "american family field": { wall: R.brickRed, roof: R.roofCopper },
    "harley-davidson museum": { wall: R.darkStone, roof: R.roofGravel, pattern: Pattern.Ribbon },
    "pabst theater": { wall: R.brickRed, roof: R.roofSlate },
    "captain frederick pabst mansion": { wall: R.brickRed, roof: R.roofSlate },
    "milwaukee public library central library": { wall: R.limestone, roof: R.roofCopper },
    "milwaukee county courthouse": { wall: R.limestone, roof: R.roofGravel, pattern: Pattern.Tall },
    "mitchell park horticultural conservatory": { wall: R.glassSilver, roof: R.glassSilver },
    "lakefront brewery": { wall: R.cream, roof: R.roofSlate },
    "north point lighthouse": { wall: R.cream, roof: R.roofSlate },
    "milwaukee pierhead light": { wall: R.brickRed, roof: R.roofSlate },
  },
  heightFixes: {
    "milwaukee county courthouse": 53,
  },
  statues: [
    quadracciWings(),
    mitchellDomes(),
    {
      // Gerald P. Sawyer's life-size figure on the RiverWalk just south of Wells Street.
      lon: -87.910988,
      lat: 43.040387,
      base: 0,
      pieces: [
        { dp: 0, dq: 0, from: 0, to: 0.92, hp: 0.18, hq: 0.27, ramp: "body" },
        { dp: 0, dq: 0, from: 0.92, to: 1.48, hp: 0.19, hq: 0.3, ramp: "body" },
        { dp: 0, dq: 0, from: 1.48, to: 1.68, r: 0.13, ramp: "body" },
        { dp: 0, dq: 0.41, from: 1.1, to: 1.38, hp: 0.1, hq: 0.17, ramp: "body" },
        { dp: 0, dq: -0.41, from: 1.1, to: 1.38, hp: 0.1, hq: 0.17, ramp: "body" },
      ],
    },
  ],
  riverBridges: true,
  walk: true,
  sights: {
    placeWords: ["Milwaukee", "Wisconsin", "Lake Michigan", "Cream City"],
    areaByDistrict: true,
    bridges: {
      "hoan bridge": ["Lake Freeway"],
    },
    wikipedia: {
      "milwaukee art museum": "Milwaukee Art Museum",
      "bronze fonz": "Bronze Fonz",
      "100 east wisconsin": "100 East Wisconsin",
      "7seventy7": "7Seventy7",
      "miller high life theatre": "Miller High Life Theatre",
      "mitchell park domes": "Mitchell Park Horticultural Conservatory",
      "u.s. bank center": "U.S. Bank Center (Milwaukee)",
      "discovery world": "Discovery World (museum)",
      "north point lighthouse": "North Point Light",
      "milwaukee central library": "Central Library (Milwaukee)",
      "milwaukee county war memorial center": "Milwaukee County War Memorial",
      "potawatomi hotel & casino": "Potawatomi Hotel Casino",
      "oriental theatre": "Oriental Theatre (Milwaukee)",
      "marcus performing arts center": "Marcus Center",
      "bradley symphony center": "Warner Grand Theater (Milwaukee)",
      "riverside theater": "Riverside Theater (Milwaukee)",
      "the rave/eagles club": "The Rave/Eagles Club",
      "turner hall": "Turner Hall (Milwaukee)",
      "federal building & u.s. courthouse": "Federal Building (Milwaukee, Wisconsin)",
      "cathedral of st. john the evangelist": "Cathedral of St. John the Evangelist (Milwaukee)",
      "church of the gesu": "Gesu Church (Milwaukee, Wisconsin)",
      "old st. mary's church": "Old St. Mary's Church (Milwaukee, Wisconsin)",
      "best place at the historic pabst brewery": "Pabst Brewing Company Former Corporate Office Building",
      "harley-davidson motorcycle factory": "Harley-Davidson Motorcycle Factory Building",
      "milwaukee soldiers home": "Milwaukee Soldiers Home (Old Main)",
      "pritzlaff building": "John Pritzlaff Hardware Company",
      "iron block building": "Iron Block Building (Milwaukee, Wisconsin)",
      "milwaukee county historical center": "Milwaukee County Historical Society",
      "cathedral church of all saints": "All Saints' Cathedral (Milwaukee)",
      "northwestern mutual north building": "Northwestern Mutual North Tower",
      "the astor hotel": "Astor on the Lake",
      "the milwaukee club": "Milwaukee Club",
    },
    aliases: {
      "milwaukee art museum": [
        "MAM",
        "Milwaukee Art Institute",
        "Milwaukee Art Center",
        "Quadracci Pavilion",
      ],
      "american family field": ["Miller Park", "AmFam Field"],
      "harley-davidson museum": ["H-D Museum", "HD Museum"],
      "fiserv forum": ["Fiserv", "Deer District Arena", "Wisconsin Entertainment and Sports Center"],
      "mitchell park domes": ["Mitchell Park Horticultural Conservatory", "The Domes"],
      "hoan bridge": ["Daniel Hoan Memorial Bridge", "Milwaukee Harbor Bridge", "Hoan"],
      "bronze fonz": ["The Fonz", "Fonzie", "Arthur Fonzarelli"],
      "u.s. bank center": ["First Wisconsin Center", "Firstar Center", "US Bank Center"],
      "pabst mansion": ["Captain Frederick Pabst Mansion", "Frederick Pabst House"],
      "north point lighthouse": ["North Point Light"],
      "milwaukee central library": [
        "Milwaukee Public Library System",
        "Milwaukee County Federated Library System",
      ],
      "100 east wisconsin": ["100 East", "Faison Building"],
      "milwaukee public museum": ["MPM", "Nature & Culture Museum of Wisconsin"],
      "american family insurance amphitheater": ["Marcus Amphitheater", "AmFam Amphitheater"],
      "baird center": [
        "Wisconsin Center",
        "Midwest Airlines Center",
        "Midwest Express Center",
        "Delta Center",
      ],
      "potawatomi hotel & casino": ["Potawatomi Hotel Casino", "Potawatomi Bingo Casino"],
      "wisconsin gas building": [
        "Milwaukee Gas Light Building",
        "Wisconsin Gas Company Building",
        "Gas Light Building",
      ],
      "st. joan of arc chapel": ["Chapelle de St. Martin de Seyssuel", "St. Martin de Seyssuel"],
      "villa terrace museum and gardens": ["Villa Terrace Decorative Arts Museum", "Sopra Mare"],
      "marcus performing arts center": [
        "Marcus Center for the Performing Arts",
        "Marcus Center",
        "Performing Arts Center",
      ],
      "bradley symphony center": ["Warner Grand Theater", "Warner Theatre", "Grand Theatre"],
      "miller high life theatre": ["Milwaukee Auditorium", "Milwaukee Theatre"],
      "uw–milwaukee panther arena": ["Milwaukee Arena", "MECCA Arena", "U.S. Cellular Arena", "MECCA"],
      "riverside theater": ["Pabst Theater Group"],
      "the rave/eagles club": ["Eagles Club", "Eagles Ballroom", "The Rave"],
      "betty brinn children's museum": ["BBCM"],
      "jewish museum milwaukee": ["JMM"],
      "milwaukee soldiers home": [
        "Old Main",
        "National Home for Disabled Volunteer Soldiers",
        "Northwestern Branch",
      ],
      "associated bank river center": ["Milwaukee Center"],
      "ascent mke": ["Ascent"],
      "7seventy7": ["777 N. Van Buren St.", "777 North Van Buren Street"],
      "two-fifty": ["250 Plaza"],
      "wisconsin tower": ["606 Building"],
      "st. peter's evangelical lutheran church": ["Iglesia Luterana San Pedro"],
      "pritzlaff building": ["John Pritzlaff Hardware Company"],
      "milwaukee county historical center": ["Milwaukee County Historical Society", "MCHS"],
    },
  },
  roofs: { waterTanks: false },
  trees: { street: { spacing: 13, chance: 0.33 } },
  flora: "temperate",
  ground: {},
  curated: CURATED,
  flights: [],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    namedBuildings: {
      minHeight: 36,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
  },
};
