import type { DatabaseSync } from "node:sqlite";

/** Fn must be synchronous — async callbacks will corrupt the savepoint boundary. */
function withSavepoint<T>(db: DatabaseSync, name: string, fn: () => T): T {
  if (!/^\w+$/u.test(name)) {
    throw new Error(`Invalid savepoint name: "${name}"`);
  }
  db.exec(`SAVEPOINT ${name}`);
  try {
    const result = fn();
    if (result instanceof Promise) {
      throw new Error(`Savepoint "${name}" callback must be synchronous — got a Promise`);
    }
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  }
}

export { withSavepoint };
