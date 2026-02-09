import { Browser, type BrowserOptions } from "../../stack/browser/browser.js";
import { createQueuedExtension } from "./fake-extension.js";
import { nextPort } from "./port.js";

export interface BrowserTestSetup {
  browser: Browser;
  ext: ReturnType<typeof createQueuedExtension>;
}

export async function setupBrowser(options?: BrowserOptions): Promise<BrowserTestSetup> {
  const port = nextPort();
  const browser = new Browser(port, options);
  const ext = createQueuedExtension(port);

  const startPromise = browser.start();
  await ext.connect();
  await startPromise;

  return { browser, ext };
}
