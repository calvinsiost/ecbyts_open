export interface ThreeLikeObject3D {
    uuid?: string;
    name?: string;
    type?: string;
    visible?: boolean;
    userData?: Record<string, unknown>;
    children?: ThreeLikeObject3D[];
}

export interface ThreeLikeScene extends ThreeLikeObject3D {
    isScene?: boolean;
}

export interface ThreeLikeCamera extends ThreeLikeObject3D {
    isCamera?: boolean;
}

export interface ThreeRenderContext {
    scene?: ThreeLikeScene;
    camera?: ThreeLikeCamera;
    renderer?: unknown;
}
