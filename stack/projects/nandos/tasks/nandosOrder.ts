import type { BrowserAPI } from "../../../browser/browser.js";
import {
  needsFromSchema,
  type SingleAttemptTask,
  type VaultSecrets,
  type TaskResultSuccess,
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
  afterNav: 3000,
  afterClick: 2000,
  afterSelection: 3000,
  afterFill: 500,
  afterModalAction: 2000,
  afterAddItem: 3000,
  addToCartWait: 15_000,
  addressWait: 50_000,
  cardSectionWait: 15_000,
  checkoutWait: 60_000,
  confirmPoll: 3000,
  deliveryModalPoll: 10_000,
  mfaPoll: 5000,
  mfaTimeout: 300_000,
  menuLoad: 5000,
  modalWait: 5000,
  placeOrderWait: 60_000,
  saveAndContinueWait: 15_000,
  cardOptionWait: 30_000,
  selectorWait: 10000,
  sessionCheck: 5000,
  sessionCheckPoll: 1000,
} as const;

const SAFE_MODE = process.env.SAFE_MODE === "true";

const FINAL_STEP = "selectPaymentAndConfirm" as const;

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

async function checkAlreadyLoggedIn(
  browser: BrowserAPI,
  log: StepLogger,
  firstName: string,
): Promise<boolean> {
  await browser.navigate(URLS.menu);
  await sleep(TIMINGS.afterNav);

  const result = await pollUntil(
    () => browser.getText(),
    (text) => text.includes(firstName),
    { timeoutMs: TIMINGS.sessionCheck, intervalMs: TIMINGS.sessionCheckPoll },
  );

  if (result.ok) {
    log.success("Already logged in — skipping login flow");
    return true;
  }

  log.log("Not logged in, proceeding with login flow");
  return false;
}

async function navigate(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(TASK.displayUrl);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  log.success("Navigated to sign-in page", { url, title });
}

