# Pages — adding your own pages

`custom/pages.config.js` declares pages the template does not have. Two kinds:

| Kind | Declaration | Built file | Address |
|---|---|---|---|
| single | `{ path: '/archive', html: 'custom/pages/archive.html' }` | `dist/archive.html` | `/archive` |
| collection | `{ path: '/projects/:slug', html: 'custom/pages/project.html', entries }` | `dist/projects/<slug>.html`, one per entry | `/projects/<slug>` |

`entries` is an array, or a function (also async) returning one, of `{ slug, title, description?, image? }`. It runs at build time in Node: read your content from the repo, for example a JSON file under `custom/content/`.

## Paths

- One or two segments of lowercase letters, digits and dashes. A collection is exactly `/<prefix>/:slug`.
- Not `/`: the home page is the `landing` slot.
- Not a first segment the template uses: `about`, `admin`, `album`, `api`, `assets`, `index`.
- Every path and every HTML file only once. A two-segment single page cannot live under a collection prefix.
- The bare prefix of a collection (`/projects`) is not a page: without a single page declared there, it reaches the album page and answers "album not found". Declare `{ path: '/projects', html: … }` to give it an index.

A wrong declaration stops `npm run dev`, `npm test` and `npm run build` with a message that starts with `custom/pages.config.js:`.

## The HTML

Files live under `custom/pages/`. Like every page they get `{{SITE_NAME}}`, `{{SITE_BIO}}`, `{{SITE_LANG}}`, `{{SITE_IMAGE}}`. Collection entries also get:

| Placeholder | Value |
|---|---|
| `{{PAGE_TITLE}}` | entry `title` |
| `{{PAGE_DESCRIPTION}}` | entry `description`, or empty |
| `{{PAGE_IMAGE}}` | entry `image`, or empty |
| `{{PAGE_URL}}` | `/<prefix>/<slug>` |
| `{{PAGE_SLUG}}` | entry `slug` |

Values are HTML-escaped. A `<meta>` whose `content` ends up empty is removed. In `npm run dev` the placeholders stay visible: they are filled by the build.

No inline `<script>` or `<style>`: the Content Security Policy blocks them. Use `<script type="module" src="/custom/pages/….js">`.

## The script

Import only from `/src/api/`: `/src/api/index.js` for data, slots and `slugFromPath`, and `/src/api/base.css` for the template's base styles. `custom.example/pages/` shows a single page and a collection, with a small helper that mounts nav and footer through `slot`. `slugFromPath('/projects/:slug', location.pathname)` returns the current entry's slug, or `null`.

If `custom/theme.css` exists, it is linked on your pages too.

## Where they are served

They are static files: Cloudflare serves them before the Worker runs, so the Worker needs no change. `/archive/` and `/archive.html` redirect to `/archive`.

## Albums and pages

The dashboard refuses to create an album whose slug is the first segment of one of your pages. An album created by hand in `albums.json` with such a slug is shadowed: the page wins.
