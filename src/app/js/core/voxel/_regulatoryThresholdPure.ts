// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   VOXEL REGULATORY THRESHOLD PURE — RF-6 (SPEC_VOXEL_PIPELINE)

   Resolve limites regulatórios VR/VP/VI por parâmetro × matriz,
   reusando o catálogo em core/uncertainty/regulatoryThresholds.ts
   (CONAMA 420 + CETESB DD-256). Permite que integrateVoxelMass
   aceite uma referência regulatória ({ref:'VI', parameterId, matrix})
   em vez de apenas um número cru, e que o resultado cite a fonte.

   PUREZA: sem DOM, sem I/O. Determinístico.
   ================================================================ */

import { resolveThreshold } from '../uncertainty/regulatoryThresholds.js';

export type RegulatoryLevel = 'VR' | 'VP' | 'VI';

export interface ActionLevelResult {
    readonly vr: number | null;
    readonly vp: number | null;
    readonly vi: number | null;
    readonly fonte: string;
    readonly unit: string;
    readonly label: string;
}

export interface ThresholdRef {
    readonly parameterId: string;
    readonly matrix?: string;
    readonly level?: RegulatoryLevel;
}

export function resolveActionLevel(parameterId: string, matrix: string = 'soil'): ActionLevelResult | null {
    const entry = resolveThreshold(parameterId, matrix);
    if (!entry) return null;
    return Object.freeze({
        vr: entry.VR ?? null,
        vp: entry.VP ?? null,
        vi: entry.VI ?? null,
        fonte: entry.source,
        unit: entry.unit,
        label: entry.label,
    });
}

export function resolveThresholdValue(ref: ThresholdRef): { value: number; provenance: string } | null {
    const result = resolveActionLevel(ref.parameterId, ref.matrix ?? 'soil');
    if (!result) return null;
    const level = ref.level ?? 'VI';
    const value = level === 'VR' ? result.vr : level === 'VP' ? result.vp : result.vi;
    if (value == null) return null;
    const provenance = `${result.label} ${level}=${value} ${result.unit} (${result.fonte})`;
    return { value, provenance };
}
