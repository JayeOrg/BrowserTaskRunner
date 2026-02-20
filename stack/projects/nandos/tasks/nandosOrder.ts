import type { BrowserAPI } from "../../../browser/browser.js";
import {
  needsFromSchema,
  type SingleAttemptTask,
  type VaultSecrets,
} from "../../../framework/tasks.js";
import type { StepLogger } from "../../../framework/logging.js";
import { StepRunner, type StepRunnerDeps } from "../../../framework/step-runner.js";
import { fillFirst, LOGIN_SELECTORS } from "../../utils/selectors.js";
import { nandosSecretsSchema } from "../../utils/schemas.js";
import { sleep } from "../../utils/timing.js";
import { pollUntil } from "../../utils/poll.js";

const URLS = {
  menu: "https://www.nandos.com.au/menu",
} as const;

const TASK = {
  name: "nandosOrder",
  displayUrl: "https://www.nandos.com.au/sign-in",
} as const;

const TIMINGS = {
  afterNavDelayMs: 3000,
  afterClickDelayMs: 2000,
  afterSelectionDelayMs: 3000,
  afterFillDelayMs: 500,
  afterModalActionDelayMs: 2000,
  afterAddItemIntervalMs: 3000,
  addToCartTimeoutMs: 15_000,
  addressTimeoutMs: 50_000,
  cardSectionTimeoutMs: 15_000,
  checkoutTimeoutMs: 60_000,
  confirmIntervalMs: 3000,
  deliveryModalTimeoutMs: 10_000,
  mfaIntervalMs: 5000,
  mfaTimeoutMs: 300_000,
  menuLoadDelayMs: 5000,
  modalDelayMs: 5000,
  placeOrderTimeoutMs: 60_000,
  saveAndContinueTimeoutMs: 15_000,
  cardOptionTimeoutMs: 30_000,
  selectorTimeoutMs: 10000,
  sessionCheckTimeoutMs: 5000,
  sessionCheckIntervalMs: 1000,
} as const;

const SAFE_MODE = process.env.SAFE_MODE === "true";

const SELECTORS = {
  ...LOGIN_SELECTORS,
  submit: ['button[type="submit"]'],
} as const;

const PROTEIN_FALLBACKS = ["PERi-PERi Tenders", "Chicken Breast Fillets"] as const;

const ADD_BUTTON_TEXTS = [
  "ADD ITEM ONLY",
  "Add item only",
  "ADD TO ORDER",
  "Add to order",
] as const;

const MENU_ITEMS = [
  {
    name: "PERi-Chip Wrap",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: PROTEIN_FALLBACKS,
    heat: "Hot",
    style: undefined,
  },
  {
    name: "Smoky Churrasco Burger",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: PROTEIN_FALLBACKS,
    heat: "Hot",
    style: "Garlic bread",
  },
  {
    name: "The Halloumi",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: PROTEIN_FALLBACKS,
    heat: "Hot",
    style: "Wrap",
  },
] as const;

async function navigateToMenuAndCheckSession(
  log: StepLogger,
  browser: BrowserAPI,
  firstName: string,
  state: { alreadyLoggedIn: boolean },
): Promise<void> {
  await browser.navigate(URLS.menu);
  await sleep(TIMINGS.afterNavDelayMs);

  const result = await pollUntil(
    () => browser.getText(),
    (text) => text !== null && text.includes(firstName),
    { timeoutMs: TIMINGS.sessionCheckTimeoutMs, intervalMs: TIMINGS.sessionCheckIntervalMs },
  );

  state.alreadyLoggedIn = result.ok;

  if (result.ok) {
    log.success("Already logged in — skipping login flow");
  } else {
    log.log("Not logged in, proceeding with login flow");
  }
}

async function navigate(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await browser.navigate(TASK.displayUrl);
  await sleep(TIMINGS.afterNavDelayMs);
  const { url, title } = await browser.getUrl();
  log.success("Navigated to sign-in page", { url, title });
}

async function findAndFillLogin(
  log: StepLogger,
  browser: BrowserAPI,
  email: string,
  password: string,
): Promise<void> {
  const emailResult = await fillFirst(browser, SELECTORS.email, email, TIMINGS.selectorTimeoutMs);
  if (!emailResult.found)
    log.fatal("EMAIL_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.email.join(", ")}`,
    });
  await sleep(TIMINGS.afterFillDelayMs);

  const passResult = await fillFirst(
    browser,
    SELECTORS.password,
    password,
    TIMINGS.selectorTimeoutMs,
  );
  if (!passResult.found)
    log.fatal("PASSWORD_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  await sleep(TIMINGS.afterFillDelayMs);

  log.success("Entered credentials");
}

