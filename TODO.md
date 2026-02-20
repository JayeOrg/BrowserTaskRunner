Improvements:

Explore plugins

Break up this file into goals, codebase directions, and actual todo

Reducing duplication of interfaces across prod and test

Need to add core principles for the project:

- DX
  - Overall
  - For specific tasks
  - Write for onboarding clarity
- Readability
- Maintainability
  - A lot of stuff gets stale. Let's only write what we need to convey
- Coverage and documentation of non coverage
- Skills for repeated dev tasks

Tasks to add:

- Job site scrapers
- Resume site fillers
- Autofill for cover letters based on keyword search? See how far we can take automating applying for jobs

Musings:

- Look into spec driven development (probably create a new project for this)

Notes on claude.md
Personal one should just have personal quirks
Checked in one/skills should have team agreed standards and be updated with workarounds for problems as they come up
Don't need to overengineer it. Model improvements will probably make a bunch of it obselete in a few months.

Can automate PR reviews, security reviews, shepherding things to prod

Give a swarm a spec, tell it to use jira to split up the context of the spec, and let the swarm take tasks off of the board

If the task seems hard, use more sub agents to research.

Claude.md is just for stuff you repeatedly say

Start in plan mode

Research:

- Claude code essentials from Anthropic
  - official skills
  - plugins
- Using swarms
- Using specs
- Github has its own PR AI
- I want to know what the model tends towards when prompted to improve ad infinitum. What does the point of diminishing returns start to look like?
  - Review REJECTIONS to get an idea of the useless stuff the model will try to implement
- There has to be a better scaffold for asking for changes
- Creating evals for agents and agentic scaffolding
- MCP

Improvement options:

- Review DX
- Review codebase via developer personas give tasks with DX in mind

Recurring tasks:

- Review DX via agent
- Review all code manually and see how it feels to read

- Review claude memory
- Can we condense documentation?
- Can we condense skills?
- Can we condense readmes
- Can we condese agents.md or split it up?
