// Presentation tuning for the 3D world. Economy numbers stay in src/config.ts; these are about how
// the shed looks and feels (scale, speed, camera, render resolution, interaction ranges).
// Units are metres and seconds unless noted.

export const WORLD = {
  view: { width: 390, height: 844 },   // logical portrait canvas (CSS px before fitting)
  renderScale: 1 / 3,                  // internal render target vs logical size: ~130x281, upscaled nearest-neighbour
  cell: 0.5,                           // m per layout cell
  wallHeight: 2.4,
  lintel: 2.1,                         // doorway height; the wall above is a lintel

  // player
  playerRadius: 0.22,
  maxSpeed: 3.0,                       // m/s at full stick — machine→phone ≈ 4 s, machine→exhaust unit ≈ 6 s
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
  fov: 52,
  camDistance: 13,                     // m from the look-at point
  camPitchDeg: 40,                     // a little lower so the fronts of things show, not just their tops
  camLerp: 4,                          // follow smoothing (1/s)
  camLead: 1.2,                        // m ahead in the direction of travel
  camYawLerp: 1.5,
  wallFadeDistance: 4.5,               // walls this close between camera and player go see-through

  interactRange: 0.7,                  // m from the player's centre to an object's footprint
  toiletMinutes: 10,                   // game minutes on the loo (no effect yet)
  rollerOpenMinutes: 4,                // game minutes the roller door stays up after a pickup or delivery
  offcutsPerSheet: 0.25,               // offcut bin fill per sheet cut (1 = full)
  offcutsEmptyAt: 0.5,                 // bin can be bagged up from this level
  saveKey: 'kir-save-v2',
} as const;
