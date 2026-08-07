// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   MODEL PRESETS — Barrel / re-export index
   Exporta schema (validacao, enums) e registry (CRUD, catalogo).
   ================================================================ */

export {
    VALID_FAMILIES,
    PRESET_CATEGORIES,
    VALID_SITE_SIZES,
    VALID_CONTAMINATION_LEVELS,
    VALID_REPORT_SECTION_TYPES,
    VALID_ORIGIN_SYSTEMS,
    KNOWN_PARAMETERS,
    validatePreset,
    validateGenerationOptions,
    validateThresholds,
    validateDefaultOrigin,
    validateReportSkeleton,
} from './schema.js';

export {
    registerPreset,
    getPreset,
    listPresets,
    listPresetIds,
    getPresetsByCategory,
    hasPreset,
    unregisterPreset,
    clearPresets,
    resetPresets,
    BUILT_IN_PRESETS,
} from './registry.js';
