import { handleDataRequest } from './worker/data-routes.js'
import { handleAdminRequest } from './worker/admin-routes.js'
import { handleContactRequest } from './worker/contact-routes.js'
import { serveAlbumPage } from './worker/album-page.js'
import { TEMPLATE_ROUTES } from './shared/content-rules.js'

const ALBUM_SLUG_RE = /^\/[a-z0-9][a-z0-9-]*$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const pathname = url.pathname.replace(/\/$/, '') || '/'

    // API routes first: they must never match the album slug regex.
    if (pathname.startsWith('/api/data/')) {
      return handleDataRequest(request, env)
    }

    if (pathname.startsWith('/api/admin/')) {
      return handleAdminRequest(request, env)
    }

    if (pathname === '/api/contact') {
      return handleContactRequest(request, env)
    }

    const page = TEMPLATE_ROUTES.pages[pathname]
    if (page) {
      return env.ASSETS.fetch(new URL(page, url))
    }

    if (ALBUM_SLUG_RE.test(pathname)) {
      return serveAlbumPage(env, url, pathname.slice(1))
    }

    return env.ASSETS.fetch(request)
  },
}
