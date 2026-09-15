import * as THREE from 'three';

const RAIN_VERT = `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uCamera;
uniform float uRadius;
uniform float uHeight;
uniform float uFallSpeed;
uniform vec2 uWind;
attribute vec3 seed;
varying float vFade;
varying float vStreak;

void main() {
  float onFlag = step(seed.z, uIntensity);

  float span = uHeight;
  float fall = uTime * uFallSpeed * (0.75 + seed.z * 0.5);
  float y = span - mod(fall + seed.z * span, span);

  vec2 cell = seed.xy * 2.0 - 1.0;
  vec2 base = cell * uRadius;

  vec2 origin = floor(uCamera.xz / (uRadius * 2.0) + 0.5) * (uRadius * 2.0);
  vec2 pos = origin + base + uWind * (span - y) * 0.12;

  vec3 world = vec3(pos.x, uCamera.y + y - uHeight * 0.35, pos.y);

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = -mv.z;

  vFade = onFlag * smoothstep(0.0, 6.0, dist) * (1.0 - smoothstep(uRadius * 0.55, uRadius, dist));
  vStreak = 1.0;

  gl_PointSize = onFlag * mix(0.6, 1.25, seed.z) * (210.0 / max(dist, 0.001));
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
varying float vStreak;

void main() {
  if (vFade <= 0.001) discard;
  vec2 p = gl_PointCoord - 0.5;
  float streak = 1.0 - smoothstep(0.0, 0.5, abs(p.x) * 3.2);
  float along = 1.0 - smoothstep(0.0, 0.5, abs(p.y));
  float a = streak * along * vFade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const SPLASH_VERT = `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uCamera;
uniform float uRadius;
attribute vec3 seed;
varying float vFade;

void main() {
  float onFlag = step(seed.z, uIntensity);
  float cycle = fract(uTime * 1.6 + seed.z * 7.31);

  vec2 cell = seed.xy * 2.0 - 1.0;
  vec2 origin = floor(uCamera.xz / (uRadius * 2.0) + 0.5) * (uRadius * 2.0);
  vec2 pos = origin + cell * uRadius;

  vec3 world = vec3(pos.x, uCamera.y - 1.55, pos.y);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float dist = -mv.z;

  vFade = onFlag * (1.0 - cycle) * (1.0 - smoothstep(uRadius * 0.4, uRadius * 0.8, dist));
  gl_PointSize = onFlag * (0.8 + cycle * 2.6) * (70.0 / max(dist, 0.001));
  gl_Position = projectionMatrix * mv;
}
`;

const SPLASH_FRAG = `
uniform vec3 uColor;
varying float vFade;

void main() {
  if (vFade <= 0.001) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float ring = smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
  float a = ring * vFade * 0.5;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export interface RainQuality {
  rainEnabled: boolean;
  rainDropCount: number;
  rainSplashes: boolean;
}

interface RainUniforms {
  uTime: { value: number };
  uIntensity: { value: number };
  uCamera: { value: THREE.Vector3 };
  uRadius: { value: number };
  uHeight: { value: number };
  uFallSpeed: { value: number };
  uWind: { value: THREE.Vector2 };
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
}

interface SplashUniforms {
  uTime: { value: number };
  uIntensity: { value: number };
  uCamera: { value: THREE.Vector3 };
  uRadius: { value: number };
  uColor: { value: THREE.Color };
}

export class WeatherFx {
  readonly group = new THREE.Group();

  private rain: THREE.Points | null = null;
  private splash: THREE.Points | null = null;
  private rainUniforms: RainUniforms | null = null;
  private splashUniforms: SplashUniforms | null = null;

  private time = 0;
  private intensity = 0;
  private dropCount = 0;
  private enabled = false;
  private splashesEnabled = false;

  constructor(quality: RainQuality) {
    this.group.name = 'weatherFx';
    this.group.frustumCulled = false;
    this.applyQuality(quality);
  }

  applyQuality(quality: RainQuality): void {
    const wantCount = quality.rainEnabled ? Math.max(0, quality.rainDropCount | 0) : 0;
    this.enabled = quality.rainEnabled && wantCount > 0;
    this.splashesEnabled = this.enabled && quality.rainSplashes;

    if (wantCount !== this.dropCount) {
      this.disposeMeshes();
      this.dropCount = wantCount;
      if (this.enabled) this.build(wantCount);
    }

    if (this.splash) this.splash.visible = this.splashesEnabled && this.intensity > 0.001;
    if (this.rain) this.rain.visible = this.enabled && this.intensity > 0.001;
  }

  private build(count: number): void {
    const seeds = new Float32Array(count * 3);
    let s = 0x2f6e2b1;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      seeds[i * 3 + 0] = rnd();
      seeds[i * 3 + 1] = rnd();
      seeds[i * 3 + 2] = rnd();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.rainUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uRadius: { value: 26 },
      uHeight: { value: 24 },
      uFallSpeed: { value: 17 },
      uWind: { value: new THREE.Vector2(1.4, 0.6) },
      uColor: { value: new THREE.Color(0xc8d6e4) },
      uOpacity: { value: 0.5 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });

    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 14;
    this.rain.visible = false;
    this.group.add(this.rain);

    const splashCount = Math.max(1, Math.floor(count * 0.18));
    const sSeeds = new Float32Array(splashCount * 3);
    for (let i = 0; i < splashCount * 3; i++) sSeeds[i] = rnd();
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(splashCount * 3), 3));
    sGeo.setAttribute('seed', new THREE.BufferAttribute(sSeeds, 3));
    sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.splashUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uRadius: { value: 16 },
      uColor: { value: new THREE.Color(0xbfd0de) },
    };

    const sMat = new THREE.ShaderMaterial({
      uniforms: this.splashUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });

    this.splash = new THREE.Points(sGeo, sMat);
    this.splash.frustumCulled = false;
    this.splash.renderOrder = 13;
    this.splash.visible = false;
    this.group.add(this.splash);
  }

  reset(): void {
    this.intensity = 0;
    if (this.rain) this.rain.visible = false;
    if (this.splash) this.splash.visible = false;
  }

  update(
    dt: number,
    rainIntensity: number,
    cameraPos: THREE.Vector3,
    tint: THREE.Color,
    daylight: number,
  ): void {
    this.intensity = rainIntensity;

    if (!this.enabled || !this.rain || !this.rainUniforms) return;

    const visible = rainIntensity > 0.001;
    this.rain.visible = visible;
    if (this.splash) this.splash.visible = visible && this.splashesEnabled;
    if (!visible) return;

    this.time += dt;

    const u = this.rainUniforms;
    u.uTime.value = this.time;
    u.uIntensity.value = rainIntensity;
    u.uCamera.value.copy(cameraPos);
    u.uColor.value.copy(tint);
    u.uOpacity.value = 0.28 + 0.34 * rainIntensity * (0.55 + 0.45 * daylight);

    if (this.splash && this.splashUniforms) {
      const su = this.splashUniforms;
      su.uTime.value = this.time;
      su.uIntensity.value = rainIntensity;
      su.uCamera.value.copy(cameraPos);
      su.uColor.value.copy(tint);
    }
  }

  get activeDropCount(): number {
    if (!this.enabled || this.intensity <= 0.001) return 0;
    return Math.round(this.dropCount * Math.min(this.intensity, 1));
  }

  private disposeMeshes(): void {
    for (const p of [this.rain, this.splash]) {
      if (!p) continue;
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
      this.group.remove(p);
    }
    this.rain = null;
    this.splash = null;
    this.rainUniforms = null;
    this.splashUniforms = null;
  }

  dispose(): void {
    this.disposeMeshes();
  }
}
