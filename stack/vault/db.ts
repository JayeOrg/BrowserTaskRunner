import type { DatabaseSync } from "node:sqlite";

/** Fn must be synchronous — async callbacks will corrupt the savepoint boundary. */
function withSavepoint<T>(db: DatabaseSync, name: string, fn: () => T): T {
  if (!/^\w+$/u.test(name)) {
    throw new Error(`Invalid savepoint name: "${name}"`);
  }
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  }
}

export { withSavepoint };
