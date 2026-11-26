// Builds backend/assets/drawn-things/things.json from a checkout of
// microsoft/fluentui-emoji (MIT) and the curated catalog beside it.
//
//   node backend/scripts/import-drawn-things.mjs <path-to-fluentui-emoji>
//
// The catalog is the source of truth for which drawings are in the library
// and what each is called; this only copies their flat SVG bodies in.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('usage: import-drawn-things.mjs <path-to-fluentui-emoji>');
  process.exit(1);
}
const library = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'drawn-things',
);

const things = [];
for (const line of readFileSync(join(library, 'catalog.txt'), 'utf8').split(
  '\n',
)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [folder, key, ar, the, category] = line
    .split('|')
    .map((part) => part.trim());
  const flat = join(source, 'assets', folder, 'Flat');
  const file = readdirSync(flat).find((name) => name.endsWith('.svg'));
  const svg = readFileSync(join(flat, file), 'utf8');
  if (!/viewBox="0 0 32 32"/.test(svg))
    throw new Error(`${folder}: unexpected viewBox`);
  // Ids would collide when several drawings share one picture.
  if (/\bid=|<defs|url\(/.test(svg))
    throw new Error(`${folder}: uses ids or defs`);
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\d+\.\d{3,}/g, (number) =>
      String(Math.round(Number(number) * 100) / 100),
    )
    .replace(/>\s+</g, '><')
    .trim();
  things.push({ key, ar, the: the || `ال${ar}`, category, body });
}

writeFileSync(
  join(library, 'things.json'),
  `${JSON.stringify(
    {
      source:
        'Fluent Emoji (flat) — https://github.com/microsoft/fluentui-emoji',
      licence: 'MIT — see LICENSE-fluent-emoji.txt',
      things,
    },
    null,
    1,
  )}\n`,
);
console.log(`${things.length} drawings written`);
