/** The cities the database starts with. */
export interface SeedCity {
  slug: string;
  name: string;
  /** Set for a city that is already on the map: the id of its world. */
  worldId?: string;
}

/** Already built: listed last on the site, each linking to its map. */
export const BUILT: SeedCity[] = [
  { slug: 'new-york', name: 'New York', worldId: 'tinynyc' },
  { slug: 'ribeirao-preto', name: 'Ribeirão Preto', worldId: 'tinyrao' },
  { slug: 'orlando', name: 'Orlando', worldId: 'tinyorl' },
  { slug: 'el-calafate', name: 'El Calafate', worldId: 'tinyfte' },
  { slug: 'valencia', name: 'Valencia', worldId: 'tinyvlc' },
  { slug: 'las-vegas', name: 'Las Vegas', worldId: 'tinylas' },
  { slug: 'los-angeles', name: 'Los Angeles', worldId: 'tinylax' },
  { slug: 'dallas', name: 'Dallas', worldId: 'tinydal' },
  { slug: 'cincinnati', name: 'Cincinnati', worldId: 'tinycvg' },
  { slug: 'winterfell', name: 'Winterfell', worldId: 'tinywinterfell' },
  {
    slug: 'king-s-landing',
    name: "King's Landing",
    worldId: 'tinykingslanding',
  },
  { slug: 'westeros', name: 'Westeros', worldId: 'tinywesteros' },
];

/** Suggestions to start the list with, each at zero. Donors add their own. */
export const PROPOSED: SeedCity[] = [
  { slug: 'sao-paulo', name: 'São Paulo' },
  { slug: 'london', name: 'London' },
  { slug: 'tokyo', name: 'Tokyo' },
  { slug: 'paris', name: 'Paris' },
  { slug: 'buenos-aires', name: 'Buenos Aires' },
  { slug: 'lisbon', name: 'Lisbon' },
];
