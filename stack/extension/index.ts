import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { getErrorMessage } from '../behaviour/utils.js';

async function playAlert(loginUrl: string): Promise<void> {
  process.stdout.write('\u0007');
  console.log('\n ALERT: Login successful!');

  try {
    mkdirSync('/app/infra/alerts', { recursive: true });
    const timestamp = new Date().toISOString();
    const alertContent = `LOGIN SUCCESSFUL!\nTime: ${timestamp}\nSite: ${loginUrl}\n`;
    writeFileSync('/app/infra/alerts/LOGIN_SUCCESS.txt', alertContent);
    console.log(' Alert file written to /app/infra/alerts/LOGIN_SUCCESS.txt');
  } catch (error) {
    console.log('Could not write alert file:', getErrorMessage(error));
  }
}

async function main(): Promise<void> {
  const loginUrl = process.env.SITE_LOGIN_URL || 'https://botc.app/';
  await playAlert(loginUrl);
}

main().catch((error: unknown) => {
  console.error('Fatal error:', getErrorMessage(error));
  process.exit(1);
});
