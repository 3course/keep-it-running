// People's legs at the low render resolution: a few degrees of tilt reads as a kink, so standing figures stand dead
// straight (both soles on the ground, nothing swaying) and the walk is four held poses at 0 or ±18°, never in between.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const THREE = await server.ssrLoadModule('three');
const { Figure } = await server.ssrLoadModule('/src/world3d/figures.ts');
const { snapAll } = await server.ssrLoadModule('/src/world3d/pixelSnap.ts');

const legs = f => f.legParts;
/** The lowest point of each foot, in world space. */
function soles(f) {
  f.root.updateMatrixWorld(true);
  return legs(f).map(l => new THREE.Box3().setFromObject(l.foot).min.y);
}

describe('figures', () => {
  it('standing: legs straight down, both soles on the ground, under the hips', () => {
    const f = new Figure({ shirt: 0x336699, hair: 'short' });
    f.setSeated(false);
    for (let i = 0; i < 120; i++) f.update(1 / 60); // idles run: sips, leans, looks
    for (const l of legs(f)) assert.ok(l.pivot.rotation.x === 0, 'no tilt');
    const s = soles(f);
    for (const y of s) assert.ok(Math.abs(y) < 0.01, `sole on the ground (${y.toFixed(3)})`);
    assert.ok(Math.abs(s[0] - s[1]) < 1e-6, 'both feet on the same row');
    for (const l of legs(f)) { l.foot.updateMatrixWorld(true); const p = l.foot.getWorldPosition(new THREE.Vector3()); assert.ok(Math.abs(p.x - l.pivot.position.x) < 1e-6, 'under the hip'); }
  });
  it("a lean or a laugh tilts the torso, never the legs", () => {
    const f = new Figure({ shirt: 0x336699, hair: 'short' });
    f.setSeated(false); f.setExpr('laughing'); f.play('lean');
    for (let i = 0; i < 60; i++) f.update(1 / 60);
    assert.notEqual(f.body.rotation.x, 0, 'the body leans');
    assert.ok(f.legs.rotation.x === 0);
    for (const l of legs(f)) assert.ok(l.pivot.rotation.x === 0);
  });
  it('walking: held poses at 0 or ±18°, alternating legs; stopping drops straight back to standing', () => {
    const f = new Figure({ shirt: 0x336699, hair: 'short' });
    f.setSeated(false); f.walking = true;
    const angles = new Set();
    for (let i = 0; i < 240; i++) { f.update(1 / 60); for (const l of legs(f)) angles.add(+l.pivot.rotation.x.toFixed(4) || 0); const [a, b] = legs(f); assert.ok(a.pivot.rotation.x === -b.pivot.rotation.x, 'one forward, one back'); }
    assert.deepEqual([...angles].sort((x, y) => x - y), [-0.32, 0, 0.32], 'only the stepped poses');
    f.walking = false; f.update(1 / 60);
    for (const l of legs(f)) assert.ok(l.pivot.rotation.x === 0, 'idle pose, not frozen mid-step');
  });
  it('snapped to whole render pixels for the frame (feet on the floor), and put back after', () => {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 130 / 281, 0.1, 100);
    cam.position.set(3, 6, 9); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    const f = new Figure({ shirt: 0x336699, hair: 'short' }); f.setSeated(false);
    scene.add(f.root); f.root.position.set(0.1234, 0, -0.5678);
    const renderer = { getDrawingBufferSize: v => v.set(130, 281) }; // the render resolution: a third of a 390x844 phone
    const undo = snapAll(scene, cam, renderer);
    f.root.updateMatrixWorld(true);
    const p = f.root.getWorldPosition(new THREE.Vector3()), ndc = p.clone().project(cam);
    const px = (ndc.x + 1) / 2 * 130, py = (1 - ndc.y) / 2 * 281;
    assert.ok(Math.abs(px - Math.round(px)) < 1e-3 && Math.abs(py - Math.round(py)) < 1e-3, `on a whole pixel (${px.toFixed(3)}, ${py.toFixed(3)})`);
    assert.equal(p.y, 0, 'feet still on the floor');
    undo();
    assert.deepEqual([f.root.position.x, f.root.position.z], [0.1234, -0.5678], 'back where it was');
  });
});
