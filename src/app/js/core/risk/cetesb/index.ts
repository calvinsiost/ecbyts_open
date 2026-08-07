// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// API pública do módulo `core/risk/cetesb` (CETESB Risk Assessment).
// Orquestra os 5 módulos pure-logic da Fase 1 num pipeline coerente:
//   catalog → expDefaults → fisqui → fatTox → diffusion → J&E → dose → risk/CMA.
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (CETESB-RISK-001) RF-1.4
// ADR: src/app/js/core/risk/cetesb/ADR.md

import {
    RISK_SCENARIOS,
    getScenario,
    listScenarios,
    type ScenarioId,
    type Pathway,
    type Medium,
} from './_riskCatalogPure.js';
import { getMfDefaults, applyMfOverrides, MF_SOURCE, type MfParams } from './mfDefaults.js';
import { getExpDefaults, EXP_SOURCE, type AgeGroup } from './expDefaults.js';
import { getFisQui, listKnownCas, FISQUI_SOURCE } from './fisqui.js';
import { getFatTox, FATTOX_SOURCE } from './fatTox.js';
import { getJeAttenuationFactor } from './_jeAttenuationPure.js';
import {
    doseIngestionSoil,
    doseDermalSoil,
    doseInhalationParticulate,
    doseIngestionGroundwater,
    doseInhalationVapor,
} from './_doseIngressPure.js';
import { computeRiskAndCma as computeRiskCmaCore, toUnitDose, type UnitDoseByPathway } from './_riskCmaPure.js';
import {
    aggregateHazardIndexByTarget,
    getTargetOrgan,
    TARGET_ORGAN_BY_CAS,
    type TargetOrgan,
    type SqiHazardContribution,
    type HazardIndexByTargetResult,
} from './_hazardIndexByTargetPure.js';

// ── Re-exports para uso externo ─────────────────────────────────────────
export { listScenarios, listKnownCas, RISK_SCENARIOS };
export { aggregateHazardIndexByTarget, getTargetOrgan, TARGET_ORGAN_BY_CAS };
export type { ScenarioId, Pathway, Medium, AgeGroup, MfParams };
export type { TargetOrgan, SqiHazardContribution, HazardIndexByTargetResult };

const SOURCE_STAMP = 'CETESB DD 103/2007/C/E v4.00' as const;

/** Concentração observada por mídia (em unidade canônica da mídia). */
export interface MediaConcentrations {
    /** Solo, mg/kg. */
    soil?: number;
    /** Água subterrânea, mg/L. */
    groundwater?: number;
    /** Ar ambiente, mg/m³. */
    air?: number;
}

export interface RiskAssessmentInput {
    /** CAS da SQI (Substância Química de Interesse). */
    sqiCas: string;
    /** Cenário receptor (RES_URB / RES_RUR / TRAB_COM_IND / TRAB_OBRA_CIV). */
    scenario: ScenarioId;
    /** Faixa etária (default: 'child' para residenciais — mais protetivo; 'adult' para trab). */
    ageGroup?: AgeGroup | undefined;
    /** Meios físicos impactados (subset de defaultMedia do cenário). */
    mediaImpacted: ReadonlyArray<Medium>;
    /** Concentrações observadas por mídia. */
    concentrations: MediaConcentrations;
    /** Overrides do meio físico (defaults CETESB Anexo B). */
    mfOverrides?: Partial<MfParams>;
    /** Target ILCR (default 1e-6 USEPA; 1e-5 alternativo CETESB DD 103/2007). */
    targetILCR?: number;
    /** Target HQ (default 1.0 RAGS). */
    targetHQ?: number;
    /** Timestamp ISO para carimbo `computedAt` (default: '' = não usar Date.now). */
    now?: string;
}

export interface RiskAssessmentResult {
    /** ILCR (Incremental Lifetime Cancer Risk) total. */
    readonly ilcr: number;
    /** HI (Hazard Index) total. */
    readonly hq: number;
    /** CMA — Concentração Máxima Aceitável. */
    readonly cma: number;
    /** Unidade da CMA (mg/kg solo / mg/L água / mg/m³ ar). */
    readonly cmaUnit: string;
    /** Contribuição de cada via à CMA (soma=1). */
    readonly pathwaysContrib: Readonly<Record<string, number>>;
    /** Warnings de cálculo. */
    readonly warnings: ReadonlyArray<string>;
    /** Fonte regulatória/científica carimbada. */
    readonly source: string;
    /** Timestamp ISO (vazio se não fornecido — pure-logic não usa Date.now). */
    readonly computedAt: string;
    /** Via que limita a CMA (driver). */
    readonly limitingPathway: string;
}

