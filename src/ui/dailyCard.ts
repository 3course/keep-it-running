// The daily's result card (in the summary's panel): margin, the one decision that cost most, walking, five emoji, a
// share button that copies the card as text, and the local streak. Then back to the lease.
import type { DailyResult } from '../world/daily.js';
import { shareText } from '../world/daily.js';
import { copyText } from './clipboard.js';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderDailyCard(el: HTMLElement, r: DailyResult) {
  const km = r.walked >= 1000 ? `${(r.walked / 1000).toFixed(1)} km` : `${r.walked} m`;
  el.innerHTML = `
    <h1>Today's daily</h1>
    <p class="sub">${r.date} · the same day for everyone</p>
    <section class="dailycard">
      <p class="emoji" style="font-size: 36px; letter-spacing: 6px; margin: 4px 0 8px">${r.emoji}</p>
      <div class="row"><span>Margin</span><span class="${r.margin >= 0.15 ? 'good' : r.margin >= 0 ? 'money' : 'bad'}">${Math.round(r.margin * 100)}%</span></div>
      <div class="row"><span>Sheets out the door</span><span>${r.sheets}</span></div>
      <div class="row"><span>Walked</span><span>${km}</span></div>
      <p class="story"><b>Cost you most:</b> ${esc(r.costliest)}</p>
      <div class="row"><span>Streak</span><span>${r.streak} day${r.streak === 1 ? '' : 's'} (best ${r.best})</span></div>
    </section>
    <button class="share">Share</button><p class="status"></p>
    <button class="back">Back to the lease</button>`;
  const status = el.querySelector('.status')!;
  el.querySelector('.share')!.addEventListener('click', () => {
    void copyText(shareText(r)).then(ok => { status.textContent = ok ? 'Copied. Paste it anywhere.' : "Couldn't reach the clipboard."; });
  });
  el.querySelector('.back')!.addEventListener('click', () => { location.search = ''; });
}
