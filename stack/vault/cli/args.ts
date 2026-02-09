export function requireArg(value: string | undefined, usage: string): asserts value is string {
  if (!value) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
}
