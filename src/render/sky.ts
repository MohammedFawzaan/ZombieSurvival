import * as THREE from 'three';

const SKY_VERT = `
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const SKY_FRAG = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uHaze;
uniform float uCloudCover;
uniform float uCloudTime;
uniform float uStarAmount;
varying vec3 vWorldDirection;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * valueNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  float h = dir.y;

  float t = clamp(pow(max(h, 0.0), 0.42), 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, t);

  float below = clamp(-h * 3.2, 0.0, 1.0);
  sky = mix(sky, uGround, below);

  float upper = smoothstep(0.02, 0.35, h);

  if (uStarAmount > 0.001 && h > 0.0) {
    vec2 sp = dir.xz / max(h + 0.28, 0.001) * 14.0;
    float star = hash21(floor(sp * 8.0));
    float twinkle = 0.75 + 0.25 * sin(uCloudTime * 2.1 + star * 43.0);
    float pt = smoothstep(0.9955, 0.9995, star) * twinkle;
    sky += vec3(0.85, 0.9, 1.0) * pt * uStarAmount * upper;
  }

  float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
  float disc = smoothstep(0.9986, 0.9995, sunDot);
  float glow = pow(sunDot, 220.0) * 0.55 + pow(sunDot, 12.0) * 0.16;
  float horizonHaze = pow(1.0 - clamp(abs(h) * 2.4, 0.0, 1.0), 2.2) * uHaze;

  float discMask = 1.0 - uCloudCover * 0.92;
  vec3 color = sky + uSunColor * (glow + disc * 14.0) * uSunIntensity * discMask;

  if (uCloudCover > 0.001 && h > 0.0) {
    vec2 cp = dir.xz / max(h + 0.18, 0.001) * 1.5;
    cp += vec2(uCloudTime * 0.012, uCloudTime * 0.005);
    float n = fbm(cp);
    float edge = mix(0.78, 0.18, uCloudCover);
    float mask = smoothstep(edge, edge + 0.32, n) * upper;
    vec3 lit = mix(uHorizon, uSunColor, 0.16) * (0.62 + 0.38 * uSunIntensity * 0.3);
    vec3 dark = mix(uZenith, uHorizon, 0.45) * 0.72;
    vec3 cloud = mix(dark, lit, smoothstep(edge, edge + 0.5, n));
    color = mix(color, cloud, clamp(mask * (0.35 + 0.65 * uCloudCover), 0.0, 0.95));
  }

  color = mix(color, uHorizon * 1.06, horizonHaze * 0.55);

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface AtmosphereState {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
}

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    uZenith: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uGround: { value: THREE.Color };
    uSunDirection: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uSunIntensity: { value: number };
    uHaze: { value: number };
    uCloudCover: { value: number };
    uCloudTime: { value: number };
    uStarAmount: { value: number };
  };

  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2c4d78) },
      uHorizon: { value: new THREE.Color(0x9ba79c) },
      uGround: { value: new THREE.Color(0x2a2b22) },
      uSunDirection: { value: new THREE.Vector3(0.4, 0.5, 0.6).normalize() },
      uSunColor: { value: new THREE.Color(0xffe3b8) },
      uSunIntensity: { value: 1 },
      uHaze: { value: 0.85 },
      uCloudCover: { value: 0.12 },
      uCloudTime: { value: 0 },
      uStarAmount: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: true,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  update(
    state: AtmosphereState,
    zenith: THREE.Color,
    horizon: THREE.Color,
    haze: number,
    cloudCover = 0,
    cloudTime = 0,
    starAmount = 0,
    ground?: THREE.Color,
  ): void {
    this.uniforms.uSunDirection.value.copy(state.sunDirection);
    this.uniforms.uSunColor.value.copy(state.sunColor);
    this.uniforms.uSunIntensity.value = state.sunIntensity;
    this.uniforms.uZenith.value.copy(zenith);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uHaze.value = haze;
    this.uniforms.uCloudCover.value = cloudCover;
    this.uniforms.uCloudTime.value = cloudTime;
    this.uniforms.uStarAmount.value = starAmount;
    if (ground) this.uniforms.uGround.value.copy(ground);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const MIN_SHADOW_ELEVATION = 0.26;
const SHADOW_ELEVATION_STEPS = 12;

export function shadowExtent(distance: number, sunElevation: number): number {
  const e = Math.max(Math.abs(sunElevation), MIN_SHADOW_ELEVATION);
  const stretch = Math.min(1 / e, 1 / MIN_SHADOW_ELEVATION);
  return distance * 0.6 * (0.72 + 0.28 * stretch);
}

export function quantiseElevation(sunElevation: number): number {
  const e = Math.max(Math.abs(sunElevation), MIN_SHADOW_ELEVATION);
  return Math.round(e * SHADOW_ELEVATION_STEPS) / SHADOW_ELEVATION_STEPS;
}

export class Atmosphere {
  readonly state: AtmosphereState = {
    sunDirection: new THREE.Vector3(0.38, 0.82, 0.42).normalize(),
    sunColor: new THREE.Color(0xfff1d8),
    sunIntensity: 3.15,
    ambientColor: new THREE.Color(0x9fb3c8),
    ambientIntensity: 1.35,
    fogColor: new THREE.Color(0xb3bdb4),
    fogDensity: 0.0062,
  };

  readonly zenith = new THREE.Color(0x4a7bb0);
  readonly horizon = new THREE.Color(0xc2c9bd);
  haze = 0.7;

  readonly sun: THREE.DirectionalLight;
  readonly ambient: THREE.HemisphereLight;
  readonly fill: THREE.DirectionalLight;
  readonly sky: Sky;
  private shadowMapSize: number;
  private lastFocusX = Infinity;
  private lastFocusZ = Infinity;
  private lastFocusY = Infinity;
  private sunMoved = true;
  shadowExtentCurrent: number;
  private lastQuantisedElevation = Infinity;
  private lastShadowDistance: number;
  cloudCover = 0.12;
  cloudTime = 0;
  starAmount = 0;
  shadowStrength = 1;
  readonly groundColor = new THREE.Color(0x2a2b22);

  constructor(shadowMapSize: number, shadowDistance: number) {
    this.sky = new Sky();
    this.shadowMapSize = shadowMapSize;
    this.lastShadowDistance = shadowDistance;
    this.shadowExtentCurrent = shadowExtent(shadowDistance, 1);

    this.sun = new THREE.DirectionalLight(this.state.sunColor, this.state.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.045;
    this.configureShadowFrustum(shadowDistance);

    this.ambient = new THREE.HemisphereLight(0xaecbe8, 0x5c5a42, this.state.ambientIntensity);

    this.fill = new THREE.DirectionalLight(0x8fa8c6, 0.6);
    this.fill.position.set(-0.5, 0.42, -0.7);
    this.fill.castShadow = false;
  }

  setShadowMapSize(size: number): void {
    this.shadowMapSize = size;
    this.invalidateShadows();
  }

  /** Force a shadow re-render on the next update. */
  invalidateShadows(): void {
    this.sunMoved = true;
    this.lastFocusX = Infinity;
    this.lastFocusZ = Infinity;
    this.lastFocusY = Infinity;
  }

  configureShadowFrustum(distance: number, sunElevation = 1): void {
    const cam = this.sun.shadow.camera;
    const extent = shadowExtent(distance, sunElevation);
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = distance * 3.2 + extent * 2.6;
    cam.updateProjectionMatrix();
    this.shadowExtentCurrent = extent;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.sky.mesh);
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.ambient);
    scene.add(this.fill);
    scene.fog = new THREE.FogExp2(this.state.fogColor.getHex(), this.state.fogDensity);
    scene.background = null;
  }

  update(
    scene: THREE.Scene,
    cameraPos: THREE.Vector3,
    shadowDistance: number,
    dynamicCastersMoved = true,
  ): void {
    const s = this.state;
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.ambient.intensity = s.ambientIntensity;

    const d = s.sunDirection;

    const qElevation = quantiseElevation(d.y);
    if (qElevation !== this.lastQuantisedElevation || shadowDistance !== this.lastShadowDistance) {
      this.lastQuantisedElevation = qElevation;
      this.lastShadowDistance = shadowDistance;
      this.configureShadowFrustum(shadowDistance, qElevation);
      this.sunMoved = true;
    }

    const extent = this.shadowExtentCurrent;
    const texel = (extent * 2) / this.shadowMapSize;
    const snap = (v: number) => Math.round(v / texel) * texel;
    const focusX = snap(cameraPos.x);
    const focusZ = snap(cameraPos.z);
    const focusY = snap(cameraPos.y);

    const anchorX = focusX + d.x * shadowDistance * 0.42;
    const anchorZ = focusZ + d.z * shadowDistance * 0.42;
    this.sun.target.position.set(focusX, focusY - 1.2, focusZ);
    this.sun.position.set(
      anchorX + d.x * shadowDistance,
      focusY + d.y * shadowDistance,
      anchorZ + d.z * shadowDistance,
    );
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();

    const focusMoved =
      focusX !== this.lastFocusX || focusZ !== this.lastFocusZ || focusY !== this.lastFocusY;
    this.lastFocusX = focusX;
    this.lastFocusZ = focusZ;
    this.lastFocusY = focusY;
    this.sun.shadow.needsUpdate = focusMoved || this.sunMoved || dynamicCastersMoved;
    this.sunMoved = false;

    this.sky.mesh.position.copy(cameraPos);
    this.sky.update(
      s,
      this.zenith,
      this.horizon,
      this.haze,
      this.cloudCover,
      this.cloudTime,
      this.starAmount,
      this.groundColor,
    );

    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(s.fogColor);
      fog.density = s.fogDensity;
    }
  }

  dispose(): void {
    this.sky.dispose();
  }
}
