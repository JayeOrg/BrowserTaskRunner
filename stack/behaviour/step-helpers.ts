/**
 * Utility to turn a readonly tuple of step names into:
 * - a dot-notation-friendly enum-like object (`Step.X`)
 * - the original ordered list for logging/progress display
 *
 * This preserves developer experience when adding and removing steps,
 * keeping step modification to a single line change without losing enum referencing.
 */
export function createStepEnum<T extends readonly string[]>(stepNames: T): {
  Step: { [K in T[number]]: K };
  orderedSteps: readonly T[number][];
} {
  const Step = Object.freeze(
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    Object.fromEntries(stepNames.map(name => [name, name])) as { [K in T[number]]: K },
  );

  return { Step, orderedSteps: stepNames };
}
