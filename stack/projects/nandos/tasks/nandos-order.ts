import { z } from "zod";
import type { BrowserAPI } from "../../../browser/browser.js";
import type {
  SingleAttemptTask,
  TaskContext,
  TaskResultSuccess,
} from "../../../framework/tasks.js";
import type { TaskLogger } from "../../../framework/logging.js";
import { StepRunner } from "../../../framework/step-runner.js";
import { waitForFirst } from "../../utils/selectors.js";
import { sleep } from "../../utils/timing.js";

const contextSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

const TASK = {
  name: "nandosOrder",
  url: "https://www.nandos.com.au/sign-in",
} as const;

const TIMINGS = {
  afterNav: 3000,
  afterClick: 2000,
  afterSelection: 3000,
  afterFill: 500,
  afterModalAction: 2000,
  afterAddItem: 3000,
  mfaPoll: 5000,
  mfaTimeout: 300_000,
  menuLoad: 5000,
  modalWait: 5000,
  selectorWait: 10000,
} as const;

const DRY_RUN = process.env.DRY_RUN === "true";

const SELECTORS = {
  email: ['input[type="email"]', 'input[name="email"]', "input#email"],
  password: ['input[type="password"]', 'input[name="password"]', "input#password"],
} as const;

const MENU_ITEMS = [
  {
    name: "PERi-Chip Wrap",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: ["PERi-PERi Tenders", "Chicken Breast Fillets"],
    heat: "Hot",
    style: undefined,
  },
  {
    name: "Smoky Churrasco Burger",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: ["PERi-PERi Tenders", "Chicken Breast Fillets"],
    heat: "Hot",
    style: "Garlic bread",
  },
  {
    name: "The Halloumi",
    protein: "Chicken Leg Fillets",
    proteinFallbacks: ["PERi-PERi Tenders", "Chicken Breast Fillets"],
    heat: "Hot",
    style: "Wrap",
  },
] as const;

/** CDP-click a CSS selector found via querySelectorRect. Returns whether it was found. */
async function cdpClickSelector(
  browser: BrowserAPI,
  selectors: string[],
): Promise<{ found: true; selector: string } | { found: false }> {
  const rect = await browser.querySelectorRect(selectors);
  if (!rect.found) return { found: false };
  const cx = rect.rect.left + rect.rect.width / 2;
  const cy = rect.rect.top + rect.rect.height / 2;
  await browser.cdpClick(cx, cy);
  return { found: true, selector: rect.selector };
}

/** Try navigating to the menu page directly. Returns true if already logged in. */
async function checkAlreadyLoggedIn(browser: BrowserAPI, logger: TaskLogger): Promise<boolean> {
  await browser.navigate("https://www.nandos.com.au/menu");
  await sleep(TIMINGS.afterNav);
  const { url } = await browser.getUrl();

  if (url.includes("/menu")) {
    logger.success("checkSession", "Already logged in — skipping login flow", { url });
    return true;
  }

  logger.log("checkSession", "Not logged in, proceeding with login flow", { url });
  return false;
}

async function navigate(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  await browser.navigate(TASK.url);
  await sleep(TIMINGS.afterNav);
  const { url, title } = await browser.getUrl();
  logger.success("navigate", "Navigated to sign-in page", { url, title });
}

async function findAndFillLogin(
  browser: BrowserAPI,
  logger: TaskLogger,
  email: string,
  password: string,
): Promise<void> {
  const emailResult = await waitForFirst(browser, SELECTORS.email, TIMINGS.selectorWait);
  if (!emailResult.found) {
    logger.fail("findAndFillLogin", "EMAIL_INPUT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.email.join(", ")}`,
    });
  }
  await browser.fill(emailResult.selector, email);
  await sleep(TIMINGS.afterFill);

  const passResult = await waitForFirst(browser, SELECTORS.password, TIMINGS.selectorWait);
  if (!passResult.found) {
    logger.fail("findAndFillLogin", "PASSWORD_INPUT_NOT_FOUND", {
      details: `Selectors tried: ${SELECTORS.password.join(", ")}`,
    });
  }
  await browser.fill(passResult.selector, password);
  await sleep(TIMINGS.afterFill);

  logger.success("findAndFillLogin", "Entered credentials");
}

