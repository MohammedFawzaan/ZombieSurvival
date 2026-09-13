import * as THREE from 'three';

export interface RendererInfo {
  type: 'WebGPURenderer' | 'WebGLRenderer';
  backend: string;
  webgpuAvailable: boolean;
}

export interface CreatedRenderer {
  renderer: THREE.WebGLRenderer;
  info: RendererInfo;
}

export interface QualitySettings {
  shadowMapSize: number;
  shadowDistance: number;
  pixelRatio: number;
  anisotropy: number;
  vegetationDensity: number;
  grassEnabled: boolean;
}

export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', QualitySettings> = {
  low: {
    shadowMapSize: 1024,
    shadowDistance: 55,
    pixelRatio: 0.72,
    anisotropy: 2,
    vegetationDensity: 0.55,
    grassEnabled: false,
  },
  medium: {
    shadowMapSize: 1536,
    shadowDistance: 78,
    pixelRatio: 0.88,
    anisotropy: 4,
    vegetationDensity: 0.8,
    grassEnabled: true,
  },
  high: {
    shadowMapSize: 2048,
    shadowDistance: 105,
    pixelRatio: 1,
    anisotropy: 8,
    vegetationDensity: 1,
    grassEnabled: true,
  },
};

export async function detectWebGPU(): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };
  if (!nav.gpu) return false;
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

export function createWebGLRenderer(canvas: HTMLCanvasElement): CreatedRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    alpha: false,
  });
  configureCommon(renderer);
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU';
  return {
    renderer,
    info: {
      type: 'WebGLRenderer',
      backend: `WebGL2 · ${shortenGpu(gpu)}`,
      webgpuAvailable: false,
    },
  };
}

function shortenGpu(raw: string): string {
  const m = raw.match(/ANGLE \([^,]+, ([^,)]+)/);
  const name = m ? m[1] : raw;
  return name.replace(/\s*\(0x[0-9A-Fa-f]+\)\s*/, '').replace(/Direct3D11.*$/, '').trim();
}

function configureCommon(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.autoClear = true;
  renderer.info.autoReset = false;
}

export function applyQuality(
  renderer: THREE.WebGLRenderer,
  quality: QualitySettings,
  maxRatio = 1.25,
): void {
  const ratio = Math.min(window.devicePixelRatio * quality.pixelRatio, maxRatio);
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = quality.shadowMapSize > 0;
}
