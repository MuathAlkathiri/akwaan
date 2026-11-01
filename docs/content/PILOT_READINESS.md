# Pilot Readiness Tasks

Work to finish before any paid pilot. **Not started: wait for the go-ahead.**
No task here needs a real database or a real model call to build or test.

| Task | Why it blocks a pilot | Done when | Size |
|---|---|---|---|
| H8: judge temperature on GPT-5 | The judge always sends `temperature: 0` with `require_parameters: true`. By the provider's own note, no `openai/gpt-5` endpoint accepts that, so judging likely fails. One failure halts the whole job. | The judge honours per-model temperature config, and one failed judgement affects only its candidate. | S |
| H10: raw-output storage | One wrong count fails a paid batch, and only 200 characters of output survive. `max_tokens` truncation does the same, and the default of 800 tokens per candidate is below GPT-5's observed peak of 914. | Raw output is stored, valid candidates are salvaged, and the token default is raised. | M |
| H11: repeat requests | An identical request returns the same job forever, even a failed one, so a failed job cannot be retried and "generate more" needs changed guidance. | An explicit run key allows a deliberate re-run, while a double click still creates nothing. | S |

## H7: status

Done on `feat/content-library`: every preflight estimate includes the judge. One
gap remains: the Studio label still has a "not active" branch for the judge,
which can no longer be reached. It is cosmetic, and belongs with H8.
