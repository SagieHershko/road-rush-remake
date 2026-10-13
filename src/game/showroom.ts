import * as THREE from 'three';
import type { BikeSpec, RiderStyle } from './config';
import { makeBike, type BikeRig } from './models';

/** Rotating bike on a turntable, used behind the garage / shop / menu screens. */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private rig: BikeRig | null = null;
  private angle = 0.9;
  private model = '';
  private t = 0;
  dragging = false;

  constructor() {
    this.scene.background = new THREE.Color(0x14141c);
    this.scene.fog = new THREE.Fog(0x14141c, 10, 26);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x302820, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7a30, 1.4);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.2, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.5, metalness: 0.5 }),
    );
    floor.position.y = -0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshLambertMaterial({ color: 0x0c0c12 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.13;
    this.scene.add(ground);
    this.pivot.add(floor, ring);
    this.scene.add(this.pivot);
    this.camera.position.set(0, 1.5, 5.6);
    this.camera.lookAt(0, 0.75, 0);
  }

  set(spec: BikeSpec, paint: number, style: RiderStyle): void {
    if (this.model !== spec.model || !this.rig) {
      if (this.rig) this.pivot.remove(this.rig.root);
      this.rig = makeBike(spec.model, paint, style);
      this.rig.shadow.visible = false;
      this.rig.root.position.y = 0;
      this.pivot.add(this.rig.root);
      this.model = spec.model;
    }
    this.rig.setPaint(paint);
    this.rig.rider.setStyle(style);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    // slide the bike left on wide screens so the menu panel fits on the right
    const wide = w / h > 1.1;
    this.pivot.position.x = wide ? -0.9 : 0;
    this.camera.position.set(0, wide ? 1.5 : 1.9, wide ? 5.6 : 8.2);
    this.camera.lookAt(0, 0.75, 0);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.dragging) this.angle += dt * 0.45;
    if (this.rig) {
      this.rig.root.rotation.y = this.angle;
      this.rig.tilt.rotation.z = 0;
      this.rig.rider.update(0, 0, false);
      if (this.rig.wheelF) this.rig.wheelF.rotation.x = -this.t * 2;
      if (this.rig.wheelR) this.rig.wheelR.rotation.x = -this.t * 2;
    }
  }

  rotate(dx: number): void {
    this.angle += dx * 0.01;
  }
}