async function findAndFillLogin(
  browser: BrowserAPI,
  log: StepLogger,
  email: string,
  password: string,
): Promise<void> {
  const emailResult = await fillFirst(browser, SELECTORS.email, email, TIMINGS.selectorWait);
  if (!emailResult.found) log.fatal("EMAIL_INPUT_NOT_FOUND", { error: emailResult.error });
  await sleep(TIMINGS.afterFill);

  const passResult = await fillFirst(browser, SELECTORS.password, password, TIMINGS.selectorWait);
  if (!passResult.found)
    log.fatal("PASSWORD_INPUT_NOT_FOUND", {
      summary: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  await sleep(TIMINGS.afterFill);

  log.success("Entered credentials");
}

async function clickSignIn(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const result = await browser.cdpClickSelector([...SELECTORS.submit]);
  if (!result.found)
    log.fatal("SIGN_IN_BUTTON_NOT_FOUND", { summary: "Could not find submit button" });
  log.success("Clicked SIGN IN via cdpClick", { selector: result.selector });
  await sleep(TIMINGS.afterClick);
}

async function handleMfa(browser: BrowserAPI, log: StepLogger): Promise<void> {
  log.log("Waiting for manual MFA entry...");

  const result = await pollUntil(
    () => browser.getUrl(),
    ({ url }) => !url.includes("/sign-in"),
    { timeoutMs: TIMINGS.mfaTimeout, intervalMs: TIMINGS.mfaPoll },
  );

  if (!result.ok)
    log.fatal("MFA_TIMEOUT", {
      summary: `MFA not completed within ${String(TIMINGS.mfaTimeout / 1000)} seconds`,
    });

  log.success("Login completed, left sign-in page", { url: result.value.url });
}

async function verifyLogin(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const { url } = await browser.getUrl();
  if (url.includes("/sign-in")) {
    log.fatal("STILL_ON_SIGN_IN", { finalUrl: url });
  }
  log.success("Login confirmed, on homepage", { url });
}

async function navigateToMenu(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await browser.navigate(URLS.menu);
  await sleep(TIMINGS.menuLoad);

  const { url: menuUrl } = await browser.getUrl();
  if (!menuUrl.includes("/menu")) {
    log.fatal("MENU_NAV_FAILED", { finalUrl: menuUrl });
  }
  log.success("On menu page", { url: menuUrl });
}

async function clickSaveAndContinue(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const result = await browser.clickText(["Save and Continue"], {
    tag: "button",
    cdp: true,
    timeout: TIMINGS.saveAndContinueWait,
  });
  if (!result.found)
    log.fatal("SAVE_AND_CONTINUE_NOT_FOUND", {
      summary: `Save and Continue not found on page within ${String(TIMINGS.saveAndContinueWait / 1000)} seconds`,
    });
  log.success("Clicked SAVE AND CONTINUE", { text: result.text });

  const closed = await pollUntil(
    () => browser.getText(),
    (body) => !body.includes("Order Details") && !body.includes("Delivery address"),
    { timeoutMs: TIMINGS.saveAndContinueWait, intervalMs: TIMINGS.modalWait },
  );
  if (!closed.ok)
    log.fatal("MODAL_NOT_CLOSING", {
      summary: "Order Details modal still visible after clicking Save and Continue",
    });
  log.success("Modal closed");
}

async function handleDeliveryModal(
  browser: BrowserAPI,
  log: StepLogger,
  expectedAddress: string,
): Promise<void> {
  await sleep(TIMINGS.modalWait);

  const delivResult = await browser.cdpClickSelector([
    'button[value="DELIVERY"]',
    '[data-testid="delivery"]',
  ]);
  if (!delivResult.found)
    log.fatal("DELIVERY_OPTION_NOT_FOUND", { summary: "Could not find Delivery button" });
  log.success("Clicked Delivery via cdpClick", {
    selector: delivResult.selector,
  });

  await sleep(TIMINGS.modalWait);

  const modalPoll = await browser.waitForText(["Order Details"], TIMINGS.deliveryModalPoll);
  if (!modalPoll.found)
    log.fatal("MODAL_NOT_PRESENT", { summary: "Expected Order Details modal but not found" });
  log.success("Order details modal confirmed present");

  const addressPoll = await browser.waitForText([expectedAddress], TIMINGS.addressWait);
  if (!addressPoll.found) {
    const body = await browser.getText();
    log.fatal("ADDRESS_NOT_VISIBLE", {
      summary: `Expected address containing '${expectedAddress}' not found. Page snippet: ${body.slice(0, 500)}`,
    });
  }
  log.success("Address confirmed visible");

  await clickSaveAndContinue(browser, log);
}

async function navigateToCategory(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const result = await browser.clickText(["Burgers, Wraps & Pitas"], { cdp: true });
  if (!result.found)
    log.fatal("CATEGORY_NOT_FOUND", {
      summary: 'Could not find "Burgers, Wraps & Pitas" section via clickText',
    });
  log.success("Navigated to Burgers, Wraps & Pitas", {
    text: result.text,
  });
  await sleep(TIMINGS.menuLoad);
}

async function clickAddToCart(browser: BrowserAPI, log: StepLogger): Promise<void> {
  const addResult = await browser.clickText([...ADD_BUTTON_TEXTS], {
    tag: "button",
    cdp: true,
    timeout: TIMINGS.addToCartWait,
  });
  if (!addResult.found)
    log.fatal("ADD_ITEM_BUTTON_NOT_FOUND", {
      summary: `Could not find add-to-cart button text on page within ${String(TIMINGS.addToCartWait / 1000)} seconds`,
    });
  log.success("Clicked add-to-cart", { text: addResult.text });

  const closed = await pollUntil(
    () => browser.getText(),
    (body) => !body.toLowerCase().includes("choose your protein"),
    { timeoutMs: TIMINGS.addToCartWait, intervalMs: TIMINGS.afterAddItem },
  );
  if (!closed.ok)
    log.fatal("ITEM_MODAL_NOT_CLOSING", {
      summary: "Item modal still visible 15 seconds after clicking add-to-cart",
    });
  log.success("Item modal closed");
}

async function addMenuItem(
  browser: BrowserAPI,
  log: StepLogger,
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
  await sleep(TIMINGS.modalWait);

  const modalBody = await browser.getText();
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
  await sleep(TIMINGS.afterSelection);

  // Exact match to avoid "Hot" matching "Extra Hot"
  const heatResult = await browser.clickText([item.heat], { exact: true, cdp: true });
  if (heatResult.found) {
    log.success(`Selected heat: ${item.heat}`, { text: heatResult.text });
  } else {
    log.warn("Heat selection not found");
  }
  await sleep(TIMINGS.afterSelection);

  if (item.style) {
    const styleResult = await browser.clickText([item.style], { exact: true, cdp: true });
    if (styleResult.found) {
      log.success(`Selected style: ${item.style}`, { text: styleResult.text });
    } else {
      log.warn(`Style "${item.style}" not found`);
    }
    await sleep(TIMINGS.afterSelection);
  }

  await clickAddToCart(browser, log);
}

async function tryOpenCart(browser: BrowserAPI, log: StepLogger): Promise<boolean> {
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

async function verifyCartAndOpen(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await sleep(TIMINGS.afterClick);

  if (!(await tryOpenCart(browser, log))) {
    log.fatal("CART_NOT_FOUND", { summary: "Could not find cart element via CSS or text" });
  }

  await sleep(TIMINGS.afterModalAction);
}

async function tryDismissSuggestions(browser: BrowserAPI, log: StepLogger): Promise<boolean> {
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

async function dismissSuggestions(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await sleep(TIMINGS.afterModalAction);
  await tryDismissSuggestions(browser, log);
  await sleep(TIMINGS.modalWait);
}

async function continueToCheckout(browser: BrowserAPI, log: StepLogger): Promise<void> {
  // Site runs a validation step after dismiss — can take 30s+ on slow loads
  const checkoutResult = await browser.clickText(["Continue to checkout"], {
    tag: "button",
    cdp: true,
    timeout: TIMINGS.checkoutWait,
  });
  if (!checkoutResult.found)
    log.fatal("CONTINUE_TO_CHECKOUT_NOT_FOUND", {
      summary: `Continue to checkout not found on page within ${String(TIMINGS.checkoutWait / 1000)} seconds`,
    });
  log.success("Clicked Continue to checkout", { text: checkoutResult.text });

  const navResult = await browser.waitForUrl("/checkout", TIMINGS.checkoutWait);
  if (!navResult.found)
    log.fatal("CHECKOUT_NAV_TIMEOUT", {
      summary: `Did not navigate to /checkout within ${String(TIMINGS.checkoutWait / 1000)} seconds`,
    });
  log.success("Navigated to checkout", { url: navResult.url });
}

async function expandCardSection(browser: BrowserAPI, log: StepLogger): Promise<void> {
  await sleep(TIMINGS.afterModalAction);

  // Target the <p> text — the card SVG is only 24x24, too small for reliable CDP clicks
  const cardClick = await browser.clickText(["Credit/Debit card"], {
    tag: "p",
    cdp: true,
    timeout: TIMINGS.cardOptionWait,
  });
  if (!cardClick.found)
    log.fatal("CARD_OPTION_NOT_FOUND", {
      summary: `Credit/Debit card not found on page within ${String(TIMINGS.cardOptionWait / 1000)} seconds`,
    });
  log.success("Clicked Credit/Debit card", { text: cardClick.text });
  await sleep(TIMINGS.afterClick);

  const expandPoll = await browser.waitForText(
    ["SAVED PAYMENT METHODS", "ending in"],
    TIMINGS.cardSectionWait,
  );
  if (!expandPoll.found)
    log.fatal("CARD_SECTION_NOT_EXPANDED", {
      summary: "Clicked Credit/Debit card but saved payment methods section did not appear",
    });
  log.success("Card section expanded — saved payment methods visible");
}

async function selectSavedCard(
  browser: BrowserAPI,
  log: StepLogger,
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
  await sleep(TIMINGS.afterClick);
}

async function selectPaymentAndConfirm(browser: BrowserAPI, log: StepLogger): Promise<string> {
  if (SAFE_MODE) {
    const { url } = await browser.getUrl();
    log.success("SAFE MODE — skipping Place Order", { url });
    return url;
  }

  const placeResult = await browser.clickText(["Place Order"], {
    tag: "button",
    cdp: true,
    timeout: TIMINGS.placeOrderWait,
  });
  if (!placeResult.found)
    return log.fatal("PLACE_ORDER_NOT_FOUND", {
      summary: `Place Order not found on page within ${String(TIMINGS.placeOrderWait / 1000)} seconds`,
    });
  log.success("Clicked Place Order", { text: placeResult.text });

  const confirmed = await pollUntil(
    async () => {
      const { url } = await browser.getUrl();
      const body = (await browser.getText()).toLowerCase();
      return { url, body };
    },
    ({ url, body }) =>
      !url.includes("/checkout") ||
      body.includes("order confirmed") ||
      body.includes("order placed") ||
      body.includes("thank you") ||
      body.includes("order number") ||
      body.includes("still processing your order"),
    { timeoutMs: TIMINGS.placeOrderWait, intervalMs: TIMINGS.confirmPoll },
  );

  if (!confirmed.ok)
    return log.fatal("ORDER_NOT_CONFIRMED", {
      summary: `Clicked Place Order but page did not navigate to confirmation within ${String(TIMINGS.placeOrderWait / 1000)} seconds`,
    });
  log.success("Order confirmed", { url: confirmed.value.url });
  return confirmed.value.url;
}

async function run(
  browser: BrowserAPI,
  secrets: VaultSecrets,
  deps: StepRunnerDeps,
): Promise<TaskResultSuccess> {
  const { email, password, firstName, expectedAddress, savedCardSuffix } =
    nandosSecretsSchema.parse(secrets);
  const logger = deps.taskLogger;
  logger.scoped("config").log(SAFE_MODE ? "SAFE MODE — will not place order" : "LIVE mode");
  let finalUrl = "";
  let alreadyLoggedIn = false;

  const skipLogin = () => alreadyLoggedIn;

  const runner = new StepRunner(deps);

  runner
    .step("checkAlreadyLoggedIn", async (log) => {
      alreadyLoggedIn = await checkAlreadyLoggedIn(browser, log, firstName);
    })
    .step("navigate", (log) => navigate(browser, log), {
      skip: skipLogin,
    })
    .step("findAndFillLogin", (log) => findAndFillLogin(browser, log, email, password), {
      skip: skipLogin,
    })
    .step("clickSignIn", (log) => clickSignIn(browser, log), {
      skip: skipLogin,
    })
    .step("handleMfa", (log) => handleMfa(browser, log), {
      skip: skipLogin,
    })
    .step("verifyLogin", (log) => verifyLogin(browser, log), {
      skip: skipLogin,
    })
    // CheckAlreadyLoggedIn already navigates to menu on session hit
    .step("navigateToMenu", (log) => navigateToMenu(browser, log), {
      skip: skipLogin,
    });

  runner
    .step("handleDeliveryModal", (log) => handleDeliveryModal(browser, log, expectedAddress))
    .step("navigateToCategory", (log) => navigateToCategory(browser, log));

  for (const item of MENU_ITEMS) {
    runner.step(`addMenuItem:${item.name}`, (log) => addMenuItem(browser, log, item));
  }

  runner
    .step("verifyCartAndOpen", (log) => verifyCartAndOpen(browser, log))
    .step("dismissSuggestions", (log) => dismissSuggestions(browser, log))
    .step("continueToCheckout", (log) => continueToCheckout(browser, log))
    .step("expandCardSection", (log) => expandCardSection(browser, log))
    .step("selectSavedCard", (log) => selectSavedCard(browser, log, savedCardSuffix))
    .step(FINAL_STEP, async (log) => {
      finalUrl = await selectPaymentAndConfirm(browser, log);
    });

  await runner.execute();

  return {
    lastCompletedStep: FINAL_STEP,
    finalUrl,
  };
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
