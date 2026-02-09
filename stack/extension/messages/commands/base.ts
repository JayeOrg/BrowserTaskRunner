export interface IncomingCommand {
  id?: number;
  type: string;
  [key: string]: unknown;
}

export function isIncomingCommand(value: unknown): value is IncomingCommand {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("type" in value)) {
    return false;
  }
  return typeof value.type === "string";
}
