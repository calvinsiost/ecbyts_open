declare module 'three' {
    export class BufferAttribute {
        constructor(array: ArrayLike<number>, itemSize: number);
        count: number;
        needsUpdate: boolean;
        getX(index: number): number;
        getY(index: number): number;
        setXY(index: number, x: number, y: number): void;
    }

    export class BufferGeometry {
        setAttribute(name: string, attribute: BufferAttribute): this;
        computeVertexNormals(): void;
        attributes: {
            uv?: BufferAttribute;
            [name: string]: BufferAttribute | undefined;
        };
    }

    export interface Euler {
        set(x: number, y: number, z: number): void;
    }

    export interface Object3D {
        rotation: Euler;
    }
}
