// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (governance/wbsManager).
//
// utils/governance/wbsManager.ts (984L) tem Earned Value Analysis (EVA) como
// matemática financeira pura (PMBOK Guide 7th ed. §2.6.4 / PMI EVM standard).
// Extração libera teste numérico isolado + citação acadêmica (doutorado Poli/USP).
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. 11º Module C da campanha.
//
// Spec NOT:
// - NÃO ler module state (wbsItems — caller passa item EVA inputs)
// - NÃO chamar calculateScheduledPercent (caller resolve percentScheduled)
// - NÃO emoji
//
// Extracted helpers:
//   - EvaInput / EvaMetrics / EvaDeviation (canonical types)
//   - EVA_DEFAULT_THRESHOLDS          (frozen SPI/CPI = 0.8)
//   - computeEva(input)               pure PMI EVM formulas
//   - aggregateEva(evaList)           pure roll-up (project-level)
//   - detectEvaDeviations(evaList, spiThreshold, cpiThreshold)  pure threshold scan

export interface EvaInput {
    /** Budget At Completion (orçamento total planejado). */
    bac: number;
    /** % do cronograma planejado decorrido [0-100]. */
    percentScheduled: number;
    /** % físico concluído [0-100]. */
    percentComplete: number;
    /** Actual Cost (custo real incorrido). */
    ac: number;
}

export interface EvaMetrics {
    BAC: number;
    PV: number; // Planned Value
    EV: number; // Earned Value
    AC: number; // Actual Cost
    SV: number; // Schedule Variance (EV - PV)
    CV: number; // Cost Variance (EV - AC)
    SPI: number; // Schedule Performance Index (EV / PV)
    CPI: number; // Cost Performance Index (EV / AC)
    EAC: number; // Estimate At Completion
    ETC: number; // Estimate To Complete
    VAC: number; // Variance At Completion
    percentScheduled: number;
    percentComplete: number;
}

export interface EvaDeviationIssue {
    metric: 'SPI' | 'CPI';
    value: number;
    threshold: number;
}

export interface EvaDeviation<TItem = unknown> {
    item: TItem;
    issues: EvaDeviationIssue[];
    eva: EvaMetrics;
}

/**
 * Frozen default thresholds para detecção de desvio.
 * SPI/CPI < 0.8 = projeto em risco (PMI rule-of-thumb).
 * Matches detectDeviations defaults @ wbsManager.ts:339.
 */
export const EVA_DEFAULT_THRESHOLDS = Object.freeze({ spi: 0.8, cpi: 0.8 });

/**
 * Compute Earned Value Analysis metrics (PMI EVM standard).
 *
 * Fórmulas (PMBOK Guide 7th ed. §2.6.4):
 *   PV  = BAC × (%scheduled / 100)
 *   EV  = BAC × (%complete / 100)
 *   SV  = EV − PV          (variância de cronograma)
 *   CV  = EV − AC          (variância de custo)
 *   SPI = EV / PV          (índice desempenho cronograma; 0 se PV=0)
 *   CPI = EV / AC          (índice desempenho custo; 0 se AC=0)
 *   EAC = AC + (BAC − EV) / CPI   (estimativa no término; BAC se CPI=0)
 *   ETC = EAC − AC         (estimativa para terminar)
 *   VAC = BAC − EAC        (variância no término)
 *
 * Matches calculateEVA body @ wbsManager.ts:245-279 (mas pure — sem item lookup).
 */
export function computeEva(input: EvaInput): EvaMetrics {
    const BAC = Number(input.bac) || 0;
    const percentScheduled = Number(input.percentScheduled) || 0;
    const percentComplete = Number(input.percentComplete) || 0;
    const AC = Number(input.ac) || 0;

    const PV = BAC * (percentScheduled / 100);
    const EV = BAC * (percentComplete / 100);
    const SV = EV - PV;
    const CV = EV - AC;
    const SPI = PV !== 0 ? EV / PV : 0;
    const CPI = AC !== 0 ? EV / AC : 0;
    const EAC = CPI !== 0 ? AC + (BAC - EV) / CPI : BAC;
    const ETC = EAC - AC;
    const VAC = BAC - EAC;

    return { BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC, percentScheduled, percentComplete };
}

