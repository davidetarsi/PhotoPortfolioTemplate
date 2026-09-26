# `custom/` — your own code, never in the template

`custom/` is the one folder the template never ships and never changes. A fork creates it to replace whole parts of the site with its own components without editing any file that comes from the template, so `git merge upstream/main` never conflicts there.

This folder, `custom.example/`, is a minimal working example.

## Activate it

```bash
cp -r custom.example custom
```

`custom/slots.js` lists the parts to replace; every part it does not list keeps the template implementation. Delete `custom/` and the site is back to the template defaults.

## Rules

- A slot implementation gets everything it needs as arguments: the element to render into and a context object. See `docs/slots.md`.
- Do not import from `src/`: those files are internal and may change in any template update.
- Commit `custom/` in your fork. Never commit it to the template itself.
