// Runs one SQL query with DuckDB (spatial loaded) and prints the rows as TSV.
// usage: node q.mjs <pipelineDir> "<sql>"   ({raw:city} in the SQL becomes data/<city>/raw)
import { createRequire } from "node:module";
import path from "node:path";
const [pipe, sqlIn] = process.argv.slice(2);
const require = createRequire(path.join(pipe, "package.json"));
const { DuckDBInstance } = require("@duckdb/node-api");
const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("LOAD spatial;");
const sql = sqlIn.replace(/\{raw:(\w+)\}/g, (_, city) => path.join(pipe, "data", city, "raw"));
const r = await c.runAndReadAll(sql);
console.log(r.columnNames().join("\t"));
for (const row of r.getRows()) console.log(row.map((v) => (v === null ? "∅" : String(v))).join("\t"));
