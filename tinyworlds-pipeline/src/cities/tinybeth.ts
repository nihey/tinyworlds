import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { OHIO_RIVER } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { MORAVIAN_BELFRY, steelStacks } from "./tinybeth.landmarks.js";
import { CURATED } from "./tinybeth.places.js";
import type { City } from "./types.js";

const BOUNDARY = "bethlehem-boundary.geojson";
const DISTRICTS = "historic-districts.geojson";
const CITY_GIS = "https://services2.arcgis.com/NlbUAihbvA50xxJw/arcgis/rest/services";
const GRID_DEG = 1.6;

export const tinybeth: City = {
  id: "tinybeth",
  title: "Bethlehem",
  origin: { lon: -75.378, lat: 40.618 },
  // Main, North New and Center streets north of the Lehigh are about 1.6° east of north.
  gridDeg: GRID_DEG,
  k: 2,
  bbox: { west: -75.449, south: 40.565, east: -75.285, north: 40.687 },
  start: { lon: -75.375, lat: 40.6157, scale: 0.32 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Microsoft ML Buildings",
    "City of Bethlehem GIS",
    "Historic American Engineering Record (Library of Congress)",
  ],
  sources: [
    overture,
    overtureAreas({ landUse: ["Lehigh University Asa Packer Campus"] }),
    publishedAreas({
      name: "bethlehem-city-boundary",
      url: `${CITY_GIS}/COB_Municipal_Boundary/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID&outSR=4326&f=geojson`,
      file: BOUNDARY,
    }),
    publishedAreas({
      name: "bethlehem-historic-districts",
      url: `${CITY_GIS}/COB_CED_Historic_Districts_and_Landmarks_Public_View/FeatureServer/0/query?where=SUBTYPE%3D0&outFields=DISTNAME&outSR=4326&f=geojson`,
      file: DISTRICTS,
    }),
  ],
  accent: "#ed996c",
  card: { lon: -75.3677, lat: 40.61485, shrink: 1.6 },
  limits: { kind: "geojson", file: BOUNDARY },
  fog: { start: 600, end: 1300 },
  areas(rawDir) {
    const features = readAreas(path.join(rawDir, "areas.geojson"));
    const city = readAreas(path.join(rawDir, BOUNDARY));
    const districts = readAreas(path.join(rawDir, DISTRICTS));
    return {
      districts: [
        ...features
          .filter(({ properties }) => properties.kind === "locality" && properties.name !== "Bethlehem")
          .map(({ properties, polygons }) => ({ name: properties.name, polygons })),
        ...city.map(({ polygons }) => ({ name: "Bethlehem", polygons })),
        ...features
          .filter(
            ({ properties }) =>
              properties.kind === "hood" &&
              ["Central Bethlehem", "South Bethlehem", "West Bethlehem"].includes(properties.name),
          )
          .map(({ properties, polygons }) => ({ name: properties.name, polygons })),
      ],
      hoods: districts.map(({ properties, polygons }) => ({
        name: properties.DISTNAME,
        district: properties.DISTNAME === "Fountain Hill Historic District" ? "Fountain Hill" : "Bethlehem",
        polygons,
      })),
    };
  },
  heights: { storey: 3.4, raster: false, floorsFirst: true },
  style: OHIO_RIVER,
  landmarks: {
    "artsquest center at steelstacks": {
      wall: R.steel,
      roof: R.roofSilver,
      glass: R.glassSilver,
      pattern: Pattern.Curtain,
    },
    "bethlehem steel corporation general office building": {
      wall: R.brickRed,
      roof: R.roofTar,
      pattern: Pattern.Tall,
    },
    "central moravian church sanctuary": { wall: R.cream, roof: R.roofSlate },
    "historic hotel bethlehem": { wall: R.brickRed, roof: R.roofTar, pattern: Pattern.Tall },
    "linderman library": { wall: R.greyStone, roof: R.roofSlate },
    "moravian museum of bethlehem": { wall: R.cream, roof: R.roofBrown },
    "national museum of industrial history": { wall: R.brickDark, roof: R.roofTar },
    "packer memorial church": { wall: R.darkStone, roof: R.roofSlate },
    "the sun inn": { wall: R.cream, roof: R.roofSlate },
  },
  heightFixes: {
    // The imagery estimates miss the sanctuary roof and the height of the nine-story hotel.
    "central moravian church sanctuary": MORAVIAN_BELFRY.base,
    "historic hotel bethlehem": 32,
  },
  // The furnaces use the scene's existing untextured monument ramps for rust and dark steel.
  colors: { libertyGreen: "#9b6049", gold: "#674b40" },
  statues: [steelStacks(GRID_DEG), MORAVIAN_BELFRY],
  riverBridges: true,
  walk: true,
  walkCycleways: ["South Bethlehem Greenway"],
  sights: {
    placeWords: ["Bethlehem", "Pennsylvania", "Lehigh Valley", "Lehigh River", "South Side"],
    areaByDistrict: true,
    wikipedia: {
      "1761 tannery": "The Tannery (Bethlehem, Pennsylvania)",
      "1762 water works": "Bethlehem Waterworks",
      "bethlehem steel blast furnaces": null,
      "central moravian church sanctuary": null,
      "fahy bridge": "Philip J. Fahy Memorial Bridge",
      "historic hotel bethlehem": "Hotel Bethlehem",
      "moravian museum of bethlehem": "Lewis David de Schweinitz Residence",
      "packer memorial church": "Packer Memorial Chapel",
      "the sun inn": "Moravian Sun Inn",
      "university center": "Packer Hall (Lehigh University)",
    },
    aliases: {
      "1762 water works": [
        "Bethlehem Waterworks",
        "Old Waterworks",
        "1762 Waterworks",
        "Waterworks",
        "Water Works",
      ],
      "fahy bridge": ["Philip J. Fahy Memorial Bridge", "The Fahy", "New Street Bridge"],
      "historic hotel bethlehem": ["Hotel Bethlehem"],
      "moravian museum of bethlehem": [
        "Lewis David de Schweinitz Residence",
        "Moravian Gemeinhaus",
        "Gemeinhaus",
      ],
      "packer memorial church": ["Packer Memorial Chapel"],
      "the sun inn": ["Moravian Sun Inn"],
      "university center": ["Packer Hall", "Clayton University Center"],
    },
  },
  roofs: { waterTanks: false },
  trees: { street: { spacing: 15, chance: 0.28 } },
  flora: "temperate",
  ground: {},
  curated: CURATED,
  flights: [],
  search: {
    districtOnly: false,
    bridge: /bridge|viaduct/i,
    stationSuffix: null,
    districtRank: 87,
    namedBuildings: { minHeight: 18, classes: ["church", "civic", "college", "university", "library"] },
  },
};