async function clickSignIn(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  const result = await cdpClickSelector(browser, ['button[type="submit"]']);
  if (!result.found) {
    logger.fail("clickSignIn", "SIGN_IN_BUTTON_NOT_FOUND", {
      details: "Could not find submit button",
    });
  }
  logger.success("clickSignIn", "Clicked SIGN IN via cdpClick", { selector: result.selector });
  await sleep(TIMINGS.afterClick);
}

async function handleMfa(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  logger.log("handleMfa", "Waiting for manual MFA entry...");

  const deadline = Date.now() + TIMINGS.mfaTimeout;
  while (Date.now() < deadline) {
    const { url } = await browser.getUrl();

    // Successful login redirects away from /sign-in to the homepage
    if (!url.includes("/sign-in")) {
      logger.success("handleMfa", "Login completed, left sign-in page", { url });
      return;
    }

    logger.log("handleMfa", "Still on sign-in page, waiting for MFA...");
    await sleep(TIMINGS.mfaPoll);
  }

  logger.fail("handleMfa", "MFA_TIMEOUT", {
    details: `MFA not completed within ${String(TIMINGS.mfaTimeout / 1000)} seconds`,
  });
}

async function verifyLoginAndNavigateToMenu(
  browser: BrowserAPI,
  logger: TaskLogger,
): Promise<void> {
  // Verify we landed on the homepage after login
  const { url } = await browser.getUrl();
  if (url.includes("/sign-in")) {
    logger.fail("waitForMenu", "STILL_ON_SIGN_IN", { finalUrl: url });
  }
  logger.success("waitForMenu", "Login confirmed, on homepage", { url });

  // Navigate to the menu page
  await browser.navigate("https://www.nandos.com.au/menu");
  await sleep(TIMINGS.menuLoad);

  const { url: menuUrl } = await browser.getUrl();
  if (!menuUrl.includes("/menu")) {
    logger.fail("waitForMenu", "MENU_NAV_FAILED", { finalUrl: menuUrl });
  }
  logger.success("waitForMenu", "On menu page", { url: menuUrl });
}

async function recoverFromChangeAddress(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  logger.warn("handleDeliveryModal", "Accidentally hit change address — clicking Back to return");
  const result = await cdpClickSelector(browser, ['[data-testid="modal"] button[title="Back"]']);
  if (result.found) {
    await sleep(TIMINGS.modalWait);
  }
}

