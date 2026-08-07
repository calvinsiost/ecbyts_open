// @ts-check
export interface RendererLike {
    domElement: HTMLCanvasElement;
    getPixelRatio(): number;
    getScissorTest(): boolean;
    getScissor(target: unknown): unknown;
    getViewport(target: unknown): unknown;
    setScissorTest(value: boolean): void;
    setScissor(...args: unknown[]): void;
    setViewport(...args: unknown[]): void;
    render(...args: unknown[]): void;
}

export interface CameraLike {
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
    zoom: number;
    position: VectorLike;
    lookAt(x: number, y: number, z: number): void;
    getWorldDirection(target: unknown): unknown;
    updateProjectionMatrix(): void;
}

export interface VectorLike {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): void;
}

export interface ControlsLike {
    enabled: boolean;
    target: VectorLike;
    enableDamping: boolean;
    enableRotate: boolean;
    minPolarAngle: number;
    maxPolarAngle: number;
    update(): void;
    addEventListener(type: string, listener: (...args: any[]) => void): void;
    removeEventListener(type: string, listener: (...args: any[]) => void): void;
}

export interface SceneLike {
    fog?: {
        near: number;
        far: number;
    } | null;
    add(object: unknown): void;
    remove(object: unknown): void;
}

export function getRenderer(...args: unknown[]): RendererLike;
export function initScene(...args: unknown[]): unknown;
export function getCamera(...args: unknown[]): CameraLike;
export function getScene(...args: unknown[]): SceneLike;
export function getControls(...args: unknown[]): ControlsLike | null;
export function getElementsGroup(...args: unknown[]): any;
export function getInterpolationGroup(...args: unknown[]): any;
export function getVoxelGroup(...args: unknown[]): any;
export function getIssuesGroup(...args: unknown[]): any;
export function getPhotoMarkersGroup(...args: unknown[]): any;
export function getEditHandlesGroup(...args: unknown[]): any;
export function setOutlineSelection(...args: unknown[]): unknown;
export function clearOutlineSelection(...args: unknown[]): unknown;
export function addRenderHook(...args: unknown[]): unknown;
export function addResizeHook(fn: (...args: any[]) => void): unknown;
export function requestRender(...args: unknown[]): unknown;
export function setModelExtent(extent: number): void;
export function scheduleResizeSync(...args: unknown[]): unknown;
export function handleResize(...args: unknown[]): unknown;
export function animate(...args: unknown[]): unknown;
export function wakeRenderLoop(...args: unknown[]): unknown;
export function applyQualityTier(...args: unknown[]): any;
export function getCurrentQualityTier(...args: unknown[]): any;
export function initPostProcessing(...args: unknown[]): Promise<any>;
