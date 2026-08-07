// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty - criticality ratio (UNC-STRUCTURAL-001 Fase 1b)

   Replaces the old "U rel absolute threshold" semaphore (10%/25%)
   with EPA-Expobox-style proximity-to-limit ratio:

     criticality_ratio = |measured - threshold| / U_expanded

   Interpretation:
     >= 3       -> GREEN    (3sigma headroom; decision is safe)
     1 <= r < 3 -> YELLOW   (close to limit; inspect drivers)
     < 1        -> RED      (CI crosses limit; decision not auditable)

   Source: EPA Expobox "Uncertainty and Variability" - uncertainty must be
   evaluated relative to the regulatory threshold, not in isolation.
   ================================================================ */

export type CriticalityBand = 'green' | 'yellow' | 'red' | 'unknown';

export interface CriticalityEvaluation {
    ratio: number | null;
    band: CriticalityBand;
    label: string;
}

export function criticalityRatio(measured: unknown, threshold: unknown, uExpanded: unknown): number | null {
    const m = Number(measured);
    const t = Number(threshold);
    const u = Number(uExpanded);
    if (!Number.isFinite(m) || !Number.isFinite(t)) return null;
    if (!Number.isFinite(u) || u <= 0) return null;
    return Math.abs(m - t) / u;
}

export function criticalityBand(ratio: number | null | undefined): CriticalityBand {
    if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return 'unknown';
    if (ratio >= 3) return 'green';
    if (ratio >= 1) return 'yellow';
    return 'red';
}

export function criticalityLabelPt(band: unknown): string {
    switch (band) {
        case 'green':
            return 'Decisão segura — 3σ de folga até o limite';
        case 'yellow':
            return 'Atenção — próximo do limite regulatório';
        case 'red':
            return 'Crítico — IC cruza o limite, decisão não auditável';
        default:
            return 'Indisponível — dados insuficientes';
    }
}

export function evaluateCriticality(measured: unknown, threshold: unknown, uExpanded: unknown): CriticalityEvaluation {
    const ratio = criticalityRatio(measured, threshold, uExpanded);
    const band = criticalityBand(ratio);
    return { ratio, band, label: criticalityLabelPt(band) };
}
