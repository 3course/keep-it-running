// The ink line (high tier only, TierSettings.detail.outline): the scene renders into a target at the internal
// resolution with its depth, then one full-screen pass darkens each pixel that sits in front of a big drop in depth,
// i.e. the edge of a prop or a person against whatever's behind. One pixel at the internal resolution, so after the
// nearest-neighbour upscale it's a chunky pixel-art outline. Things that don't write depth (decals, particles, light
// pools, the faded tube fittings) get no line.
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uEdge;
  uniform vec3 uInk;
  varying vec2 vUv;
  float viewDist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
  void main() {
    vec4 col = texture2D(tColor, vUv);
    float d = viewDist(vUv);
    // the most any neighbour falls away behind this pixel, relative to how far away it is
    float fall = max(max(viewDist(vUv + vec2(uTexel.x, 0.0)), viewDist(vUv - vec2(uTexel.x, 0.0))),
                     max(viewDist(vUv + vec2(0.0, uTexel.y)), viewDist(vUv - vec2(0.0, uTexel.y)))) - d;
    float ink = step(uEdge * d, fall);
    gl_FragColor = vec4(mix(col.rgb, uInk, ink * 0.85), 1.0);
    #include <colorspace_fragment>
  }`;

export class Outline {
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;

  /** edge: the depth fall (as a fraction of the distance) that counts as an edge. */
  constructor(width: number, height: number, edge = 0.06) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(width, height),
    });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) }, uNear: { value: 0.1 }, uFar: { value: 100 },
        uEdge: { value: edge }, uInk: { value: new THREE.Color(0x1c1612) },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number) {
    this.target.setSize(width, height);
    (this.mat.uniforms.uTexel.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.mat.uniforms.uNear.value = camera.near;
    this.mat.uniforms.uFar.value = camera.far;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
