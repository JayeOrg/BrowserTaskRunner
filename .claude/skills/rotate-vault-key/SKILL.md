---
description: Rotate a vault project key. Use when a project token may be compromised or as a security practice.
---

# Rotating a Vault Project Key

Key rotation re-encrypts all DEKs (data encryption keys) under a new project key without touching the actual secret values.

## Quick rotation

```bash
npm run vault -- login
npm run vault -- project rotate <project-name>
```

This outputs a new project token. **The old token immediately stops working.**

## What happens internally

The `rotateProject()` function in `stack/vault/ops/projects.ts`:

1. Opens a SAVEPOINT (atomic transaction)
2. Decrypts the old project key using the master key
3. Generates a new random 32-byte project key
4. Updates the `projects` table with the new encrypted key
5. For each detail in the project:
   - Decrypts the DEK using the **old** project key
   - Re-encrypts the DEK using the **new** project key
   - Updates the `details` table
6. Releases the SAVEPOINT (commits)

On any failure, the entire operation rolls back — no partial state.

## After rotation

1. **Export the new token**: `npm run vault -- project export <project-name>`
2. **Update `.env`**: Replace the old `VAULT_TOKEN` with the new one
3. **Restart any running containers**: They cache the token at startup

## Key properties

- **Zero-copy values**: Secret values are never re-encrypted — only the wrapping keys change
- **Atomic**: SQLite SAVEPOINT ensures all-or-nothing
- **No session impact**: Sessions hold the master key, not project keys
- **Immediate invalidation**: Old project tokens fail on next use

## When to rotate

- Project token may have been exposed
- Team member leaves and had access to the token
- Periodic rotation policy
- After a security incident

## Encryption model reference

```
Master Key (from password)
    ↓ wraps
Project Key (per-project, random 32 bytes)
    ↓ wraps
DEK (per-detail, random 32 bytes)
    ↓ encrypts
Secret value (AES-256-GCM)
```

Each detail stores its DEK wrapped under both the master key and the project key, enabling both admin access (password change) and runtime access (project token).