/** Mapeia via → rota toxicológica. */
function _routeOf(pathway: Pathway): 'oral' | 'inhalation' {
    return pathway.startsWith('inhalation') ? 'inhalation' : 'oral';
}

/** Mídia primária da via (para selecionar concentração + unidade CMA). */
function _mediumOf(pathway: Pathway): Medium {
    if (pathway.endsWith('_soil') || pathway === 'ingestion_vegetables') return 'soil';
    if (pathway.endsWith('_groundwater')) return 'groundwater';
    if (pathway === 'inhalation_ambient_air') return 'air';
    return 'soil';
}

function _unitOf(medium: Medium): string {
    if (medium === 'soil') return 'mg/kg';
    if (medium === 'groundwater') return 'mg/L';
    return 'mg/m³';
}

function _concentrationOf(c: MediaConcentrations, medium: Medium): number {
    if (medium === 'soil') return Number.isFinite(c.soil) ? (c.soil as number) : 0;
    if (medium === 'groundwater') return Number.isFinite(c.groundwater) ? (c.groundwater as number) : 0;
    if (medium === 'air') return Number.isFinite(c.air) ? (c.air as number) : 0;
    return 0;
}

function _defaultAge(scenarioId: ScenarioId): AgeGroup {
    // Cenários residenciais usam criança (mais protetivo); trabalhador usa adulto.
    if (scenarioId === 'RES_URB' || scenarioId === 'RES_RUR') return 'child';
    return 'adult';
}

/**
 * Pipeline completo de avaliação de risco CETESB.
 * Calcula ILCR + HQ + CMA reversa para uma SQI × cenário × concentrações.
 */
