import { sleep } from "./timing.js";

export async function pollUntil<T>(
  poll: () => Promise<T>,
  check: (value: T) => boolean,
  options: { timeoutMs: number; intervalMs: number },
): Promise<{ ok: true; value: T } | { ok: false }> {
  if (options.intervalMs <= 0) {
    throw new Error("pollUntil: intervalMs must be positive");
  }
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    const value = await poll();
    if (check(value)) return { ok: true, value };
    await sleep(options.intervalMs);
  }

  return { ok: false };
}
