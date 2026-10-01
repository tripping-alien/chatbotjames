# Contributing to JAMES AI

First off, thank you for considering contributing to JAMES! It's people like you that make this project such a great tool.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/tripping-alien/chatbotjames/issues) first to see if someone else has already created a ticket. If not, go ahead and [create one](https://github.com/tripping-alien/chatbotjames/issues/new/choose)!

## Fork & create a branch

If this is something you think you can fix, then fork JAMES and create a branch with a descriptive name.

## Get the test suite running

Since JAMES is a client-side web application, you can simply serve the directory locally using any basic HTTP server (e.g., `npx serve .` or `python -m http.server`). Make sure your changes work in modern browsers (Chrome/Edge recommended for WebGPU features) and that no existing tools break.

## Implement your fix or feature

At this point, you're ready to make your changes! Feel free to ask for help; everyone is a beginner at first. 

If you are adding a new Tool:
1. Make sure it is completely client-side (no new backend server dependencies).
2. Add the function implementation in `tools-worker.js`.
3. Add the natural language routing regex and parameter parsing in `tools/rules.js` and/or `tools/rules-part1.js`.
4. Document the tool's existence in the system prompt inside `worker.js`.
5. Update the UI welcome messages in `app.js` and the `docs.html` file.

## Make a Pull Request

At this point, you should switch back to your master branch and make sure it's up to date with JAMES's master branch.

Once your branch is up to date, push your branch to GitHub and create a Pull Request! Please fill out the Pull Request template provided so we know exactly what you changed and how to test it.
