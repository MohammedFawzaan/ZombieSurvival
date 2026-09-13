import * as THREE from 'three';
import {
  createWebGLRenderer,
  detectWebGPU,
  type CreatedRenderer,
  type RendererInfo,
} from './renderer';

export type RendererPreference = 'auto' | 'webgpu' | 'webgl';

export interface RendererBundle {
  renderer: THREE.WebGLRenderer;
  info: RendererInfo;
  isWebGPU: boolean;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  renderOverlay(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(w: number, h: number): void;
  resetInfo(): void;
  getStats(): { drawCalls: number; triangles: number };
}

interface WebGpuModule {
  WebGPURenderer: new (params: Record<string, unknown>) => WebGpuRendererLike;
}

interface WebGpuRendererLike {
  init(): Promise<void>;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(w: number, h: number, updateStyle?: boolean): void;
  setPixelRatio(v: number): void;
  autoClear: boolean;
  clearDepth(): void;
  backend?: { isWebGPUBackend?: boolean };
  info: { render: { drawCalls: number; triangles: number }; reset(): void; autoReset: boolean };
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: THREE.ColorSpace;
  dispose(): void;
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  preference: RendererPreference,
): Promise<RendererBundle> {
  const webgpuAvailable = await detectWebGPU();
  const wantWebGpu = preference === 'webgpu' || (preference === 'auto' && false);

  if (wantWebGpu && webgpuAvailable) {
    try {
      const bundle = await createWebGpuBundle(canvas, webgpuAvailable);
      if (bundle) return bundle;
    } catch (err) {
      console.warn('[render] WebGPU init failed, falling back to WebGL2:', err);
    }
  }

  const created: CreatedRenderer = createWebGLRenderer(canvas);
  created.info.webgpuAvailable = webgpuAvailable;
  const r = created.renderer;
  return {
    renderer: r,
    info: created.info,
    isWebGPU: false,
    render: (scene, camera) => r.render(scene, camera),
    renderOverlay: (scene, camera) => {
      r.autoClear = false;
      r.clearDepth();
      r.render(scene, camera);
      r.autoClear = true;
    },
    setSize: (w, h) => r.setSize(w, h, false),
    resetInfo: () => r.info.reset(),
    getStats: () => ({
      drawCalls: r.info.render.calls,
      triangles: r.info.render.triangles,
    }),
  };
}

async function createWebGpuBundle(
  canvas: HTMLCanvasElement,
  webgpuAvailable: boolean,
): Promise<RendererBundle | null> {
  const mod = (await import('three/webgpu')) as unknown as WebGpuModule;
  if (!mod?.WebGPURenderer) return null;

  const renderer = new mod.WebGPURenderer({
    canvas,
    antialias: false,
    forceWebGL: false,
    powerPreference: 'high-performance',
  });
  await renderer.init();

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const isWebGPU = renderer.backend?.isWebGPUBackend === true;

  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    info: {
      type: 'WebGPURenderer',
      backend: isWebGPU ? 'WebGPU' : 'WebGPURenderer · WebGL2 backend',
      webgpuAvailable,
    },
    isWebGPU,
    render: (scene, camera) => renderer.render(scene, camera),
    renderOverlay: (scene, camera) => {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
    },
    setSize: (w, h) => renderer.setSize(w, h, false),
    resetInfo: () => renderer.info.reset(),
    getStats: () => ({
      drawCalls: renderer.info.render.drawCalls,
      triangles: renderer.info.render.triangles,
    }),
  };
}
