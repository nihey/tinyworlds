import type { Curated } from "./types.js";

/**
 * The places people look for in Truckee, at the coordinates the map data gives them (Overture's
 * buildings, places and divisions; OpenStreetMap's node for the Pioneer Monument). A sight's
 * point stands inside its building's footprint, so the building lights up. A sight that is also
 * a named building in the data keeps the data's name and no context line of its own, so the two
 * are one entry.
 */
export const CURATED: Curated[] = [
  // downtown: Commercial Row, the depot and the river
  { n: "Commercial Row", t: "place", lon: -120.18575, lat: 39.32773, b: "Downtown", r: 99, s: 1.5 },
  { n: "Downtown Truckee", t: "place", lon: -120.18358, lat: 39.32795, r: 97, s: 1 },
  {
    n: "The Truckee Hotel",
    t: "landmark",
    lon: -120.18384,
    lat: 39.32851,
    r: 96,
    s: 2,
    sight: true,
  },
  // the depot: the Amtrak station, the welcome center and the Museum of Truckee History
  { n: "Truckee station", t: "station", lon: -120.1856, lat: 39.32749, r: 95, s: 2, sight: true },
  { n: "Old Truckee Jail", t: "museum", lon: -120.18682, lat: 39.32801, r: 94, s: 2.5, sight: true },
  { n: "Rex Hotel", t: "landmark", lon: -120.185, lat: 39.32821, r: 86, s: 2.5, sight: true },
  {
    n: "Truckee Veterans Memorial Building",
    t: "landmark",
    lon: -120.18864,
    lat: 39.32786,
    r: 90,
    s: 2.5,
    sight: true,
  },
  { n: "Rocking Stone Tower", t: "landmark", lon: -120.18852, lat: 39.32804, r: 88, s: 3, sight: true },
  // 10292 Donner Pass Road: the footprint nearest the house's point in the places data
  { n: "Kruger House", t: "landmark", lon: -120.18951, lat: 39.32642, r: 86, s: 2.5, sight: true },
  { n: "Truckee River", t: "place", lon: -120.18549, lat: 39.32597, b: "Downtown", r: 93, s: 1 },
  { n: "Truckee River Regional Park", t: "park", lon: -120.17431, lat: 39.32798, r: 84, s: 1.5 },
  { n: "Truckee Railyard", t: "place", lon: -120.17798, lat: 39.3304, r: 72, s: 1.5 },

  // Donner Lake and the state park at its east end
  { n: "Donner Lake", t: "place", lon: -120.26917, lat: 39.32285, r: 98, s: 0.5 },
  { n: "Donner Memorial State Park", t: "park", lon: -120.23218, lat: 39.32382, r: 97, s: 1 },
  { n: "Pioneer Monument", t: "landmark", lon: -120.23104, lat: 39.32383, r: 95, s: 3, sight: true },
  {
    n: "Donner Memorial State Park Visitor Center",
    t: "museum",
    lon: -120.23205,
    lat: 39.32416,
    r: 92,
    s: 2,
    sight: true,
  },
  { n: "West End Beach", t: "park", lon: -120.29021, lat: 39.32214, b: "Donner Lake", r: 82, s: 1.5 },

  // the rest of town
  { n: "Truckee Tahoe Airport", t: "place", lon: -120.14501, lat: 39.31938, r: 92, s: 0.7 },
  { n: "Tahoe Donner", t: "place", lon: -120.2305, lat: 39.3519, r: 91, s: 0.7 },
  { n: "Tahoe Donner Downhill", t: "park", lon: -120.26363, lat: 39.35084, b: "Tahoe Donner", r: 82, s: 1 },
  { n: "Glenshire", t: "place", lon: -120.09979, lat: 39.35188, r: 84, s: 0.8 },
  {
    n: "FiftyFifty Brewing Company",
    t: "landmark",
    lon: -120.16339,
    lat: 39.32193,
    r: 80,
    s: 2,
    sight: true,
  },
  { n: "Truckee High School", t: "landmark", lon: -120.21626, lat: 39.3249, r: 78, s: 1.5, sight: true },
];
