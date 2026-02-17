export function requireArg(value: string | undefined, usage: string): asserts value is string {
  if (!value) {
    throw new Error(`Missing argument. Usage: ${usage}`);
  }
}
