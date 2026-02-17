import { describe, it, expect } from "vitest";
import { pollUntil } from "../../../../stack/projects/utils/poll.js";

describe("pollUntil", () => {
  it("returns immediately when check passes on first poll", async () => {
    const result = await pollUntil(
      async () => 42,
      (val) => val === 42,
      { timeoutMs: 1000, intervalMs: 10 },
    );
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("retries until check passes", async () => {
    let calls = 0;
    const result = await pollUntil(
      async () => ++calls,
      (val) => val >= 3,
      { timeoutMs: 1000, intervalMs: 10 },
    );
    expect(result).toEqual({ ok: true, value: 3 });
    expect(calls).toBe(3);
  });

  it("returns ok: false on timeout", async () => {
    const result = await pollUntil(
      async () => "nope",
      () => false,
      { timeoutMs: 50, intervalMs: 10 },
    );
    expect(result).toEqual({ ok: false, timeoutMs: 50 });
  });

  it("returns the value that passed the check", async () => {
    let counter = 0;
    const result = await pollUntil(
      async () => ({ count: ++counter }),
      (val) => val.count === 2,
      { timeoutMs: 1000, intervalMs: 10 },
    );
    expect(result).toEqual({ ok: true, value: { count: 2 } });
  });

  it("handles async poll functions that take time", async () => {
    let calls = 0;
    const result = await pollUntil(
      async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        return ++calls;
      },
      (val) => val >= 2,
      { timeoutMs: 1000, intervalMs: 10 },
    );
    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("propagates errors thrown by the poll function", async () => {
    await expect(
      pollUntil(
        async () => {
          throw new Error("poll exploded");
        },
        () => true,
        { timeoutMs: 1000, intervalMs: 10 },
      ),
    ).rejects.toThrow("poll exploded");
  });
});