async function clickSignIn(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const result = await browser.cdpClickSelector([...SELECTORS.submit]);
  if (!result.found)
    log.fatal("SIGN_IN_BUTTON_NOT_FOUND", { summary: "Could not find submit button" });
  log.success("Clicked SIGN IN via cdpClick", { selector: result.selector });
  await sleep(TIMINGS.afterClickDelayMs);
}

async function handleMfa(log: StepLogger, browser: BrowserAPI): Promise<void> {
  log.log("Waiting for manual MFA entry...");

  const result = await pollUntil(
    () => browser.getUrl(),
    ({ url }) => !url.includes("/sign-in"),
    { timeoutMs: TIMINGS.mfaTimeoutMs, intervalMs: TIMINGS.mfaIntervalMs },
  );

  if (!result.ok)
    log.fatal("MFA_TIMEOUT", {
      summary: `MFA not completed within ${String(TIMINGS.mfaTimeoutMs / 1000)} seconds`,
    });

  log.success("Login completed, left sign-in page", { url: result.value.url });
}

async function verifyLogin(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const { url } = await browser.getUrl();
  if (url.includes("/sign-in")) {
    log.fatal("STILL_ON_SIGN_IN", { finalUrl: url });
  }
  log.success("Login confirmed, on homepage", { url });
}

async function navigateToMenu(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await browser.navigate(URLS.menu);
  await sleep(TIMINGS.menuLoadDelayMs);

  const { url: menuUrl } = await browser.getUrl();
  if (!menuUrl.includes("/menu")) {
    log.fatal("MENU_NAV_FAILED", { finalUrl: menuUrl });
  }
  log.success("On menu page", { url: menuUrl });
}

async function clickSaveAndContinue(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const waitResult = await browser.waitForText(
    ["Save and Continue"],
    TIMINGS.saveAndContinueTimeoutMs,
  );
  if (!waitResult.found)
    log.fatal("SAVE_AND_CONTINUE_NOT_FOUND", {
      summary: `Save and Continue not found on page within ${String(TIMINGS.saveAndContinueTimeoutMs / 1000)} seconds`,
    });
  const clickResult = await browser.clickText(["Save and Continue"], { tag: "button", cdp: true });
  if (!clickResult.found)
    log.fatal("SAVE_AND_CONTINUE_CLICK_FAILED", {
      summary: "Save and Continue text visible but click failed",
    });
  log.success("Clicked SAVE AND CONTINUE", { text: clickResult.text });

  const closed = await pollUntil(
    () => browser.getText(),
    (body) =>
      body !== null && !body.includes("Order Details") && !body.includes("Delivery address"),
    { timeoutMs: TIMINGS.saveAndContinueTimeoutMs, intervalMs: TIMINGS.modalDelayMs },
  );
  if (!closed.ok)
    log.fatal("MODAL_NOT_CLOSING", {
      summary: "Order Details modal still visible after clicking Save and Continue",
    });
  log.success("Modal closed");
}

async function handleDeliveryModal(
  log: StepLogger,
  browser: BrowserAPI,
  expectedAddress: string,
): Promise<void> {
  await sleep(TIMINGS.modalDelayMs);

  const delivResult = await browser.cdpClickSelector([
    'button[value="DELIVERY"]',
    '[data-testid="delivery"]',
  ]);
  if (!delivResult.found)
    log.fatal("DELIVERY_OPTION_NOT_FOUND", { summary: "Could not find Delivery button" });
  log.success("Clicked Delivery via cdpClick", {
    selector: delivResult.selector,
  });

  await sleep(TIMINGS.modalDelayMs);

  const modalPoll = await browser.waitForText(["Order Details"], TIMINGS.deliveryModalTimeoutMs);
  if (!modalPoll.found)
    log.fatal("MODAL_NOT_PRESENT", { summary: "Expected Order Details modal but not found" });
  log.success("Order details modal confirmed present");

  const addressPoll = await browser.waitForText([expectedAddress], TIMINGS.addressTimeoutMs);
  if (!addressPoll.found) {
    const body = (await browser.getText()) ?? "";
    log.fatal("ADDRESS_NOT_VISIBLE", {
      summary: `Expected address containing '${expectedAddress}' not found. Page snippet: ${body.slice(0, 500)}`,
    });
  }
  log.success("Address confirmed visible");

  await clickSaveAndContinue(log, browser);
}

