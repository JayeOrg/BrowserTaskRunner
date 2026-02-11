import { sleep } from "./timing.js";

/**
 * Poll an async function until a condition is met or timeout occurs.
 * Returns { ok: true, value } with the first passing value, or { ok: false } on timeout.
 */
export async function pollUntil<T>(
  poll: () => Promise<T>,
  check: (value: T) => boolean,
  options: { timeoutMs: number; intervalMs: number },
): Promise<{ ok: true; value: T } | { ok: false }> {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    const value = await poll();
    if (check(value)) return { ok: true, value };
    await sleep(options.intervalMs);
  }

  return { ok: false };
}
