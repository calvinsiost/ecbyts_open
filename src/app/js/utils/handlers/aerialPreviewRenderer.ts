// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type DrawFeatureOutline = (
    ctx: any,
    feature: any,
    extent: any,
    canvasWidth: number,
    canvasHeight: number,
    selected: boolean,
    total: number,
    familyColors: any,
    familyLabels: any,
) => void;

type DrawAnnotationMarker = (
    ctx: any,
    x: number,
    y: number,
    family: any,
    label: number,
    familyColors: any,
) => void;

export interface AerialDetectedFeatureOverlaysArgs {
    ctx?: any;
    detectedFeatures?: any[];
    selectedFeatures?: any[];
    extent?: any;
    canvasWidth?: number;
    canvasHeight?: number;
    familyColors?: any;
    familyLabels?: any;
    drawFeatureOutline?: DrawFeatureOutline;
}

export interface AerialAnnotation {
    nx: number;
    ny: number;
    family: any;
}

export interface AerialAnnotationOverlaysArgs {
    ctx?: any;
    annotations?: AerialAnnotation[];
    canvasWidth?: number;
    canvasHeight?: number;
    familyColors?: any;
    drawAnnotationMarker?: DrawAnnotationMarker;
}

export function drawAerialDetectedFeatureOverlays(arg?: AerialDetectedFeatureOverlaysArgs | null): void {
    const {
        ctx,
        detectedFeatures = [],
        selectedFeatures = [],
        extent,
        canvasWidth,
        canvasHeight,
        familyColors,
        familyLabels,
        drawFeatureOutline,
    } = arg || {};
    const total = detectedFeatures.length;
    if (!total || !extent) return;

    const drawPass = (selected: boolean): void => {
        for (let index = 0; index < total; index++) {
            if (Boolean(selectedFeatures[index]) !== selected) continue;
            drawFeatureOutline!(
                ctx,
                detectedFeatures[index],
                extent,
                canvasWidth!,
                canvasHeight!,
                selected,
                total,
                familyColors,
                familyLabels,
            );
        }
    };

    drawPass(false);
    drawPass(true);
}

export function drawAerialAnnotationOverlays(arg?: AerialAnnotationOverlaysArgs | null): void {
    const { ctx, annotations = [], canvasWidth, canvasHeight, familyColors, drawAnnotationMarker } = arg || {};
    for (const [index, annotation] of annotations.entries()) {
        drawAnnotationMarker!(
            ctx,
            annotation.nx * canvasWidth!,
            annotation.ny * canvasHeight!,
            annotation.family,
            index + 1,
            familyColors,
        );
    }
}
