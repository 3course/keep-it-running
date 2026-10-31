// The shed filling up with gratitude, from the people state: thank-you cards on a corkboard in the office, kids'
// drawings on the fridge, pot plants on the office windowsill, today's slice or cake and the café's coffees on
// the smoko crate, gifted slabs stacked by the fridge, and the things cut after hours hung on the walls (the moon on
// the dunny door). Also the morning after: empties where they landed, and the "Cans for refund" bag by the door.
// Rebuilt only when what's there changes.
import * as THREE from 'three';
import { designById } from '../designs/index.js';
import { flatDesign } from '../designs/path.js';
import type { Design } from '../designs/types.js';
import { PEOPLE } from '../people/config.js';
import type { Gift, Keepsake, PeopleState } from '../people/state.js';
import { BAG_SPOT } from '../world/cans.js';
import { boxAt, toon } from './build.js';
import { buildPiece } from './piece.js';

// spots, in metres (world). Walls that face the camera (south-facing faces of north walls) so you see them as you work.
const CORK = { x: 4.6, y: 1.45, z: 19.53, w: 1.5, h: 0.9 };            // office, on the wall it shares with the floor
const SILL = { x0: 6.6, x1: 8.6, y: 1.0, z: 19.62 };                     // office window, same wall
const FRIDGE_SIDE = { x0: 14.06, y0: 0.2, z: 18.512 };                  // the bar fridge's side that faces the room (south)
const SMOKO = { x: 12.75, y: 0.35, z: 21.27 };                           // the upturned crate between the smoko chairs
const SLABS = { x: 13.7, z: 18.75 };                                     // on the floor beside the fridge
/** Keepsakes: wall hooks on the factory's north wall and the dock's, the workbench as a shelf, the toilet door. */
export const KEEPSAKE_SPOTS: { x: number; y: number; z: number; on: 'wall' | 'shelf' | 'door' }[] = [
  { x: 5.5, y: 1.8, z: 7.03, on: 'wall' }, { x: 9.6, y: 1.75, z: 7.03, on: 'wall' }, { x: 10.6, y: 1.9, z: 7.03, on: 'wall' },
  { x: 12.2, y: 1.7, z: 11.03, on: 'wall' }, { x: 13.6, y: 1.7, z: 11.03, on: 'wall' }, { x: 4.4, y: 2.05, z: 7.03, on: 'wall' },
  { x: 6.25, y: 0.95, z: 18.4, on: 'shelf' }, { x: 7.1, y: 0.95, z: 18.4, on: 'shelf' }, { x: 3.4, y: 1.8, z: 7.03, on: 'wall' },
];
const DUNNY_DOOR = { x: 10.25, y: 1.75, z: 22.03 };

export class Gratitude {
  readonly group = new THREE.Group();
  /** Tap targets: morning cans (userData.morningCan = id) and the refund bag (userData.refundBag). */
  readonly targets: THREE.Object3D[] = [];
  private sig = '';
  private bag!: THREE.Group;
  private bagFill!: THREE.Mesh;
  private disposers: (() => void)[] = [];

  constructor(scene: THREE.Scene, private rich: boolean) {
    scene.add(this.group);
  }

  /** Bring the shed in line with the people state. */
  update(p: PeopleState, dayIndex: number) {
    const sig = JSON.stringify([p.gifts.map(g => [g.kind, g.slot, g.dayIndex === dayIndex || isKeep(g)]), p.keepsakes.map(k => k.design.id), p.cans.map(c => c.id),
      Math.ceil(p.fridgeGifted / PEOPLE.gifts.slab), Math.floor(p.bagged / 2), p.oddObject ?? '']);
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    this.buildBag(p.bagged);
    this.buildCans(p);
    this.buildGifts(p.gifts, dayIndex);
    this.buildSlabs(Math.ceil(p.fridgeGifted / PEOPLE.gifts.slab));
    this.buildKeepsakes(p.keepsakes);
    this.buildOdd(p.oddObject ?? null);
  }

