// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

export interface TraversableObject3D {
    visible: boolean;
    userData?: {
        temporalX?: number;
    };
    traverse?: (callback: (obj: TraversableObject3D) => void) => void;
}

/**
 * Apply temporal clipping to objects in the scene.
 * Objects with userData.temporalX are hidden if temporalX > xCurrent.
 */
export function applyTemporalClip(scene: TraversableObject3D | null | undefined, xCurrent: number): void {
    if (!scene || typeof scene.traverse !== 'function') return;

    scene.traverse((object) => {
        if (object.userData && object.userData.temporalX !== undefined) {
            object.visible = object.userData.temporalX <= xCurrent;
        }
    });
}
