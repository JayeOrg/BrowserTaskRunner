// Usage: vi.mock('../../../stack/projects/utils/poll.js', () => ({ pollUntil: fastPollUntil }));
export async function fastPollUntil<T>(
  poll: () => Promise<T>,
  check: (value: T) => boolean,
  options: { timeoutMs: number; intervalMs: number },
): Promise<{ ok: true; value: T } | { ok: false; timeoutMs: number }> {
  const maxIter = Math.ceil(options.timeoutMs / Math.max(options.intervalMs, 1));
  for (let iter = 0; iter < maxIter; iter++) {
    const value = await poll();
    if (check(value)) return { ok: true, value };
  }
  return { ok: false, timeoutMs: options.timeoutMs };
}
