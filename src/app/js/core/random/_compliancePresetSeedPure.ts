// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RANDOM-COV-001 F2 (RF-6) — Seed de preset de compliance para o modelo random.

   O modelo random não setava nenhum preset de compliance baseline → o "Veredito
   da Área" (MODEL_BASELINE_COMPLIANCE_PRESET) e o banner de compliance nasciam
   sem base. Este helper declara o(s) binding(s) de preset a aplicar ao modelo
   sintético, coerentes com o cenário (sítio contaminado BR, BTEX em groundwater).

   Default: CETESB DD 256/2016 (mesma fonte regulatória usada no resolver de
   thresholds RF-4, BR_CETESB) com escopos groundwater + soil — as matrizes que o
   gerador efetivamente popula com contaminantes.

   Os bindings retornados são consumidos por _modelBindingsPure.addBinding no
   wire (fase finalize/governance). IDs de preset cruzados contra
   core/compliance/_presetPure (getPresetById) no teste — anti-drift.

   Pure: sem DOM/rede; determinístico; estruturas frozen.
   ================================================================ */

/** Preset baseline default do modelo random (sítio contaminado BR). */
export const DEFAULT_RANDOM_PRESET_ID = 'br-sp-cetesb-dd256-2016';

/** Escopos default — matrizes que o gerador popula com contaminantes. */
export const DEFAULT_RANDOM_PRESET_SCOPES: ReadonlyArray<string> = Object.freeze([
    'groundwater',
    'soil',
]);

/** Escopos válidos (espelha ALLOWED_SCOPES de _modelBindingsPure — cruzado no teste). */
export const VALID_PRESET_SCOPES: ReadonlySet<string> = Object.freeze(
    new Set([
        'soil',
        'groundwater',
        'surface-water',
        'air',
        'ghg',
        'border-tax',
        'risk-assessment',
        'monetary',
        'all',
    ]),
) as ReadonlySet<string>;

export interface PresetBindingSeed {
    readonly presetId: string;
    readonly scope: string;
}

export interface CompliancePresetSeedOptions {
    /** Override do preset baseline (default CETESB DD 256/2016). */
    presetId?: string;
    /** Override dos escopos (default groundwater + soil). */
    scopes?: ReadonlyArray<string>;
}

/**
 * Constrói os bindings de preset de compliance para semear no modelo random.
 * Filtra escopos inválidos e deduplica (presetId, scope). Retorna array frozen
 * de bindings frozen — prontos para _modelBindingsPure.addBinding.
 */
export function buildCompliancePresetSeed(
    opts: CompliancePresetSeedOptions = {},
): ReadonlyArray<PresetBindingSeed> {
    const presetId =
        typeof opts.presetId === 'string' && opts.presetId.trim() !== ''
            ? opts.presetId.trim()
            : DEFAULT_RANDOM_PRESET_ID;
    const requested =
        Array.isArray(opts.scopes) && opts.scopes.length > 0 ? opts.scopes : DEFAULT_RANDOM_PRESET_SCOPES;

    const seen = new Set<string>();
    const bindings: PresetBindingSeed[] = [];
    for (const scope of requested) {
        if (typeof scope !== 'string' || !VALID_PRESET_SCOPES.has(scope)) continue;
        const key = `${presetId}|${scope}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bindings.push(Object.freeze({ presetId, scope }));
    }
    return Object.freeze(bindings);
}
