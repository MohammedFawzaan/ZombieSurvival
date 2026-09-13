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
varying vec3 vWorldDirection;

void main() {
  vec3 dir = normalize(vWorldDirection);
  float h = dir.y;

  float t = clamp(pow(max(h, 0.0), 0.42), 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, t);

  float below = clamp(-h * 3.2, 0.0, 1.0);
  sky = mix(sky, uGround, below);

  float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
  float disc = smoothstep(0.9986, 0.9995, sunDot);
  float glow = pow(sunDot, 220.0) * 0.55 + pow(sunDot, 12.0) * 0.16;
  float horizonHaze = pow(1.0 - clamp(abs(h) * 2.4, 0.0, 1.0), 2.2) * uHaze;

  vec3 color = sky + uSunColor * (glow + disc * 14.0) * uSunIntensity;
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

  update(state: AtmosphereState, zenith: THREE.Color, horizon: THREE.Color, haze: number): void {
    this.uniforms.uSunDirection.value.copy(state.sunDirection);
    this.uniforms.uSunColor.value.copy(state.sunColor);
    this.uniforms.uSunIntensity.value = state.sunIntensity;
    this.uniforms.uZenith.value.copy(zenith);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uHaze.value = haze;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
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

  constructor(shadowMapSize: number, shadowDistance: number) {
    this.sky = new Sky();
    this.shadowMapSize = shadowMapSize;

    this.sun = new THREE.DirectionalLight(this.state.sunColor, this.state.sunIntensity);
    this.sun.castShadow = true;
    // needsUpdate is only consulted when autoUpdate is off, so drive the
    // shadow pass manually and re-render it only when something moved.
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

  configureShadowFrustum(distance: number): void {
    const cam = this.sun.shadow.camera;
    const extent = distance * 0.6;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = distance * 3.2;
    cam.updateProjectionMatrix();
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

    // The shadow frustum is snapped to a texel-sized grid. Letting it follow
    // the camera continuously re-renders the whole shadow map every frame and
    // makes shadow edges crawl; snapping keeps both stable while walking.
    const extent = shadowDistance * 0.6;
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

    // With the frustum snapped, the shadow map only needs re-rendering when
    // the snapped focus actually moves to a new texel. Standing still or
    // making small movements then costs nothing.
    const focusMoved =
      focusX !== this.lastFocusX || focusZ !== this.lastFocusZ || focusY !== this.lastFocusY;
    this.lastFocusX = focusX;
    this.lastFocusZ = focusZ;
    this.lastFocusY = focusY;
    this.sun.shadow.needsUpdate = focusMoved || this.sunMoved || dynamicCastersMoved;
    this.sunMoved = false;

    this.sky.mesh.position.copy(cameraPos);
    this.sky.update(s, this.zenith, this.horizon, this.haze);

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
