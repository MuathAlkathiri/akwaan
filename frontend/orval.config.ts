import { defineConfig } from "orval";
import path from "node:path";

const outputRoot = process.env.ORVAL_OUTPUT_ROOT
  ? path.resolve(process.env.ORVAL_OUTPUT_ROOT)
  : path.resolve(__dirname, "src/api/generated");

export default defineConfig({
  akwaanApi: {
    input: path.resolve(
      __dirname,
      "../backend/openapi/openapi.json",
    ),
    output: {
      mode: "tags-split",
      target: path.join(outputRoot, "operations.ts"),
      schemas: path.join(outputRoot, "models"),
      client: "react-query",
      httpClient: "axios",
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: path.resolve(__dirname, "src/api/orval-mutator.ts"),
          name: "orvalMutator",
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
    },
  },
});
