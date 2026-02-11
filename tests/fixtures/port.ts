// Randomized base port per worker avoids collisions across parallel vitest workers.
const base = 20000 + Math.floor(Math.random() * 10000);
let counter = base;

export function nextPort(): number {
  counter++;
  return counter;
}