  /** The morning after the rare late one: a milk crate on the router bed, or the extinguisher in the fridge. */
  private buildOdd(odd: PeopleState['oddObject']) {
    if (odd === 'crateOnBed') {
      const c = boxAt(0.42, 0.36, 0.42, toon(0xe0b030), 7.3, 0.77, 12.1); c.rotation.y = 0.4; this.group.add(c);
    } else if (odd === 'extinguisherInFridge') {
      const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 10), toon(0xc0281e)); ext.position.set(13.92, 0.5, 18.0); ext.rotation.z = 0.5;
      const door = boxAt(0.04, 0.8, 0.9, 0xe4e4e0, 13.7, 0.05, 18.35); door.rotation.y = -0.9; // left open
      this.group.add(ext, door);
    }
  }

  private clear() {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.group.clear();
    this.targets.length = 0;
  }

  private buildBag(bagged: number) {
    const g = this.bag = new THREE.Group();
    const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 10, 1, true), toon(0x3a7a4a, true, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    sack.position.y = 0.31;
    this.bagFill = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 1, 10), toon(0xb8bec4));
    const k = Math.min(1, bagged / PEOPLE.cans.bag);
    this.bagFill.scale.y = Math.max(0.001, 0.6 * k); this.bagFill.position.y = 0.3 * k;
    const tag = boxAt(0.22, 0.12, 0.01, 0xf4efe0, 0, 0.4, 0.245);  // "CANS FOR REFUND"
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.4; hit.userData.refundBag = true;
    g.add(sack, this.bagFill, tag, hit);
    g.position.set(BAG_SPOT.x, 0, BAG_SPOT.z);
    this.group.add(g);
    this.targets.push(hit);
  }

  private buildCans(p: PeopleState) {
    for (const c of p.cans) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 8), toon([0xc0281e, 0x2f8f6f, 0xd9a23a, 0x8fd37a][c.id % 4]));
      body.rotation.z = c.spot === 'floor' && c.id % 3 ? Math.PI / 2 : 0;     // some on their side, some stood up
      body.rotation.y = c.id * 1.7;
      body.position.y = body.rotation.z ? 0.05 : 0.065;
      body.castShadow = true;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.15; hit.userData.morningCan = c.id;
      g.add(body, hit);
      g.position.set(c.x, c.y, c.z);
      this.group.add(g);
      this.targets.push(hit);
    }
  }

  private buildGifts(gifts: Gift[], dayIndex: number) {
    // the corkboard's always up once there's been a card
    if (gifts.some(g => g.kind === 'card')) {
      const board = boxAt(CORK.w, CORK.h, 0.03, 0xb88a5a, CORK.x, CORK.y - CORK.h / 2, CORK.z - 0.015);
      this.group.add(board);
    }
    if (gifts.some(g => g.kind === 'plant')) {
      this.group.add(boxAt(SILL.x1 - SILL.x0, 0.6, 0.02, toon(0xa8d8f0, true, { emissive: 0x3a5a70 }), (SILL.x0 + SILL.x1) / 2, SILL.y, SILL.z - 0.1)); // the window
      this.group.add(boxAt(SILL.x1 - SILL.x0 + 0.1, 0.04, 0.16, 0xe9e2d0, (SILL.x0 + SILL.x1) / 2, SILL.y - 0.04, SILL.z));     // the sill
    }
    for (const g of gifts) {
      const today = g.dayIndex === dayIndex;
      switch (g.kind) {
        case 'card': {
          const cols = 6, i = g.slot % 18;
          const x = CORK.x - CORK.w / 2 + 0.16 + (i % cols) * 0.235, y = CORK.y - 0.18 - Math.floor(i / cols) * 0.27;
          const c = boxAt(0.17, 0.21, 0.01, toon(cardColour(g.from), true), x, y - 0.1, CORK.z + 0.005);
          c.rotation.z = ((g.slot * 37) % 9 - 4) * 0.03;
          this.group.add(c, boxAt(0.025, 0.025, 0.012, 0xc0281e, x, y + 0.08, CORK.z + 0.012)); // the pin
          break;
        }
        case 'drawing': {
          // up the fridge's side, two across, overlapping a bit as they pile up
          const i = g.slot % 8, col = i % 2, row = Math.floor(i / 2);
          const tex = this.drawingTexture(g);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.17), new THREE.MeshBasicMaterial({ map: tex }));
          m.position.set(FRIDGE_SIDE.x0 + 0.11 + col * 0.2, FRIDGE_SIDE.y0 + 0.6 - row * 0.15, FRIDGE_SIDE.z + i * 0.001);
          m.rotation.z = ((g.slot * 7) % 5 - 2) * 0.06;
          this.group.add(m, boxAt(0.035, 0.03, 0.02, [0xd9643a, 0x2f6fe0, 0x8fd37a][g.slot % 3], m.position.x, m.position.y + 0.065, m.position.z)); // a magnet
          this.disposers.push(() => { tex.dispose(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
          break;
        }
        case 'plant': {
          const x = SILL.x0 + 0.2 + (g.slot % 6) * 0.33;
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.12, 10), toon(0xc0643a)); pot.position.set(x, SILL.y + 0.06, SILL.z);
          const leaves = new THREE.Group();
          for (let k = 0; k < 4; k++) {
            const l = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (k % 2) * 0.02, 8, 6), toon([0x4e8a46, 0x3d7a3a, 0x6aa84f][(g.slot + k) % 3]));
            l.position.set(Math.cos(k * 1.7) * 0.05, 0.16 + k * 0.035, Math.sin(k * 1.7) * 0.04); leaves.add(l);
          }
          leaves.position.set(x, SILL.y, SILL.z);
          this.group.add(pot, leaves);
          break;
        }
        // food and coffee only on the day they came (it's eaten, it's drunk)
        case 'slice': case 'cake': {
          if (!today) break;
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 14), toon(0xf4f4f0)); plate.position.set(SMOKO.x, SMOKO.y + 0.01, SMOKO.z);
          this.group.add(plate);
          if (g.kind === 'cake') {
            const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), toon(0xf2e2b0)); cake.position.set(SMOKO.x, SMOKO.y + 0.07, SMOKO.z);
            const icing = new THREE.Mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.02, 14), toon(0xfff6e0)); icing.position.set(SMOKO.x, SMOKO.y + 0.12, SMOKO.z);
            const candle = boxAt(0.015, 0.07, 0.015, 0xd9643a, SMOKO.x, SMOKO.y + 0.13, SMOKO.z);
            this.group.add(cake, icing, candle);
          } else for (let k = 0; k < 5; k++) this.group.add(boxAt(0.07, 0.04, 0.07, 0xf2d65a, SMOKO.x - 0.08 + (k % 3) * 0.08, SMOKO.y + 0.02, SMOKO.z - 0.04 + Math.floor(k / 3) * 0.08));
          break;
        }
        case 'coffees': {
          if (!today) break;
          this.group.add(boxAt(0.22, 0.03, 0.22, 0xb89a6a, SMOKO.x + 0.05, SMOKO.y + 0.17, SMOKO.z - 0.02));
          for (let k = 0; k < 4; k++) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.1, 8), toon(0xf4efe0));
            cup.position.set(SMOKO.x - 0.0 + (k % 2) * 0.1, SMOKO.y + 0.25, SMOKO.z - 0.07 + Math.floor(k / 2) * 0.1);
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.015, 8), toon(0x2a2a2e)); lid.position.copy(cup.position); lid.position.y += 0.055;
            this.group.add(cup, lid);
          }
          break;
        }
        case 'beer': break; // into the fridge (and a slab by it: buildSlabs)
      }
    }
  }

  private buildSlabs(n: number) {
    for (let i = 0; i < Math.min(n, 4); i++) {
      const s = boxAt(0.42, 0.16, 0.28, toon([0x2f6f9e, 0x2f8f6f, 0xc0402a][i % 3]), SLABS.x - (i % 2) * 0.05, Math.floor(i / 1) * 0.165, SLABS.z);
      s.rotation.y = (i % 2) * 0.12;
      this.group.add(s);
    }
  }

  /** Things cut after hours, up for good: the moon goes on the dunny door, the rest on the walls and the bench. */
  private buildKeepsakes(ks: Keepsake[]) {
    let next = 0;
    for (const k of ks) {
      const isMoon = k.design.id.startsWith('kept-ah-dunny-moon');
      const spot = isMoon ? { ...DUNNY_DOOR, on: 'door' as const } : KEEPSAKE_SPOTS[next++ % KEEPSAKE_SPOTS.length];
      const size = Math.max(k.design.sheet.w, k.design.sheet.h);
      const piece = buildPiece(k.design, (spot.on === 'shelf' ? 0.42 : 0.55) / size, this.rich);
      // flat piece → hung on a wall facing out (+z), sketch-up the right way up
      const box = new THREE.Box3().setFromObject(piece.group), c = box.getCenter(new THREE.Vector3());
      piece.group.position.set(-c.x, 0, -c.z);
      const holder = new THREE.Group();
      holder.add(piece.group);
      holder.rotation.x = spot.on === 'shelf' ? Math.PI / 2 - 0.25 : Math.PI / 2;
      holder.position.set(spot.x, spot.y, spot.z);
      if (spot.on === 'shelf') holder.position.y += (box.max.z - box.min.z) / 2 * Math.cos(0.25);
      this.group.add(holder);
      this.disposers.push(piece.dispose);
    }
  }

  /** A kid's crayon drawing of the thing that was made for them (or a sun and a house). */
  private drawingTexture(g: Gift): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 56; c.height = 44;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fbfaf4'; x.fillRect(0, 0, 56, 44);
    x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(47, 8, 5, 0, Math.PI * 2); x.fill(); // the sun, top right, always
    x.fillStyle = '#5ab04a'; x.fillRect(0, 39, 56, 5); // grass
    const d: Design | undefined = g.design ? designById(g.design) : undefined;
    x.lineWidth = 2; x.strokeStyle = d?.colour ?? '#d9643a'; x.lineJoin = 'round';
    if (d) {
      const f = flatDesign(d), s = Math.min(36 / d.sheet.w, 28 / d.sheet.h);
      x.beginPath();
      f.outer.forEach(([px, py], i) => { const X = 6 + px * s + Math.sin(i) * 0.8, Y = 8 + py * s + Math.cos(i * 1.3) * 0.8; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
      x.closePath(); x.stroke();
    } else { x.strokeRect(14, 18, 20, 18); x.beginPath(); x.moveTo(12, 18); x.lineTo(24, 8); x.lineTo(36, 18); x.stroke(); }
    // a stick person waving
    x.strokeStyle = '#2a2a6a'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(44, 26, 3, 0, Math.PI * 2); x.moveTo(44, 29); x.lineTo(44, 36); x.moveTo(40, 31); x.lineTo(48, 28); x.moveTo(44, 36); x.lineTo(41, 40); x.moveTo(44, 36); x.lineTo(47, 40); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Raycast the tap targets: a can's id, the bag, or nothing. */
  hit(ray: THREE.Raycaster): { can: number } | { bag: true } | null {
    const h = ray.intersectObjects(this.targets, false)[0];
    if (!h) return null;
    if (h.object.userData.refundBag) return { bag: true };
    return { can: h.object.userData.morningCan as number };
  }
}

const isKeep = (g: Gift) => g.kind === 'card' || g.kind === 'drawing' || g.kind === 'plant';
function cardColour(from: string) { let h = 0; for (const c of from) h = (h * 31 + c.charCodeAt(0)) >>> 0; return [0xf4c2c2, 0xc2e0f4, 0xf4e6a2, 0xd0f4c2, 0xe6c2f4][h % 5]; }
