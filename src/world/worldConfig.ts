// Presentation tuning for the 3D world. Economy numbers stay in src/config.ts; these are about how
// the shed looks and feels (scale, speed, camera, render resolution, interaction ranges).
// Units are metres and seconds unless noted.

export const WORLD = {
  view: { width: 390, height: 844 },   // the reference phone: HUD sizes are tuned for it (the canvas fills whatever the screen is)
  renderScale: 1 / 3,                  // internal render target vs logical size: ~130x281, upscaled nearest-neighbour
  cell: 0.5,                           // m per layout cell
  wallHeight: 2.4,
  lintel: 2.1,                         // doorway height; the wall above is a lintel

  // player
  playerRadius: 0.22,
  maxSpeed: 3.0,                       // m/s at full stick — machine→phone ≈ 3 s (through the office door and straight on), machine→exhaust unit ≈ 6 s
  accel: 9,                            // how quickly velocity chases the stick (1/s)
  turnRate: 10,                        // facing catch-up (1/s)
  hopVelocity: 2.4,                    // m/s up on tapping an interactable
  gravity: 14,

  // touch
  stickRadius: 44,                     // logical px of drag for full speed
  stickDeadzone: 8,
  tapMaxMs: 300,
  tapMaxMove: 12,

  // camera
  fov: 52,                             // vertical, in portrait
  landscapeHFov: 64,                   // horizontal, in landscape (so a wide screen shows more, not smaller)
  camDistance: 13,                     // m from the look-at point
  camPitchDeg: 40,                     // a little lower so the fronts of things show, not just their tops
  camLerp: 5,                          // follow smoothing (1/s)
  camLead: 0.6,                        // m ahead in the direction of travel (small floor: don't run ahead)
  camYardPullback: 1.1,                // camera distance multiplier outside, so the yard reads bigger
  camYawLerp: 1.5,
  wallFadeDistance: 4.5,               // walls this close between camera and player go see-through

  visitorSpeed: 1.6,                   // m/s: a visiting mate ambles
  visitorTalkRange: 2.0,               // m: close enough to answer a mate who's come up to you
  inspectorSpeed: 1.2,                 // m/s: the council inspector, clipboard in hand
  inspectorStayClose: 3.0,             // m: the walk-round only counts while you're this close to them
  inspectorLinger: 14,                 // s they spend looking at each stop on the round
  interactRange: 0.7,                  // m from the player's centre to an object's footprint
  offerSwapBelow: 0.6,                 // swap labels (bit, bag, spoilboard) only show once the part is this worn
  rollerOpenMinutes: 4,                // game minutes the roller door stays up after a pickup or delivery
  offcutsPerSheet: 0.25,               // offcut bin fill per sheet cut (1 = full)
  offcutsEmptyAt: 0.5,                 // bin can be bagged up from this level
  // spraying the extinguisher: the aim mark sits this far above your thumb, and has to be within this of the glow
  sprayAimAbove: 70,                   // CSS px (scaled with the HUD)
  sprayAimRadius: 38,                  // CSS px (scaled with the HUD)
  sprayFlareSeconds: 1.2,              // the flames jump up this long when you let go too soon
  uteReach: 3.2,                       // m from the ute's middle: close enough to hand the stack over
  saveKey: 'kir-save-v2',
} as const;
