The issue I'm trying to solve:

- Login is down for the target URL
- I want an autonomous test that will check logging into the target every five minutes

The steps are:

- Navigate to the site
- Enter login details
- Pass the cloudflare human check
- Attempt to log in
- IF navigation is successful, end and alert
- ELSE re-attempt logging in each five minutes until navigation is successful or the test errors

Notes:

- Don't care about code churn cost when coming up with new solutions
- Don't preserve legacy code
- Avoid adding in-test retries; treat them as a test smell.

Review FAILED_APPROACHES for things to avoid, and add to it as paths fail.

We don't want to publish this extension, it's for personal use.

## Architecture

Three layers with strict separation:

- **Infra**: Docker, Xvfb, Chrome startup. No knowledge of sites or automation logic.
- **Extension**: Generic browser automation bridge. Receives commands, returns results. No site-specific knowledge.
- **Behaviour**: All site-specific logic lives here - selectors, timing, detection strategies.

### Extension Design Principle

Keep extension commands **minimal and generic** while maintaining **developer experience**:

- Extension should only know _how_ to interact with the DOM (click, fill, wait, query)
- Behaviour should own _what_ to interact with (selectors, coordinates, timing)
- Prefer typed primitives (`click(selector)`) over stringly-typed code (`executeScript("document.querySelector...")`)
- When adding new capabilities, ask: "Is this generic enough that any site might need it?"

Good extension commands: `click`, `fill`, `waitForSelector`, `navigate`, `cdpClick`, `querySelectorRect`
Bad extension commands: `clickTurnstile`, `fillLoginForm`, `detectCaptcha`
