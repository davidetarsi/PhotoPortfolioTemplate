// Read by vite.config.js at build time (Node), never shipped to the browser.
import projects from './content/projects.json' with { type: 'json' };

export default [
  { path: '/archive', html: 'custom/pages/archive.html' },
  { path: '/projects/:slug', html: 'custom/pages/project.html', entries: projects },
];
