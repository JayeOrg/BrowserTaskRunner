# nandos

Logs into Nando's Australia and places a favourite order for delivery.

## Flow

1. Navigate to https://www.nandos.com.au/sign-in
2. Fill email and password, click SIGN IN
3. Wait for manual MFA completion (mobile number verification)
4. Verify navigation to /menu
5. Handle delivery modal: select Delivery, confirm address, SAVE AND CONTINUE
6. Navigate to "Burgers, Wraps & Pitas" section
7. Add items with customisations:
   - PERi-Chip Wrap (Chicken Leg Fillets, Hot)
   - Smoky Churrasco Burger (Chicken Leg Fillets, Hot, Garlic bread)
   - The Halloumi (Chicken Leg Fillets, Hot, Wrap)
8. Verify cart count (3), open cart
9. Dismiss last-minute suggestions, confirm "Your Order" sidebar
10. Continue to checkout, select Google Pay + Gem Visa, confirm

## Vault Details

| Detail key        | Description                                         |
|-------------------|-----------------------------------------------------|
| `email`           | Login email                                         |
| `password`        | Login password                                      |
| `firstName`       | First name shown on account (used for verification) |
| `expectedAddress` | Delivery address (matched during address confirm)   |
| `savedCardSuffix` | Last 4 digits of saved payment card                 |

Vault project: `nandos`

## Setup

```bash
npm run vault -- project create nandos
npm run vault -- detail set nandos email
npm run vault -- detail set nandos password
npm run vault -- detail set nandos firstName
npm run vault -- detail set nandos expectedAddress
npm run vault -- detail set nandos savedCardSuffix
```

## Run

```bash
npm run check nandosOrder --persist-profile
```

The `--persist-profile` flag keeps Chrome's login session across Docker runs, so you only need to complete MFA once. Subsequent runs detect the existing session and skip straight to the menu.

To run without placing a real order (safe mode):

```bash
npm run check nandosOrder --safemode
```

To clear the persisted profile:

```bash
docker volume rm sitecheck_chrome-profile
```

## Task Config

- **Mode**: `once` (single attempt, requires manual MFA)
- **Context schema**: Validates `email`, `password`, `firstName`, `expectedAddress`, and `savedCardSuffix` are non-empty strings
- **MFA**: Polls for up to 5 minutes for manual mobile verification
- **Business hours**: Outside Nando's business hours, the task will get stuck at `dismissSuggestionsAndCheckout` because the menu/ordering system is unavailable
- **Menu items**: 3 items from Burgers, Wraps & Pitas with protein/heat/style customisations
- **Clicks**: This site requires `cdpClick` (real mouse events via CDP coordinates) for most interactions — synthetic `.click()` dispatched by the extension does not trigger form submissions or button handlers. Use `querySelectorRect` to get coordinates, then `cdpClick`.
