// Each pool worker gets 1000 ports: worker 0 → 20001–20999, worker 1 → 21001–21999, …
const PORTS_PER_WORKER = 1000;

const poolId = parseInt(process.env.VITEST_POOL_ID ?? "0", 10);
const base =
  20000 + (Number.isFinite(poolId) ? poolId : Math.floor(Math.random() * 10)) * PORTS_PER_WORKER;

let counter = base;

export function nextPort(): number {
  counter++;
  return counter;
}
