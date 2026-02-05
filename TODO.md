Add testing?
Add a vault for locally storing login details for multiple tasks
Add nandos task
Explore relaxed linting for extension chrome api
Explore functional options rather than class based, assess tradeoffs
How can we improve the logger?
Proper separation of concerns:

- Infra creates the docker env with chrome installed and installs the extension
- Extension functions as a dumb bridge between chrome and behaviour
- Behaviour fully drives the chrome session via the extension. It should have fully task specific instructions that leverage generic helpers held in behaviour

"The Docker build is caching the old extension. The new querySelectorRect command isn't in the container. Need to force a clean rebuild" how do we prevent that from happening?
