function requireBlob(row: Record<string, unknown>, field: string): Buffer {
  const val = row[field];
  if (!(val instanceof Uint8Array)) {
    throw new Error(`Expected BLOB for field "${field}"`);
  }
  return Buffer.from(val);
}

function requireString(row: Record<string, unknown>, field: string): string {
  const val = row[field];
  if (typeof val !== "string") {
    throw new Error(`Expected TEXT for field "${field}"`);
  }
  return val;
}

function requireNumber(row: Record<string, unknown>, field: string): number {
  const val = row[field];
  if (typeof val !== "number") {
    throw new Error(`Expected NUMBER for field "${field}"`);
  }
  return val;
}

export { requireBlob, requireString, requireNumber };
