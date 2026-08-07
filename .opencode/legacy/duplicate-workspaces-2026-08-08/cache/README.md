# Lammah Search and Asset Cache

This directory stores lightweight operational metadata. It contains no binary
Assets and does not change the question output schema.

## Files

- `search-history.json`: prior search intents, query plans, candidates,
  selections, and rejections.
- `asset-index.json`: validated local Asset references and acquisition metadata.

Both files use:

```json
{
  "version": 1,
  "records": []
}
```

## Search Cache

Before searching, normalize Subject, Catalog, event/scene, Question Pattern,
required observation, and Media type. Reuse a recent result only when the full
intent matches and its selected source remains valid.

Re-search when the intended event or Media type differs, the cache is stale,
the source or local file is missing, the result was rejected, rules changed,
or better quality was explicitly requested. Never reuse by Subject name alone.

A record may contain the normalized intent, queries, date, query/rule version,
candidates, selection, rejection reasons, and reusability.

## Asset Cache

Before downloading:

1. check normalized source URL;
2. check checksum when a local candidate exists;
3. check for a validated Asset matching the same scene, observation, and Media
   type.

Reuse only when the file exists, passes current rules, has sufficient quality,
does not leak the new answer, and will not create repetitive gameplay.

An Asset record may contain local relative path, source URLs, checksum, Media
type, Subject, event/scene, source type, dimensions or duration, file size, MIME
type, quality score and reasons, leakage/promotional status, validation status,
acquisition and last-used dates, usage count, and questions using it.

Never fabricate records, retain a missing path as valid, reuse a rejected Asset,
or treat different scenes as equivalent because they share a character.
Revalidate cached records when relevant rules change.

Cache writes occur only after real search, inspection, acquisition, or reuse.
Update usage count and last-used date after final question approval, not when a
draft merely references the Asset.
