// Presentation tuning for the walkable world. Economy numbers stay in src/config.ts; these are
// about how the shed looks and feels to walk around (tile size, speed, camera, ranges).

export const WORLD = {
  view: { width: 390, height: 844 },   // logical portrait canvas
  tile: 32,                            // px per tile
  zoom: 0.75,                          // camera zoom: ~16 x 35 tiles on screen
  playerSpeed: 178,                    // px per real second: machine→phone 22 tiles ≈ 4.0 s, machine→exhaust unit 32 tiles ≈ 5.8 s
  playerRadius: 10,
  cameraLerp: 0.12,
  cameraLead: 48,                      // px the camera looks ahead in the facing direction
  interactRange: 44,                   // px from the player to an object's edge to use it
  toiletMinutes: 10,                   // game minutes on the loo (no effect yet)
  rollerOpenMinutes: 4,                // game minutes the roller door stays up after a pickup or delivery
  offcutsPerSheet: 0.25,               // offcut bin fill per sheet cut (1 = full)
  offcutsEmptyAt: 0.5,                 // bin can be bagged up from this level
  saveKey: 'kir-save-v1',
} as const;
