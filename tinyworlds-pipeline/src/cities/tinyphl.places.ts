import type { Curated } from "./types.js";

/**
 * The places people look for in Philadelphia, at the coordinates the map data gives them (a
 * building's point on its footprint, a stadium's from its grounds, a square's or a pier's from
 * the search data). A sight's point stands inside its building's footprint, so the building
 * lights up. The context lines come from the parts of town (Center City, University City…).
 */
export const CURATED: Curated[] = [
  // Center City: City Hall at the crossing of Broad and Market, the towers west of it
  { n: "Philadelphia City Hall", t: "landmark", lon: -75.16299, lat: 39.9524, r: 99, s: 1.5, sight: true },
  { n: "Comcast Center", t: "landmark", lon: -75.1685, lat: 39.95472, r: 95, s: 1, sight: true },
  { n: "Comcast Technology Center", t: "landmark", lon: -75.1704, lat: 39.95498, r: 95, s: 1, sight: true },
  { n: "One Liberty Place", t: "landmark", lon: -75.16813, lat: 39.95258, r: 93, s: 1, sight: true },
  { n: "LOVE Park", t: "park", lon: -75.16612, lat: 39.9541, r: 94, s: 2 },
  // the data names them for what is inside: the hotel in the PSFS tower, the store in the Wanamaker's
  { n: "PSFS Building", t: "landmark", lon: -75.16032, lat: 39.95143, r: 88, s: 1.5, sight: true },
  { n: "Wanamaker Building", t: "landmark", lon: -75.16212, lat: 39.95152, r: 86, s: 1.5, sight: true },
  { n: "Reading Terminal Market", t: "landmark", lon: -75.15901, lat: 39.95334, r: 92, s: 2, sight: true },
  { n: "Academy of Music", t: "landmark", lon: -75.1652, lat: 39.94802, r: 84, s: 2, sight: true },

  // Old City and Society Hill: Independence National Historical Park
  { n: "Independence Hall", t: "landmark", lon: -75.15003, lat: 39.94889, r: 99, s: 2.5, sight: true },
  { n: "Liberty Bell", t: "landmark", lon: -75.15021, lat: 39.94995, r: 98, s: 2.5, sight: true },
  { n: "Congress Hall", t: "landmark", lon: -75.15064, lat: 39.94898, r: 82, s: 2.5, sight: true },
  { n: "Carpenters' Hall", t: "landmark", lon: -75.14721, lat: 39.94814, r: 82, s: 2.5, sight: true },
  { n: "Elfreth's Alley", t: "place", lon: -75.14241, lat: 39.95272, r: 88, s: 2.5 },
  { n: "Penn's Landing", t: "place", lon: -75.14102, lat: 39.9478, r: 88, s: 1.5 },
  { n: "Spruce Street Harbor Park", t: "park", lon: -75.14142, lat: 39.94438, r: 76, s: 2 },
  // its deck is filed under its two walkways' names, which hold its own
  { n: "Ben Franklin Bridge", t: "bridge", lon: -75.13277, lat: 39.95267, r: 94, s: 1, sight: true },

  // Fairmount: the Parkway up to the Art Museum, and the Schuylkill below it
  { n: "Philadelphia Museum of Art", t: "museum", lon: -75.18152, lat: 39.96557, r: 98, s: 1.5, sight: true },
  { n: "Rocky Steps", t: "landmark", lon: -75.1802, lat: 39.9649, r: 92, s: 2.5 },
  { n: "Boathouse Row", t: "place", lon: -75.18764, lat: 39.96958, r: 90, s: 2 },

  // South Philadelphia: the stadiums
  { n: "Lincoln Financial Field", t: "landmark", lon: -75.16749, lat: 39.90091, r: 93, s: 1.5, sight: true },
  { n: "Citizens Bank Park", t: "landmark", lon: -75.16648, lat: 39.90592, r: 92, s: 1.5, sight: true },

  // University City
  { n: "Franklin Field", t: "landmark", lon: -75.18997, lat: 39.95007, r: 80, s: 2, sight: true },
];
