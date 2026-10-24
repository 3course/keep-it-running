// What the device's GPU can do, probed once before the real renderer is made, and the render tier that
// follows from it. Android and weak GPUs get a plainer pipeline; ?safe=1 forces it, ?safe=2 goes further.
import * as THREE from 'three';

/** full: desktop/iOS. low: small PCF-free shadows, no point lights. bare: low with no shadows at all. */
export type Tier = 'full' | 'low' | 'bare';

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
}

export interface TierSettings {
  shadows: boolean;
  shadowMapSize: number;
  shadowType: THREE.ShadowMapType;
  pointLights: boolean;     // the fire's light and the office door's lamp; off: emissive glow only
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
}

export const TIERS: Record<Tier, TierSettings> = {
  full: { shadows: true, shadowMapSize: 1024, shadowType: THREE.PCFShadowMap, pointLights: true, antialias: false, powerPreference: 'low-power' },
  // BasicShadowMap: a nearest-filtered depth texture, no hardware compare — the most widely supported shadow path
  low: { shadows: true, shadowMapSize: 512, shadowType: THREE.BasicShadowMap, pointLights: false, antialias: false, powerPreference: 'high-performance' },
  bare: { shadows: false, shadowMapSize: 512, shadowType: THREE.BasicShadowMap, pointLights: false, antialias: false, powerPreference: 'high-performance' },
};

/** Look at the GPU through a throwaway context, then let it go. */
export function probeGpu(search = location.search): GpuInfo {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const info: GpuInfo = {
    tier: 'full', why: 'desktop or iOS', webgl2: false, vendor: '?', renderer: '?', maxTextureSize: 0,
    floatRenderTarget: false, halfFloatRenderTarget: false, depthTexture: false, android, ios, userAgent: ua,
  };
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
  else if (android) { info.tier = 'low'; info.why = 'Android'; }
  else if (!info.webgl2) { info.tier = 'low'; info.why = 'no WebGL2'; }
  else if (info.maxTextureSize < 4096) { info.tier = 'low'; info.why = `max texture ${info.maxTextureSize}`; }
  else if (!info.floatRenderTarget && !info.halfFloatRenderTarget) { info.tier = 'low'; info.why = 'no float render targets'; }
  else if (!info.depthTexture) { info.tier = 'low'; info.why = 'no depth textures'; }
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
  ].filter(Boolean).join('\n');
}
