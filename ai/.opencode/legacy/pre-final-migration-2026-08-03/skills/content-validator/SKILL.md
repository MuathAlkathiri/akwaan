---
name: content-validator
description: Validates and repairs Akwaan ContentItems and generated sets against domain, media, and gameplay rules.
---

# Content Validator

Read `../../knowledge/AKWAN-CONTENT-BIBLE.md` and preserve the repository's
current ContentItem schema.

## Item blockers

Reject or repair when:

- Scope is missing or incompatible;
- target Challenge Type is excluded by the Scope;
- answer mode is unsupported;
- answer cannot resolve automatically;
- multiple-choice has no single correct option;
- closest value/tolerance/unit is invalid or ambiguous;
- prompt or media leaks the answer;
- attached media is decorative, wrong, unreadable, or insufficient;
- factual support is missing;
- semantic duplicate exists;
- legacy fields appear (`points`, `difficulty`, manual correctness);
- required asset metadata or local file is missing;
- wording is unnatural or unfair under the fixed timer.

## Set checks

- requested count matches;
- Content Pattern and primary-focus coverage is varied;
- answers and event clusters are not concentrated;
- every media path resolves;
- every media item passes the Blind Asset Test;
- no Scope exclusion is bypassed;
- RYO items use only `multiple_choice` or `closest`;
- no open host-judged answer appears;
- generated output matches the current ContentItem DTO.

Return stable reason codes and specific explanations. Re-run every affected
validation after repair. Never silently approve a failure.
