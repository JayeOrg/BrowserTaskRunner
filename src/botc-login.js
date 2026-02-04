import 'dotenv/config';

const LOGIN_URL = process.env.BOTC_LOGIN_URL || 'https://botc.app/';
const CHECK_INTERVAL_MS = Number.parseInt(process.env.BOTC_CHECK_INTERVAL_MS || '300000', 10);

// Status tracking
let lastStatus = null;

async function checkSite() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(LOGIN_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();

    // Analyze response
    const status = {
      httpStatus: response.status,
      isCloudflare: text.includes('cloudflare') || text.includes('cf-') || response.status === 403,
      hasLoginForm: text.includes('type="email"') || text.includes('type="password"'),
      hasMaintenance: text.toLowerCase().includes('maintenance') || text.toLowerCase().includes('unavailable'),
      contentLength: text.length,
      title: text.match(/<title>([^<]*)<\/title>/i)?.[1] || 'Unknown',
    };

    return status;
  } catch (error) {
    return {
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      httpStatus: 0,
      isCloudflare: false,
      hasLoginForm: false,
      hasMaintenance: false,
    };
  }
}

function playAlert() {
  // Terminal bell - repeat a few times
  for (let i = 0; i < 3; i++) {
    process.stdout.write('\u0007');
  }
}

function formatStatus(status) {
  if (status.error) {
    return `❌ ERROR: ${status.error}`;
  }

  const parts = [];
  parts.push(`HTTP ${status.httpStatus}`);

  if (status.isCloudflare) parts.push('🛡️ Cloudflare');
  if (status.hasLoginForm) parts.push('✅ Login form visible');
  if (status.hasMaintenance) parts.push('🔧 Maintenance');

  parts.push(`(${status.contentLength} bytes)`);

  return parts.join(' | ');
}

async function run() {
  console.log('='.repeat(60));
  console.log('BOTC Site Monitor (Headless)');
  console.log('='.repeat(60));
  console.log(`URL: ${LOGIN_URL}`);
  console.log(`Check interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log('');
  console.log('This monitors if the site is responding.');
  console.log('When login form is detected, use the extension version to log in:');
  console.log('  npm run login:extension');
  console.log('='.repeat(60));
  console.log('');

  let attempt = 0;
  while (true) {
    attempt++;
    const timestamp = new Date().toISOString();
    const status = await checkSite();

    const statusStr = formatStatus(status);
    const changed = JSON.stringify(status) !== JSON.stringify(lastStatus);

    if (changed) {
      console.log(`[${timestamp}] #${attempt} ${statusStr} ⚡ CHANGED`);

      // Alert if login form becomes visible
      if (status.hasLoginForm && !lastStatus?.hasLoginForm) {
        console.log('\n🔔🔔🔔 LOGIN FORM DETECTED! Site may be back up! 🔔🔔🔔\n');
        playAlert();
      }

      lastStatus = status;
    } else {
      console.log(`[${timestamp}] #${attempt} ${statusStr}`);
    }

    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
