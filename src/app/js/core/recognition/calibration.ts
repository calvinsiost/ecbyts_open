// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   CALIBRATION — Auto-calibration & slider↔threshold mapping
   ================================================================

   Modulo de calibracao para o algoritmo de analise de cores aereas.
   Converte sliders normalizados (0-100) em limiares brutos usados
   pelo classifyPixel. Inclui auto-calibracao via histogramas.

   Slider=50 sempre produz o comportamento padrao (hardcoded).

   ================================================================ */

import { excessGreen, shadowIndex, otsuThreshold } from './indices.js';

// ----------------------------------------------------------------
// DEFAULT CALIBRATION - All sliders at neutral position
// Posicao neutra: produz exatamente os limiares hardcoded originais
// ----------------------------------------------------------------

export const DEFAULT_CALIBRATION = Object.freeze({
    shadowSensitivity: 50, // 0-100 → C3 threshold + luminance ceiling
    vegetationSensitivity: 65, // 0-100 → ExG threshold (benchmark R2: 65-70 optimal)
    buildingBrightness: 50, // 0-100 → sat cap + lum ranges (benchmark R2: 40-50 optimal)
    waterSensitivity: 50, // 0-100 → water saturation floor
    featureSize: 50, // 0-100 → MIN_AREA multiplier
    edgeSharpness: 50, // 0-100 → edge density thresholds
    maxFeatures: 30, // 5-100 → direct cap (benchmark: 25 too restrictive)
});

// ----------------------------------------------------------------
// LINEAR INTERPOLATION
// ----------------------------------------------------------------

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

// ----------------------------------------------------------------
// MAP SLIDERS → RAW THRESHOLDS
// Converte valores 0-100 dos sliders em limiares usados pela pipeline
// ----------------------------------------------------------------

/**
 * Convert calibration sliders to raw thresholds.
 * Cada slider mapeia linearmente de "strict" (0) para "aggressive" (100),
 * com o valor 50 produzindo o limiar default original.
 *
 * @param cal - CalibrationParams (0-100 values)
 * @returns Raw thresholds for the analysis pipeline
 */
export function mapToThresholds(cal: Record<string, any>): object {
    const s = (cal.shadowSensitivity ?? 50) / 100;
    const v = (cal.vegetationSensitivity ?? 50) / 100;
    const b = (cal.buildingBrightness ?? 50) / 100;
    const w = (cal.waterSensitivity ?? 50) / 100;
    const f = (cal.featureSize ?? 50) / 100;
    const e = (cal.edgeSharpness ?? 50) / 100;

    return {
        // Shadow: slider=0 → strict (C3>1.2, lum<20), slider=50 → default, slider=100 → aggressive
        shadow: {
            c3: lerp(1.2, 0.55, s),
            lum: lerp(20, 65, s),
        },
        // Vegetation: ExG threshold - strict=0.20, default=0.08, aggressive=0.01
        vegetation: {
            exg: lerp(0.2, 0.01, v),
        },
        // Building brightness: saturation cap and luminance ranges
        building: {
            satCap: lerp(10, 28, b), // S < this → building candidate
            brightLumFloor: lerp(78, 62, b), // bright buildings: L > this
            darkLumFloor: lerp(8, 16, b), // dark buildings: L >= this
            darkLumCeil: lerp(48, 62, b), // dark buildings: L <= this
            infraSatCap: lerp(10, 20, b), // infrastructure: S < this
            infraLumFloor: lerp(42, 54, b), // infrastructure: L > this
            infraLumCeil: lerp(72, 72, b), // infrastructure: L <= this
        },
        // Water: saturation floor
        water: {
            satFloor: lerp(20, 3, w), // S > this → water candidate
        },
        // Feature size: MIN_AREA multiplier
        minAreaMultiplier: lerp(2.0, 0.3, f),
        // Edge density thresholds
        edgeDensity: {
            discard: lerp(0.01, 0.06, e), // Below → discard as shadow
            boost: lerp(0.1, 0.2, e), // Above → confidence boost
        },
        // Max features (direct pass-through)
        maxFeatures: cal.maxFeatures ?? 25,
    };
}