async function clickSaveAndContinue(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  const step = "handleDeliveryModal";

  // Poll for "Save and Continue" button to be present
  const btnDeadline = Date.now() + 15_000;
  let buttonReady = false;
  while (Date.now() < btnDeadline) {
    const content = await browser.getContent("body");
    if (content.content.includes("Save and Continue")) {
      buttonReady = true;
      break;
    }
    logger.log(step, "Save and Continue button not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!buttonReady) {
    logger.fail(step, "SAVE_AND_CONTINUE_NOT_FOUND", {
      details: "Save and Continue text not found on page within 15 seconds",
    });
  }

  // Click once
  const result = await browser.clickText(["Save and Continue"], { tag: "button", cdp: true });
  if (!result.found) {
    logger.fail(step, "SAVE_AND_CONTINUE_CLICK_FAILED", {
      details: "Save and Continue text visible but clickText could not find it",
    });
  }
  logger.success(step, "Clicked SAVE AND CONTINUE", { text: result.text });

  // Poll for modal to close
  const closeDeadline = Date.now() + 15_000;
  while (Date.now() < closeDeadline) {
    await sleep(TIMINGS.modalWait);
    const postContent = await browser.getContent("body");
    if (postContent.content.includes("Delivery address")) {
      await recoverFromChangeAddress(browser, logger);
    } else if (!postContent.content.includes("Order Details")) {
      logger.success(step, "Modal closed");
      return;
    } else {
      logger.log(step, "Modal still open, waiting...");
    }
  }
  logger.fail(step, "MODAL_NOT_CLOSING", {
    details: "Order Details modal still visible after clicking Save and Continue",
  });
}

async function handleDeliveryModal(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  await sleep(TIMINGS.modalWait);

  const delivResult = await cdpClickSelector(browser, [
    'button[value="DELIVERY"]',
    '[data-testid="delivery"]',
  ]);
  if (!delivResult.found) {
    logger.fail("handleDeliveryModal", "DELIVERY_OPTION_NOT_FOUND", {
      details: "Could not find Delivery button",
    });
  }
  logger.success("handleDeliveryModal", "Clicked Delivery via cdpClick", {
    selector: delivResult.selector,
  });

  // Wait for order details modal to appear after clicking Delivery
  await sleep(TIMINGS.modalWait);

  // Poll for modal presence — look for "Order Details" text
  let modalFound = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const content = await browser.getContent("body");
    if (content.content.includes("Order Details")) {
      modalFound = true;
      break;
    }
    logger.log(
      "handleDeliveryModal",
      `Order details modal not visible yet (attempt ${String(attempt + 1)}/5)`,
    );
    await sleep(TIMINGS.afterModalAction);
  }
  if (!modalFound) {
    logger.fail("handleDeliveryModal", "MODAL_NOT_PRESENT", {
      details: "Expected Order Details modal but not found",
    });
  }
  logger.success("handleDeliveryModal", "Order details modal confirmed present");

  // Verify address is visible (poll — address section loads async after modal)
  let addressFound = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const content = await browser.getContent("body");
    if (content.content.includes("Ninth Avenue")) {
      addressFound = true;
      break;
    }
    logger.log(
      "handleDeliveryModal",
      `Address not visible yet (attempt ${String(attempt + 1)}/10)`,
    );
    await sleep(TIMINGS.modalWait);
  }
  if (!addressFound) {
    const content = await browser.getContent("body");
    logger.fail("handleDeliveryModal", "ADDRESS_NOT_VISIBLE", {
      details: `Expected address containing 'Ninth Avenue' not found. Page snippet: ${content.content.slice(0, 500)}`,
    });
  }
  logger.success("handleDeliveryModal", "Address confirmed visible");

  await clickSaveAndContinue(browser, logger);
}

async function navigateToCategory(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  const result = await browser.clickText(["Burgers, Wraps & Pitas"], { cdp: true });
  if (!result.found) {
    logger.fail("navigateToCategory", "CATEGORY_NOT_FOUND", {
      details: 'Could not find "Burgers, Wraps & Pitas" section via clickText',
    });
  }
  logger.success("navigateToCategory", "Navigated to Burgers, Wraps & Pitas", {
    text: result.text,
  });
  await sleep(TIMINGS.afterClick);
}

const ADD_BUTTON_TEXTS = ["ADD ITEM ONLY", "Add item only", "ADD TO ORDER", "Add to order"];

