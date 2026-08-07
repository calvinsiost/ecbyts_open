// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

let _THREE: any = null;
let _OrbitControls: any = null;
let _promise: Promise<any> | null = null;

export function loadTHREE(): Promise<any> {
    if (!_promise) {
        _promise = Promise.all([
            import('three' as string),
            import('three/addons/controls/OrbitControls.js' as string),
        ]).then(([three, orbit]: any[]) => {
            _THREE = three;
            _OrbitControls = orbit.OrbitControls;
            return _THREE;
        });
    }
    return _promise;
}

export function getTHREE(): any {
    if (!_THREE) {
        throw new Error('[three-lazy] three.js not loaded — call loadTHREE() before using 3D functions');
    }
    return _THREE;
}

export function getOrbitControls(): any {
    if (!_OrbitControls) {
        throw new Error('[three-lazy] OrbitControls not loaded — call loadTHREE() first');
    }
    return _OrbitControls;
}

export function isTHREELoaded(): boolean {
    return _THREE !== null;
}

export function createTHREEProxy(): any {
    let _cached: any = null;
    return new Proxy({} as any, {
        get: (_t: any, p: string | symbol) => {
            if (!_cached) _cached = getTHREE();
            return _cached[p];
        },
    });
}
