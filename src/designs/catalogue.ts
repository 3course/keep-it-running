// The designs customers bring in: four of each kind. Coordinates are mm on the design's sheet (y down). Path data is
// plain SVG; the helpers below only save typing circles and rounded rectangles.
import { textC } from './font.js';
import type { Design } from './types.js';

const r1 = (n: number) => Math.round(n * 10) / 10;
/** A full circle as two arcs. */
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
/** A rectangle with rounded corners. */
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
/** A slot with round ends, horizontal. */
const slot = (x: number, y: number, w: number, h: number) => rrect(x, y, w, h, h / 2);
/** A ring segment between radii r1 < r2, from angle a0 to a1 (degrees, clockwise from 3 o'clock). */
function sector(cx: number, cy: number, ra: number, rb: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${r1(cx + r * Math.cos(a * Math.PI / 180))} ${r1(cy + r * Math.sin(a * Math.PI / 180))}`;
  return `M${p(ra, a0)} L${p(rb, a0)} A${rb} ${rb} 0 0 1 ${p(rb, a1)} L${p(ra, a1)} A${ra} ${ra} 0 0 0 ${p(ra, a0)} Z`;
}

const FORMPLY = { material: '18mm formply', thickness: 18, colour: '#8a4f32' } as const;
const MDF = { material: '18mm MDF', thickness: 18 } as const;
const ACRYLIC = { material: '6mm acrylic', thickness: 6 } as const;

export const DESIGNS: Design[] = [
  // ---------- formwork ----------
  {
    id: 'cubby-wall', name: 'Cubby-house wall panel', kind: 'formwork', customer: 'Nan Doreen', ...FORMPLY,
    sheet: { w: 1200, h: 1200 },
    outer: 'M100 1100 L100 450 L600 100 L1100 450 L1100 1100 Z',
    inner: [
      { op: 'engrave', d: textC('NO ADULTS', 330, 930, 28) },
      { op: 'cut', d: circle(600, 420, 150) },
      { op: 'cut', d: rrect(200, 620, 260, 260, 20) },
      { op: 'cut', d: 'M700 1040 L700 780 A140 140 0 0 1 980 780 L980 1040 Z' },
    ],
    note: "For the grandkids' cubby. Porthole fits the 300 ship window Pop found. The sign was their idea",
    pickup: ['The grandkids are going to lose their minds. NO ADULTS. Ha!', "Pop's porthole fits. I can tell from here."], thanks: { kind: 'slice', line: 'Lemon slice. My mother\'s recipe. Do not share it with the man next door.' },
  },
  {
    id: 'birdbath-ring', name: 'Birdbath plinth form ring', kind: 'formwork', customer: 'Ros at No. 14', ...FORMPLY,
    sheet: { w: 1200, h: 1200 },
    outer: circle(600, 600, 520),
    inner: [
      { op: 'engrave', d: textC('TOP', 600, 150, 50) },
      { op: 'cut', d: circle(600, 600, 300) },
      ...[45, 135, 225, 315].map(a => ({ op: 'cut' as const, d: circle(r1(600 + 410 * Math.cos(a * Math.PI / 180)), r1(600 + 410 * Math.sin(a * Math.PI / 180)), 16) })),
    ],
    note: 'Pour form for the birdbath plinth. Has to be ROUND round, the birds will know',
    pickup: ['Round round. The birds will be thrilled.'], thanks: { kind: 'plant', line: 'A cutting from the garden. It grows like mad, you can\'t kill it.' },
  },
  {
    id: 'pizza-arch', name: 'Pizza-oven arch former', kind: 'formwork', customer: 'Enzo', ...FORMPLY,
    sheet: { w: 1200, h: 720 },
    outer: 'M150 660 A450 450 0 0 1 1050 660 Z',
    inner: [
      { op: 'engrave', d: 'M600 250 L600 330 M570 290 L630 290' },
      { op: 'cut', d: slot(480, 540, 240, 60) },
      { op: 'cut', d: circle(400, 440, 40) },
      { op: 'cut', d: circle(800, 440, 40) },
    ],
    note: 'Arch 900 wide, 450 high. A proper semicircle, NOT pointy like the last bloke. Pizza on me',
    pickup: ['A proper semicircle! Not pointy! Bellissimo.', 'First pizza out of the oven has your name on it.'], thanks: { kind: 'beer', line: 'Slab for the fridge. The pizza comes later, I promise.' },
  },
  {
    id: 'kennel-gable', name: 'Dog kennel gable end', kind: 'formwork', customer: 'Marg & Biscuit', ...FORMPLY,
    sheet: { w: 1000, h: 1000 },
    outer: 'M100 950 L100 400 L500 80 L900 400 L900 950 Z',
    inner: [
      { op: 'engrave', d: textC('BISCUIT', 500, 450, 50) },
      { op: 'cut', d: circle(500, 260, 40) },
      { op: 'cut', d: 'M330 880 L330 700 A170 170 0 0 1 670 700 L670 880 Z' },
    ],
    note: "Biscuit's a big lad (kelpie x lab). Door 340 wide at LEAST. His name over the door please",
    pickup: ["BISCUIT. He's going to think he's royalty."], thanks: { kind: 'card', line: "Biscuit signed it. That's a paw, not a smudge." },
  },

  // ---------- MDF, painted ----------
  {
    id: 'cafe-menu', name: 'Café menu board', kind: 'mdf', customer: 'Wren, Little Magpie Café', ...MDF, colour: '#2e5e4e',
    sheet: { w: 900, h: 1200 },
    outer: 'M140 1140 Q100 1140 100 1100 L100 380 A350 350 0 0 1 800 380 L800 1100 Q800 1140 760 1140 Z',
    inner: [
      { op: 'engrave', d: textC('MENU', 450, 230, 90) },
      ...[440, 560, 680, 800, 920].map(y => ({ op: 'engrave' as const, d: `M180 ${y} L720 ${y}` })),
      { op: 'engrave', d: textC('LITTLE MAGPIE', 450, 1020, 34) },
      { op: 'cut', d: circle(330, 150, 14) },
      { op: 'cut', d: circle(570, 150, 14) },
    ],
    note: 'Bottle green please. Lines are for the chalk specials. Coffee on the house when you drop it round',
    pickup: ['Bottle green! The specials are going to look so smart.'], thanks: { kind: 'coffees', line: 'Coffees from the café. Flat whites, one with three sugars for whoever needs it.' },
  },
  {
    id: 'record-shelf', name: 'Record shelf side', kind: 'mdf', customer: 'Theo (DJ Fitzy)', ...MDF, colour: '#d9a23a',
    sheet: { w: 450, h: 1200 },
    outer: rrect(50, 50, 350, 1100, 30),
    inner: [
      { op: 'engrave', d: circle(225, 210, 110) },
      { op: 'engrave', d: circle(225, 210, 85) },
      { op: 'engrave', d: circle(225, 210, 60) },
      { op: 'cut', d: circle(225, 210, 18) },
      { op: 'cut', d: slot(100, 440, 250, 18) },
      { op: 'cut', d: slot(100, 790, 250, 18) },
      { op: 'cut', d: slot(150, 1040, 150, 50) }, // hand-hold
    ],
    note: "12-inch records so shelves MUST clear 330. Mustard like my old Kingswood. Record's just for vibes",
    pickup: ['Clears 330. I measured with a record. Twice.'], thanks: { kind: 'card', line: 'Card. There\'s a mixtape code in it. Do not judge track four.' },
  },
  {
    id: 'dachshund-hook', name: 'Sausage-dog coat hook', kind: 'mdf', customer: 'Ash', ...MDF, colour: '#c65b3f',
    sheet: { w: 1200, h: 500 },
    outer: 'M200 195 L80 120 L90 138 L195 228 Q185 280 210 320 L205 430 L320 430 L330 330 L920 330 L925 430 L1015 430 '
      + 'L985 400 L980 260 Q990 200 1030 185 L1130 170 Q1158 160 1140 135 L1080 95 Q1010 60 950 100 Q900 150 860 195 Q500 185 200 195 Z',
    inner: [
      { op: 'engrave', d: 'M1012 105 Q975 150 1002 190' },
      { op: 'engrave', d: 'M890 165 Q930 205 972 222' },
      { op: 'cut', d: circle(1062, 128, 9) },
      ...[460, 610, 760].map(x => ({ op: 'cut' as const, d: circle(x, 262, 10) })),
    ],
    note: 'Sausage dog for the hallway, like Frankie. 3 holes for dowel pegs (lead, keys, beanie). Terracotta!',
    pickup: ['She looks exactly like Frankie. Long and proud.'], thanks: { kind: 'card', line: 'Frankie and I made you a card. She did the paw bit. Mostly.' },
  },
  {
    id: 'rocket-bookcase', name: 'Rocket bookcase end', kind: 'mdf', customer: 'Priya, for Arlo (5)', ...MDF, colour: '#4a8cc4',
    sheet: { w: 600, h: 1200 },
    outer: 'M300 40 Q450 120 460 300 L460 900 L560 1060 L560 1160 L460 1100 L140 1100 L40 1160 L40 1060 L140 900 L140 300 Q150 120 300 40 Z',
    inner: [
      { op: 'engrave', d: textC('ARLO', 300, 690, 50) },
      { op: 'cut', d: circle(300, 390, 64) },
      { op: 'cut', d: circle(300, 580, 50) },
      { op: 'cut', d: slot(180, 790, 240, 18) },
      { op: 'cut', d: slot(180, 960, 240, 18) },
    ],
    note: 'Arlo wants a ROCKET bookcase. Two shelves, windows to see the books. Sky blue (not navy!!)',
    pickup: ["Arlo's going to fly to the moon. And then read in it."], thanks: { kind: 'drawing', line: 'Arlo drew you a picture of his rocket. That\'s you, in the window.' },
  },

  // ---------- acrylic ----------
  {
    id: 'mila-cloud', name: "Mila's name cloud", kind: 'acrylic', customer: "Bec (Mila's mum)", ...ACRYLIC, colour: '#ff4fa0',
    sheet: { w: 600, h: 300 },
    outer: 'M80 230 A50 50 0 0 1 90 135 A70 70 0 0 1 210 85 A90 90 0 0 1 380 80 A70 70 0 0 1 500 130 A55 55 0 0 1 520 230 Q300 262 80 230 Z',
    inner: [
      { op: 'engrave', d: textC('MILA', 300, 115, 90) },
      { op: 'cut', d: circle(118, 196, 7) },
      { op: 'cut', d: circle(482, 196, 7) },
    ],
    note: 'Hot pink for her bedroom door!! Mila is 4 and very into clouds. Letters frosted please x',
    pickup: ['Pink! Cloud! Frosted letters! Mila is going to scream.'], thanks: { kind: 'drawing', line: 'Mila drew her sign for you. The purple bit is a rainbow. Or a horse.' },
  },
  {
    id: 'fern-fig', name: 'Fern + Fig shopfront sign', kind: 'acrylic', customer: 'Odette, Fern + Fig florist', ...ACRYLIC, colour: '#1fa774',
    sheet: { w: 1200, h: 600 },
    outer: 'M100 300 A500 230 0 1 1 1100 300 A500 230 0 1 1 100 300 Z',
    inner: [
      { op: 'engrave', d: 'M540 190 Q600 100 660 170 Q600 205 540 190 Z M552 186 L640 160' },
      { op: 'engrave', d: textC('FERN + FIG', 600, 240, 110) },
      { op: 'engrave', d: textC('FLORIST', 600, 390, 40) },
      { op: 'cut', d: circle(300, 145, 10) },
      { op: 'cut', d: circle(900, 145, 10) },
    ],
    note: 'For over the shop on Smith St. Green to match the awning. Edges should GLOW when the sun hits',
    pickup: ['The edges glow! Exactly like I wanted. Better.'], thanks: { kind: 'plant', line: 'A little fern for the windowsill. She likes a bit of morning sun.' },
  },
  {
    id: 'spoke-wheel', name: 'Bike shop wheel sign', kind: 'acrylic', customer: 'Benny, Spoke St Cycles', ...ACRYLIC, colour: '#ffae1a',
    sheet: { w: 800, h: 800 },
    outer: circle(400, 400, 370),
    inner: [
      { op: 'engrave', d: textC('SPOKE ST', 400, 372, 44) },
      { op: 'engrave', d: textC('CYCLES', 400, 434, 30) },
      { op: 'engrave', d: circle(400, 400, 185) },
      ...[0, 60, 120, 180, 240, 300].map(a => ({ op: 'cut' as const, d: sector(400, 400, 205, 315, a + 5, a + 55) })),
    ],
    note: 'Hangs in the window on fishing line. Amber like a reflector. Gaps so the light comes through',
    pickup: ['Amber like a reflector. People are going to stop on the footpath.'], thanks: { kind: 'beer', line: 'Slab for the fridge. Ride safe. Well, drink safe.' },
  },
  {
    id: 'house-27', name: 'House number 27', kind: 'acrylic', customer: 'The Okafors', ...ACRYLIC, colour: '#2f6fe0',
    sheet: { w: 600, h: 420 },
    outer: rrect(40, 60, 520, 300, 40),
    inner: [
      { op: 'engrave', d: textC('27', 300, 110, 200) },
      { op: 'engrave', d: 'M420 310 Q440 280 470 290 L485 282 L475 298 Q470 330 430 330 Q410 320 420 310 Z' },
      ...[[80, 100], [520, 100], [80, 320], [520, 320]].map(([x, y]) => ({ op: 'cut' as const, d: circle(x, y, 6) })),
    ],
    note: 'For the letterbox. Cobalt to match the front door. Little wren in the corner, one lives in the hedge',
    pickup: ['The little wren! The kids will be counting it every day.'], thanks: { kind: 'card', line: 'A card from the whole Okafor household. Even the cat. Allegedly.' },
  },

  // ---------- after hours (a mate's idea at knock-off; traced by hand, never a paying job) ----------
  { id: 'ah-dunny-moon', name: 'Dunny door moon', kind: 'mdf', customer: 'Eggby', ...MDF, colour: '#e8c547', afterHours: true, sheet: { w: 500, h: 500 },
    outer: 'M330 60 A200 200 0 1 0 330 440 A160 160 0 1 1 330 60 Z', inner: [], note: 'For the dunny door. Like the old days' },
  { id: 'ah-trophy', name: 'Best customer trophy', kind: 'mdf', customer: 'Eggby', ...MDF, colour: '#d9a23a', afterHours: true, sheet: { w: 500, h: 600 },
    outer: 'M110 60 L390 60 L380 200 Q370 300 280 330 L280 420 L360 420 L360 520 L140 520 L140 420 L220 420 L220 330 Q130 300 120 200 Z', inner: [], note: 'Best customer. Speech to follow' },
  { id: 'ah-coaster', name: 'Dinner-plate coaster', kind: 'formwork', customer: 'Eggby', ...FORMPLY, afterHours: true, sheet: { w: 400, h: 400 },
    outer: circle(200, 200, 170), inner: [], note: 'For the big nights' },
  { id: 'ah-fin', name: 'Surfboard fin', kind: 'acrylic', customer: 'Courtney', ...ACRYLIC, colour: '#36b3d9', afterHours: true, sheet: { w: 400, h: 500 },
    outer: 'M90 440 Q120 220 300 60 Q260 250 330 440 Z', inner: [], note: 'Shaped it myself, basically' },
  { id: 'ah-boomerang', name: 'Boomerang that comes back', kind: 'formwork', customer: 'Courtney', ...FORMPLY, afterHours: true, sheet: { w: 600, h: 400 },
    outer: 'M60 330 Q200 80 300 70 Q400 80 540 330 Q500 350 460 320 Q380 170 300 160 Q220 170 140 320 Q100 350 60 330 Z', inner: [], note: 'Comes back. Unlike some people' },
  { id: 'ah-dog', name: "Bron's dog", kind: 'mdf', customer: 'Courtney', ...MDF, colour: '#8a5a3c', afterHours: true, sheet: { w: 500, h: 500 },
    outer: 'M150 460 L150 300 Q120 230 140 170 L110 80 L180 130 Q250 110 320 130 L390 80 L360 170 Q380 230 350 300 L350 460 Z', inner: [], note: "Bron's dog, sitting nicely" },
  { id: 'ah-parma', name: 'Trivia team parma', kind: 'mdf', customer: 'Tim Baker', ...MDF, colour: '#d98b3a', afterHours: true, sheet: { w: 600, h: 400 },
    outer: 'M80 220 Q60 120 170 90 Q300 50 430 80 Q550 110 530 220 Q545 320 420 330 Q300 350 180 330 Q70 320 80 220 Z', inner: [], note: 'Quiz Team Aguilera' },
  { id: 'ah-pick', name: 'Dinner-plate guitar pick', kind: 'acrylic', customer: 'Tim Baker', ...ACRYLIC, colour: '#c43c8a', afterHours: true, sheet: { w: 450, h: 500 },
    outer: 'M225 460 Q90 330 70 170 Q70 60 225 50 Q380 60 380 170 Q360 330 225 460 Z', inner: [], note: 'For the band. Name pending' },
];
