// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RANDOM-COV-001 F1 (RF-4 — resolver de thresholds) — pure-logic.

   Resolve um triplo {vr, vp, vi} (Valor de Referência / Prevenção / Intervenção)
   para um parameterId de contaminante, encadeando:

     parameterId → CAS (_casMapPure) → GLOBAL_THRESHOLDS[CAS] (core/validation)
       → VI (Valor de Intervenção, groundwater, µg/L) da jurisdição preferida
       → deriva VR/VP como frações do VI.

   POR QUE DERIVAR: `globalThresholds.ts` cataloga só o VI (severity
   'intervention'), matriz groundwater, em µg/L. O sampler de bandas
   (_concentrationBandsPure) precisa do triplo {vr,vp,vi}. Derivamos
   VR = VI·0.1 e VP = VI·0.3 — proxies conservadores coerentes com a hierarquia
   CONAMA 420 (VR < VP < VI). Para DADO SINTÉTICO de demo isso ancora as
   concentrações a valores regulatórios REAIS (o VI), muito melhor que random*100.

   Unidade: retorna na unidade nativa do catálogo (µg/L). O caller que fia no
   gerador converte para a unidade do parâmetro (mg/L etc.) via core/units.

   ADR A2/A4: não duplica catálogos — consome _casMapPure + GLOBAL_THRESHOLDS.
   Pure: sem DOM/rede; determinístico.
   ================================================================ */

import { casForParameterId } from './_casMapPure.js';
import { GLOBAL_THRESHOLDS } from '../validation/globalThresholds.js';

/** Fração do VI usada para derivar VR (Valor de Referência). */
export const VR_FRACTION_OF_VI = 0.1;
/** Fração do VI usada para derivar VP (Valor de Prevenção). */
export const VP_FRACTION_OF_VI = 0.3;

/** Ordem de preferência de jurisdição (BR primeiro — contexto CETESB/CONAMA). */
export const JURISDICTION_PREFERENCE: ReadonlyArray<string> = Object.freeze([
    'BR_CETESB',
    'BR_CONAMA',
    'US_EPA',
    'WHO',
]);

export interface ResolvedThresholds {
    readonly vr: number;
    readonly vp: number;
    readonly vi: number;
    readonly unit: string;
    readonly matrix: string;
    readonly cas: string;
    readonly jurisdiction: string;
    readonly source: string;
    /** true quando VR/VP foram DERIVADOS do VI (não catalogados diretamente). */
    readonly derived: boolean;
}

type ThresholdEntryLike = {
    value?: unknown;
    unit?: unknown;
    matrix?: unknown;
    jurisdiction?: unknown;
    source?: unknown;
};

/** Escolhe a melhor entrada de VI pela ordem de preferência de jurisdição. */
function pickPreferredEntry(entries: ReadonlyArray<ThresholdEntryLike>): ThresholdEntryLike | null {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    for (const pref of JURISDICTION_PREFERENCE) {
        const hit = entries.find(
            (e) => e && e.jurisdiction === pref && typeof e.value === 'number' && Number.isFinite(e.value),
        );
        if (hit) return hit;
    }
    // fallback: primeira entrada com valor finito
    return entries.find((e) => e && typeof e.value === 'number' && Number.isFinite(e.value)) || null;
}

/**
 * Resolve {vr,vp,vi} para um parameterId de contaminante de substância única.
 * @returns ResolvedThresholds, ou null se: não-contaminante de CAS único,
 *          CAS sem entrada no catálogo, ou VI ausente/inválido.
 */
export function resolveThresholdsForParameter(parameterId: unknown): ResolvedThresholds | null {
    const cas = casForParameterId(parameterId);
    if (!cas) return null; // agregado / não-contaminante / desconhecido
    const entries = (GLOBAL_THRESHOLDS as Record<string, ThresholdEntryLike[]>)[cas];
    const entry = pickPreferredEntry(entries || []);
    if (!entry || typeof entry.value !== 'number' || !(entry.value > 0)) return null;
    const vi = entry.value;
    return Object.freeze({
        vr: vi * VR_FRACTION_OF_VI,
        vp: vi * VP_FRACTION_OF_VI,
        vi,
        unit: typeof entry.unit === 'string' ? entry.unit : 'ug_L',
        matrix: typeof entry.matrix === 'string' ? entry.matrix : 'groundwater',
        cas,
        jurisdiction: typeof entry.jurisdiction === 'string' ? entry.jurisdiction : 'unknown',
        source: typeof entry.source === 'string' ? entry.source : '',
        derived: true,
    });
}

/** True se o parameterId tem thresholds resolvíveis (atalho de guarda). */
export function hasResolvableThresholds(parameterId: unknown): boolean {
    return resolveThresholdsForParameter(parameterId) !== null;
}
