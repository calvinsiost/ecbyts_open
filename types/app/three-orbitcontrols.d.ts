declare module 'three/addons/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(object: unknown, domElement?: HTMLElement);
    enabled: boolean;
    target: unknown;
    update(): boolean;
    dispose(): void;
  }
}
