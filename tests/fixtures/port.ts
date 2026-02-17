const poolId = parseInt(process.env.VITEST_POOL_ID ?? "0", 10);
const base = 20000 + (Number.isFinite(poolId) ? poolId : Math.floor(Math.random() * 10)) * 1000;
let counter = base;

export function nextPort(): number {
  counter++;
  return counter;
}
