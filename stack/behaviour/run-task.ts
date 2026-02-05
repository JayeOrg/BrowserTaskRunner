import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { ExtensionHost } from '../extension/host.js';
import { getTask, listTasks } from './tasks.js';
import type { Credentials, TaskSchedule, TaskConfig, TaskResult, TaskResultFailure } from './types.js';
import { getErrorMessage } from './utils.js';
import { createPrefixLogger } from './utils/site-utils.js';

const WS_PORT = 8765;
const logger = createPrefixLogger('Runner');

function getTaskName(): string {
  const taskName = process.argv[2];
  if (!taskName) {
    const available = listTasks().join(', ');
    throw new Error(`Missing task name. Usage: node run-task.js <taskName>\nAvailable tasks: ${available}`);
  }
  return taskName;
}

function loadCredentials(): Credentials {
  const email = process.env.SITE_EMAIL;
  const password = process.env.SITE_PASSWORD;

  if (!email || !password) {
    const missing: string[] = [];
    if (!email) {missing.push('SITE_EMAIL');}
    if (!password) {missing.push('SITE_PASSWORD');}
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return { email, password };
}

function loadSchedule(): TaskSchedule {
  const checkIntervalMs = Number.parseInt(process.env.SITE_CHECK_INTERVAL_MS || '300000', 10);
  return { checkIntervalMs };
}

function logFailureDetails(result: TaskResultFailure): void {
  logger.warn('Failure', {
    reason: result.reason,
    step: result.step,
    ...(result.finalUrl ? { url: result.finalUrl } : {}),
    ...(result.details ? { details: result.details } : {}),
    ...(result.context ? { context: result.context } : {}),
  });
}

async function writeAlert(taskName: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const alertFile = `alert-${taskName}.txt`;
  const content = `Task: ${taskName}\nSuccess: ${timestamp}\n`;
  writeFileSync(alertFile, content);
  logger.success('Alert written', { file: alertFile });
  process.stdout.write('\u0007');
  logger.success('ALERT: Task successful!');
}

async function runTask(task: TaskConfig, creds: Credentials, schedule: TaskSchedule): Promise<void> {
  const host = new ExtensionHost(WS_PORT);

  try {
    await host.start();

    logger.log('Testing connection...');
    await host.ping();
    logger.success('Extension connected and ready');

    let attempt = 0;
    while (true) {
      attempt++;
      logger.log(`--- Attempt ${attempt.toString()} ---`);

      try {
        const result: TaskResult = await task.run(host, creds);

        if (result.ok) {
          logger.success('TASK SUCCESSFUL!');
          await writeAlert(task.name);
          process.exit(0);
        }

        logger.warn('Task not successful yet');
        logFailureDetails(result);
      } catch (error) {
        logger.error('Attempt failed', { error: getErrorMessage(error) });
      }

      logger.log('Waiting before next attempt', { seconds: Math.round(schedule.checkIntervalMs / 1000) });
      await new Promise(resolve => { setTimeout(resolve, schedule.checkIntervalMs); });
    }
  } finally {
    host.close();
  }
}

async function main(): Promise<void> {
  const taskName = getTaskName();
  const task = getTask(taskName);
  const creds = loadCredentials();
  const schedule = loadSchedule();

  logger.log('Running task', { task: task.name, url: task.url });

  await runTask(task, creds, schedule);
}

main().catch((error: unknown) => {
  logger.error('Fatal error', { error: getErrorMessage(error) });
  process.exit(1);
});
