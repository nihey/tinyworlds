/** A place raw data comes from. Each source writes files into the raw directory and nothing else. */
export interface DataSource {
  name: string;
  /** Files (relative to the raw dir) this source produces. */
  files: string[];
  fetch(ctx: FetchContext): Promise<void>;
}

export interface FetchContext {
  rawDir: string;
  bbox: { west: number; south: number; east: number; north: number };
  force: boolean;
  log: (msg: string) => void;
}
