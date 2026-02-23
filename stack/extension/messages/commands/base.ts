export interface IncomingCommand {
  id?: number;
  type: string;
  [key: string]: unknown;
}

export function isIncomingCommand(value: unknown): value is IncomingCommand {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}
