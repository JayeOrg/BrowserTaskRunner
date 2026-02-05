import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { getErrorMessage } from '../behaviour/utils.js';

async function playAlert(taskUrl: string): Promise<void> {
  process.stdout.write('\u0007');
  console.log('\n ALERT: Task successful!');

  try {
    mkdirSync('/app/infra/alerts', { recursive: true });
    const timestamp = new Date().toISOString();
    const alertContent = `Task SUCCESSFUL!\nTime: ${timestamp}\nSite: ${taskUrl}\n`;
    writeFileSync('/app/infra/alerts/TASK_SUCCESS.txt', alertContent);
    console.log(' Alert file written to /app/infra/alerts/TASK_SUCCESS.txt');
  } catch (error) {
    console.log('Could not write alert file:', getErrorMessage(error));
  }
}

async function main(): Promise<void> {
  const taskUrl = process.env.SITE_TASK_URL || 'https://botc.app/';
  await playAlert(taskUrl);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', getErrorMessage(error));
  process.exit(1);
});
