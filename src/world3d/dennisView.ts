// Dennis, in the shed. His calls are speech bubbles at the phone (his pitch, then Yes / No / Give me a minute); how each
// bet turned out comes the same way. His bets are things you can see: a second pallet of pre-bought formply, the
// second-hand edge-bander, a leased second router in the dock, the footy club's sponsor banner, a service tag on the
// extractor. His ledger hangs in the office (a board with a tick or a cross per bet; read it at the desk). About monthly
// he drops in for a coffee at the roller door and has a look at it.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import type { Game } from '../sim/Game.js';
import { ledger, oddsWords, type Bet } from '../sim/dennis.js';
import { DENNIS_LINES } from '../people/lines/dennis.js';
import { PEOPLE } from '../people/config.js';
import { Talk } from '../ui/talk.js';
import { logEvent, type WorldState } from '../world/state.js';
import { objectById } from '../world/layout.js';
import { boxAt, toon } from './build.js';
import { Figure } from './figures.js';

const C = 0.5;
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-AU')}`;
const pick = <T,>(xs: readonly T[], n: number) => xs[Math.abs(Math.floor(n)) % xs.length];
const CSS = `
#kir-hud .ledgercard { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92%, 380px); max-height: 70%; overflow-y: auto; z-index: 8;
  background: #fbfaf4; border: 3px solid #14110f; border-radius: 10px; padding: 10px 12px; font: 13px/1.35 'Courier New', monospace; color: #14110f; pointer-events: auto; }
#kir-hud .ledgercard h3 { margin: 0 0 6px; } #kir-hud .ledgercard .row { display: flex; justify-content: space-between; gap: 8px; border-top: 1px dashed #a2937f; padding: 3px 0; }
#kir-hud .ledgercard .won { color: #2f7a2a; } #kir-hud .ledgercard .lost { color: #c0281e; } #kir-hud .ledgercard .dim { color: #7a6f60; }
#kir-hud .ledgercard button { margin-top: 8px; width: 100%; padding: 8px; font: 15px 'Courier New', monospace; border: 2px solid #14110f; border-radius: 8px; background: #efe6d8; }
`;

const TITLE: Record<Bet['kind'], string> = {
  prebuy: 'Pre-buy ply', terms: 'Big job, 30-day terms', bandsaw: 'Second-hand edge-bander', secondRouter: 'Lease a second router', jessHours: 'Part-timer extra days',
  extractorService: 'Extractor service', rushInvoice: 'Rush job, his invoice', longerLease: 'Longer lease', footy: 'Footy club sponsor',
};

export interface DennisViewDeps {
  scene: THREE.Scene;
  g: Game;
  w: WorldState;
  parent: HTMLElement;
  project: (v: THREE.Vector3) => { x: number; y: number; behind: boolean };
  save: () => void;
}

export class DennisView {
  readonly talk: Talk;
  private props = new THREE.Group();
  private sig = '';
  private seen = new Set<number>();          // bets whose outcome's been told
  private bubbleT = 0;
  private card: HTMLDivElement | null = null;
  private coffee: { fig: Figure; until: number } | null = null;
  private quietSeen = 0;

