// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Compliance Checker (NBR 15495-1)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   WELL COMPLIANCE CHECKER — Verificação de conformidade NBR 15495-1

   Avalia o perfil construtivo de um poço de monitoramento contra
   os requisitos mínimos da norma NBR 15495-1 (ABNT 2007):
   "Poços de monitoramento de águas subterrâneas em aquíferos granulares
   - Parte 1: Projeto e construção".

   Cada regra retorna: { code, severity, message, reference, passed }
   Score: 100 − penalidades acumuladas (error=15, warning=7, info=0)
   Verdict: 'ok' (≥80), 'warning' (≥50), 'error' (<50)

   Referência: ABNT NBR 15495-1:2007
   ================================================================ */

type IssueSeverity = 'error' | 'warning' | 'info';

interface ComplianceIssue {
    /** Código da regra (ex: 'W-C01') */
    code: string;
    severity: IssueSeverity;
    /** Descrição da não-conformidade */
    message: string;
    /** Norma de referência */
    reference: string;
    /** true se a regra passou */
    passed: boolean;
}

interface ComplianceResult {
    /** 0–100 (100 = totalmente conforme) */
    score: number;
    verdict: 'ok' | 'warning' | 'error';
    /** Todas as regras verificadas */
    issues: ComplianceIssue[];
}

const REF = 'NBR 15495-1';
const EPSILON = 0.01; // tolerância em metros

// Penalidades por severidade (descontam do score 100)
const PENALTY = { error: 15, warning: 7, info: 0 };

/**
 * Verifica conformidade de um perfil de poço com NBR 15495-1.
 *
 * @param profile - element.data.profile
 */
