import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { ExtensionHost } from './host.js';

const WS_PORT = 8765;

async function playAlert(loginUrl: string): Promise<void> {
  process.stdout.write('\u0007');
  console.log('\n ALERT: Login successful!');

  try {
    mkdirSync('/app/docker/alerts', { recursive: true });
    const timestamp = new Date().toISOString();
    const alertContent = `LOGIN SUCCESSFUL!\nTime: ${timestamp}\nSite: ${loginUrl}\n`;
    writeFileSync('/app/docker/alerts/LOGIN_SUCCESS.txt', alertContent);
    console.log(' Alert file written to /app/docker/alerts/LOGIN_SUCCESS.txt');
  } catch (err) {
    const error = err as Error;
    console.log('Could not write alert file:', error.message);
  }
}

async function main(): Promise<void> {
  const loginUrl = process.env.SITE_LOGIN_URL || 'https://botc.app/';
  await playAlert(loginUrl);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
