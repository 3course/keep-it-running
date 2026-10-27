// Google Analytics 4. Paste your measurement ID (GA4 → Admin → Data streams → Measurement ID, looks like G-ABC123XYZ9)
// into GA_ID. While it's still the placeholder, or when running on localhost, nothing loads and track() is a no-op.
const GA_ID = 'G-XXXXXXXXXX';

type Params = Record<string, string | number | boolean>;
type Gtag = (...args: unknown[]) => void;

let ready = false;

function enabled(): boolean {
  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID) || GA_ID === 'G-XXXXXXXXXX') return false;
  const h = location.hostname;
  return !(h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost') || h.endsWith('.test'));
}

/** Load gtag.js once. Safe to call repeatedly; never throws (blocked scripts just mean no stats). */
export function initAnalytics() {
  if (ready || !enabled()) return;
  ready = true;
  try {
    const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function () { w.dataLayer.push(arguments); }; // gtag.js needs the real `arguments` object, not a rest array
    w.gtag('js', new Date());
    w.gtag('config', GA_ID, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  } catch { /* analytics must never break the game */ }
}

/** Send a custom event. No-op until analytics is set up. */
export function track(event: string, params: Params = {}) {
  if (!ready) return;
  try { (window as unknown as { gtag: Gtag }).gtag('event', event, params); } catch { /* ignore */ }
}
