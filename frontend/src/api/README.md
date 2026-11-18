# Generated API client

`generated/` is produced by Orval from the committed backend OpenAPI document. Do not edit generated files. Run `npm run api:generate` after an intentional contract change; `npm run api:generate:check` verifies the committed SHA-256 manifest.

Transport flow:

```text
generated operation -> orvalMutator -> centralized apiClient -> backend
```

The mutator returns the documented HTTP body. It does not globally unwrap `{ statusCode, data }`, because not every endpoint uses that envelope. Feature hooks own unwrapping and API-to-UI mapping.

## Coverage

The OpenAPI document now covers only Auth, Users and Subscriptions
(`generated/auth`, `generated/users`, `generated/subscriptions`), consumed by the
auth and user feature hooks and mappers. World content, Match, live sessions and
the Content Engine use hand-written clients under their feature folders.