async function navigateToCategory(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const result = await browser.clickText(["Burgers, Wraps & Pitas"], { cdp: true });
  if (!result.found)
    log.fatal("CATEGORY_NOT_FOUND", {
      summary: 'Could not find "Burgers, Wraps & Pitas" section via clickText',
    });
  log.success("Navigated to Burgers, Wraps & Pitas", {
    text: result.text,
  });
  await sleep(TIMINGS.menuLoadDelayMs);
}

async function clickAddToCart(log: StepLogger, browser: BrowserAPI): Promise<void> {
  const waitResult = await browser.waitForText([...ADD_BUTTON_TEXTS], TIMINGS.addToCartTimeoutMs);
  if (!waitResult.found)
    log.fatal("ADD_ITEM_BUTTON_NOT_FOUND", {
      summary: `Could not find add-to-cart button text on page within ${String(TIMINGS.addToCartTimeoutMs / 1000)} seconds`,
    });
  const addResult = await browser.clickText([...ADD_BUTTON_TEXTS], { tag: "button", cdp: true });
  if (!addResult.found)
    log.fatal("ADD_ITEM_CLICK_FAILED", {
      summary: "Add-to-cart button text visible but click failed",
    });
  log.success("Clicked add-to-cart", { text: addResult.text });

  const closed = await pollUntil(
    () => browser.getText(),
    (body) => body !== null && !body.toLowerCase().includes("choose your protein"),
    { timeoutMs: TIMINGS.addToCartTimeoutMs, intervalMs: TIMINGS.afterAddItemIntervalMs },
  );
  if (!closed.ok)
    log.fatal("ITEM_MODAL_NOT_CLOSING", {
      summary: "Item modal still visible 15 seconds after clicking add-to-cart",
    });
  log.success("Item modal closed");
}

async function addMenuItem(
  log: StepLogger,
  browser: BrowserAPI,
  item: (typeof MENU_ITEMS)[number],
): Promise<void> {
  // Text labels aren't clickable — target the <img alt="..."> above them
  const imgSelector = `img[alt="${item.name}"]`;
  const imgResult = await browser.cdpClickSelector([imgSelector]);
  if (!imgResult.found)
    log.fatal("MENU_ITEM_NOT_FOUND", {
      summary: `Could not find product image with alt="${item.name}"`,
    });
  log.success(`Clicked ${item.name} image`, { selector: imgResult.selector });
  await sleep(TIMINGS.modalDelayMs);

  const modalBody = (await browser.getText()) ?? "";
  if (!modalBody.toLowerCase().includes("choose your protein")) {
    log.fatal("ITEM_MODAL_NOT_VISIBLE", {
      summary: `Expected item modal with "choose your protein" heading after clicking ${item.name}. Page snippet: ${modalBody.slice(0, 500)}`,
    });
  }
  log.success("Item modal confirmed open");

  const proteinTexts = [item.protein, ...item.proteinFallbacks];
  const proteinResult = await browser.clickText(proteinTexts, { cdp: true });
  if (proteinResult.found) {
    log.success("Selected protein", { text: proteinResult.text });
  } else {
    log.warn("Protein selection not found, may be pre-selected");
  }
  await sleep(TIMINGS.afterSelectionDelayMs);

  // Exact match to avoid "Hot" matching "Extra Hot"
  const heatResult = await browser.clickText([item.heat], { exact: true, cdp: true });
  if (heatResult.found) {
    log.success(`Selected heat: ${item.heat}`, { text: heatResult.text });
  } else {
    log.warn("Heat selection not found");
  }
  await sleep(TIMINGS.afterSelectionDelayMs);

  if (item.style) {
    const styleResult = await browser.clickText([item.style], { exact: true, cdp: true });
    if (styleResult.found) {
      log.success(`Selected style: ${item.style}`, { text: styleResult.text });
    } else {
      log.warn(`Style "${item.style}" not found`);
    }
    await sleep(TIMINGS.afterSelectionDelayMs);
  }

  await clickAddToCart(log, browser);
}

async function tryOpenCart(log: StepLogger, browser: BrowserAPI): Promise<boolean> {
  const cartResult = await browser.cdpClickSelector([
    '[data-testid*="cart"]',
    'button[aria-label*="cart"]',
    'a[aria-label*="cart"]',
  ]);
  if (cartResult.found) {
    log.success("Clicked cart element", { selector: cartResult.selector });
    return true;
  }

  log.warn("Cart CSS selectors did not match, trying text fallback");

  const textResult = await browser.clickText(["View cart", "Cart"], { cdp: true });
  if (textResult.found) {
    log.success("Clicked cart via text", { text: textResult.text });
    return true;
  }

  return false;
}

