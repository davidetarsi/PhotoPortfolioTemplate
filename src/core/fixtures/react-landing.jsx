// A landing written in React, as a fork would write it in custom/: it proves that JSX
// compiles in this build and that a React root fits the slot mount contract.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

function Landing({ name, albums }) {
  return (
    <main className="page-main">
      <h1>{name}</h1>
      <ul>
        {albums.map(album => <li key={album.slug}>{album.title}</li>)}
      </ul>
    </main>
  );
}

export default {
  async mount(container, ctx) {
    const { site, albums } = await ctx.data;
    const root = createRoot(container);
    // flushSync: the page is "ready" only once the markup is in the DOM.
    flushSync(() => root.render(<Landing name={site.name} albums={albums ?? []} />));
    return { destroy() { root.unmount(); } };
  },
};
