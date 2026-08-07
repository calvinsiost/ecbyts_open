// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - Public API
// ADR: ADR-021
// ================================================================
// index.ts - Barrel exports do modulo SpatialBlueprint
// ================================================================
export { processDXF, BLUEPRINT_CATEGORIES, isValidCategory } from './processor.js';
export { parseDXF } from './dxfParser.js';
export { polygonize, healGeometry, unionPolygons, jstsToCoords } from './topology.js';
export { projectToUTM, projectToWGS84, simplifyMetric, calculateAreaMetric, determineUTMZone } from './projection.js';
export { checkCompliance, REFERENCE_ZONES } from './compliance.js';
