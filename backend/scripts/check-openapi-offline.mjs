import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const output = resolve("/tmp/akwaan-openapi-offline-check.json");
const result = spawnSync("npm", ["run", "api:openapi"], {
  cwd: resolve(import.meta.dirname, ".."),
  encoding: "utf8",
  timeout: 15_000,
  env: {
    ...process.env,
    MONGODB_URI: "mongodb://127.0.0.1:1/openapi_must_not_connect",
    OPENAPI_OUTPUT: output,
  },
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const committed = readFileSync(resolve(import.meta.dirname, "../openapi/openapi.json"));
const generated = readFileSync(output);
rmSync(output, { force: true });
if (!committed.equals(generated)) {
  throw new Error("Offline-generated OpenAPI document differs from the committed contract");
}
process.stdout.write("OpenAPI generated offline and matches the committed contract\n");