export function checkWellCompliance(profile: Record<string, any>): ComplianceResult {
    const issues: ComplianceIssue[] = [];

    const constructive = profile?.constructive || {};
    const lithologic = profile?.lithologic || [];
    const elements = constructive.elements || [];
    const waterLevel = profile?.waterLevel;

    // ------------------------------------------------------------------
    // W-C01 - Profundidade total ≤ profundidade de perfuração
    // ------------------------------------------------------------------
    {
        const totalDepth = constructive.totalDepth ?? 0;
        const drillingDepth = constructive.drillingDepth ?? 0;
        const passed = drillingDepth === 0 || totalDepth <= drillingDepth + EPSILON;
        issues.push({
            code: 'W-C01',
            severity: 'error',
            message: `Profundidade total (${totalDepth} m) não deve exceder a profundidade de perfuração (${drillingDepth} m).`,
            reference: REF,
            passed,
        });
    }

    // ------------------------------------------------------------------
    // W-C02 - Selo de bentonita ≥ 2 m de espessura
    // ------------------------------------------------------------------
    {
        const bentoniteEls = elements.filter((e: any) => e.type === 'bentonite_seal');
        let passed: boolean;
        if (bentoniteEls.length > 0) {
            const thickness = bentoniteEls.reduce((sum: any, e: any) => {
                const top = e.topDepth ?? e.from ?? 0;
                const bot = e.bottomDepth ?? e.to ?? 0;
                return sum + Math.abs(bot - top);
            }, 0);
            passed = thickness >= 2 - EPSILON;
            issues.push({
                code: 'W-C02',
                severity: 'error',
                message: `Espessura total de bentonita: ${thickness.toFixed(1)} m (mínimo: 2,0 m conforme item 5.4.3).`,
                reference: REF,
                passed,
            });
        } else {
            // Sem bentonita registrada - tratar como warning
            issues.push({
                code: 'W-C02',
                severity: 'warning',
                message: 'Nenhum elemento de bentonita registrado. Selo superficial obrigatório (item 5.4.3).',
                reference: REF,
                passed: false,
            });
        }
    }

    // ------------------------------------------------------------------
    // W-C03 - Revestimento liso deve cobrir ≥ 2 m acima do filtro
    // ------------------------------------------------------------------
    {
        const screens = elements.filter((e: any) => e.type === 'screen');
        const casings = elements.filter((e: any) => e.type === 'blank_casing');
        let passed: boolean;
        if (screens.length > 0 && casings.length > 0) {
            // Topo do filtro mais raso
            const screenTopMin = Math.min(...screens.map((e: any) => e.topDepth ?? e.from ?? 0));
            // Base do revestimento mais profundo que termina acima do filtro
            const casingCover = casings.some((e: any) => {
                const casingBot = e.bottomDepth ?? e.to ?? 0;
                return casingBot >= screenTopMin - EPSILON;
            });
            const coverDepth = casings.reduce((best: any, e: any) => {
                const bot = e.bottomDepth ?? e.to ?? 0;
                return bot > best ? bot : best;
            }, 0);
            const _margin = screenTopMin - (casings[0]?.topDepth ?? casings[0]?.from ?? 0);
            passed = casingCover && coverDepth >= screenTopMin - EPSILON;
            issues.push({
                code: 'W-C03',
                severity: 'error',
                message: `Revestimento liso até ${coverDepth.toFixed(1)} m; topo do filtro em ${screenTopMin.toFixed(1)} m (item 5.3.2).`,
                reference: REF,
                passed,
            });
        } else if (screens.length === 0) {
            issues.push({
                code: 'W-C03',
                severity: 'warning',
                message: 'Nenhum filtro (screen) registrado no perfil construtivo.',
                reference: REF,
                passed: false,
            });
        }
    }

    // ------------------------------------------------------------------
    // W-C04 - Camadas litológicas sem lacuna (gap > EPSILON)
    // ------------------------------------------------------------------
    {
        let passed = true;
        let gapDesc = '';
        if (lithologic.length > 1) {
            const sorted = [...lithologic].sort((a, b) => a.from - b.from);
            for (let i = 0; i < sorted.length - 1; i++) {
                const gap = sorted[i + 1].from - sorted[i].to;
                if (gap > EPSILON) {
                    passed = false;
                    gapDesc = `lacuna de ${gap.toFixed(2)} m em ${sorted[i].to.toFixed(1)}–${sorted[i + 1].from.toFixed(1)} m`;
                    break;
                }
            }
        }
        issues.push({
            code: 'W-C04',
            severity: 'error',
            message: passed ? 'Camadas litológicas contínuas sem lacunas.' : `Descontinuidade litológica: ${gapDesc}.`,
            reference: REF,
            passed,
        });
    }

    // ------------------------------------------------------------------
    // W-C05 - Pelo menos 1 camada litológica
    // ------------------------------------------------------------------
    {
        const passed = lithologic.length >= 1;
        issues.push({
            code: 'W-C05',
            severity: 'warning',
            message: passed
                ? `${lithologic.length} camada(s) litológica(s) registrada(s).`
                : 'Nenhuma camada litológica registrada (recomendado pela norma).',
            reference: REF,
            passed,
        });
    }

    // ------------------------------------------------------------------
    // W-C06 - Nível d'água documentado
    // ------------------------------------------------------------------
    {
        const passed = waterLevel?.depth != null;
        issues.push({
            code: 'W-C06',
            severity: 'info',
            message: passed
                ? `Nível d'água documentado em ${waterLevel.depth.toFixed(2)} m.`
                : "Nível d'água não documentado (recomendado registrar na conclusão do poço).",
            reference: REF,
            passed,
        });
    }

    // ------------------------------------------------------------------
    // W-C07 - Diâmetro do revestimento ≤ diâmetro de perfuração
    // ------------------------------------------------------------------
    {
        const boreDiam = constructive.boreholeDiameter ?? 0;
        const casingDiam = constructive.casingDiameter ?? 0;
        const passed = boreDiam === 0 || casingDiam === 0 || casingDiam <= boreDiam + EPSILON;
        issues.push({
            code: 'W-C07',
            severity: 'warning',
            message: passed
                ? `Diâmetro revestimento ${casingDiam}" ≤ perfuração ${boreDiam}" (item 5.2.1).`
                : `Diâmetro revestimento ${casingDiam}" excede perfuração ${boreDiam}" (item 5.2.1).`,
            reference: REF,
            passed,
        });
    }

    // ------------------------------------------------------------------
    // W-C08 - Filtro abaixo do nível d'água
    // ------------------------------------------------------------------
    {
        const screens = elements.filter((e: any) => e.type === 'screen');
        if (screens.length > 0 && waterLevel?.depth != null) {
            const screenTopMin = Math.min(...screens.map((e: any) => e.topDepth ?? e.from ?? 0));
            const passed = screenTopMin >= waterLevel.depth - EPSILON;
            issues.push({
                code: 'W-C08',
                severity: 'warning',
                message: passed
                    ? `Filtro em ${screenTopMin.toFixed(1)} m, abaixo do NA em ${waterLevel.depth.toFixed(2)} m.`
                    : `Filtro em ${screenTopMin.toFixed(1)} m está acima do NA em ${waterLevel.depth.toFixed(2)} m (item 5.3.1).`,
                reference: REF,
                passed,
            });
        }
        // Se sem filtro ou sem NA, W-C03/W-C06 já cobriram
    }

    // ------------------------------------------------------------------
    // SCORE - desconta penalidades por regra não aprovada
    // ------------------------------------------------------------------
    let score = 100;
    for (const issue of issues) {
        if (!issue.passed) {
            score -= (PENALTY as Record<string, number>)[issue.severity] || 0;
        }
    }
    score = Math.max(0, score);

    const verdict = score >= 80 ? 'ok' : score >= 50 ? 'warning' : 'error';

    return { score, verdict, issues };
}
