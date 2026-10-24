// A card over everything for when the 3D view can't run, and a quieter one while it restarts.
// Plain DOM with its own styles, so it works even if the world and HUD never got built.
import { BUILD_TAG, copyText } from './clipboard.js';

const CSS = `
#kir-fail { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
  background: rgba(20,17,15,.88); font: 16px 'Courier New', monospace; color: #efe6d8; padding: 16px; box-sizing: border-box; }
#kir-fail .card { width: 100%; max-width: 360px; max-height: 100%; overflow-y: auto; background: #241f1a; border: 2px solid #d48a3c;
  padding: 16px; box-sizing: border-box; }
#kir-fail h1 { font-size: 24px; font-weight: normal; margin: 0 0 8px; }
#kir-fail p { color: #a2937f; margin: 6px 0; }
#kir-fail pre { white-space: pre-wrap; word-break: break-word; background: #14110f; color: #d8cdb8; padding: 8px; font-size: 13px; margin: 10px 0; }
#kir-fail button, #kir-fail a.btn { display: inline-block; font: inherit; font-size: 18px; color: #efe6d8; border: 0; padding: 12px 14px; min-height: 48px; box-sizing: border-box;
  margin: 4px 6px 0 0; cursor: pointer; text-decoration: none; background: #3d6f9e; }
#kir-fail a.btn { background: #4e8a46; }
#kir-fail .status { font-size: 14px; }
#kir-fail.quiet .card { border-color: #a2937f; text-align: center; }
`;

function root(): HTMLDivElement {
  if (!document.getElementById('kir-fail-css')) {
    const style = document.createElement('style');
    style.id = 'kir-fail-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  document.getElementById('kir-fail')?.remove();
  const el = document.createElement('div');
  el.id = 'kir-fail';
  document.body.appendChild(el);
  return el;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The URL one step safer than this one: full → ?safe=1 → ?safe=2. Null when there's nowhere safer to go. */
function saferUrl(): string | null {
  const u = new URL(location.href);
  const safe = u.searchParams.get('safe');
  if (safe === '2') return null;
  u.searchParams.set('safe', safe ? '2' : '1');
  return u.toString();
}

/** "The 3D view couldn't start on this device", with the details to send and a button to copy them. */
export function showRendererFailure(details: string, title = "The 3D view couldn't start on this device") {
  const text = `${BUILD_TAG}\n${title}\n${details}`;
  console.error(`[Keep It Running] ${title}\n${details}`);
  const el = root();
  const safer = saferUrl();
  el.innerHTML = `<div class="card">
    <h1>${esc(title)}</h1>
    <p>Your game is saved — nothing's lost. Copy these details and send them to Courtney.</p>
    <pre>${esc(details)}</pre>
    <button class="copy">Copy details</button>
    ${safer ? `<a class="btn" href="${esc(safer)}">Try the safe view</a>` : ''}
    <button class="reload">Reload</button>
    <p class="status"></p></div>`;
  const status = el.querySelector('.status')!;
  el.querySelector('.copy')!.addEventListener('click', () => {
    void copyText(text).then(ok => { status.textContent = ok ? 'Copied — paste it into a message.' : "Couldn't reach the clipboard; long-press the text above."; });
  });
  el.querySelector('.reload')!.addEventListener('click', () => location.reload());
}

/** "Restarting the 3D view…" while a lost context comes back. */
export function showRestarting() {
  const el = root();
  el.className = 'quiet';
  el.innerHTML = `<div class="card"><h1>Restarting the 3D view…</h1><p>The clock's stopped. Your game is saved.</p></div>`;
}

export function hideOverlay() { document.getElementById('kir-fail')?.remove(); }
