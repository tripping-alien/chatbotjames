# Security Policy

## Supported Versions

Since JAMES is a client-side web application, security updates are pushed directly to the `master` branch. Please ensure you are running the latest version from the repository.

## Reporting a Vulnerability

Because JAMES runs entirely locally within the browser, it is highly isolated and protected by the browser's sandbox. However, if you discover a security vulnerability (such as an XSS vector in the Markdown rendering or a sandbox escape in the Python worker), please do **not** report it via public issues.

Instead, please email the project maintainer directly at **synecraft@gmail.com**.

You should receive a response within 48 hours. If the vulnerability is confirmed, we will issue a patch as quickly as possible.
