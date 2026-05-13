#!/usr/bin/env node
/**
 * Resolve a generated (bundled) line/column to original source using Vite's .map file.
 *
 * Usage:
 *   node scripts/resolve-source-map.mjs dist/public/assets/index-XXXX.js 546 59813
 *   node scripts/resolve-source-map.mjs dist/public/assets/index-XXXX.js 546 59813 107098
 *
 * Requires: npm install source-map --save-dev
 * Notes:
 * - Line/column are usually what Safari reports for the *generated* file (1-based line; try column as-is).
 * - If mapping is null, try column-1 (some tools use 0-based column).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SourceMapConsumer } from "source-map";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const chunkPath = process.argv[2];
const line = Number(process.argv[3]);
const cols = process.argv.slice(4).map(Number).filter((n) => Number.isFinite(n));

if (!chunkPath || !Number.isFinite(line) || cols.length === 0) {
  console.error(
    "Usage: node scripts/resolve-source-map.mjs <path-to-chunk.js> <generatedLine> <col1> [col2 ...]",
  );
  process.exit(1);
}

const abs = path.resolve(chunkPath);
const mapPath = `${abs}.map`;

if (!fs.existsSync(mapPath)) {
  console.error(`No source map at ${mapPath}. Build with VITE_SOURCEMAP=1 or VITE_CAP_DEBUG=1.`);
  process.exit(1);
}

const raw = fs.readFileSync(mapPath, "utf8");
const consumer = await new SourceMapConsumer(JSON.parse(raw));

for (const col of cols) {
  for (const c of [col, col - 1]) {
    if (c < 0) continue;
    const pos = consumer.originalPositionFor({
      line,
      column: c,
    });
    console.log(JSON.stringify({ generatedLine: line, generatedColumn: c, ...pos }, null, 2));
    if (pos.source && pos.line != null) break;
  }
}

consumer.destroy();
