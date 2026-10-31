// The landlord's letter on the first day of a lease: a sheet of paper over the shed. It doesn't take taps (the world
// under it still works); any touch puts it away, and the rent stays on the notepad.
const CSS = `
#kir-hud .lettercard { position: absolute; left: 50%; top: calc(80px + env(safe-area-inset-top, 0px)); width: min(86%, 330px); transform: translateX(-50%) rotate(1.2deg);
  background: #fffdf6; border: 2px solid #14110f; box-shadow: 0 6px 0 rgba(20,17,15,.3); padding: 14px 16px; z-index: 6; pointer-events: none;
  font: 15px/1.45 Georgia, 'Times New Roman', serif; color: #14110f; transition: opacity .3s; }
#kir-hud .lettercard h3 { margin: 0 0 6px; font: 700 13px 'Courier New', monospace; letter-spacing: 1px; text-transform: uppercase; }
#kir-hud .lettercard.gone { opacity: 0; }
`;
export function showLetter(parent: HTMLElement, title: string, lines: string[], gone: () => void) {
  if (!document.getElementById('kir-letter-css')) { const s = document.createElement('style'); s.id = 'kir-letter-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div');
  el.className = 'lettercard';
  el.innerHTML = `<h3>${title}</h3>${lines.map(l => `<p>${l.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</p>`).join('')}`;
  parent.appendChild(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.classList.add('gone'); setTimeout(() => el.remove(), 350); gone(); window.removeEventListener('pointerdown', close, true); };
  window.addEventListener('pointerdown', close, true);
  setTimeout(close, 12000);
  return el;
}
