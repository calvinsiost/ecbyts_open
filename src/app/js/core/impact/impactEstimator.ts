// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Impact Estimator - Passivos (custos de remediação) + Ativos ambientais.
 *
 * Pure module, no browser deps. Calculates:
 *   - Soil remediation costs by contaminant/method/volume
 *   - Groundwater remediation annual costs by method
 *   - Occupational health cost per exposure scenario
 *   - Land value appreciation pre/post remediation (VAA formula)
 *   - Ecosystem services NPV (Lei 14.119/2021)
 *   - Cost-benefit ratio + ROI + payback horizon
 *   - Aggregated model impact report
 *
 * Data tier: this MVP uses the FREE hypothetical dataset. A future
 * PREMIUM tier can inject a different benchmark set via the dataLibrary
 * constructor option (spec §Arquitetura de Dados).
 *
 * Reference spec: docs/specs/features/SPEC_IMPACT_ESTIMATOR.md (Item 9.63)
 *
 * Legal disclaimer: estimates are referential only and DO NOT substitute
 * technical engineering assessment, judicial expertise, or regulatory
 * review. See core/impact/ADR.md for methodology provenance.
 */

// ============================================================================
// BENCHMARKS - FREE demo dataset (hypothetical but realistic)
// Values are [min, base, max] in BRL. Sources in ADR.md.
// ============================================================================

export const SOIL_BENCHMARKS_BRL_PER_M3 = Object.freeze({
    hydrocarbons: Object.freeze({
        inSitu: Object.freeze([50, 200, 500]),
        exSitu: Object.freeze([300, 914, 2000]),
        thermal: Object.freeze([1500, 3500, 7000]),
    }),
    metals: Object.freeze({
        inSitu: Object.freeze([100, 400, 800]),
        exSitu: Object.freeze([400, 1200, 2500]),
    }),
    solvents: Object.freeze({
        inSitu: Object.freeze([200, 600, 1200]),
        exSitu: Object.freeze([800, 2000, 4000]),
    }),
    pesticides: Object.freeze({
        inSitu: Object.freeze([150, 500, 1000]),
        exSitu: Object.freeze([500, 1500, 3000]),
    }),
});

export const GROUNDWATER_BENCHMARKS_BRL_PER_YEAR = Object.freeze({
    pumpAndTreat: Object.freeze([50_000, 150_000, 500_000]),
    prb: Object.freeze([20_000, 80_000, 200_000]),
    naturalAttenuation: Object.freeze([10_000, 30_000, 80_000]),
});

// Occupational cost per case (BRL), by severity
export const OCCUPATIONAL_BENCHMARKS_BRL = Object.freeze({
    medicalLeave: Object.freeze([5_000, 15_000, 50_000]),
    disability: Object.freeze([50_000, 200_000, 1_000_000]),
    death: Object.freeze([500_000, 2_000_000, 10_000_000]),
});

// Exposure level multipliers (cumulative expected incidence)
export const EXPOSURE_INCIDENCE = Object.freeze({
    low: 0.02,
    moderate: 0.08,
    high: 0.2,
    extreme: 0.45,
});

// Severity mix probabilities per incidence (sum ≤ 1)
const SEVERITY_MIX = Object.freeze({
    medicalLeave: 0.75,
    disability: 0.22,
    death: 0.03,
});

// ============================================================================
// ADJUSTMENT FACTORS (spec §Fatores de Ajuste)
// ============================================================================

export const COMPLEXITY_MULTIPLIERS = Object.freeze({
    simple: 1.0,
    moderate: 1.5,
    complex: 2.5,
    extreme: 4.0,
});

export const DEPTH_MULTIPLIERS = Object.freeze({
    shallow: 1.0, // 0-2m
    medium: 1.5, // 2-5m
    deep: 2.5, // 5-10m
    veryDeep: 4.0, // >10m
});

export const LAND_USE_MULTIPLIERS = Object.freeze({
    industrial: 1.0,
    commercial: 1.3,
    agricultural: 1.5,
    residential: 2.0,
    protected: 2.5,
});

export const AQUIFER_IMPACT_MULTIPLIERS = Object.freeze({
    none: 1.0,
    minor: 1.3,
    moderate: 1.8,
    severe: 2.5,
});

