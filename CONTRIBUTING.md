# Contributing to JAMES AI

First off, thank you for considering contributing to JAMES! It's people like you that make this project such a great tool.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/tripping-alien/chatbotjames/issues) first to see if someone else has already created a ticket. If not, go ahead and [create one](https://github.com/tripping-alien/chatbotjames/issues/new/choose)!

## Fork & create a branch

If this is something you think you can fix, then fork JAMES and create a branch with a descriptive name.

## Running the local server & test suite

Since JAMES is a client-side web application, you can serve the directory locally using any basic HTTP server (e.g., `npx serve .` or `python -m http.server`).

To run the automated unit test suite from the command line:
```bash
node tests/run-all-tests.js
```
You can also open `pages/tests.html` in your browser to run the tests in a live browser environment. Make sure your changes work in modern browsers (Chrome/Edge recommended for WebGPU features) and that all test suites pass.

## Implement your fix or feature

At this point, you're ready to make your changes! Feel free to ask for help; everyone is a beginner at first. 

If you are adding a new Tool:
1. Make sure it is completely client-side (no backend server dependencies).
2. Add the tool implementation in `workers/tools-worker.js` (for worker-isolated tools), `workers/python-worker.js` (for Python features), `tools/tools-bridge.js` (for main-thread browser APIs), or `games/` (for interactive games).
3. Add the natural language trigger patterns and parameter parsing in `tools/rules.js` (or `tools/rules-part1.js` / `tools/rules-part2.js`), and run `node tools/build-bundle.js` to compile `tools/tool-router-bundle.js`.
4. Document the tool in `workers/worker-system-prompt.js` (full desktop prompt) and add an entry to the `CATALOG` in `workers/worker-prompt-tiers.js` (dynamic compact/mobile prompt tier).
5. Update the tool reference in `pages/docs.html`.
6. Add unit test coverage in `tests/test-all-tools.js` or `tests/test-tool-triggers.js`, and verify that `node tests/run-all-tests.js` passes cleanly.

## Make a Pull Request

At this point, you should switch back to your master branch and make sure it's up to date with JAMES's master branch.

Once your branch is up to date, push your branch to GitHub and create a Pull Request! Please fill out the Pull Request template provided so we know exactly what you changed and how to test it.