async function clickAddToCart(
  browser: BrowserAPI,
  logger: TaskLogger,
  step: string,
): Promise<void> {
  // Wait for add-to-cart button to appear, then click once
  const addDeadline = Date.now() + 15_000;
  let addButtonReady = false;
  while (Date.now() < addDeadline) {
    const content = await browser.getContent("body");
    if (ADD_BUTTON_TEXTS.some((text) => content.content.includes(text))) {
      addButtonReady = true;
      break;
    }
    logger.log(step, "Add-to-cart button not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!addButtonReady) {
    logger.fail(step, "ADD_ITEM_BUTTON_NOT_FOUND", {
      details: "Could not find add-to-cart button text on page within 15 seconds",
    });
  }
  const addResult = await browser.clickText(ADD_BUTTON_TEXTS, { tag: "button", cdp: true });
  if (!addResult.found) {
    logger.fail(step, "ADD_ITEM_CLICK_FAILED", {
      details: "Add-to-cart text visible but clickText could not find it",
    });
  }
  logger.success(step, "Clicked add-to-cart", { text: addResult.text });

  // Poll for modal to close
  const modalCloseDeadline = Date.now() + 15_000;
  while (Date.now() < modalCloseDeadline) {
    await sleep(TIMINGS.afterAddItem);
    const content = await browser.getContent("body");
    if (!content.content.toLowerCase().includes("choose your protein")) {
      logger.success(step, "Item modal closed");
      return;
    }
    logger.log(step, "Item modal still open, waiting...");
  }
  logger.fail(step, "ITEM_MODAL_NOT_CLOSING", {
    details: "Item modal still visible 15 seconds after clicking add-to-cart",
  });
}

async function addMenuItem(
  browser: BrowserAPI,
  logger: TaskLogger,
  item: (typeof MENU_ITEMS)[number],
): Promise<void> {
  const step = `addItem:${item.name}`;

  // Click the product image — text labels aren't clickable, the img above them is.
  // Each product card has an <img alt="Product Name"> inside a cursor:pointer div.
  const imgSelector = `img[alt="${item.name}"]`;
  const imgResult = await cdpClickSelector(browser, [imgSelector]);
  if (!imgResult.found) {
    logger.fail(step, "MENU_ITEM_NOT_FOUND", {
      details: `Could not find product image with alt="${item.name}"`,
    });
  }
  logger.success(step, `Clicked ${item.name} image`, { selector: imgResult.selector });
  await sleep(TIMINGS.modalWait);

  // Verify item customisation modal appeared (check for modal heading text)
  const modalContent = await browser.getContent("body");
  if (!modalContent.content.toLowerCase().includes("choose your protein")) {
    logger.fail(step, "ITEM_MODAL_NOT_VISIBLE", {
      details: `Expected item modal with "choose your protein" heading after clicking ${item.name}`,
    });
  }
  logger.success(step, "Item modal confirmed open");

  // Select protein
  const proteinTexts = [item.protein, ...item.proteinFallbacks];
  const proteinResult = await browser.clickText(proteinTexts, { cdp: true });
  if (proteinResult.found) {
    logger.success(step, "Selected protein", { text: proteinResult.text });
  } else {
    logger.warn(step, "Protein selection not found, may be pre-selected");
  }
  await sleep(TIMINGS.afterSelection);

  // Select heat (exact match to avoid "Hot" matching "Extra Hot")
  const heatResult = await browser.clickText([item.heat], { exact: true, cdp: true });
  if (heatResult.found) {
    logger.success(step, `Selected heat: ${item.heat}`, { text: heatResult.text });
  } else {
    logger.warn(step, "Heat selection not found");
  }
  await sleep(TIMINGS.afterSelection);

  // Select style if applicable
  if (item.style) {
    const styleResult = await browser.clickText([item.style], { cdp: true });
    if (styleResult.found) {
      logger.success(step, `Selected style: ${item.style}`, { text: styleResult.text });
    } else {
      logger.warn(step, `Style "${item.style}" not found`);
    }
    await sleep(TIMINGS.afterSelection);
  }

  await clickAddToCart(browser, logger, step);
}

async function verifyCartAndOpen(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  await sleep(TIMINGS.afterClick);

  // Try CSS selectors for cart button
  const cartResult = await cdpClickSelector(browser, [
    '[data-testid*="cart"]',
    'button[aria-label*="cart"]',
    'a[aria-label*="cart"]',
  ]);
  if (cartResult.found) {
    logger.success("verifyCartAndOpen", "Clicked cart element", { selector: cartResult.selector });
    await sleep(TIMINGS.afterModalAction);
    return;
  }

  // Fallback: try text-based matching
  const textResult = await browser.clickText(["View cart", "Cart"], { cdp: true });
  if (textResult.found) {
    logger.success("verifyCartAndOpen", "Clicked cart via text", { text: textResult.text });
    await sleep(TIMINGS.afterModalAction);
    return;
  }

  logger.fail("verifyCartAndOpen", "CART_NOT_FOUND", {
    details: "Could not find cart element via CSS or text",
  });
}

async function dismissSuggestionsModal(browser: BrowserAPI, logger: TaskLogger): Promise<boolean> {
  const step = "dismissSuggestions";

  // Strategy 1: Standard modal close button (X icon) — but only if actually visible.
  // Hidden modals (e.g. order details from earlier) stay in the DOM with zero-size rects.
  // Clicking at (0,0) would hit the cart drawer backdrop and close it.
  const closeBtn = await browser.querySelectorRect([
    '[data-testid="modal-close-button"]',
    '[data-testid="modal"] button[title="Close"]',
  ]);
  if (closeBtn.found && closeBtn.rect.width > 0 && closeBtn.rect.height > 0) {
    const cx = closeBtn.rect.left + closeBtn.rect.width / 2;
    const cy = closeBtn.rect.top + closeBtn.rect.height / 2;
    await browser.cdpClick(cx, cy);
    logger.success(step, "Dismissed suggestions via close button", {
      selector: closeBtn.selector,
    });
    return true;
  }

  // Strategy 2: Text-based dismiss buttons
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
    logger.success(step, "Dismissed suggestions via text", { text: dismissResult.text });
    return true;
  }

  logger.warn(step, "No suggestions modal found to dismiss");
  return false;
}

