### Extension Design Principle

Keep commands **minimal and generic**: extension knows _how_ to interact with DOM; tasks own _what_ to interact with. Prefer typed primitives over `executeScript`. Ask: "Is this generic enough that any site might need it?"

Good: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`, `select`, `keyboard`, `check`, `scroll`, `getFrameId`
Bad: `detectAndClickTurnstile`, `fillLoginForm`, `detectCaptcha`

See `stack/browser/README.md` for implementation details. Use `/extension` for adding/updating commands.
