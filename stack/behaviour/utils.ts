export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function logStep<T extends string>(
  step: T,
  orderedSteps: readonly T[],
  message: string,
  ...details: unknown[]
): void {
  const total = orderedSteps.length;
  const index = orderedSteps.indexOf(step);
  const stepNumber = index >= 0 ? String(index + 1) : '?';
  const totalLabel = String(total);
  const label = `${stepNumber}/${totalLabel}`;
  console.log(`[${label} ${step}] ${message}`, ...details);
}

export function logJson<T extends string>(
  step: T,
  orderedSteps: readonly T[],
  label: string,
  value: unknown,
): void {
  logStep(step, orderedSteps, `${label}:`, JSON.stringify(value, null, 2));
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