/**
 * Aggregate EVA metrics across multiple items (project roll-up).
 * Soma BAC/PV/EV/AC e recalcula índices derivados sobre os totais.
 *
 * Matches calculateProjectEVA @ wbsManager.ts:288-329 (mas pure — caller passa
 * lista de EvaMetrics dos roots; não faz item lookup nem recursão).
 */
export function aggregateEva(evaList: ReadonlyArray<EvaMetrics>): EvaMetrics & { itemCount: number } {
    let totalBAC = 0;
    let totalPV = 0;
    let totalEV = 0;
    let totalAC = 0;
    for (const eva of evaList) {
        totalBAC += eva.BAC;
        totalPV += eva.PV;
        totalEV += eva.EV;
        totalAC += eva.AC;
    }
    const SV = totalEV - totalPV;
    const CV = totalEV - totalAC;
    const SPI = totalPV !== 0 ? totalEV / totalPV : 0;
    const CPI = totalAC !== 0 ? totalEV / totalAC : 0;
    const EAC = CPI !== 0 ? totalAC + (totalBAC - totalEV) / CPI : totalBAC;
    const ETC = EAC - totalAC;
    const VAC = totalBAC - EAC;
    return {
        BAC: totalBAC,
        PV: totalPV,
        EV: totalEV,
        AC: totalAC,
        SV,
        CV,
        SPI,
        CPI,
        EAC,
        ETC,
        VAC,
        percentScheduled: totalBAC !== 0 ? (totalPV / totalBAC) * 100 : 0,
        percentComplete: totalBAC !== 0 ? (totalEV / totalBAC) * 100 : 0,
        itemCount: evaList.length,
    };
}

/**
 * Detect EVA deviations beyond thresholds.
 * Caller passa lista de { item, eva } pré-computados; pure scan.
 *   SPI < spiThreshold E PV > 0 → issue SPI
 *   CPI < cpiThreshold E AC > 0 → issue CPI
 *   BAC === 0 → item ignorado (sem baseline)
 *
 * Matches detectDeviations @ wbsManager.ts:339-368 (mas pure).
 */
export function detectEvaDeviations<TItem>(
    evaList: ReadonlyArray<{ item: TItem; eva: EvaMetrics }>,
    spiThreshold: number = EVA_DEFAULT_THRESHOLDS.spi,
    cpiThreshold: number = EVA_DEFAULT_THRESHOLDS.cpi,
): EvaDeviation<TItem>[] {
    const deviations: EvaDeviation<TItem>[] = [];
    for (const { item, eva } of evaList) {
        if (!eva || eva.BAC === 0) continue;
        const issues: EvaDeviationIssue[] = [];
        if (eva.SPI < spiThreshold && eva.PV > 0) {
            issues.push({ metric: 'SPI', value: eva.SPI, threshold: spiThreshold });
        }
        if (eva.CPI < cpiThreshold && eva.AC > 0) {
            issues.push({ metric: 'CPI', value: eva.CPI, threshold: cpiThreshold });
        }
        if (issues.length > 0) {
            deviations.push({ item, issues, eva });
        }
    }
    return deviations;
}

/**
 * Classify EVA health by SPI/CPI (helper para badges UI).
 *   SPI E CPI estritamente > 1.0 → 'ahead' (melhor que o planejado em ambos)
 *   SPI E CPI ≥ threshold → 'on_track' (inclui exatamente 1.0 = no plano)
 *   senão → 'at_risk'
 */
export function classifyEvaHealth(
    eva: EvaMetrics,
    spiThreshold: number = EVA_DEFAULT_THRESHOLDS.spi,
    cpiThreshold: number = EVA_DEFAULT_THRESHOLDS.cpi,
): 'ahead' | 'on_track' | 'at_risk' {
    if (eva.SPI > 1.0 && eva.CPI > 1.0) return 'ahead';
    if (eva.SPI >= spiThreshold && eva.CPI >= cpiThreshold) return 'on_track';
    return 'at_risk';
}
