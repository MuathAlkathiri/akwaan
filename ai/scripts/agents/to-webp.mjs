#!/usr/bin/env node
// Convert one image to WebP with the repo's own `sharp` (already a dependency).
//
//   node ai/scripts/agents/to-webp.mjs <input> <output.webp> [quality]
//
// Prints one JSON line describing the result. Never overwrites: the caller
// decides where a file may land, and an existing asset may already be referenced
// by live content.
import { existsSync, statSync } from 'node:fs';
import sharp from 'sharp';

const [input, output, qualityArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: to-webp.mjs <input> <output.webp> [quality]');
  process.exit(2);
}
if (!existsSync(input)) {
  console.error(`input not found: ${input}`);
  process.exit(2);
}
if (existsSync(output)) {
  console.error(`refusing to overwrite: ${output}`);
  process.exit(2);
}
const quality = qualityArg === undefined ? 86 : Number(qualityArg);
if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
  console.error('quality must be an integer from 1 to 100');
  process.exit(2);
}

const info = await sharp(input).webp({ quality }).toFile(output);
console.log(JSON.stringify({
  output,
  width: info.width,
  height: info.height,
  bytes: statSync(output).size,
  sourceBytes: statSync(input).size,
  quality,
}));
