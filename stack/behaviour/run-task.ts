import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { ExtensionHost } from '../extension/host.js';
import { getTask, listTasks } from './tasks.js';
import type { Credentials, TaskSchedule, TaskConfig, LoginResult, LoginResultFailure } from './types.js';
import { getErrorMessage } from './utils.js';

const WS_PORT = 8765;

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

function logFailureDetails(result: LoginResultFailure): void {
  const stepLabel = ` | Step: ${result.step}`;
  const contextLabel = result.context ? ` | Context: ${JSON.stringify(result.context)}` : '';
  const urlLabel = result.finalUrl ? ` | URL: ${result.finalUrl}` : '';
  const detailsLabel = result.details ? ` | Details: ${result.details}` : '';
  console.log(` Reason: ${result.reason}${stepLabel}${urlLabel}${detailsLabel}${contextLabel}`);
}

async function writeAlert(taskName: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const alertFile = `alert-${taskName}.txt`;
  const content = `Task: ${taskName}\nSuccess: ${timestamp}\n`;
  writeFileSync(alertFile, content);
  console.log(`Alert written to ${alertFile}`);
  process.stdout.write('\u0007');
  console.log('\n ALERT: Login successful!');
}

async function runTask(task: TaskConfig, creds: Credentials, schedule: TaskSchedule): Promise<void> {
  const host = new ExtensionHost(WS_PORT);

  try {
    await host.start();

    console.log('\n[Setup] Testing connection...');
    await host.ping();
    console.log('[Setup] Extension connected and ready');

    let attempt = 0;
    while (true) {
      attempt++;
      console.log(`\n${  '='.repeat(50)}`);
      console.log(`ATTEMPT ${attempt.toString()} - ${new Date().toISOString()}`);
      console.log('='.repeat(50));

      try {
        const result: LoginResult = await task.run(host, creds);

        if (result.ok) {
          console.log('\n LOGIN SUCCESSFUL!');
          await writeAlert(task.name);
          process.exit(0);
        }

        console.log('\n Login not successful yet');
        logFailureDetails(result);
      } catch (error) {
        console.error('\n Attempt failed:', getErrorMessage(error));
      }

      console.log(`\nWaiting ${Math.round(schedule.checkIntervalMs / 1000).toString()} seconds before next attempt...`);
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

  console.log(`Running task: ${task.name}`);
  console.log(`Target URL: ${task.url}`);

  await runTask(task, creds, schedule);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', getErrorMessage(error));
  process.exit(1);
});
