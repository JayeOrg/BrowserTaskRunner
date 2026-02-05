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

- Avoid adding in-test retries; treat them as a test smell.

Review FAILED_APPROACHES for things to avoid, and add to it as paths fail.
