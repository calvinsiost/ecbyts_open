// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROTOCOL VALIDATION FINDING - score explicavel com achados
   legiveis (PIPELINE-UNIFIED-PROTOCOL #8).

   "Score pouco explicavel: score deve gerar lista legivel de
   pendencias; numero sem achados explicados nao aprova."
   (SPEC_PIPELINE_UNIFIED_PROTOCOL.md, blind spot "Score pouco
   explicavel").

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface ProtocolValidationFinding {
    rule: string;
    severity: FindingSeverity;
    message: string;
    score: number;
    evidence: string;
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
    error: 1.0,
    warning: 0.5,
    info: 0.1,
};

/**
 * Compute a validation score from 0 to 100. Starts at 100 and deducts
 * points proportional to each finding's score field weighted by severity.
 * Errors deduct fully, warnings half, info a tenth. The result is clamped
 * to [0, 100] and rounded to one decimal place.
 *
 * @param {ProtocolValidationFinding[]} findings
 * @returns {number} score between 0 and 100
 */
export function computeValidationScore(findings: ProtocolValidationFinding[]): number {
    if (!Array.isArray(findings) || findings.length === 0) return 100;

    let deduction = 0;
    for (const finding of findings) {
        const raw = Number(finding.score);
        const points = Number.isFinite(raw) && raw > 0 ? raw : 0;
        const weight = SEVERITY_WEIGHT[finding.severity] ?? 1.0;
        deduction += points * weight;
    }

    const score = 100 - deduction;
    const clamped = Math.max(0, Math.min(100, score));
    return Math.round(clamped * 10) / 10;
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
    error: 'ERRO',
    warning: 'AVISO',
    info: 'INFO',
};

/**
 * Format findings into human-readable strings, one per finding. Each line
 * contains the severity label, the rule identifier, the plain-language
 * message, the score impact, and the evidence. Sorted by severity
 * (errors first, then warnings, then info) and within the same severity
 * by descending score impact.
 *
 * @param {ProtocolValidationFinding[]} findings
 * @returns {string[]} one formatted string per finding
 */
export function formatFindings(findings: ProtocolValidationFinding[]): string[] {
    if (!Array.isArray(findings) || findings.length === 0) return [];

    const severityOrder: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

    const sorted = [...findings].sort((a, b) => {
        const orderDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
        if (orderDiff !== 0) return orderDiff;
        const scoreA = Number.isFinite(Number(a.score)) ? Number(a.score) : 0;
        const scoreB = Number.isFinite(Number(b.score)) ? Number(b.score) : 0;
        return scoreB - scoreA;
    });

    return sorted.map((finding) => {
        const label = SEVERITY_LABEL[finding.severity] ?? 'ERRO';
        const rule = String(finding.rule || 'regra-desconhecida').trim() || 'regra-desconhecida';
        const message = String(finding.message || 'Pendencia sem descricao.').trim() || 'Pendencia sem descricao.';
        const raw = Number(finding.score);
        const points = Number.isFinite(raw) && raw > 0 ? raw : 0;
        const evidence = String(finding.evidence || '').trim();
        const evidencePart = evidence ? ` | Evidencia: ${evidence}` : '';
        return `[${label}] ${rule}: ${message} (impacto: ${points} pts)${evidencePart}`;
    });
}
