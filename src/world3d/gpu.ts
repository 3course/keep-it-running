// What the device's GPU can do, probed once before the real renderer is made, and the render tier that
// follows from it. Android and weak GPUs get a plainer pipeline; ?safe=1 forces it, ?safe=2 goes further.
// ?res=<n> overrides the tier's render resolution (a multiple of WORLD.renderScale) to compare on a device.
import * as THREE from 'three';
import { perf } from './perf.js';

/**
 * full (high): desktop/iOS. mid: Android with a capable GPU — the low pipeline, a sharper picture and the cheaper detail.
 * low: small PCF-free shadows, no point lights, the original resolution and no extra detail. bare: low with no shadows.
 */
export type Tier = 'full' | 'mid' | 'low' | 'bare';

export interface GpuInfo {
  tier: Tier;
  why: string;              // what decided the tier
  webgl2: boolean;
  vendor: string;
  renderer: string;         // unmasked GPU string where the browser gives it out
  maxTextureSize: number;
  floatRenderTarget: boolean;
  halfFloatRenderTarget: boolean;
  depthTexture: boolean;
  android: boolean;
  ios: boolean;
  userAgent: string;
  /** ?res=<n>: render at n × WORLD.renderScale instead of the tier's resolution (and don't step it down). */
  resOverride: number | null;
}

export interface TierSettings {
  shadows: boolean;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
  pointLights: boolean;     // the fire's light and the office door's lamp; off: emissive glow only
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
  /** Internal render resolution, as a multiple of WORLD.renderScale (1 = the original 1/3 of the screen). Still pixelated. */
  resMult: number;
  /** Frame time to hold (ms): 60 fps on the capable tiers, 30 on the weak ones. Missed for long, resolution steps down. */
  targetMs: number;
  /** Extra detail, cheapest first. Each tier only gets what it can afford. */
  detail: {
    textures: boolean;      // pixel-art plywood, MDF, acrylic and concrete
    decals: boolean;        // sawdust building up round the router and extractor
    particles: 0 | 1 | 2;   // 0: the old smoke only; 1: + embers, sparks, dust puffs (fewer); 2: all of them
    lighting: 0 | 1 | 2;    // 0: the old lights; 1: fluorescent tubes and the roller-door shaft (emissive, no new lights); 2: + light pools
    outline: boolean;       // ink outline pass on props and characters
  };
}

const NO_DETAIL: TierSettings['detail'] = { textures: false, decals: false, particles: 0, lighting: 0, outline: false };

export const TIERS: Record<Tier, TierSettings> = {
  full: { shadows: true, shadowMapSize: 1024, shadowType: THREE.PCFShadowMap, pointLights: true, antialias: false, powerPreference: 'low-power',
    resMult: 2, targetMs: 1000 / 60, detail: { textures: true, decals: true, particles: 2, lighting: 2, outline: true } },
  // the low pipeline (it's what Android needed), with a sharper picture and the cheaper detail
  mid: { shadows: true, shadowMapSize: 512, shadowType: THREE.BasicShadowMap, pointLights: false, antialias: false, powerPreference: 'high-performance',
    resMult: 1.5, targetMs: 1000 / 60, detail: { textures: true, decals: true, particles: 1, lighting: 1, outline: false } },
  // BasicShadowMap: a nearest-filtered depth texture, no hardware compare — the most widely supported shadow path
  low: { shadows: true, shadowMapSize: 512, shadowType: THREE.BasicShadowMap, pointLights: false, antialias: false, powerPreference: 'high-performance',
    resMult: 1, targetMs: 1000 / 30, detail: NO_DETAIL },
  bare: { shadows: false, shadowMapSize: 512, shadowType: THREE.BasicShadowMap, pointLights: false, antialias: false, powerPreference: 'high-performance',
    resMult: 1, targetMs: 1000 / 30, detail: NO_DETAIL },
};

/** Look at the GPU through a throwaway context, then let it go. */
export function probeGpu(search = location.search): GpuInfo {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const info: GpuInfo = {
    tier: 'full', why: 'desktop or iOS', webgl2: false, vendor: '?', renderer: '?', maxTextureSize: 0,
    floatRenderTarget: false, halfFloatRenderTarget: false, depthTexture: false, android, ios, userAgent: ua, resOverride: null,
  };
  const res = Number(new URLSearchParams(search).get('res'));
  if (res > 0) info.resOverride = Math.min(4, Math.max(0.5, res));
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl');
    info.webgl2 = !!gl2;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      info.vendor = String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
      info.renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      info.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      info.floatRenderTarget = !!gl.getExtension(gl2 ? 'EXT_color_buffer_float' : 'WEBGL_color_buffer_float');
      info.halfFloatRenderTarget = info.floatRenderTarget || !!gl.getExtension(gl2 ? 'EXT_color_buffer_half_float' : 'EXT_color_buffer_half_float');
      info.depthTexture = !!gl2 || !!gl.getExtension('WEBGL_depth_texture'); // core in WebGL2
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // don't hold a second context open
    }
  } catch { /* leave the defaults: the tier logic below treats it as weak */ }

  const safe = new URLSearchParams(search).get('safe');
  if (safe === '2') { info.tier = 'bare'; info.why = '?safe=2'; }
  else if (safe !== null && safe !== '0') { info.tier = 'low'; info.why = '?safe=1'; }
  else if (!info.webgl2) { info.tier = 'low'; info.why = 'no WebGL2'; }
  else if (info.maxTextureSize < 4096) { info.tier = 'low'; info.why = `max texture ${info.maxTextureSize}`; }
  else if (!info.floatRenderTarget && !info.halfFloatRenderTarget) { info.tier = 'low'; info.why = 'no float render targets'; }
  else if (!info.depthTexture) { info.tier = 'low'; info.why = 'no depth textures'; }
  else if (android) { info.tier = 'mid'; info.why = 'Android, capable GPU'; } // the low pipeline, sharper and with some detail
  return info;
}

/** Everything someone would need to know about why the 3D view failed, as plain text. */
export function describeGpu(info: GpuInfo, error?: string): string {
  return [
    error ? `What failed: ${error}` : null,
    `Tier: ${info.tier} (${info.why})`,
    `GPU: ${info.renderer}`,
    `Vendor: ${info.vendor}`,
    `WebGL2: ${info.webgl2 ? 'yes' : 'no'} · max texture ${info.maxTextureSize} · float RT ${info.floatRenderTarget ? 'yes' : 'no'} · half-float RT ${info.halfFloatRenderTarget ? 'yes' : 'no'} · depth texture ${info.depthTexture ? 'yes' : 'no'}`,
    `User agent: ${info.userAgent}`,
    `Page: ${location.href}`,
    perf.report(),
  ].filter(Boolean).join('\n');
}
