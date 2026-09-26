# Contributing

Thank you for considering a contribution to this template. This guide explains how to contribute, and the conventions we follow for code clarity.

## How to Contribute

1. **Fork the repository** — this keeps the git history, so you'll be able to pull in future improvements with a merge.
2. **Create a branch** from your fork for your work: `git checkout -b feature/my-change`.
3. **Make your changes** and test them locally with `npm test` — all tests must pass.
4. **Keep dependencies intentional** — don't add a package without a clear reason. If you do, explain why in the PR description.
5. **Open a pull request** against the upstream `main` branch. Describe what your change does and why.

## Code Comment Conventions

Comments are a crucial part of code maintainability. They should explain **why** decisions were made, not **what** the code does.

### File Headers

Add a one or two-line header comment at the top of a file only if the module's purpose isn't obvious from its filename.

Example (only if needed):
```javascript
/**
 * Validation rules for contact form submission and email sanitization.
 */
```

### JSDoc on Exported Functions

Every exported function must have a JSDoc block describing:
- **What it does** — a clear, concise description.
- **@param** — each parameter, its type, and what it means.
- **@returns** — the return type and what it contains.
- **@throws** — any exceptions thrown (optional, but important).

Examples:

```javascript
/**
 * Sends a notification email when a contact form is submitted.
 * @param {Object} contactData - The submitted contact form data.
 * @param {string} contactData.name - Visitor's name.
 * @param {string} contactData.email - Visitor's email address.
 * @param {string} contactData.message - The message body.
 * @returns {Promise<void>}
 * @throws {Error} If the email service fails.
 */
export async function notifyContactSubmission(contactData) {
  // ...
}
```

```javascript
/**
 * Compresses all images in a directory using WebP and reduces them to max 1900px width.
 * @param {string} inputDir - Path to directory with images.
 * @param {Object} options - Compression options.
 * @param {number} options.quality - JPEG quality, 1–100. Default 85.
 * @returns {Promise<string[]>} Array of output file paths.
 */
export async function compressImages(inputDir, options = {}) {
  // ...
}
```

### Inline Comments: The Why, Never the What

Only add inline comments to explain **why** a decision was made, especially when the code doesn't make it obvious.

**✅ Good — explains the reason:**
```javascript
// Email validation is intentionally permissive because the real check
// happens when the email server accepts the SMTP handshake. Rejecting
// at form submission is a convenience, not a gate.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

**❌ Wrong — just repeats what the code says:**
```javascript
// Check if the string contains an @ and a dot
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

**Rule of thumb:** If you can understand the line by reading it alone, the comment should be deleted. Comments exist to answer "why is it this way and not the obvious alternative?"

### What to Remove

Delete:
- Decorative separators: `// ========` or `// --- config section ---`
- Commented-out code blocks (use git history instead).
- Comments that state what the code obviously does.

### What NOT to Remove — Ever

**Do not delete or significantly shorten comments that explain a counter-intuitive choice.** These are the memory of past bugs and design decisions.

Examples from this codebase that must be preserved:

1. **Email validation in `contact-rules.js`** — why it's intentionally permissive.
2. **Field copying in `buildMessage.js`** — why fields are copied manually instead of spread, and why keys lose the colon.
3. **Message notification in `notifyBody.js`** — why the message body and the sender's email are never included. A notification can land on a public channel, and what leaves there cannot be recalled.
4. **Turnstile in CSP headers** — why it only appears when configured.
5. **Text replacement in `formatText.js`** — why it's done in one pass, not multiple.
6. **Album sorting in `album.js`** — why Sortable attaches once, not on every render, and why the `beforeunload` guard detaches on `hashchange`.
7. **Honeypot handling in `contact-routes.js`** — why it returns 200 instead of an error, and why the notification happens after write in a `try/catch`.
8. **Message ID in admin routes** — why it's constrained by regex before becoming an R2 key.
9. **Worker routing in `worker.js`** — why APIs come before the album regex, and why `/contatti` is a 301.
10. **Config fetch ordering in `about.js`** — why the form is built *after* fetching config, not before.

These decisions cost bugs to learn. Removing them makes those bugs returnable.

**When in doubt:** preserve the comment. If it reads like explanation of a choice rather than description of the code, it stays.

### Language

Write all comments and commit messages in **English**, everywhere.

### Comments in Tests

Test files follow the same comment conventions, but the contract is expressed in the test name itself. JSDoc on test functions isn't required — a good test name explains what's being tested more clearly than a JSDoc block would.

Example:
```javascript
describe('contact form validation', () => {
  it('should accept emails with permissive pattern to allow international domains', () => {
    // ...
  });
});
```

---

## Code Quality

- Make sure all tests pass: `npm test`
- Build verification: `ALLOW_PLACEHOLDER_CSP=1 npm run build`
- No console logs in production code (they'll be minified away, but they're noise).
- No `console.log` in tests — use assertions instead.

## `custom/` never belongs to the template

`custom/` is where a fork replaces parts of the site; the template ships only `custom.example/`. If you try the example in the template checkout (`cp -r custom.example custom`), delete `custom/` before committing, and never commit it here.

## Questions?

Open an issue. If something in this guide is unclear, the guide should be clearer — that's a valid contribution too.

Thank you for helping this template stay maintainable.
