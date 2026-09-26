import { handleDataRequest } from './worker/data-routes.js'
import { handleAdminRequest } from './worker/admin-routes.js'
import { handleContactRequest } from './worker/contact-routes.js'
import { serveAlbumPage } from './worker/album-page.js'

const STATIC_PAGES = {
  '/about': '/about.html',
  '/admin': '/admin.html',
}

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

    // The page was renamed from /contatti: existing shared links must not become 404s.
    // 301 (permanent) not 302 (temporary) because the old address will not return.
    if (pathname === '/contatti') {
      return Response.redirect(new URL('/about', url).toString(), 301)
    }

    if (STATIC_PAGES[pathname]) {
      return env.ASSETS.fetch(new URL(STATIC_PAGES[pathname], url))
    }

    if (ALBUM_SLUG_RE.test(pathname)) {
      return serveAlbumPage(env, url, pathname.slice(1))
    }

    return env.ASSETS.fetch(request)
  },
}
