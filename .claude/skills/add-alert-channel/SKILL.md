---
description: Add a new alert channel (e.g., webhook, email, SMS). Use when expanding how task success is reported beyond the current file + bell mechanism.
---

# Adding an Alert Channel

Currently, alerting lives in `stack/framework/run.ts` in the `writeAlert()` function. On task success it:

1. Writes `logs/alert-<taskName>.txt` (task name, timestamp, step, URL)
2. Sends a BEL character to stdout (system bell)
3. Logs "ALERT: Task successful!"

## Adding a new channel

### 1. Create the channel function in `stack/framework/`

Keep it in `run.ts` if small, or extract to a new file if substantial:

```typescript
// stack/framework/alerts.ts
async function sendWebhook(
  taskName: string,
  result: TaskResultSuccess,
): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK;
  if (!webhookUrl) return; // gracefully skip if not configured

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: taskName,
      step: result.lastCompletedStep,
      url: result.finalUrl,
      timestamp: new Date().toISOString(),
    }),
  });
}
```

### 2. Call from `writeAlert()` in `stack/framework/run.ts`

```typescript
function writeAlert(taskName: string, result: TaskResultSuccess): void {
  // ...existing file write and bell...
  sendWebhook(taskName, result).catch((err) => {
    logger.warn("Webhook failed", { error: toErrorMessage(err) });
  });
}
```

Catch errors — alert channels should never crash the task.

### 3. Thread config via environment

Use `/add-env-var` to add the configuration (e.g., `ALERT_WEBHOOK`) through Docker.

For secrets (API keys, tokens), use vault details instead:
- Add to the project's vault details
- Add to the task's `needs` mapping
- Read from context in the alert function

### Design rules

- **Never throw** — alert failures shouldn't affect task success/failure
- **Fire-and-forget** — don't `await` in the main flow if latency matters
- **Log failures** — use `logger.warn()` so issues are visible
- **Graceful skip** — if config is missing, silently skip (not all deployments need all channels)
- **Keep the file alert** — it's the baseline that always works, even offline

### Existing alert data

The `TaskResultSuccess` type provides:

```typescript
interface TaskResultSuccess {
  lastCompletedStep: string;  // name of the final successful step
  finalUrl?: string;  // URL after the task completed (if applicable)
}
```

If you need more data in alerts, extend `TaskResultSuccess` in `stack/framework/tasks.ts`.