// ----------------------------------------------------------------
// AUTO-CALIBRATION - Histogram analysis for optimal slider values
// Analisa histogramas da imagem para estimar sliders ideais
// ----------------------------------------------------------------

/**
 * Auto-calibrate slider values from image pixel data.
 * Faz uma unica passagem pela imagem (512x512 ≈ 262K pixels) para:
 * 1. Histograma de luminancia → Otsu → ajuste de sombra
 * 2. Media ExG → ajuste de vegetacao
 * 3. Contagem de pixels desaturados → ajuste de edificios
 * 4. Media C3 → ajuste de agua
 *
 * @param pixels - RGBA pixel data
 * @param width
 * @param height
 * @returns CalibrationParams with adjusted slider values
 */
export function autoCalibrate(pixels: Uint8ClampedArray, width: number, height: number): object {
    const total = width * height;
    const lumHist = new Uint32Array(256);
    let sumExG = 0;
    let sumC3 = 0;
    let lowSatCount = 0; // Pixels com S < 20 (potenciais edificios)
    let highExGCount = 0; // Pixels com ExG > 0.05 (potencial vegetacao)

    for (let i = 0; i < total; i++) {
        const off = i * 4;
        const r = pixels[off] as number,
            g = pixels[off + 1] as number,
            b = pixels[off + 2] as number;

        // Luminance (BT.601)
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        lumHist[lum] = (lumHist[lum] as number) + 1;

        // ExG
        const exg = excessGreen(r, g, b);
        sumExG += exg;
        if (exg > 0.05) highExGCount++;

        // C3 shadow index
        sumC3 += shadowIndex(r, g, b);

        // Saturation (simplified: max-min)/max)
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max > 0 ? (max - min) / max : 0;
        if (sat < 0.15) lowSatCount++;
    }

    // Otsu threshold on luminance histogram
    const otsu = otsuThreshold(lumHist, total);
    const meanExG = sumExG / total;
    const meanC3 = sumC3 / total;
    const lowSatRatio = lowSatCount / total;
    const vegRatio = highExGCount / total;

    // --- Map image statistics to slider values ---

    // Shadow: dark images (low Otsu) need more aggressive shadow removal
    // Otsu < 60 → very dark → slider=75; Otsu > 160 → bright → slider=30
    const shadowSlider = Math.round(Math.max(10, Math.min(90, lerp(75, 30, (otsu - 60) / 100))));

    // Vegetation: high ExG mean → more vegetation → raise sensitivity
    // meanExG > 0.05 → lots of green → slider=70; meanExG < -0.02 → urban → slider=30
    const vegSlider = Math.round(Math.max(10, Math.min(90, lerp(30, 70, (meanExG + 0.02) / 0.07))));

    // Building brightness: many desaturated pixels → widen detection range
    // lowSatRatio > 0.5 → urban → slider=65; lowSatRatio < 0.15 → natural → slider=35
    const buildingSlider = Math.round(Math.max(10, Math.min(90, lerp(35, 65, (lowSatRatio - 0.15) / 0.35))));

    // Water: high mean C3 → blue-dominant → raise sensitivity
    // meanC3 > 0.6 → water-rich → slider=70; meanC3 < 0.3 → dry → slider=35
    const waterSlider = Math.round(Math.max(10, Math.min(90, lerp(35, 70, (meanC3 - 0.3) / 0.3))));

    // Feature size: smaller images with sparse features → keep default
    // Vegetation-rich → many small blobs → raise size filter
    const sizeSlider = Math.round(Math.max(20, Math.min(80, vegRatio > 0.3 ? 60 : vegRatio < 0.1 ? 40 : 50)));

    // Edge sharpness: keep at 50 (auto doesn't have a strong signal for this)
    const edgeSlider = 50;

    // Max features: urban images → more features, natural → fewer
    const maxFeatures = Math.round(Math.max(10, Math.min(60, lowSatRatio > 0.4 ? 35 : lowSatRatio > 0.25 ? 25 : 20)));

    return {
        shadowSensitivity: shadowSlider,
        vegetationSensitivity: vegSlider,
        buildingBrightness: buildingSlider,
        waterSensitivity: waterSlider,
        featureSize: sizeSlider,
        edgeSharpness: edgeSlider,
        maxFeatures,
    };
}
