# Generated API client

`generated/` is produced by Orval from the committed backend OpenAPI document. Do not edit generated files. Run `npm run api:generate` after an intentional contract change; `npm run api:generate:check` verifies the committed SHA-256 manifest.

Transport flow:

```text
generated operation -> orvalMutator -> centralized apiClient -> backend
```

The mutator returns the documented HTTP body. It does not globally unwrap `{ statusCode, data }`, because not every endpoint uses that envelope. Feature hooks own unwrapping and API-to-UI mapping.

## Migration map

| Feature       | Generated output                            | Production consumer                 | Status   |
| ------------- | ------------------------------------------- | ----------------------------------- | -------- |
| Catalogs      | `generated/catalogs` and generated models   | Catalog feature hooks and mappers   | Migrated |
| Categories    | `generated/categories` and generated models | Category feature hooks and mappers  | Migrated |
| Music         | Generated Music operations and models       | Music feature hooks and mappers     | Migrated |
| Users/Auth    | Generated Auth, Users, and Subscriptions    | Auth/User feature hooks and mappers | Migrated |
| Questions     | Generated public/admin Question operations  | Question feature hooks and mappers  | Migrated |
| Games         | Generated Games operations and models       | Game feature hooks and mappers      | Migrated |
| AI Generation | Generated AI operations and models          | AI feature hooks and mappers        | Migrated |

Catalog and Category API response/request types are generated. Their handwritten
UI and form models remain feature-facing contracts. Request mappers serialize the
JSON metadata field and optional `banner`; generated operations create the
`FormData`. Response mappers normalize transport details such as `_id` and keep
generated types inside each feature. Feature hooks preserve the existing query
keys, cache invalidation, and UI-facing return values.

Music upload values remain handwritten UI state. Its request mapper adapts the
selected file, scalar metadata, and numeric snippet timing to the generated
multipart body. The response mapper normalizes media URLs through the centralized
helper, and Question forms consume only the public Music feature API.

Auth and Users retain handwritten form, session, storage, and UI models. Their
request/response mappers adapt generated transport DTOs without exposing them to
providers or screens. The existing current-user and user-list query keys remain
feature-owned, while `authStorage` remains the sole localStorage boundary.

Questions owns persisted Question queries, mutations, bulk review actions, and
asset retries. UI models and flexible metadata stay behind feature mappers, and
AI Generation consumes persisted records only through the Questions public API.

Games keeps its handwritten board and form models behind request/response
mappers. Generated operations own create, list, detail, reveal, award, and skip
transport. Every action writes the authoritative returned game into the detail
cache; concurrent-update conflicts invalidate and refetch that cache without
blind mutation retries. Category and Question records cross into Games only
through their public feature APIs.

AI Generation owns only unsaved reviewed generation and save-draft transport.
Its request mapper preserves the default count and optional compatibility names;
its response mapper keeps extensible metadata while filtering unsafe diagnostic
fields and normalizing media URLs. Long-running mutations disable retries and
delegate provider timeouts to the backend. Saving writes returned persisted
Questions into detail caches and invalidates only the stable Question and
AI-review list keys. The legacy generation route remains generated but unused.

All business-feature backend networking now follows:

```text
feature component -> feature hook -> generated operation -> shared mutator -> centralized Axios -> backend
```

There are no feature-owned manual Axios API wrappers remaining.
