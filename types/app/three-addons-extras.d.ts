// Stubs para Three.js addons não cobertos por three-addons.d.ts (audit W68 risky-import 2026-05-14).
// Sources: meshFactory.js (GLTFLoader, MeshoptDecoder), gizmoController.js (TransformControls).

declare module 'three/addons/loaders/GLTFLoader.js' {
    export class GLTFLoader {
        constructor(manager?: unknown);
        load(
            url: string,
            onLoad: (gltf: {
                scene: unknown;
                scenes: unknown[];
                animations: unknown[];
                cameras: unknown[];
                asset: unknown;
            }) => void,
            onProgress?: (e: ProgressEvent) => void,
            onError?: (e: unknown) => void,
        ): void;
        setMeshoptDecoder(decoder: unknown): this;
        setDRACOLoader(loader: unknown): this;
        parseAsync(data: ArrayBuffer, path: string): Promise<unknown>;
    }
}

declare module 'three/addons/libs/meshopt_decoder.module.js' {
    export const MeshoptDecoder: {
        ready: Promise<void>;
        supported: boolean;
        decodeGltfBuffer(
            target: Uint8Array,
            count: number,
            size: number,
            source: Uint8Array,
            mode: string,
            filter?: string,
        ): void;
    };
}

declare module 'three/addons/controls/TransformControls.js' {
    import * as THREE from 'three';
    export class TransformControls extends THREE.Object3D {
        constructor(camera: unknown, domElement?: HTMLElement);
        attach(object: unknown): this;
        detach(): this;
        setMode(mode: 'translate' | 'rotate' | 'scale'): void;
        setSpace(space: 'world' | 'local'): void;
        setSize(size: number): void;
        setTranslationSnap(snap: number | null): void;
        setRotationSnap(snap: number | null): void;
        setScaleSnap(snap: number | null): void;
        addEventListener(type: string, listener: (event: unknown) => void): void;
        removeEventListener(type: string, listener: (event: unknown) => void): void;
        dispose(): void;
        enabled: boolean;
        visible: boolean;
    }
}

declare module 'three/addons/renderers/CSS2DRenderer.js' {
    import * as THREE from 'three';
    export class CSS2DObject extends THREE.Object3D {
        constructor(element?: HTMLElement);
        element: HTMLElement;
        center: { x: number; y: number; set(x: number, y: number): void };
        layers: { set(channel: number): void; enable(channel: number): void };
        [key: string]: any;
    }
    export class CSS2DRenderer {
        constructor(parameters?: { element?: HTMLElement });
        domElement: HTMLElement;
        setSize(width: number, height: number): void;
        render(scene: unknown, camera: unknown): void;
    }
}