async function verifyCartAndOpen(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await sleep(TIMINGS.afterClickDelayMs);

  if (!(await tryOpenCart(log, browser))) {
    log.fatal("CART_NOT_FOUND", { summary: "Could not find cart element via CSS or text" });
  }

  await sleep(TIMINGS.afterModalActionDelayMs);
}

async function tryDismissSuggestions(log: StepLogger, browser: BrowserAPI): Promise<boolean> {
  const closeBtn = await browser.cdpClickSelector([
    '[data-testid="modal-close-button"]',
    '[data-testid="modal"] button[title="Close"]',
  ]);
  if (closeBtn.found) {
    log.success("Dismissed suggestions via close button", {
      selector: closeBtn.selector,
    });
    return true;
  }

  const dismissTexts = [
    "No thanks",
    "No Thanks",
    "NO THANKS",
    "Skip",
    "Not now",
    "Not Now",
    "No, I'm good",
  ];
  const dismissResult = await browser.clickText(dismissTexts, { tag: "button", cdp: true });
  if (dismissResult.found) {
    log.success("Dismissed suggestions via text", { text: dismissResult.text });
    return true;
  }

  log.warn("No suggestions modal found to dismiss");
  return false;
}

async function dismissSuggestions(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await sleep(TIMINGS.afterModalActionDelayMs);
  await tryDismissSuggestions(log, browser);
  await sleep(TIMINGS.modalDelayMs);
}

async function continueToCheckout(log: StepLogger, browser: BrowserAPI): Promise<void> {
  // Site runs a validation step after dismiss — can take 30s+ on slow loads
  const waitResult = await browser.waitForText(["Continue to checkout"], TIMINGS.checkoutTimeoutMs);
  if (!waitResult.found)
    log.fatal("CONTINUE_TO_CHECKOUT_NOT_FOUND", {
      summary: `Continue to checkout not found on page within ${String(TIMINGS.checkoutTimeoutMs / 1000)} seconds`,
    });
  const checkoutResult = await browser.clickText(["Continue to checkout"], {
    tag: "button",
    cdp: true,
  });
  if (!checkoutResult.found)
    log.fatal("CONTINUE_TO_CHECKOUT_CLICK_FAILED", {
      summary: "Continue to checkout text visible but click failed",
    });
  log.success("Clicked Continue to checkout", { text: checkoutResult.text });

  const navResult = await browser.waitForUrl("/checkout", TIMINGS.checkoutTimeoutMs);
  if (!navResult.found)
    log.fatal("CHECKOUT_NAV_TIMEOUT", {
      summary: `Did not navigate to /checkout within ${String(TIMINGS.checkoutTimeoutMs / 1000)} seconds`,
    });
  log.success("Navigated to checkout", { url: navResult.url });
}

async function expandCardSection(log: StepLogger, browser: BrowserAPI): Promise<void> {
  await sleep(TIMINGS.afterModalActionDelayMs);

  // Target the <p> text — the card SVG is only 24x24, too small for reliable CDP clicks
  const waitResult = await browser.waitForText(["Credit/Debit card"], TIMINGS.cardOptionTimeoutMs);
  if (!waitResult.found)
    log.fatal("CARD_OPTION_NOT_FOUND", {
      summary: `Credit/Debit card not found on page within ${String(TIMINGS.cardOptionTimeoutMs / 1000)} seconds`,
    });
  const cardClick = await browser.clickText(["Credit/Debit card"], { tag: "p", cdp: true });
  if (!cardClick.found)
    log.fatal("CARD_OPTION_CLICK_FAILED", {
      summary: "Credit/Debit card text visible but click failed",
    });
  log.success("Clicked Credit/Debit card", { text: cardClick.text });
  await sleep(TIMINGS.afterClickDelayMs);

  const expandPoll = await browser.waitForText(
    ["SAVED PAYMENT METHODS", "ending in"],
    TIMINGS.cardSectionTimeoutMs,
  );
  if (!expandPoll.found)
    log.fatal("CARD_SECTION_NOT_EXPANDED", {
      summary: "Clicked Credit/Debit card but saved payment methods section did not appear",
    });
  log.success("Card section expanded — saved payment methods visible");
}