// ============================================================================
// LAND APPRECIATION (VAA formula, spec §Valor do Ativo Ambiental)
// Values in BRL/m² [pre-remediation, post-remediation]
// ============================================================================

export const LAND_APPRECIATION_BRL_PER_M2 = Object.freeze({
    industrial: Object.freeze([150, 300]),
    commercial: Object.freeze([400, 1000]),
    residential: Object.freeze([600, 1800]),
    agricultural: Object.freeze([50, 120]),
});

// ============================================================================
// ECOSYSTEM SERVICES (Lei 14.119/2021)
// Values in BRL per unit (ha/year or tCO2e)
// ============================================================================

export const ECOSYSTEM_SERVICES_BRL = Object.freeze({
    waterSourceProtection: 800, // R$/ha/year
    carbonSequestration: 150, // R$/tCO2e
    biodiversityConservation: 1500, // R$/ha/year
    soilProtection: 400, // R$/ha/year
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Apply a set of multiplicative adjustment factors to a [min, base, max] tuple.
 * Returns a new frozen tuple; input is not mutated.
 */
function applyFactors(range: any, factors: any): any {
    const product = factors.reduce((acc: any, f: any) => acc * (f ?? 1), 1);
    return Object.freeze([range[0] * product, range[1] * product, range[2] * product]);
}

function frozenEstimate(range: any): any {
    return Object.freeze({ min: range[0], base: range[1], max: range[2] });
}

function clamp01(v: any): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

// ============================================================================
// Passivos - Custo de remediação de solo
// ============================================================================

/**
 * Estimate soil remediation cost.
 *
 * @param params
 * @param params.volume - Volume in m³ (required, > 0)
 */
export function estimateSoilRemediation(params: {
    volume: number;
    contaminant: 'hydrocarbons' | 'metals' | 'solvents' | 'pesticides';
    method?: 'inSitu' | 'exSitu' | 'thermal';
    complexity?: 'simple' | 'moderate' | 'complex' | 'extreme';
    depth?: 'shallow' | 'medium' | 'deep' | 'veryDeep';
    landUse?: 'industrial' | 'commercial' | 'agricultural' | 'residential' | 'protected';
    aquiferImpact?: 'none' | 'minor' | 'moderate' | 'severe';
}): any {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const volume = Number(params.volume);
    if (!Number.isFinite(volume) || volume <= 0) {
        return { ok: false, reason: 'invalid_volume' };
    }
    const contaminant = String(params.contaminant || '');
    const family = (SOIL_BENCHMARKS_BRL_PER_M3 as Record<string, any>)[contaminant];
    if (!family) return { ok: false, reason: 'unknown_contaminant' };

    const method = params.method || 'exSitu';
    const unitRange = family[method];
    if (!unitRange) return { ok: false, reason: 'unknown_method' };

    const complexityFactor = COMPLEXITY_MULTIPLIERS[params.complexity ?? 'moderate'] ?? 1.5;
    const depthFactor = DEPTH_MULTIPLIERS[params.depth ?? 'medium'] ?? 1.5;
    const landUseFactor = LAND_USE_MULTIPLIERS[params.landUse ?? 'industrial'] ?? 1.0;
    const aquiferFactor = AQUIFER_IMPACT_MULTIPLIERS[params.aquiferImpact ?? 'none'] ?? 1.0;

    const factors = { complexityFactor, depthFactor, landUseFactor, aquiferFactor };
    const adjustedUnit = applyFactors(unitRange, [complexityFactor, depthFactor, landUseFactor, aquiferFactor]);

    const estimate = Object.freeze([adjustedUnit[0] * volume, adjustedUnit[1] * volume, adjustedUnit[2] * volume]);

    return {
        ok: true,
        volume,
        contaminant,
        method,
        unitCost: frozenEstimate(adjustedUnit),
        estimate: frozenEstimate(estimate),
        factors,
    };
}

// ============================================================================
// Passivos - Custo anual de tratamento de água subterrânea
// ============================================================================

/**
 * Estimate groundwater remediation annual cost.
 *
 * @param params
 */
export function estimateGroundwaterRemediation(params: {
    method: 'pumpAndTreat' | 'prb' | 'naturalAttenuation';
    years?: number;
    discountRate?: number;
    complexity?: 'simple' | 'moderate' | 'complex' | 'extreme';
}): object {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const method = String(params.method || '');
    const baseRange = (GROUNDWATER_BENCHMARKS_BRL_PER_YEAR as Record<string, any>)[method];
    if (!baseRange) return { ok: false, reason: 'unknown_method' };

    const years = Math.max(1, Math.round(Number(params.years ?? 5)));
    const complexityFactor = COMPLEXITY_MULTIPLIERS[params.complexity ?? 'moderate'] ?? 1.5;
    const discountRate = Number(params.discountRate ?? 0.08);

    const adjusted = applyFactors(baseRange, [complexityFactor]);
    const npv = Object.freeze([
        calculateNPV(adjusted[0], discountRate, years),
        calculateNPV(adjusted[1], discountRate, years),
        calculateNPV(adjusted[2], discountRate, years),
    ]);

    return {
        ok: true,
        method,
        years,
        annualCost: frozenEstimate(adjusted),
        totalNPV: frozenEstimate(npv),
        factors: { complexityFactor },
    };
}

// ============================================================================
// Passivos - Custo ocupacional
// ============================================================================

/**
 * Estimate occupational health impact cost.
 *
 * @param params
 */
export function estimateOccupationalImpact(params: {
    workersExposed: number;
    exposureLevel?: 'low' | 'moderate' | 'high' | 'extreme';
    duration?: number;
    ppeCompliance?: number;
}): object {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const workers = Math.max(0, Math.round(Number(params.workersExposed ?? 0)));
    if (workers === 0) {
        return { ok: false, reason: 'no_workers' };
    }

    const exposureLevel = params.exposureLevel ?? 'moderate';
    const incidence = (EXPOSURE_INCIDENCE as Record<string, any>)[exposureLevel];
    if (incidence == null) return { ok: false, reason: 'unknown_exposure_level' };

    const ppe = clamp01(Number(params.ppeCompliance ?? 0.7));
    const ppeReduction = 1 - ppe * 0.6; // PPE compliance reduces incidence up to 60%
    const duration = Math.max(1, Number(params.duration ?? 5));

    // Expected cases = workers × incidence × duration_factor × ppeReduction
    const durationFactor = Math.sqrt(duration); // diminishing returns beyond initial years
    const expectedCases = workers * incidence * durationFactor * ppeReduction;

    // Distribute across severity mix
    const cases = {
        medicalLeave: expectedCases * SEVERITY_MIX.medicalLeave,
        disability: expectedCases * SEVERITY_MIX.disability,
        death: expectedCases * SEVERITY_MIX.death,
    };

    const costMin =
        cases.medicalLeave * OCCUPATIONAL_BENCHMARKS_BRL.medicalLeave[0]! +
        cases.disability * OCCUPATIONAL_BENCHMARKS_BRL.disability[0]! +
        cases.death * OCCUPATIONAL_BENCHMARKS_BRL.death[0]!;
    const costBase =
        cases.medicalLeave * OCCUPATIONAL_BENCHMARKS_BRL.medicalLeave[1]! +
        cases.disability * OCCUPATIONAL_BENCHMARKS_BRL.disability[1]! +
        cases.death * OCCUPATIONAL_BENCHMARKS_BRL.death[1]!;
    const costMax =
        cases.medicalLeave * OCCUPATIONAL_BENCHMARKS_BRL.medicalLeave[2]! +
        cases.disability * OCCUPATIONAL_BENCHMARKS_BRL.disability[2]! +
        cases.death * OCCUPATIONAL_BENCHMARKS_BRL.death[2]!;

    return {
        ok: true,
        workersExposed: workers,
        exposureLevel,
        duration,
        ppeCompliance: ppe,
        expectedCases: Object.freeze({
            total: expectedCases,
            medicalLeave: cases.medicalLeave,
            disability: cases.disability,
            death: cases.death,
        }),
        estimate: frozenEstimate([costMin, costBase, costMax]),
    };
}

// ============================================================================
// NPV - Present value of a constant annual flow
// ============================================================================

/**
 * Net Present Value of a constant annual cash flow over N years.
 * Standard discount formula: Σ annual / (1+r)^t for t=1..N.
 *
 * @param annual - Annual cash flow (BRL)
 * @param rate - Discount rate (0..1, e.g. 0.08 for 8%)
 * @param years - Number of years (>= 1)
 */
export function calculateNPV(annual: number, rate: number, years: number): number {
    if (!Number.isFinite(annual) || !Number.isFinite(rate) || !Number.isFinite(years)) return 0;
    if (years < 1) return 0;
    if (rate === 0) return annual * years;

    // Closed-form annuity factor for constant flow
    const factor = (1 - Math.pow(1 + rate, -years)) / rate;
    return annual * factor;
}

// ============================================================================
// Ativos - Valor do Ativo Ambiental (VAA)
// ============================================================================

/**
 * Calculate Environmental Asset Value (VAA) for a remediated site.
 *
 * VAA = (VF - VI) + VSE
 *   VI  = initial land value (contaminated, restricted use)
 *   VF  = future land value (post-remediation, full use)
 *   VSE = NPV of ecosystem services flow
 *
 * @param params
 */
export function calculateAssetValue(params: {
    areaM2: number;
    landUse?: 'industrial' | 'commercial' | 'residential' | 'agricultural';
    ecosystemYears?: number;
    discountRate?: number;
    ecosystemServices?: object;
    hectares?: number;
    carbonTonsPerYear?: number;
}): object {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const areaM2 = Number(params.areaM2);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
        return { ok: false, reason: 'invalid_area' };
    }

    const landUse = params.landUse ?? 'industrial';
    const appreciation = (LAND_APPRECIATION_BRL_PER_M2 as Record<string, any>)[landUse];
    if (!appreciation) return { ok: false, reason: 'unknown_land_use' };

    const vi = appreciation[0] * areaM2;
    const vf = appreciation[1] * areaM2;
    const landGain = vf - vi;
    const appreciationPercent = ((vf - vi) / vi) * 100;

    // Ecosystem services NPV
    const hectares = Number(params.hectares ?? areaM2 / 10_000);
    const carbonTonsPerYear = Number(params.carbonTonsPerYear ?? 0);
    const ecosystemYears = Math.max(1, Number(params.ecosystemYears ?? 30));
    const discountRate = Number(params.discountRate ?? 0.08);

    const serviceRates = { ...ECOSYSTEM_SERVICES_BRL, ...(params.ecosystemServices || {}) };

    const annualFlow =
        hectares * serviceRates.waterSourceProtection +
        hectares * serviceRates.biodiversityConservation +
        hectares * serviceRates.soilProtection +
        carbonTonsPerYear * serviceRates.carbonSequestration;

    const ecosystemNPV = calculateNPV(annualFlow, discountRate, ecosystemYears);

    const totalAssetValue = landGain + ecosystemNPV;

    return {
        ok: true,
        landValue: Object.freeze({
            current: vi,
            future: vf,
            gain: landGain,
            appreciationPercent,
        }),
        ecosystemServices: Object.freeze({
            annualFlow,
            npv: ecosystemNPV,
            years: ecosystemYears,
            hectares,
        }),
        totalAssetValue,
    };
}

// ============================================================================
// Cost-Benefit Analysis
// ============================================================================

/**
 * Compute cost-benefit ratio, ROI, and payback horizon.
 *
 * @param totalCost - Sum of all passivos (BRL)
 * @param totalAssetValue - Result of calculateAssetValue (BRL)
 * @param paybackAnnualFlow - Annual cash flow from recovered asset
 */
export function calculateCostBenefit(
    totalCost: number,
    totalAssetValue: number,
    paybackAnnualFlow: number = 0,
): any {
    if (!Number.isFinite(totalCost) || totalCost <= 0) {
        return { ratio: 0, roi: 0, viable: false, payback: null };
    }
    const ratio = totalAssetValue / totalCost;
    const roi = ((totalAssetValue - totalCost) / totalCost) * 100;
    const viable = ratio >= 1;
    const payback = paybackAnnualFlow > 0 ? totalCost / paybackAnnualFlow : null;
    return { ratio, roi, viable, payback };
}

// ============================================================================
// Model Aggregate Report
// ============================================================================

/**
 * Generate a full impact report for a model. Walks the element list and
 * aggregates soil + groundwater + occupational costs, computes asset value
 * and cost-benefit. Used by the HUD card + EIS integration widget.
 *
 * Shape is intentionally structured so UI can render without re-walking
 * elements. Element shape matches ecbyts core/elements schema.
 *
 * @param modelData
 */
export function generateModelImpactReport(modelData: any): any {
    const elements: any[] = Array.isArray(modelData?.elements) ? modelData.elements : [];
    const passivos: any[] = [];
    const environmentalBreakdown = { soil: 0, groundwater: 0, occupational: 0 };
    let totalAreaM2 = 0;

    for (const el of elements) {
        if (!el || typeof el !== 'object') continue;

        // Soil contamination → estimate remediation
        if (el.type === 'plume' || el.family === 'plume') {
            const volume = Number(el.volume ?? el.data?.volume ?? 0);
            if (volume > 0) {
                const contaminant = el.contamination?.type ?? el.data?.contamination?.type ?? 'hydrocarbons';
                const r = estimateSoilRemediation({
                    volume,
                    contaminant,
                    method: el.data?.remediationMethod ?? 'exSitu',
                    complexity: el.data?.geologyComplexity,
                    depth: el.data?.depth,
                    landUse: el.data?.landUse,
                    aquiferImpact: el.data?.aquiferImpact,
                });
                if (r.ok) {
                    passivos.push({ kind: 'soil', elementId: el.id, result: r });
                    environmentalBreakdown.soil += r.estimate.base;
                    const area = Number(el.data?.areaM2 ?? 0);
                    if (area > 0) totalAreaM2 += area;
                }
            }
        }

        // Groundwater element → annual treatment
        if (el.type === 'groundwater' || el.family === 'groundwater') {
            const method = el.data?.treatmentMethod ?? 'pumpAndTreat';
            const years = el.data?.treatmentYears ?? 5;
            const r: any = estimateGroundwaterRemediation({
                method,
                years,
                complexity: el.data?.geologyComplexity,
            });
            if (r.ok) {
                passivos.push({ kind: 'groundwater', elementId: el.id, result: r });
                environmentalBreakdown.groundwater += r.totalNPV.base;
            }
        }
    }

    // Occupational (site-level, from modelData.workers if present)
    let occupationalResult: any = null;
    if (modelData?.workers && modelData.workers.count > 0) {
        occupationalResult = estimateOccupationalImpact({
            workersExposed: modelData.workers.count,
            exposureLevel: modelData.workers.exposureLevel,
            duration: modelData.workers.duration,
            ppeCompliance: modelData.workers.ppeCompliance,
        });
        if (occupationalResult.ok) {
            environmentalBreakdown.occupational += occupationalResult.estimate.base;
        }
    }

    const totalPassivoBase =
        environmentalBreakdown.soil + environmentalBreakdown.groundwater + environmentalBreakdown.occupational;

    // Asset value (only if we have an area)
    let assetValue: any = null;
    if (totalAreaM2 > 0) {
        assetValue = calculateAssetValue({
            areaM2: totalAreaM2,
            landUse: modelData?.landUse ?? 'industrial',
        });
    }

    const costBenefit = calculateCostBenefit(totalPassivoBase, assetValue?.ok ? assetValue.totalAssetValue : 0);

    return {
        passivos,
        breakdown: Object.freeze({ ...environmentalBreakdown }),
        totalPassivoBase,
        occupational: occupationalResult,
        assetValue,
        costBenefit,
        disclaimers: Object.freeze([
            'As estimativas são referenciais e baseadas em benchmarks de mercado, jurisprudência e referências técnicas (CONAMA, CNJ, INSS).',
            'Valores NÃO substituem perícia técnica, avaliação de engenharia ou estudo de viabilidade econômica específico.',
            'Recomenda-se consulta a profissionais especializados para avaliações formais.',
        ]),
        generatedAt: new Date().toISOString(),
    };
}
// ============================================================================
// Scenario Comparison (Phase 1.5 - Claude owner 2026-04-20)
// ============================================================================

/**
 * Compara dois cenários de remediação, devolvendo delta de custo/benefício.
 * Útil para UI mostrar "método A vs B" antes do usuário escolher.
 *
 * Input: dois reports completos de `generateModelImpactReport` (ou estruturas
 * equivalentes com `totalPassivoBase` + `assetValue?.totalAssetValue` +
 * `costBenefit.roi`). Ambos precisam ter sido gerados com o MESMO universo
 * de elementos; comparação cross-modelo distorce.
 *
 * @param scenarioA
 * @param scenarioB
 */
export function compareScenarios(
    scenarioA: any,
    scenarioB: any,
): {
    ok: boolean;
    winner: 'A' | 'B' | 'tie';
    deltaCostBase: number;
    deltaROI: number;
    deltaPayback: number | null;
    recommendation: string;
} {
    if (!scenarioA || !scenarioB) {
        return { ok: false, error: 'Ambos cenários são obrigatórios' } as any;
    }
    const costA = Number(scenarioA.totalPassivoBase ?? 0);
    const costB = Number(scenarioB.totalPassivoBase ?? 0);
    const roiA = Number(scenarioA.costBenefit?.roi ?? 0);
    const roiB = Number(scenarioB.costBenefit?.roi ?? 0);
    const paybackA = scenarioA.costBenefit?.payback ?? null;
    const paybackB = scenarioB.costBenefit?.payback ?? null;

    const deltaCostBase = costB - costA; // positivo = B mais caro
    const deltaROI = roiB - roiA; // positivo = B melhor retorno
    const deltaPayback = paybackA != null && paybackB != null ? paybackB - paybackA : null;

    // Winner heuristic: ROI maior ganha; em empate, menor custo ganha; se ainda empate, payback menor ganha
    const EPS = 0.01;
    let winner: 'A' | 'B' | 'tie';
    if (Math.abs(deltaROI) > EPS) {
        winner = deltaROI > 0 ? 'B' : 'A';
    } else if (Math.abs(deltaCostBase) > EPS) {
        winner = deltaCostBase < 0 ? 'B' : 'A';
    } else if (deltaPayback != null && Math.abs(deltaPayback) > EPS) {
        winner = deltaPayback < 0 ? 'B' : 'A';
    } else {
        winner = 'tie';
    }

    const labelA = scenarioA.label || 'A';
    const labelB = scenarioB.label || 'B';
    let recommendation;
    if (winner === 'tie') {
        recommendation = `${labelA} e ${labelB} equivalentes nos critérios medidos.`;
    } else {
        const winnerLabel = winner === 'A' ? labelA : labelB;
        recommendation = `${winnerLabel} preferido: ROI ${Math.abs(deltaROI).toFixed(1)}pp maior + custo ${Math.abs(deltaCostBase).toFixed(0)} BRL ${deltaCostBase < 0 ? 'menor' : 'maior'}.`;
    }

    return {
        ok: true,
        winner,
        deltaCostBase,
        deltaROI,
        deltaPayback,
        recommendation,
    };
}

/**
 * Aggregates passivos por family para UI exibir breakdown visual
 * ("Plumes: X, Wells: Y"). Útil para cards comparativos no HUD.
 *
 * @param report - output de `generateModelImpactReport`
 */
export function aggregateByFamily(report: any): {
    ok: boolean;
    byFamily: Record<string, { count: number; baseCost: number; kinds: string[] }>;
} {
    if (!report?.passivos || !Array.isArray(report.passivos)) {
        return { ok: false, error: 'report.passivos ausente ou inválido' } as any;
    }
    const byFamily: Record<string, { count: number; baseCost: number; kinds: string[] }> = {};
    for (const p of report.passivos) {
        const family = p.kind || 'unknown';
        if (!byFamily[family]) {
            byFamily[family] = { count: 0, baseCost: 0, kinds: [] };
        }
        byFamily[family].count += 1;
        const cost = p.kind === 'groundwater' ? p.result?.totalNPV?.base : p.result?.estimate?.base;
        byFamily[family].baseCost += Number(cost ?? 0);
        if (p.elementId && !byFamily[family].kinds.includes(p.elementId)) {
            byFamily[family].kinds.push(p.elementId);
        }
    }
    return { ok: true, byFamily };
}

// ============================================================================
// Sensitivity Analysis (Phase 2 enhancement - Claude owner 2026-04-23)
// ============================================================================

/**
 * One-at-a-time (OAT) sensitivity sweep: vary a single numeric parameter
 * linearly across [range.min, range.max] in `steps` points, call the
 * estimator at each, and return the scalar impact metric.
 *
 * Pure and deterministic - given the same inputs, emits the same output.
 * Useful for (a) tornado-style charts, (b) threshold discovery
 * (find param value that crosses threshold), (c) elasticity of impact
 * relative to a driver parameter before committing to Monte Carlo.
 *
 * The `extract` callback pulls the scalar from the estimator output;
 * default pulls `result.estimate.base` to match soil/occupational shape.
 * For groundwater override with `r => r.totalNPV.base`. For assetValue
 * use `r => r.totalAssetValue`.
 *
 * Elasticity is computed endpoint-to-endpoint:
 *   E = ((impactMax - impactMin) / impactMin) / ((paramMax - paramMin) / paramMin)
 *
 * @param options
 */
export function sensitivityAnalysis(options: {
    estimator: Function;
    params: object;
    param: string;
    range: { min: number; max: number };
    steps?: number;
    extract?: Function;
}): any {
    if (!options || typeof options !== 'object') {
        return { ok: false, reason: 'options_required' };
    }
    const { estimator, params, param, range, steps = 11, extract } = options;
    if (typeof estimator !== 'function') {
        return { ok: false, reason: 'invalid_estimator' };
    }
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'invalid_params' };
    }
    if (typeof param !== 'string' || param.length === 0) {
        return { ok: false, reason: 'invalid_param' };
    }
    if (!range || typeof range !== 'object') {
        return { ok: false, reason: 'invalid_range' };
    }
    const minV = Number(range.min);
    const maxV = Number(range.max);
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
        return { ok: false, reason: 'non_finite_range' };
    }
    if (minV >= maxV) {
        throw new RangeError(`sensitivityAnalysis: range.min (${minV}) must be < range.max (${maxV})`);
    }
    const nSteps = Math.floor(Number(steps));
    if (!Number.isFinite(nSteps) || nSteps < 2) {
        return { ok: false, reason: 'invalid_steps' };
    }

    const extractor =
        typeof extract === 'function' ? extract : (r: any) => (r && r.ok ? Number(r?.estimate?.base ?? 0) : 0);

    const stride = (maxV - minV) / (nSteps - 1);
    const rawPoints: Array<{ paramValue: number; impact: number }> = [];
    for (let i = 0; i < nSteps; i++) {
        const paramValue = i === nSteps - 1 ? maxV : minV + stride * i;
        const localParams = { ...params, [param]: paramValue };
        let impact: number;
        try {
            const result = estimator(localParams);
            const scalar = Number(extractor(result));
            impact = Number.isFinite(scalar) ? scalar : 0;
        } catch (_err) {
            impact = 0;
        }
        rawPoints.push(Object.freeze({ paramValue, impact }));
    }

    const impacts = rawPoints.map((p) => p.impact);
    const impactMin = Math.min(...impacts);
    const impactMax = Math.max(...impacts);
    const spread = impactMax - impactMin;

    // Elasticity endpoint-to-endpoint; null when base impact/param is zero
    // or when denominators would divide-by-zero.
    let elasticity: number | null = null;
    const baseImpact = rawPoints[0]!.impact;
    const baseParam = rawPoints[0]!.paramValue;
    const endImpact = rawPoints[rawPoints.length - 1]!.impact;
    const endParam = rawPoints[rawPoints.length - 1]!.paramValue;
    if (baseImpact !== 0 && baseParam !== 0) {
        const paramFracChange = (endParam - baseParam) / baseParam;
        const impactFracChange = (endImpact - baseImpact) / baseImpact;
        if (paramFracChange !== 0 && Number.isFinite(paramFracChange)) {
            elasticity = impactFracChange / paramFracChange;
        }
    }

    // Monotonic check: strictly non-decreasing OR strictly non-increasing.
    // Tolerance of 1e-9 × |max| to absorb FP noise.
    const tol = Math.max(1e-9, Math.abs(impactMax) * 1e-12);
    let nonDecreasing = true;
    let nonIncreasing = true;
    for (let i = 1; i < impacts.length; i++) {
        if (impacts[i]! < impacts[i - 1]! - tol) nonDecreasing = false;
        if (impacts[i]! > impacts[i - 1]! + tol) nonIncreasing = false;
    }
    const monotonic = nonDecreasing || nonIncreasing;

    return Object.freeze({
        ok: true,
        param,
        points: Object.freeze(rawPoints),
        min: impactMin,
        max: impactMax,
        spread,
        elasticity,
        monotonic,
    });
}