async function dismissSuggestionsAndCheckout(
  browser: BrowserAPI,
  logger: TaskLogger,
): Promise<void> {
  const step = "dismissSuggestions";

  // "One last treat" suggestions modal may appear on top of the cart drawer.
  // Must dismiss it BEFORE clicking "Continue to checkout", otherwise the
  // CDP click lands on the modal overlay instead of the button.
  await sleep(TIMINGS.afterModalAction);

  // Dismiss suggestions modal if present
  await dismissSuggestionsModal(browser, logger);
  await sleep(TIMINGS.modalWait);

  // Wait for "Continue to checkout" to appear — site runs a validation step after dismiss.
  // This can take over 30 seconds on slow loads.
  const checkoutDeadline = Date.now() + 60_000;
  let checkoutVisible = false;
  while (Date.now() < checkoutDeadline) {
    const content = await browser.getContent("body");
    if (content.content.includes("Continue to checkout")) {
      checkoutVisible = true;
      break;
    }
    logger.log(step, "Continue to checkout not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!checkoutVisible) {
    logger.fail(step, "CONTINUE_TO_CHECKOUT_NOT_FOUND", {
      details: "Continue to checkout text not found on page within 30 seconds",
    });
  }
  const checkoutResult = await browser.clickText(["Continue to checkout"], {
    tag: "button",
    cdp: true,
  });
  if (!checkoutResult.found) {
    logger.fail(step, "CONTINUE_TO_CHECKOUT_CLICK_FAILED", {
      details: "Continue to checkout text visible but clickText could not find it",
    });
  }
  logger.success(step, "Clicked Continue to checkout", { text: checkoutResult.text });
  // Wait for navigation to /checkout
  const navDeadline = Date.now() + 60_000;
  while (Date.now() < navDeadline) {
    await sleep(TIMINGS.afterNav);
    const { url } = await browser.getUrl();
    if (url.includes("/checkout")) {
      logger.success(step, "Navigated to checkout", { url });
      return;
    }
    logger.log(step, "Waiting for /checkout navigation...");
  }
  logger.fail(step, "CHECKOUT_NAV_TIMEOUT", {
    details: "Did not navigate to /checkout within 60 seconds",
  });
}

async function selectSavedCard(browser: BrowserAPI, logger: TaskLogger): Promise<void> {
  const step = "selectPayment";
  await sleep(TIMINGS.afterModalAction);

  // Step 1: Wait for the Credit/Debit card option to appear, then click once.
  // Click the <p> text — the SVG ([data-testid="card"]) is only 24x24 and CDP clicks
  // On it don't reliably bubble up to the React button handler.
  const cardDeadline = Date.now() + 30_000;
  let cardVisible = false;
  while (Date.now() < cardDeadline) {
    const content = await browser.getContent("body");
    if (content.content.includes("Credit/Debit card")) {
      cardVisible = true;
      break;
    }
    logger.log(step, "Credit/Debit card option not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!cardVisible) {
    logger.fail(step, "CARD_OPTION_NOT_FOUND", {
      details: "Credit/Debit card text not found on page within 30 seconds",
    });
  }
  const cardClick = await browser.clickText(["Credit/Debit card"], { tag: "p", cdp: true });
  if (!cardClick.found) {
    logger.fail(step, "CARD_CLICK_FAILED", {
      details: "Credit/Debit card text visible but clickText could not find it",
    });
  }
  logger.success(step, "Clicked Credit/Debit card", { text: cardClick.text });
  await sleep(TIMINGS.afterClick);

  // Step 2: Wait for the saved card section to expand.
  const expandDeadline = Date.now() + 15_000;
  let sectionExpanded = false;
  while (Date.now() < expandDeadline) {
    const content = await browser.getContent("body");
    if (
      content.content.includes("SAVED PAYMENT METHODS") ||
      content.content.includes("ending in")
    ) {
      sectionExpanded = true;
      break;
    }
    logger.log(step, "Waiting for saved payment methods to appear...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!sectionExpanded) {
    logger.fail(step, "CARD_SECTION_NOT_EXPANDED", {
      details: "Clicked Credit/Debit card but saved payment methods section did not appear",
    });
  }
  logger.success(step, "Card section expanded — saved payment methods visible");

  // Step 3: Wait for saved card element, then click once.
  const savedDeadline = Date.now() + 15_000;
  let savedVisible = false;
  while (Date.now() < savedDeadline) {
    const rect = await browser.querySelectorRect(['[data-testid="saved-card"]']);
    if (rect.found && rect.rect.width > 0 && rect.rect.height > 0) {
      savedVisible = true;
      break;
    }
    logger.log(step, "Saved card not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!savedVisible) {
    logger.fail(step, "SAVED_CARD_NOT_FOUND", {
      details: "Could not find saved card (ending in 3375) within 15 seconds",
    });
  }
  const savedClick = await cdpClickSelector(browser, ['[data-testid="saved-card"]']);
  if (!savedClick.found) {
    logger.fail(step, "SAVED_CARD_CLICK_FAILED", {
      details: "Saved card element visible but cdpClickSelector could not click it",
    });
  }
  logger.success(step, "Clicked saved card", { selector: savedClick.selector });
  await sleep(TIMINGS.afterClick);
}

async function selectPaymentAndConfirm(browser: BrowserAPI, logger: TaskLogger): Promise<string> {
  const step = "placeOrder";

  // Select saved credit card as payment method
  await selectSavedCard(browser, logger);

  if (DRY_RUN) {
    const { url } = await browser.getUrl();
    logger.success(step, "DRY RUN — skipping Place Order", { url });
    return url;
  }

  // Wait for "Place Order" button to appear, then click once
  const placeOrderDeadline = Date.now() + 30_000;
  let placeOrderVisible = false;
  while (Date.now() < placeOrderDeadline) {
    const content = await browser.getContent("body");
    if (content.content.includes("Place Order")) {
      placeOrderVisible = true;
      break;
    }
    logger.log(step, "Place Order button not visible yet, waiting...");
    await sleep(TIMINGS.afterModalAction);
  }
  if (!placeOrderVisible) {
    logger.fail(step, "PLACE_ORDER_NOT_FOUND", {
      details: "Place Order text not found on page within 30 seconds",
    });
  }
  const placeResult = await browser.clickText(["Place Order"], { tag: "button", cdp: true });
  if (!placeResult.found) {
    logger.fail(step, "PLACE_ORDER_CLICK_FAILED", {
      details: "Place Order text visible but clickText could not find it",
    });
  }
  logger.success(step, "Clicked Place Order", { text: placeResult.text });

  // Verify the order was actually placed — URL should leave /checkout
  // (e.g. to a confirmation or order-tracking page)
  const confirmDeadline = Date.now() + 30_000;
  while (Date.now() < confirmDeadline) {
    await sleep(TIMINGS.afterNav);
    const { url } = await browser.getUrl();
    if (!url.includes("/checkout")) {
      logger.success(step, "Order confirmed — left checkout page", { url });
      return url;
    }

    // Check for confirmation content on the same page
    const content = await browser.getContent("body");
    const body = content.content.toLowerCase();
    if (
      body.includes("order confirmed") ||
      body.includes("order placed") ||
      body.includes("thank you") ||
      body.includes("order number")
    ) {
      logger.success(step, "Order confirmed via page content", { url });
      return url;
    }

    logger.log(step, "Still on /checkout, waiting for confirmation...");
  }

  logger.fail(step, "ORDER_NOT_CONFIRMED", {
    details: "Clicked Place Order but page did not navigate to confirmation within 30 seconds",
  });
  // Unreachable — logger.fail throws
  return "";
}

async function run(
  browser: BrowserAPI,
  context: TaskContext,
  logger: TaskLogger,
): Promise<TaskResultSuccess> {
  const { email, password } = contextSchema.parse(context);
  let finalUrl = "";
  let alreadyLoggedIn = false;

  const runner = new StepRunner({
    sendStepUpdate: (update) => {
      browser.sendStepUpdate(update);
    },
    onControl: (handler) => {
      browser.onControl(handler);
    },
    pauseOnError: true,
  });

  runner
    .step("checkSession", async () => {
      alreadyLoggedIn = await checkAlreadyLoggedIn(browser, logger);
    })
    .step("navigate", async () => {
      if (!alreadyLoggedIn) await navigate(browser, logger);
    })
    .step("fillLogin", async () => {
      if (!alreadyLoggedIn) await findAndFillLogin(browser, logger, email, password);
    })
    .step("signIn", async () => {
      if (!alreadyLoggedIn) await clickSignIn(browser, logger);
    })
    .step("handleMfa", async () => {
      if (!alreadyLoggedIn) await handleMfa(browser, logger);
    })
    .step("verifyLogin", async () => {
      if (!alreadyLoggedIn) await verifyLoginAndNavigateToMenu(browser, logger);
    })
    .step("deliveryModal", () => handleDeliveryModal(browser, logger))
    .step("navigateToCategory", () => navigateToCategory(browser, logger));

  for (const item of MENU_ITEMS) {
    runner.step(`addItem:${item.name}`, () => addMenuItem(browser, logger, item));
  }

  runner
    .step("verifyCart", () => verifyCartAndOpen(browser, logger))
    .step("checkout", () => dismissSuggestionsAndCheckout(browser, logger))
    .step("payment", async () => {
      finalUrl = await selectPaymentAndConfirm(browser, logger);
    });

  await runner.execute();

  return {
    ok: true,
    step: "payment",
    finalUrl,
    context: { task: TASK.name },
  };
}

export const nandosOrderTask: SingleAttemptTask = {
  name: TASK.name,
  url: TASK.url,
  project: "nandos",
  needs: { email: "email", password: "password" },
  mode: "once",
  keepBrowserOpen: true,
  contextSchema,
  run,
};