async function selectSavedCard(
  log: StepLogger,
  browser: BrowserAPI,
  savedCardSuffix: string,
): Promise<void> {
  const savedClick = await browser.cdpClickSelector([
    `[data-testid="saved-card"]:has([data-last4="${savedCardSuffix}"])`,
    `[data-testid="saved-card"]`,
  ]);
  if (!savedClick.found)
    log.fatal("SAVED_CARD_NOT_FOUND", {
      summary: `Could not find saved card (ending in ${savedCardSuffix})`,
    });
  log.success("Clicked saved card", { selector: savedClick.selector });
  await sleep(TIMINGS.afterClickDelayMs);
}

async function selectPaymentAndConfirm(log: StepLogger, browser: BrowserAPI): Promise<void> {
  if (SAFE_MODE) {
    const { url } = await browser.getUrl();
    log.success("SAFE MODE — skipping Place Order", { url });
    return;
  }

  const waitResult = await browser.waitForText(["Place Order"], TIMINGS.placeOrderTimeoutMs);
  if (!waitResult.found)
    log.fatal("PLACE_ORDER_NOT_FOUND", {
      summary: `Place Order not found on page within ${String(TIMINGS.placeOrderTimeoutMs / 1000)} seconds`,
    });
  const placeResult = await browser.clickText(["Place Order"], { tag: "button", cdp: true });
  if (!placeResult.found)
    log.fatal("PLACE_ORDER_CLICK_FAILED", {
      summary: "Place Order text visible but click failed",
    });
  log.success("Clicked Place Order", { text: placeResult.text });

  const confirmed = await pollUntil(
    async () => {
      const { url } = await browser.getUrl();
      const body = ((await browser.getText()) ?? "").toLowerCase();
      return { url, body };
    },
    ({ url, body }) =>
      !url.includes("/checkout") ||
      body.includes("order confirmed") ||
      body.includes("order placed") ||
      body.includes("thank you") ||
      body.includes("order number") ||
      body.includes("still processing your order"),
    { timeoutMs: TIMINGS.placeOrderTimeoutMs, intervalMs: TIMINGS.confirmIntervalMs },
  );

  if (!confirmed.ok)
    log.fatal("ORDER_NOT_CONFIRMED", {
      summary: `Clicked Place Order but page did not navigate to confirmation within ${String(TIMINGS.placeOrderTimeoutMs / 1000)} seconds`,
    });
  log.success("Order confirmed", { url: confirmed.value.url });
}

async function run(
  browser: BrowserAPI,
  secrets: VaultSecrets,
  deps: StepRunnerDeps,
): Promise<string> {
  const { email, password, firstName, expectedAddress, savedCardSuffix } =
    nandosSecretsSchema.parse(secrets);
  const logger = deps.taskLogger;
  logger.scoped("config").log(SAFE_MODE ? "SAFE MODE — will not place order" : "LIVE mode");
  const state = { alreadyLoggedIn: false };
  const needsLogin = () => !state.alreadyLoggedIn;

  const runner = new StepRunner(deps);

  runner
    .step(navigateToMenuAndCheckSession, browser, firstName, state)
    .conditionalStep(needsLogin, navigate, browser)
    .conditionalStep(needsLogin, findAndFillLogin, browser, email, password)
    .conditionalStep(needsLogin, clickSignIn, browser)
    .conditionalStep(needsLogin, handleMfa, browser)
    .conditionalStep(needsLogin, verifyLogin, browser)
    // NavigateToMenuAndCheckSession already navigates to menu on session hit
    .conditionalStep(needsLogin, navigateToMenu, browser);

  runner.step(handleDeliveryModal, browser, expectedAddress).step(navigateToCategory, browser);

  for (const item of MENU_ITEMS) {
    runner.named(item.name, addMenuItem, browser, item);
  }

  runner
    .step(verifyCartAndOpen, browser)
    .step(dismissSuggestions, browser)
    .step(continueToCheckout, browser)
    .step(expandCardSection, browser)
    .step(selectSavedCard, browser, savedCardSuffix)
    .step(selectPaymentAndConfirm, browser);

  return runner.execute();
}

export const task: SingleAttemptTask = {
  name: TASK.name,
  displayUrl: TASK.displayUrl,
  project: "nandos",
  needs: needsFromSchema(nandosSecretsSchema),
  mode: "once",
  keepBrowserOpen: true,
  secretsSchema: nandosSecretsSchema,
  run,
};
