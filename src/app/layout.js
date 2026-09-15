import './globals.css';
import 'katex/dist/katex.min.css';
import { ClientState, Header } from '../components/ClientState.js';
import { OfflineBanner, OfflineProvider } from '../components/Offline.js';
import { requestViewer } from '../lib/request.js';
import { statePrefix } from '../lib/state.js';

export const metadata = { title: 'infodump · Your local learning library', description: 'A quiet place for deep technical reading.' };
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function RootLayout({ children }) {
  const viewer = await requestViewer();
  const key = JSON.stringify(`${statePrefix(viewer.id)}theme`).replace(/</g, '\\u003c');
  const themeScript = `try{var t=localStorage.getItem(${key});document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`;
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><a href="#main" className="skip-link">Skip to content</a><OfflineProvider><ClientState viewer={viewer}><Header /><OfflineBanner />{children}</ClientState></OfflineProvider></body></html>;
}