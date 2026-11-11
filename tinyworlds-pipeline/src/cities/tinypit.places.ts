import type { Curated } from "./types.js";

/**
 * The places people look for in Pittsburgh, at the coordinates the map data gives them (a
 * building's point on its footprint, a bridge's or a park's from the search data, a stadium's from
 * its grounds). A sight's point stands inside its building's footprint, so the building lights up.
 * The context lines come from the parts of town (Downtown, North Side, Oakland…).
 */
export const CURATED: Curated[] = [
  // Downtown: the Point and the Golden Triangle
  { n: "Point State Park", t: "park", lon: -80.00786, lat: 40.44157, r: 98, s: 1.5 },
  { n: "Point State Park Fountain", t: "landmark", lon: -80.01281, lat: 40.44182, r: 90, s: 2.5 },
  { n: "Fort Pitt Block House", t: "landmark", lon: -80.00982, lat: 40.44119, r: 88, s: 2.5, sight: true },
  { n: "Market Square", t: "place", lon: -80.00242, lat: 40.44076, r: 92, s: 2 },
  { n: "PPG Place", t: "landmark", lon: -80.00376, lat: 40.44001, r: 97, s: 1.5, sight: true },
  { n: "U.S. Steel Tower", t: "landmark", lon: -79.99476, lat: 40.44138, r: 96, s: 1, sight: true },
  { n: "Heinz Hall", t: "landmark", lon: -80.00147, lat: 40.44266, r: 84, s: 2, sight: true },
  { n: "Benedum Center", t: "landmark", lon: -79.99963, lat: 40.44309, r: 80, s: 2, sight: true },

  // the bridges: the Three Sisters over the Allegheny, the Smithfield Street over the Mon
  { n: "Roberto Clemente Bridge", t: "bridge", lon: -80.00341, lat: 40.44582, r: 92, s: 1.5, sight: true },
  { n: "Andy Warhol Bridge", t: "bridge", lon: -80.00148, lat: 40.4463, r: 88, s: 1.5, sight: true },
  { n: "Rachel Carson Bridge", t: "bridge", lon: -79.99978, lat: 40.44673, r: 86, s: 1.5, sight: true },
  { n: "Smithfield Street Bridge", t: "bridge", lon: -80.00074, lat: 40.43675, r: 90, s: 1.5, sight: true },
  { n: "Fort Pitt Bridge", t: "bridge", lon: -80.0112, lat: 40.43892, r: 86, s: 1.5, sight: true },
  { n: "Fort Duquesne Bridge", t: "bridge", lon: -80.00931, lat: 40.44464, r: 84, s: 1.5, sight: true },
  { n: "West End Bridge", t: "bridge", lon: -80.02714, lat: 40.44609, r: 80, s: 1.5, sight: true },
  { n: "Liberty Bridge", t: "bridge", lon: -79.99747, lat: 40.43176, r: 78, s: 1.5, sight: true },
  { n: "Hot Metal Bridge", t: "bridge", lon: -79.95992, lat: 40.42878, r: 76, s: 1.5, sight: true },
  { n: "Birmingham Bridge", t: "bridge", lon: -79.97372, lat: 40.43126, r: 72, s: 1.5, sight: true },
  { n: "Veterans Bridge", t: "bridge", lon: -79.99709, lat: 40.45446, r: 72, s: 1.5, sight: true },
  { n: "David McCullough Bridge", t: "bridge", lon: -79.98997, lat: 40.4509, r: 72, s: 1.5, sight: true },

  // the North Shore
  { n: "PNC Park", t: "landmark", lon: -80.00561, lat: 40.44693, r: 95, s: 1.5, sight: true },
  { n: "Acrisure Stadium", t: "landmark", lon: -80.01572, lat: 40.44672, r: 94, s: 1.5, sight: true },
  { n: "Kamin Science Center", t: "museum", lon: -80.01793, lat: 40.44563, r: 84, s: 2, sight: true },
  { n: "National Aviary", t: "place", lon: -80.00958, lat: 40.45333, r: 80, s: 2 },
  { n: "Mattress Factory", t: "museum", lon: -80.01234, lat: 40.45696, r: 72, s: 2.5 },
  { n: "Randyland", t: "museum", lon: -80.00972, lat: 40.45792, r: 70, s: 2.5 },

  // across the Mon: Station Square and the inclines up Mount Washington
  { n: "Station Square", t: "place", lon: -80.00452, lat: 40.43305, r: 88, s: 2 },
  { n: "Monongahela Incline", t: "landmark", lon: -80.00595, lat: 40.4313, r: 90, s: 2.5, sight: true },
  { n: "Duquesne Incline", t: "landmark", lon: -80.01759, lat: 40.43987, r: 90, s: 2.5, sight: true },

  // Oakland
  { n: "Cathedral of Learning", t: "landmark", lon: -79.95319, lat: 40.4443, r: 96, s: 1.5, sight: true },
  { n: "University of Pittsburgh", t: "place", lon: -79.95363, lat: 40.44395, r: 90, s: 1.5 },
  { n: "Carnegie Mellon University", t: "place", lon: -79.94842, lat: 40.44501, r: 88, s: 1.5 },
  { n: "Phipps Conservatory", t: "landmark", lon: -79.9477, lat: 40.43895, r: 88, s: 2, sight: true },
  {
    n: "Carnegie Museum of Natural History",
    t: "museum",
    lon: -79.94994,
    lat: 40.44306,
    r: 88,
    s: 2,
    sight: true,
  },
  { n: "Carnegie Museum of Art", t: "museum", lon: -79.94905, lat: 40.44371, r: 86, s: 2, sight: true },
  {
    n: "Soldiers and Sailors Memorial Hall",
    t: "landmark",
    lon: -79.95638,
    lat: 40.44501,
    r: 80,
    s: 2,
    sight: true,
  },
];
