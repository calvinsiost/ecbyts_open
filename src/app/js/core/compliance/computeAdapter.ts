// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// COMPLIANCE-PRESET-001 RF5 — adapter motor de cálculo.
// Owner SPEC: claude - novaspec. Wire RF5 por claude - executor 2026-06-06
// (autorização Calvin Opção 3 — canal corrId 8ce3dab1).
//
// Responsabilidade:
//   - Expor lookups que módulos de cálculo (GWP, validation, EIS weights)
//     consultam para descobrir parâmetros ativos do preset bound
//   - Multi-binding D7: lookup por scope (ghg → preset GHG bound,
//     soil/groundwater → preset CONAMA bound, etc)
//   - Degradação graciosa: scope sem binding retorna null + caller usa
//     default app-wide (modal onboarding D4 sugere preset)
//
// Funções helper expostas:
//   - getActiveGwpFactor(manager) → GhgFactors | null  (scope='ghg' OR 'all')
//   - getActiveValidationProfile(manager, matrix) → string | null
//       (matrix='soil' → scope='soil'; matrix='groundwater' → 'groundwater'; etc)
//   - getActiveEisWeights(manager) → EisWeights | null  (scope='all')
//   - getActiveEmissionRegistry(manager) → string | null  (scope='ghg' OR 'all')
//
// NÃO toco em motor de cálculo (core/analytics/, core/eis/, core/calculator/) —
// esses módulos consomem o adapter via call site mínimo quando ready.

import {
    type CompliancePreset,
    type GhgFactors,
    type EisWeights,
} from './_presetPure.js';
import {
    type ModelPresetBinding,
    type PresetScope,
} from './_modelBindingsPure.js';
import { type ComplianceManager } from './manager.js';

/**
 * Matrix ambiental → scope lookup.
 * Mapeia matrizes do motor de cálculo para PresetScope.
 */
export type EnvironmentalMatrix =
    | 'soil'
    | 'groundwater'
    | 'surface-water'
    | 'air'
    | 'ghg'
    | 'monetary'
    | 'risk';

const MATRIX_TO_SCOPE: Readonly<Record<EnvironmentalMatrix, PresetScope>> = Object.freeze({
    soil: 'soil',
    groundwater: 'groundwater',
    'surface-water': 'surface-water',
    air: 'air',
    ghg: 'ghg',
    monetary: 'monetary',
    risk: 'risk-assessment',
});

/**
 * Resolve scope canonical de um matrix label.
 */
export function matrixToScope(matrix: EnvironmentalMatrix): PresetScope {
    return MATRIX_TO_SCOPE[matrix];
}

/**
 * Lookup interno: dado um manager + scope alvo, retorna o preset bound
 * mais recente (último adicionado). Fallback para scope='all' quando
 * scope específico não tem binding.
 */
function resolvePresetForScope(
    manager: ComplianceManager,
    scope: PresetScope,
): CompliancePreset | null {
    const specificBindings = manager.getActiveBindings(scope);
    const lastSpecific = pickLatestBinding(specificBindings);
    if (lastSpecific) {
        const preset = manager.getPresetSync(lastSpecific.presetId);
        if (preset) return preset;
    }
    // Fallback: scope='all' (binding global aplica a tudo)
    if (scope !== 'all') {
        const allBindings = manager.getActiveBindings('all');
        const lastAll = pickLatestBinding(allBindings);
        if (lastAll) {
            const preset = manager.getPresetSync(lastAll.presetId);
            if (preset) return preset;
        }
    }
    return null;
}

function pickLatestBinding(
    bindings: ReadonlyArray<ModelPresetBinding>,
): ModelPresetBinding | null {
    if (!bindings || bindings.length === 0) return null;
    // Bindings activatedAt é ISO string — sort lexicográfico funciona
    let latest = bindings[0]!;
    for (let i = 1; i < bindings.length; i++) {
        const candidate = bindings[i]!;
        if (candidate.activatedAt > latest.activatedAt) {
            latest = candidate;
        }
    }
    return latest;
}

/**
 * Motor GWP consulta: qual versão IPCC + timeHorizon usar?
 * Retorna null quando não há preset com GhgFactors bound → caller
 * usa default app-wide (`CONFIG.GWP.DEFAULT_VERSION`).
 */
export function getActiveGwpFactor(manager: ComplianceManager): GhgFactors | null {
    const preset = resolvePresetForScope(manager, 'ghg');
    if (!preset || !preset.ghgFactors) return null;
    return preset.ghgFactors;
}

/**
 * Motor validação consulta: qual validation profile (CONAMA 420, CETESB
 * DD256, EPA RSL, etc) por matriz ambiental?
 * Retorna null → caller usa profile default por matriz.
 */
export function getActiveValidationProfile(
    manager: ComplianceManager,
    matrix: EnvironmentalMatrix,
): string | null {
    const scope = matrixToScope(matrix);
    const preset = resolvePresetForScope(manager, scope);
    if (!preset || !preset.validationProfileId) return null;
    return preset.validationProfileId;
}

/**
 * Motor EIS consulta: pesos TCCCA+T fixados pelo preset?
 * Quando customScoreBuilder estiver bound + preset travar pesos,
 * caller deve usar estes weights (RF B6: "Pesos travados pelo preset").
 * Retorna null → caller usa pesos custom do usuário.
 */
export function getActiveEisWeights(manager: ComplianceManager): EisWeights | null {
    const preset = resolvePresetForScope(manager, 'all');
    if (!preset) return null;
    const w = (preset as CompliancePreset & { eisWeights?: EisWeights }).eisWeights;
    if (!w) return null;
    return w;
}

/**
 * Motor GHG consulta: qual emission factors registry usar?
 * Ex: 'br-ipcc-2006' / 'epa-ar5-2023' / 'mctic-ar4'.
 * Retorna null → caller usa registry default app-wide.
 */
export function getActiveEmissionRegistry(manager: ComplianceManager): string | null {
    const preset = resolvePresetForScope(manager, 'ghg');
    if (!preset || !preset.emissionFactorsRegistry) return null;
    return preset.emissionFactorsRegistry;
}

/**
 * Summary helper para banner UI: lista todos os bindings ativos com
 * preset resolvido. Útil para banner mostrar chips multi-jurisdição
 * (RF10 / D7).
 */
export interface ActiveBindingSummary {
    readonly scope: PresetScope;
    readonly preset: CompliancePreset;
    readonly activatedAt: string;
    readonly activatedBy: string;
}

export function getAllActiveBindingsSummary(
    manager: ComplianceManager,
): ReadonlyArray<ActiveBindingSummary> {
    const state = manager.getState();
    const summary: ActiveBindingSummary[] = [];
    for (const binding of state.bindings) {
        const preset = manager.getPresetSync(binding.presetId);
        if (preset) {
            summary.push(Object.freeze({
                scope: binding.scope,
                preset,
                activatedAt: binding.activatedAt,
                activatedBy: binding.activatedBy,
            }));
        }
    }
    return Object.freeze(summary);
}
