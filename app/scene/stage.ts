import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface SceneColors {
  sky: string;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  sun: string;
  sunIntensity: number;
  hemiIntensity: number;
}

export const DAY: SceneColors = {
  sky: '#bfe0ea',
  fog: '#cfe6ec',
  hemiSky: '#e8f4ff',
  hemiGround: '#6f8a55',
  sun: '#fff1d6',
  sunIntensity: 2.4,
  hemiIntensity: 1.25,
};

export const NIGHT: SceneColors = {
  sky: '#122433',
  fog: '#16293a',
  hemiSky: '#8fa9cc',
  hemiGround: '#2f4232',
  sun: '#c4d5ff',
  sunIntensity: 1.5,
  hemiIntensity: 1.25,
};

const ELEVATION = Math.atan(1 / Math.SQRT2); // classic isometric angle (~35.26°)
const DISTANCE = 220;

export type Tick = (t: number, dt: number) => void;

/** Renderer, isometric camera with 90° rotation snaps, map controls, lights and the render loop. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labels = new CSS2DRenderer();
  readonly controls: MapControls;
  readonly sun = new THREE.DirectionalLight();
  readonly hemi = new THREE.HemisphereLight();
  private ticks: Tick[] = [];
  private azimuth = Math.PI / 4;
  private azimuthTarget = Math.PI / 4;
  private flight: { from: THREE.Vector3; to: THREE.Vector3; zoomFrom: number; zoomTo: number; t: number } | null = null;
  private timer = new THREE.Timer();
  private viewSize = 40;
  readonly reducedMotion: boolean;
  onZoom: (zoom: number) => void = () => {};

  constructor(private host: HTMLElement) {
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Isometric map of the Cardano technology landscape');
    this.renderer.domElement.setAttribute('role', 'img');

    this.labels.domElement.className = 'label-layer';
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minZoom = 0.35;
    this.controls.maxZoom = 6;
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.addEventListener('change', () => this.onZoom(this.camera.zoom));

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  setColors(c: SceneColors) {
    this.scene.background = new THREE.Color(c.sky);
    this.scene.fog = new THREE.Fog(c.fog, DISTANCE * 0.9, DISTANCE * 2.4);
    this.hemi.color.set(c.hemiSky);
    this.hemi.groundColor.set(c.hemiGround);
    this.hemi.intensity = c.hemiIntensity;
    this.sun.color.set(c.sun);
    this.sun.intensity = c.sunIntensity;
  }

  /** Fit the shadow camera and initial view to the island. */
  frame(bounds: { minX: number; minY: number; maxX: number; maxY: number }, focus: THREE.Vector3) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minY + bounds.maxY) / 2;
    const half = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 12;
    this.sun.position.set(cx - 60, 120, cz - 90);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 400;
    sc.updateProjectionMatrix();
    this.viewSize = 26;
    this.controls.target.copy(focus);
    this.camera.zoom = 1;
    this.placeCamera();
    this.resize();
  }

  private placeCamera() {
    const t = this.controls.target;
    const r = DISTANCE;
    this.camera.position.set(
      t.x + Math.sin(this.azimuth) * Math.cos(ELEVATION) * r,
      t.y + Math.sin(ELEVATION) * r,
      t.z + Math.cos(this.azimuth) * Math.cos(ELEVATION) * r,
    );
    this.camera.lookAt(t);
  }

  rotate(direction: 1 | -1) {
    this.azimuthTarget += (direction * Math.PI) / 2;
    if (this.reducedMotion) this.azimuth = this.azimuthTarget;
  }

  flyTo(target: THREE.Vector3, zoom = 2.2) {
    const to = target.clone();
    if (this.reducedMotion) {
      this.controls.target.copy(to);
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
      this.placeCamera();
      return;
    }
    this.flight = { from: this.controls.target.clone(), to, zoomFrom: this.camera.zoom, zoomTo: Math.max(this.camera.zoom, zoom), t: 0 };
  }

  addTick(tick: Tick) {
    this.ticks.push(tick);
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    const aspect = w / h;
    // Show more of the island on narrow (portrait) screens.
    const size = aspect < 1 ? this.viewSize / Math.max(aspect, 0.55) : this.viewSize;
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  start() {
    const loop = (now: number) => {
      this.timer.update(now);
      const dt = Math.min(this.timer.getDelta(), 0.1);
      const t = this.timer.getElapsed();
      if (Math.abs(this.azimuthTarget - this.azimuth) > 1e-4) {
        this.azimuth += (this.azimuthTarget - this.azimuth) * Math.min(1, dt * 7);
        this.placeCamera();
      }
      if (this.flight) {
        const f = this.flight;
        f.t = Math.min(1, f.t + dt * 1.4);
        const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
        this.controls.target.lerpVectors(f.from, f.to, e);
        this.camera.zoom = f.zoomFrom + (f.zoomTo - f.zoomFrom) * e;
        this.camera.updateProjectionMatrix();
        this.placeCamera();
        this.onZoom(this.camera.zoom);
        if (f.t >= 1) this.flight = null;
      }
      this.controls.update();
      for (const tick of this.ticks) tick(t, dt);
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