export function computeRiskAndCma(input: RiskAssessmentInput): RiskAssessmentResult {
    const warnings: string[] = [];
    const computedAt = input.now || '';

    // 1. Resolve scenario
    const scenarioDef = getScenario(input.scenario);
    if (!scenarioDef) {
        return Object.freeze({
            ilcr: 0,
            hq: 0,
            cma: Infinity,
            cmaUnit: 'mg/kg',
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze([`Cenário "${input.scenario}" desconhecido`]),
            source: SOURCE_STAMP,
            computedAt,
            limitingPathway: 'none',
        });
    }

    // 2. Resolve SQI bases
    const sqi = getFisQui(input.sqiCas);
    const tox = getFatTox(input.sqiCas);
    if (!sqi || !tox) {
        warnings.push(`SQI ${input.sqiCas} sem dados toxicológicos na base CETESB v4.00`);
        return Object.freeze({
            ilcr: 0,
            hq: 0,
            cma: NaN,
            cmaUnit: 'mg/kg',
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze(warnings),
            source: SOURCE_STAMP,
            computedAt,
            limitingPathway: 'none',
        });
    }

    // 3. Resolve faixa etária + parâmetros exposicionais
    const age = input.ageGroup || _defaultAge(input.scenario);
    const exp = getExpDefaults(input.scenario, age);
    if (!exp) {
        warnings.push(`Faixa etária "${age}" não aplicável ao cenário "${input.scenario}"`);
        return Object.freeze({
            ilcr: 0,
            hq: 0,
            cma: NaN,
            cmaUnit: 'mg/kg',
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze(warnings),
            source: SOURCE_STAMP,
            computedAt,
            limitingPathway: 'none',
        });
    }

    // 4. Resolve meio físico (defaults + overrides)
    const mfBase = getMfDefaults(input.scenario);
    const mf = applyMfOverrides(mfBase!, input.mfOverrides);

    // 5. Itera vias aplicáveis para cada mídia habilitada
    const applicable: Pathway[] = scenarioDef.pathways.filter((p) => {
        const medium = _mediumOf(p);
        return input.mediaImpacted.includes(medium);
    });

    if (applicable.length === 0) {
        warnings.push('Nenhuma via de exposição habilitada para as mídias impactadas');
        return Object.freeze({
            ilcr: 0,
            hq: 0,
            cma: Infinity,
            cmaUnit: 'mg/kg',
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze(warnings),
            source: SOURCE_STAMP,
            computedAt,
            limitingPathway: 'none',
        });
    }

    // J&E atenuação para vias de vapor (predefinido CETESB α=0.03)
    const je = getJeAttenuationFactor(mf);

    // 6. Compute dose por via × concentração observada
    const unitDoses: UnitDoseByPathway[] = [];
    let driverMedium: Medium = 'soil';
    for (const p of applicable) {
        const medium = _mediumOf(p);
        const C_obs = _concentrationOf(input.concentrations, medium);
        if (C_obs <= 0) continue; // sem concentração nesta mídia
        driverMedium = medium; // último encontrado define unidade CMA

        let doseResult;
        switch (p) {
            case 'ingestion_soil':
                doseResult = doseIngestionSoil(C_obs, exp, tox, age);
                break;
            case 'dermal_soil':
                doseResult = doseDermalSoil(C_obs, exp, tox, age);
                break;
            case 'inhalation_particulate_soil':
                // Mídia ar é derivada do solo via Pa (emissão de partículas) — simplificado para C_solo · 1e-6 (proxy)
                doseResult = doseInhalationParticulate(C_obs * 1e-6, exp, tox, age);
                break;
            case 'inhalation_vapor_soil':
                // C_ar = C_solo · α_JE (atenuação volatilização)
                doseResult = doseInhalationVapor(C_obs * je.alpha, exp, tox, age);
                break;
            case 'ingestion_groundwater':
                doseResult = doseIngestionGroundwater(C_obs, exp, tox, age);
                break;
            case 'dermal_groundwater':
                // Aproxima como ingestão com fator dérmico reduzido (Fase 2 implementa dérmico aquoso completo)
                warnings.push('dermal_groundwater não implementado Fase 1 (Manual §6.2 — Fase 2)');
                continue;
            case 'inhalation_vapor_groundwater':
                // C_ar = C_water · H · α_JE (vapor da água sub atenuado pela edificação)
                doseResult = doseInhalationVapor(C_obs * sqi.H * je.alpha, exp, tox, age);
                break;
            case 'inhalation_ambient_air':
                doseResult = doseInhalationVapor(C_obs, exp, tox, age);
                break;
            case 'ingestion_vegetables':
                warnings.push('ingestion_vegetables não implementado Fase 1 (Fase 2 — Trapp 1995)');
                continue;
            default:
                continue;
        }

        unitDoses.push(toUnitDose(doseResult, C_obs, _routeOf(p)));
    }

    if (unitDoses.length === 0) {
        return Object.freeze({
            ilcr: 0,
            hq: 0,
            cma: Infinity,
            cmaUnit: _unitOf(driverMedium),
            pathwaysContrib: Object.freeze({}),
            warnings: Object.freeze([...warnings, 'Nenhuma dose computada — verifique concentrations']),
            source: SOURCE_STAMP,
            computedAt,
            limitingPathway: 'none',
        });
    }

    // 7. Compute risk + CMA
    const observedSoil = _concentrationOf(input.concentrations, driverMedium);
    const result = computeRiskCmaCore({
        observedConcentration: observedSoil > 0 ? observedSoil : 1,
        perPathway: unitDoses,
        tox,
        targetILCR: input.targetILCR,
        targetHQ: input.targetHQ,
        cmaUnit: _unitOf(driverMedium),
    });

    return Object.freeze({
        ilcr: result.ILCR_total,
        hq: result.HI_total,
        cma: result.CMA,
        cmaUnit: result.CMA_unit,
        pathwaysContrib: result.pathwaysContrib,
        warnings: Object.freeze([...warnings, ...result.warnings]),
        source: `${SOURCE_STAMP} | ${MF_SOURCE} | ${EXP_SOURCE} | ${FISQUI_SOURCE} | ${FATTOX_SOURCE}`,
        computedAt,
        limitingPathway: result.limitingPathway,
    });
}
