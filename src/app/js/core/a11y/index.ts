// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   A11Y module index — re-exports públicos
   ================================================================ */

// Array-based WCAG API (contrastChecker.js - P1-34)
export { hexToRgb, relativeLuminance, contrastRatio, WCAG_THRESHOLDS, checkContrast } from './contrastChecker.js';

// Object-based engine (contrast.js - richer internal API)
export {
    parseColor,
    relativeLuminance as relativeLuminanceObj,
    contrastRatio as contrastRatioObj,
    // Alpha compositing (A11Y-ALPHA-001) — medir o PIXEL, não a tinta.
    alphaOf,
    isOpaque,
    compositeOver,
    compositeStack,
    resolvePair,
    contrastRatioComposited,
    isAACompliant,
    isAAACompliant,
    wcagLevel,
    validatePair,
    scanPairs,
    validateTokenMap,
    extractCssVariables,
    auditCssFile,
    suggestFixColor,
} from './contrast.js';
