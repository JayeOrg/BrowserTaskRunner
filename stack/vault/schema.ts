const SCHEMA = `
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    iv BLOB,
    auth_tag BLOB,
    ciphertext BLOB
  ) STRICT;

  CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    key_iv BLOB NOT NULL,
    key_auth_tag BLOB NOT NULL,
    key_ciphertext BLOB NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS details (
    key TEXT NOT NULL,
    project TEXT NOT NULL REFERENCES projects(name) ON DELETE CASCADE,
    value_iv BLOB NOT NULL,
    value_auth_tag BLOB NOT NULL,
    value_ciphertext BLOB NOT NULL,
    master_dek_iv BLOB NOT NULL,
    master_dek_auth_tag BLOB NOT NULL,
    master_dek_ciphertext BLOB NOT NULL,
    project_dek_iv BLOB NOT NULL,
    project_dek_auth_tag BLOB NOT NULL,
    project_dek_ciphertext BLOB NOT NULL,
    PRIMARY KEY (project, key)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    id BLOB PRIMARY KEY,
    iv BLOB NOT NULL,
    auth_tag BLOB NOT NULL,
    ciphertext BLOB NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT;
`;

export { SCHEMA };
