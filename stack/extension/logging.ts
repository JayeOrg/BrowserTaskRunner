function formatTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
}

export function log(msg: string, data?: Record<string, unknown>): void {
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${formatTime()} SiteCheck] ${msg}${dataStr}`);
}