  constructor(private d: DennisViewDeps) {
    if (!document.getElementById('kir-dennis-css')) { const s = document.createElement('style'); s.id = 'kir-dennis-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.talk = new Talk(d.parent, 'day');
    d.scene.add(this.props);
    for (const b of d.g.dennis.bets) if (b.status === 'won' || b.status === 'lost') this.seen.add(b.id);
    this.quietSeen = d.g.dennis.humble;
  }

  /** The pitch's numbers, in his words. */
  private fill(text: string, bet: Bet) {
    const L = ledger(this.d.g.dennis);
    const vals: Record<string, string> = {
      stake: money(bet.stake), gain: money(bet.gain), loss: money(bet.loss), odds: oddsWords(bet.hit), sheets: String(Math.round(bet.stake / 95) || CONFIG.dennis.bets.terms.sheets),
      days: String(Math.max(1, bet.settleDay - bet.day)), jess: PEOPLE.partTimer.name, won: String(L.won), total: String(L.settled), net: money(Math.abs(bet.net)), name: CONFIG.dennis.name,
    };
    return text.replace(/\{(\w+)\}/g, (m, k) => vals[k] ?? m);
  }

  /** Picked up: his pitch, and your answer. */
  pitch() {
    const g = this.d.g, bet = g.dennis.pitched;
    if (!bet) return;
    const L = ledger(g.dennis);
    const lead = g.dennis.humble > this.quietSeen ? `${pick(DENNIS_LINES.humble, bet.id)} ` : L.settled >= 5 && bet.id % 3 === 0 ? `${this.fill(pick(DENNIS_LINES.record, bet.id), bet)} ` : '';
    this.quietSeen = g.dennis.humble;
    this.say(lead + this.fill(pick(DENNIS_LINES.pitch[bet.kind], bet.id), bet), 12);
    this.talk.ask([{ text: 'Yes', cls: 'door' }, { text: 'No', cls: 'home' }, { text: 'Give me a minute' }], i => {
      const choice = (['yes', 'no', 'later'] as const)[i];
      const before = g.dennis.humble;
      g.decideDennis(choice);
      const line = choice === 'yes' ? DENNIS_LINES.yes : choice === 'no' ? DENNIS_LINES.no : DENNIS_LINES.later;
      this.say(this.fill(pick(line, bet.id), bet) + (g.dennis.humble > before ? ` ${pick(DENNIS_LINES.quiet, bet.id)}` : ''), 5);
      logEvent(this.d.w, choice === 'yes' ? `Yes to ${CONFIG.dennis.name}: ${TITLE[bet.kind].toLowerCase()}` : choice === 'no' ? `No to ${CONFIG.dennis.name}` : `${CONFIG.dennis.name}'ll ring back`);
      this.d.save();
    });
  }

  /** The ledger, read at the desk. */
  showLedger() {
    this.card?.remove();
    const g = this.d.g, L = ledger(g.dennis);
    const c = this.card = document.createElement('div');
    c.className = 'ledgercard';
    const rows = L.bets.filter(b => b.status !== 'pitched').map(b => {
      const out = b.status === 'won' ? 'came good' : b.status === 'lost' ? "didn't" : b.status === 'open' ? 'running' : b.status === 'declined' ? 'you said no' : 'gone';
      return `<div class="row"><span>Day ${b.day}: ${TITLE[b.kind]} <span class="dim">(${oddsWords(b.hit)})</span></span><span class="${b.status === 'won' ? 'won' : b.status === 'lost' ? 'lost' : 'dim'}">${out}${b.status === 'won' || b.status === 'lost' || b.status === 'open' ? ` ${money(b.net)}` : ''}</span></div>`;
    }).join('');
    c.innerHTML = `<h3>${CONFIG.dennis.name}'s ledger</h3><div>${L.won} of ${L.settled} came good · net ${money(L.net)}</div>${rows || '<p class="dim">Nothing yet.</p>'}<button>Close</button>`;
    c.querySelector('button')!.addEventListener('click', () => { c.remove(); this.card = null; });
    for (const t of ['pointerdown', 'pointerup'] as const) c.addEventListener(t, e => e.stopPropagation());
    this.d.parent.appendChild(c);
  }

  update(dt: number) {
    const g = this.d.g;
    // how they turned out: he rings to say (a bubble at the phone, and the log)
    for (const b of g.dennis.bets) if ((b.status === 'won' || b.status === 'lost') && !this.seen.has(b.id)) {
      this.seen.add(b.id);
      const line = this.fill(pick(DENNIS_LINES[b.status][b.kind], b.id), b);
      if (g.phase === 'day') this.say(line, 6);
      logEvent(this.d.w, `${CONFIG.dennis.name}: ${line}`);
    }
    this.bubbleT -= dt;
    if (this.bubbleT <= 0 && !this.talk.asking) this.talk.hush('dennis');
    const ph = objectById('phone').rect;
    const at = this.d.project(new THREE.Vector3((ph.x + 0.5) * C, 1.9, (ph.y + 0.5) * C));
    this.talk.place('dennis', at.x, at.y, !at.behind);
    // his coffee, about monthly, mid-morning: at the roller door with a look at the ledger
    const due = CONFIG.dennis.enabled && g.dayIndex > 1 && g.dayIndex % CONFIG.dennis.coffeeEvery === 0 && g.phase === 'day' && g.minute >= 10 * 60;
    if (due && !this.coffee && !this.d.w.dennisCoffeeDay?.includes?.(g.dayIndex)) this.coffeeVisit();
    if (this.coffee) {
      this.coffee.fig.update(dt);
      const p = this.d.project(this.coffee.fig.headWorld(new THREE.Vector3()));
      this.talk.place('dennisVisit', p.x, p.y, !p.behind);
      if (g.minute >= this.coffee.until || g.phase !== 'day') { this.props.remove(this.coffee.fig.root); this.coffee = null; this.talk.hush('dennisVisit'); }
    }
    this.buildProps();
  }

  private coffeeVisit() {
    const g = this.d.g, w = this.d.w;
    (w.dennisCoffeeDay ??= []).push(g.dayIndex);
    const fig = new Figure({ shirt: 0xb8902e, hair: 'short', hairColour: 0x9a9aa0 });
    fig.setSeated(false); fig.setExpr('laughing');
    fig.root.position.set(13.9, 0, 15.6); fig.root.rotation.y = Math.PI / 2;
    this.props.add(fig.root);
    this.coffee = { fig, until: g.minute + 25 };
    const L = ledger(g.dennis);
    const rec = L.settled ? ` ${pick(DENNIS_LINES.record, g.dayIndex).replace('{won}', String(L.won)).replace('{total}', String(L.settled)).replace('{net}', money(L.net)).replace('{name}', CONFIG.dennis.name)}` : '';
    this.talk.say('dennisVisit', CONFIG.dennis.name, pick(DENNIS_LINES.coffee, g.dayIndex) + rec);
    logEvent(w, `${CONFIG.dennis.name} dropped in for a coffee`);
    this.d.save();
  }

  /** His bets, as things in the shed (rebuilt only when they change). */
  private buildProps() {
    const g = this.d.g, d = g.dayIndex;
    const live = (k: Bet['kind']) => g.dennis.bets.some(b => b.kind === k && (b.status === 'open' || b.status === 'won') && (b.until ?? -1) >= d);
    const L = ledger(g.dennis);
    const sig = JSON.stringify([live('prebuy'), live('bandsaw') || g.dennis.bets.some(b => b.kind === 'bandsaw' && b.status !== 'declined' && b.status !== 'gone' && b.status !== 'pitched'),
      live('secondRouter'), live('footy'), live('extractorService'), L.bets.filter(b => b.status === 'won' || b.status === 'lost').map(b => b.status[0]).join('')]);
    if (sig === this.sig) return;
    this.sig = sig;
    for (const c of [...this.props.children]) if (!this.coffee || c !== this.coffee.fig.root) this.props.remove(c);
    const [prebuy, bander, router, footy, service, record] = JSON.parse(sig) as [boolean, boolean, boolean, boolean, boolean, string];
    const r = (id: Parameters<typeof objectById>[0]) => objectById(id).rect;
    if (prebuy) { // a second pallet of formply beside the first
      const p = r('plyPallet');
      const pal = new THREE.Group();
      pal.add(boxAt(1.3, 0.12, 1.3, 0x8a6a40, 0, 0));
      for (let i = 0; i < 8; i++) pal.add(boxAt(1.2, 0.04, 1.2, i % 2 ? 0x8a4f32 : 0x7a4329, 0, 0.12 + i * 0.045));
      pal.position.set((p.x + p.w / 2) * C, 0, (p.y + p.h) * C + 0.8);
      this.props.add(pal);
    }
    if (bander) { // the second-hand edge-bander, against the dock wall
      const m = new THREE.Group();
      m.add(boxAt(1.6, 0.85, 0.6, toon(0x2f6f9e), 0, 0), boxAt(0.3, 0.3, 0.3, 0x6a6f74, 0.5, 0.85));
      m.position.set(12.0, 0, 12.0);
      this.props.add(m);
    }
    if (router) { // the leased second router, in the dock
      const m = new THREE.Group();
      m.add(boxAt(2.4, 0.7, 1.5, toon(0x5a7a98), 0, 0), boxAt(0.15, 0.5, 1.6, 0xd48a3c, 0.3, 0.7), boxAt(0.6, 0.2, 0.02, 0xffd23a, 0, 0.45, 0.76));
      m.position.set(12.6, 0, 13.3);
      this.props.add(m);
    }
    if (footy) { // the club's banner, on the factory's back wall
      const b = boxAt(1.8, 0.5, 0.02, toon(0x2a2a6a), 6.5, 2.0, 7.03);
      this.props.add(b, boxAt(1.6, 0.1, 0.022, 0xf4efe0, 6.5, 2.2, 7.035));
    }
    if (service) { // a service tag on the extractor
      const e = r('extractor');
      this.props.add(boxAt(0.18, 0.24, 0.02, 0x8fd37a, (e.x + 0.6) * C, 1.2, (e.y + e.h) * C + 0.01));
    }
    // the ledger board in the office: a tick (green) or a cross (red) per settled bet
    const board = boxAt(1.0, 0.7, 0.03, toon(0xf4f4f0), 7.6, 1.2, 19.53);
    this.props.add(board);
    [...record].slice(-20).forEach((c, i) => this.props.add(boxAt(0.07, 0.07, 0.02, c === 'w' ? 0x2f7a2a : 0xc0281e, 7.2 + (i % 8) * 0.11, 1.75 - Math.floor(i / 8) * 0.12, 19.55)));
  }

  private say(text: string, secs: number) {
    this.talk.say('dennis', `📱 ${CONFIG.dennis.name}`, text, 'phone');
    this.bubbleT = secs;
  }

  dispose() { this.talk.clear(); this.card?.remove(); this.d.scene.remove(this.props); }
}
