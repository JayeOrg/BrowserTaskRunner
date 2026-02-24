### Vault

- `node:sqlite` enables `PRAGMA foreign_keys = ON` by default. Don't add it manually. FK constraints are always active — code that works around them (INSERT+DELETE pattern) is correct and necessary.
- **Defense-in-depth.** Vault code includes technically unreachable guards. Intentional redundancy for direct callers bypassing the CLI.
