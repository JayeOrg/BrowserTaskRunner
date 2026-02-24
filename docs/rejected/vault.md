# Rejected: Vault

Won't-fix decisions for `stack/vault/`. Check before proposing changes to vault core, crypto, ops, or CLI.

- **`vault/core.ts` string template for SQL**: The query strings use template literals with `$paramName` placeholders (not JS interpolation). This is safe — node:sqlite uses parameterized queries. Don't flag as SQL injection risk.
- **No schema version in vault SQLite**: The vault schema is created by `initSchema()` and has no version column or migration system. The schema is simple (4 tables) and changes infrequently. A version/migration system would add complexity disproportionate to the schema's stability. If a breaking change is needed, a fresh vault can be created.
- **`resolveAdminAuth` silently clears invalid tokens from `.env`**: When `VAULT_ADMIN` contains a wrong-type token (32-byte project token instead of 48-byte session token) or an expired session, `resolveAdminAuth` removes it from `.env` and falls back to password prompt. This is intentional self-healing — the stderr message explains what happened, and re-prompting is better UX than failing with an opaque error.
- **`resolveToken` naming overlaps with `path.resolve`**: Different contexts (path resolution vs token lookup). No real ambiguity in practice.
- **`promptConfirm` auto-approves in non-TTY mode**: Intentional for scripting/automation. The alternative (failing in non-TTY) would make the CLI unusable in pipelines.
- **`setEnvVar` splits on `\n` without handling `\r\n`**: macOS/Linux only tool. `.env` is created and maintained by this same code, so line endings are always `\n`.
- **Async guard in `vault/db.ts` is runtime-only; could be compile-time**: TypeScript's `Exclude` on return types is fragile with confusing error messages. Runtime guard gives clear, actionable error (`"callback must be synchronous — got a Promise"`). Intentional defense-in-depth.
- **`withVault`/`withVaultReadOnly` have duplicated structure in `vault/cli/env.ts`**: Two functions, 8 lines each, differ only in the opener call. A shared helper would save 4 lines but add indirection. Tolerable at this scale.
- **`unpackBlob` has no layout comment in `crypto.ts`**: Offsets are derived from named constants (`IV_LENGTH`, `AUTH_TAG_LENGTH`). The layout is readable from the code. `packBlob` is equally self-documenting — the concatenation order is the layout.
- **`exportProjectToken`/`parseProjectToken` inverse pair not documented in `crypto.ts`**: Function names clearly indicate the relationship (export/parse).
- **Low-level AES functions exported alongside high-level helpers in `crypto.ts`**: All exports are used by `core.ts` and `ops/`. No external callers exist. The module has a clear internal audience.
- **`wrapVaultOpenError` exported solely for test access in `core.ts`**: Tests need to verify error wrapping behavior. The export is harmless — no external consumers of the vault package.
- **`changePassword` inline comment about session wiping in `core.ts`**: The comment is at the relevant code line. Moving it to the function level separates it from the code it explains.
- **`withSavepoint` error doesn't say what characters are allowed in `db.ts`**: The regex `[a-zA-Z_]` is visible 2 lines above. Error messages don't need to duplicate the validation rule.
- **Error messages lack table/operation context in `rows.ts`**: Callers add context via their own error handling. Adding table context to low-level field extractors would require threading parameters.
- **`createProject` has no savepoint in `projects.ts`**: Single INSERT is atomic. Adding a savepoint for a single statement is unnecessary.
- **`renameProject` comment omits FK name in `projects.ts`**: The comment explains the workaround clearly. The specific FK name is an implementation detail.
- **`getProjectKey` "master key mismatch" error after password verification in `projects.ts`**: The error covers both mismatch and corruption. After password change, the old master key genuinely doesn't match. The message is accurate.
- **Two-stage decryption loop has no structural comment in `runtime.ts`**: The try/catch blocks have clear error messages. The structure is self-documenting.
- **`createSession` prunes expired sessions as undocumented side effect in `sessions.ts`**: Housekeeping during creation is a common pattern. The pruning is visible in the function body.
- **`getMasterKeyFromSession` "not found" error has no recovery hint in `sessions.ts`**: Adding recovery hints to every error message creates coupling between ops and CLI layers. The CLI can add hints at its level.
- **`VAULT_PATH` three-level `../` assumption in `env.ts`**: Standard pattern for resolving from compiled output to project root. The path is stable.
- **`rl.question("")` with empty string in `prompt.ts`**: The label is written to stderr on the preceding line. The empty string prevents double-printing. Standard readline pattern.
- **Module-level `stdinBuffer`/`stdinIndex` state in `prompt.ts`**: The vault CLI is tested via `spawnSync` (separate process). The module-level state is fine for CLI use.
- **Auth required for `detail list` is implicit policy in `detail.ts`**: The auth call is the first line of the handler. Its presence IS the documentation of the policy.
- **`handleChangePassword` "old password" prompt labeled "Vault password" in `session.ts`**: The flow is old -> new -> confirm. "Vault password" is unambiguous in context — it's the first prompt.
- **`deriveMasterKeyWithSalt` vs `deriveMasterKey` redundant wrapper in `core.ts`**: `deriveMasterKey` is the common-case helper. `deriveMasterKeyWithSalt` is used by `changePassword` which needs both. The naming indicates the relationship.
- **`sessions.id` blob storage vs external base64 representation in `schema.ts`**: Standard binary-storage / text-transport pattern. `createSession` encodes to base64, `parseSessionToken` decodes back. No mismatch, no effects.
- **`details` INSERT column order differs from PRIMARY KEY in `schema.ts`**: INSERT lists `key, project` matching the CREATE TABLE column declaration order. PRIMARY KEY `(project, key)` controls B-tree index layout, not INSERT ordering. SQLite matches by name.
- **Double-label prompt in `project setup` (project.ts:139-140)**: `console.error` followed by `promptHidden("Value")` shows two labels for one input. Both labels together provide redundant context, which some users may find helpful. Not confusing enough to warrant refactoring `getSecretValue`.
