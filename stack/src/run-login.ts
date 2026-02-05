import 'dotenv/config';
import { ExtensionHost } from '../extension/host.js';
import { botcLoginFlow } from './sites/botc.js';
import { Credentials, SiteLoginFlow } from './types.js';

const WS_PORT = 8765;

function loadCredentials(): Credentials {
  const email = process.env.SITE_EMAIL;
  const password = process.env.SITE_PASSWORD;
  const loginUrl = process.env.SITE_LOGIN_URL || 'https://botc.app/';
  const checkIntervalMs = Number.parseInt(process.env.SITE_CHECK_INTERVAL_MS || '300000', 10);

  if (!email || !password) {
    throw new Error('Missing SITE_EMAIL or SITE_PASSWORD environment variables.');
  }

  return { email, password, loginUrl, checkIntervalMs };
}

async function playAlert(): Promise<void> {
  process.stdout.write('\u0007');
  console.log('\n ALERT: Login successful!');
}

async function runFlow(flow: SiteLoginFlow, creds: Credentials): Promise<void> {
  const host = new ExtensionHost(WS_PORT);

  try {
    await host.start();

    console.log('\n[Setup] Testing connection...');
    await host.ping();
    console.log('[Setup] Extension connected and ready');

    let attempt = 0;
    while (true) {
      attempt++;
      console.log('\n' + '='.repeat(50));
      console.log(`ATTEMPT ${attempt} - ${new Date().toISOString()}`);
      console.log('='.repeat(50));

      try {
        const success = await flow.run(host, creds);

        if (success) {
          console.log('\n LOGIN SUCCESSFUL!');
          await playAlert();
          process.exit(0);
        }

        console.log('\n Login not successful yet');
      } catch (error) {
        const err = error as Error;
        console.error('\n Attempt failed:', err.message);
      }

      console.log(`\nWaiting ${Math.round(creds.checkIntervalMs / 1000)} seconds before next attempt...`);
      await new Promise(r => setTimeout(r, creds.checkIntervalMs));
    }
  } finally {
    host.close();
  }
}

async function main(): Promise<void> {
  const creds = loadCredentials();
  const flow = botcLoginFlow; // future: select by env or args

  await runFlow(flow, creds);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

