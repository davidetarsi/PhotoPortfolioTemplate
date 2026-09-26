import '/src/api/base.css';
import { slugFromPath, texts } from '/src/api/index.js';
import projects from '../content/projects.json';
import { mountChrome } from './chrome.js';

mountChrome();

// The build already wrote title and meta into the HTML; the script fills the body.
const project = projects.find(p => p.slug === slugFromPath('/projects/:slug', location.pathname));
document.getElementById('project-title').textContent = project?.title ?? texts.album.notFound;
document.getElementById('project-description').textContent = project?.description ?? '';
