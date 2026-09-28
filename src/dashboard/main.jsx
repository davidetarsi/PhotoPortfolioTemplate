import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import themeTokens from 'virtual:admin-theme';
import { App } from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';

// The site's own colours and fonts, read from custom/theme.css at build time. Set as
// properties (not a <style> element, which the Content Security Policy forbids).
for (const [name, value] of Object.entries(themeTokens)) {
  document.documentElement.style.setProperty(name, value);
}

const queryClient = new QueryClient({
  defaultOptions: {
    // The draft changes only through this dashboard: no refetch on every focus.
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

createRoot(document.getElementById('admin-root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
