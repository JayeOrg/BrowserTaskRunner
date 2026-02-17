export function tailLines(content: string, count: number): string {
  return content.split("\n").slice(-count).join("\n");
}
