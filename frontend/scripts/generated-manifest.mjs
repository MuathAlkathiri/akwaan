import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const generatedRoot = path.resolve("src/api/generated");
const manifestPath = path.resolve("scripts/generated-manifest.json");

async function files(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...(await files(root, absolute)));
    else result.push(path.relative(root, absolute));
  }
  return result.sort();
}

async function buildManifest() {
  const result = {};
  for (const file of await files(generatedRoot)) {
    const content = await readFile(path.join(generatedRoot, file));
    result[file] = createHash("sha256").update(content).digest("hex");
  }
  return result;
}

const actual = await buildManifest();
if (process.argv.includes("--write")) {
  await writeFile(manifestPath, `${JSON.stringify(actual, null, 2)}\n`);
  process.stdout.write(
    `Generated manifest written: ${Object.keys(actual).length} files\n`,
  );
} else {
  const expected = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Generated client has drifted. Run npm run api:generate.");
  }
  process.stdout.write(
    `Generated client valid: ${Object.keys(actual).length} files\n`,
  );
}
