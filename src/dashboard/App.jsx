import { useEffect } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router';
import { texts } from '../../config/texts.config.js';
import { formatText } from '../utils/formatText.js';
import { useDraft, useDraftStatus } from './api/queries.js';
import { useSaveQueue, useSaveState } from './api/drafts.jsx';
import { Icon } from './ui/Icon.jsx';
import { PublishBar } from './features/publish/PublishBar.jsx';
import { AlbumsScreen } from './features/albums/AlbumsScreen.jsx';
import { AlbumScreen } from './features/album/AlbumScreen.jsx';
import { SiteScreen } from './features/site/SiteScreen.jsx';
import { MessagesScreen } from './features/messages/MessagesScreen.jsx';
import { UploadProvider } from './features/album/upload-context.jsx';
import './app.css';

const t = texts.admin;

/** The routes, inside the frame shared by every screen. Exported for tests (memory router). */
export const routes = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <AlbumsScreen /> },
      { path: 'album/:slug', element: <AlbumScreen /> },
      { path: 'site', element: <SiteScreen /> },
      { path: 'messages', element: <MessagesScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

/**
 * Saving, not saved (with Retry), draft saved, or everything published: shown in the top bar.
 */
export function DraftState() {
  const { data } = useDraftStatus();
  const queue = useSaveQueue();
  const save = useSaveState();
  if (save.error?.refused) {
    // The Worker said the value is wrong: retrying cannot help, the next change is saved.
    return (
      <span className="dash-state dash-state--error" role="alert">
        <span className="dash-state__dot" aria-hidden="true" />
        {formatText(t.publish.saveRefused, { message: save.error.message })}
      </span>
    );
  }
  if (save.error) {
    return (
      <span className="dash-state dash-state--error" role="alert">
        <span className="dash-state__dot" aria-hidden="true" />
        {formatText(t.publish.saveFailed, { message: save.error.message })}
        <button type="button" className="dash-state__retry" onClick={() => queue.flush()}>{t.publish.retry}</button>
      </span>
    );
  }
  if (save.paused && save.pending > 0) {
    return <span className="dash-state dash-state--draft" role="status"><span className="dash-state__dot" aria-hidden="true" />{t.publish.waitingPublication}</span>;
  }
  if (save.pending > 0 || save.saving) {
    return <span className="dash-state dash-state--draft" role="status"><span className="dash-state__dot" aria-hidden="true" />{t.publish.saving}</span>;
  }
  if (!data) return null;
  const draft = data.hasDraft || data.publishing;
  return (
    <span className={`dash-state${draft ? ' dash-state--draft' : ''}`} role="status">
      <span className="dash-state__dot" aria-hidden="true" />
      {draft ? t.publish.draftSaved : t.publish.allPublished}
    </span>
  );
}

/**
 * The frame of every screen: the site's name, the sections (top bar on a computer, tab bar
 * at the bottom on a phone), the screen itself, the publish bar.
 */
export function Shell() {
  const draft = useDraft();
  const queue = useSaveQueue();
  const location = useLocation();
  // Changing screen saves what is waiting at once (spec: "subito quando si cambia vista").
  useEffect(() => { queue.flush(); }, [location.pathname, queue]);
  const siteName = draft.data?.site?.name;
  const sections = [
    { to: '/', end: true, icon: 'albums', label: t.common.navAlbums },
    { to: '/site', icon: 'site', label: t.common.navSite },
    { to: '/messages', icon: 'messages', label: t.common.navMessages },
  ];
  return (
    <UploadProvider>
      <div className="dash">
        <header className="dash-top">
          <span className="dash-brand">{siteName ?? ''}</span>
          <DraftState />
        </header>
        <nav className="dash-sections" aria-label={t.common.navLabel}>
          {sections.map(section => (
            <NavLink key={section.to} to={section.to} end={section.end} className="dash-sections__link">
              <Icon name={section.icon} />
              <span>{section.label}</span>
            </NavLink>
          ))}
        </nav>
        <main className="dash-main">
          {draft.isError ? <p className="dash-error" role="alert">{t.common.loadError}</p> : <Outlet />}
        </main>
        <PublishBar />
      </div>
    </UploadProvider>
  );
}

const router = createHashRouter(routes);

/** The dashboard: the routes of the hash (/admin#/album/notte). */
export function App() {
  return <RouterProvider router={router} />;
}
