#!/usr/bin/env node
// What deploy.sh asks before it sends a world's street walk or its manifest. Node only, no
// dependencies. Prints one line per problem (nothing when all is well) and always exits 0, so
// the script decides what to do.
//
//   node deploy/walk-check.mjs walk <data dir>
//     the walk there: walk.json present, every square it lists on disk by name and no other, and the
//     manifest naming the walk's version as it is on disk (the pipeline's `walkVersion`, which
//     the pipeline's tests hold this to)
//   node deploy/walk-check.mjs manifest <local manifest> <server manifest> <field>
//     every field of the two manifests but <field> the same: what may be sent when only that
//     field (the walk's or the indexes' version) is meant to change
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SQUARE = /^-?\d+_-?\d+\.bin$/;

/** The walk's version, as the pipeline's `walkVersion` makes it: a hash of every file's name and
 * contents, in name order. */
export function walkVersion(walk) {
  const cells = path.join(walk, "cells");
  const squares = fs.existsSync(cells)
    ? fs
        .readdirSync(cells)
        .filter((name) => SQUARE.test(name))
        .map((name) => {
          const [i, j] = name.slice(0, -4).split("_").map(Number);
          return `cells/${i}_${j}.bin`;
        })
    : [];
  const files = ["walk.json", ...squares].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(walk, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/** The squares' files a walk.json lists: bit (i − i0) + (j − j0)·cols of its bitset, LSB-first. */
function listed(index) {
  const bits = Buffer.from(index.cells, "base64");
  const names = new Set();
  for (let k = 0; k < bits.length * 8; k++)
    if ((bits[k >> 3] >> (k & 7)) & 1)
      names.add(`${index.i0 + (k % index.cols)}_${index.j0 + Math.floor(k / index.cols)}.bin`);
  return names;
}

/** Up to three names of a list, and how many more. */
function some(names) {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

export function walkProblems(data) {
  const walk = path.join(data, "walk");
  const problems = [];
  const indexFile = path.join(walk, "walk.json");
  if (!fs.existsSync(indexFile)) return ["no walk/walk.json"];
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const cells = path.join(walk, "cells");
  const onDisk = new Set(fs.existsSync(cells) ? fs.readdirSync(cells).filter((name) => SQUARE.test(name)) : []);
  const want = listed(index);
  // the same squares, not only as many: a walk made with --around elsewhere, or a folder of
  // another build, can hold as many squares as walk.json lists and still miss some of them
  const missing = [...want].filter((name) => !onDisk.has(name)).sort();
  const extra = [...onDisk].filter((name) => !want.has(name)).sort();
  if (onDisk.size === 0)
    problems.push("walk/cells/ has no squares (the last --delete pass would empty the server's)");
  else if (missing.length || extra.length)
    problems.push(
      `walk/cells/ has ${onDisk.size} squares, walk.json lists ${want.size}: ` +
        `${missing.length ? `${missing.length} missing (${some(missing)})` : "none missing"}, ` +
        `${extra.length ? `${extra.length} not listed (${some(extra)})` : "none not listed"}`,
    );
  const manifestFile = path.join(data, "manifest.json");
  if (!fs.existsSync(manifestFile)) problems.push("no manifest.json");
  else {
    const named = JSON.parse(fs.readFileSync(manifestFile, "utf8")).walk;
    const version = walkVersion(walk);
    if (!named)
      problems.push(`the manifest names no walk (stamp it: 'npm run cli -- --city <world> walk --stamp')`);
    else if (named !== version)
      problems.push(
        `the manifest names walk ${named}, the folder is ${version} (stamp it: 'npm run cli -- --city <world> walk --stamp')`,
      );
  }
  return problems;
}

export function manifestProblems(localFile, serverFile, field) {
  const here = JSON.parse(fs.readFileSync(localFile, "utf8"));
  let there;
  try {
    there = JSON.parse(fs.readFileSync(serverFile, "utf8"));
  } catch {
    return ["the server has no manifest"];
  }
  const keys = new Set([...Object.keys(here), ...Object.keys(there)]);
  const differ = [...keys].filter((k) => k !== field && JSON.stringify(here[k]) !== JSON.stringify(there[k]));
  return differ.length
    ? [`the manifest here differs from the server's in more than ${field}: ${differ.join(", ")}`]
    : [];
}

// run as a command (the pipeline's tests import it for `walkVersion`)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [what, ...args] = process.argv.slice(2);
  if (what === "walk" && args.length === 1) {
    for (const line of walkProblems(args[0])) console.log(line);
  } else if (what === "manifest" && args.length === 3) {
    for (const line of manifestProblems(args[0], args[1], args[2])) console.log(line);
  } else {
    console.error("usage: walk-check.mjs walk <data dir> | manifest <local> <server> <field>");
    process.exit(2);
  }
}
