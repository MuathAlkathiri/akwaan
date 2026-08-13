const required = ["LIVE_AI_TEST", "LIVE_AI_BASE_URL", "LIVE_AI_TOKEN", "LIVE_AI_CATEGORY_ID"];
const missing = required.filter((name) => !process.env[name]);
if (process.env.LIVE_AI_TEST !== "true" || missing.length) {
  process.stdout.write("Live AI check skipped; explicit LIVE_AI_TEST configuration is required\n");
  process.exit(0);
}

const response = await fetch(`${process.env.LIVE_AI_BASE_URL}/admin/ai-generator/generate-reviewed`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.LIVE_AI_TOKEN}`,
  },
  body: JSON.stringify({ categoryId: process.env.LIVE_AI_CATEGORY_ID, count: 1 }),
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error(`Live AI check failed with HTTP ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload?.data?.questions) || payload.data.questions.length !== 1) {
  throw new Error("Live AI check returned an unexpected response shape");
}
process.stdout.write("Live AI reviewed-generation check passed without saving drafts\n");
