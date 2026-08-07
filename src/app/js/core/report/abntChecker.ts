// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ABNT CHECKER — SPEC_REPORT_SCRIPTS_LIBRARY §ABNT Checker

   Pure helpers para validação de referências técnicas em relatórios:
   - Detect patterns: ABNT NBR, ISO, CONAMA, NR, CETESB §Q3
   - Vigência check via tabela JSON
   - Sugestões de correção para formatos incorretos
   - Severity classification (error/warning/info)

   UI panel + fix application ficam em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §ABNT Checker
// ──────────────────────────────────────────────────────────────────────

export const ISSUE_SEVERITY = Object.freeze(['error', 'warning', 'info']);

// Patterns canônicos
export const NORM_PATTERNS = Object.freeze({
    ABNT_NBR: /\bABNT\s+NBR\s+(\d+)(?:[-:](\d+))?(?::(\d{4}))?/gi,
    NBR_SHORT: /\bNBR\s+(\d+)(?:[-:](\d+))?(?::(\d{4}))?/gi,
    ISO: /\bISO\s+(\d+)(?:[-:](\d+))?(?::(\d{4}))?/gi,
    CONAMA: /\bCONAMA\s+(?:Res(?:olução)?\.?\s+)?n?º?\s*(\d+)\/(\d{2,4})/gi,
    NR: /\bNR[-\s]?(\d+)\b/gi,
    CETESB: /\bCETESB\s+(?:DD|Deliberação|Decisão)[-\s]?(\d+)\/(\d{2,4})/gi,
});

// Tabela de vigência (subset) - normas ambientais principais
export const NORM_REGISTRY = Object.freeze({
    // ABNT ambientais comuns
    'ABNT NBR 10004': { year: 2004, status: 'active', topic: 'Resíduos sólidos' },
    'ABNT NBR 10005': { year: 2004, status: 'active', topic: 'Lixiviação' },
    'ABNT NBR 10006': { year: 2004, status: 'active', topic: 'Solubilização' },
    'ABNT NBR 10007': { year: 2004, status: 'active', topic: 'Amostragem de resíduos' },
    'ABNT NBR 15495': { year: 2007, status: 'active', topic: 'Poços de monitoramento' },
    'ABNT NBR 15515': { year: 2007, status: 'active', topic: 'Avaliação preliminar' },
    'ABNT NBR 16435': { year: 2015, status: 'active', topic: 'Gestão ambiental' },
    // CONAMA
    'CONAMA 357/2005': { year: 2005, status: 'active', topic: 'Classificação águas' },
    'CONAMA 420/2009': { year: 2009, status: 'active', topic: 'Qualidade do solo' },
    'CONAMA 430/2011': { year: 2011, status: 'active', topic: 'Efluentes' },
    // NRs (saúde ocupacional)
    'NR-6': { year: 1978, status: 'active', topic: 'EPI' },
    'NR-7': { year: 1978, status: 'active', topic: 'PCMSO' },
    'NR-9': { year: 1978, status: 'active', topic: 'PGR (PPRA legado)' },
    'NR-15': { year: 1978, status: 'active', topic: 'Atividades insalubres' },
    'NR-22': { year: 1999, status: 'active', topic: 'Mineração' },
    // ISO
    'ISO 14001': { year: 2015, status: 'active', topic: 'EMS' },
    'ISO 14040': { year: 2006, status: 'active', topic: 'LCA' },
    'ISO 17025': { year: 2017, status: 'active', topic: 'Acreditação lab' },
    // Deprecadas
    'ABNT NBR 13895': {
        year: 1997,
        status: 'deprecated',
        topic: 'Construção poços (use 15495)',
        replacedBy: 'ABNT NBR 15495',
    },
});

// ──────────────────────────────────────────────────────────────────────
// Detection
// ──────────────────────────────────────────────────────────────────────

/**
 * Extrai todas as referências normativas de um texto.
 * @param text
 * @returns
 */
export function detectNorms(text: string): Array<any> {
    if (typeof text !== 'string') return [];
    const results: any[] = [];
    for (const [type, regex] of Object.entries(NORM_PATTERNS)) {
        const re = new RegExp(regex.source, regex.flags);
        let m;
        while ((m = re.exec(text)) !== null) {
            results.push({
                type,
                normId: _normalizeNormId(type, m),
                match: m[0],
                index: m.index,
            });
        }
    }
    return results.sort((a, b) => a.index - b.index);
}

function _normalizeNormId(type: any, match: any): any {
    if (type === 'ABNT_NBR') return `ABNT NBR ${match[1]}`;
    if (type === 'NBR_SHORT') return `ABNT NBR ${match[1]}`;
    if (type === 'ISO') return `ISO ${match[1]}`;
    if (type === 'CONAMA') {
        const year = match[2].length === 2 ? (match[2] > '50' ? `19${match[2]}` : `20${match[2]}`) : match[2];
        return `CONAMA ${match[1]}/${year}`;
    }
    if (type === 'NR') return `NR-${match[1]}`;
    if (type === 'CETESB') {
        const year = match[2].length === 2 ? (match[2] > '50' ? `19${match[2]}` : `20${match[2]}`) : match[2];
        return `CETESB ${match[1]}/${year}`;
    }
    return match[0];
}

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica vigência de uma norma detectada.
 * @param normId - ex: "ABNT NBR 10004"
 * @returns
 */
export function checkNormStatus(normId: string): any {
    const entry = (NORM_REGISTRY as Record<string, any>)[normId];
    if (!entry) {
        return {
            status: 'unknown',
            severity: 'info',
        };
    }
    if (entry.status === 'deprecated') {
        return {
            status: 'deprecated',
            severity: 'warning',
            replacedBy: entry.replacedBy || null,
            topic: entry.topic,
            year: entry.year,
        };
    }
    return {
        status: 'active',
        severity: 'info',
        topic: entry.topic,
        year: entry.year,
    };
}

/**
 * Roda checker completo: detecta + valida + gera issues.
 * @param text
 * @returns
 */
export function runAbntCheck(text: string): Array<any> {
    const norms = detectNorms(text);
    const issues: any[] = [];
    for (const n of norms) {
        const status = checkNormStatus(n.normId);
        if (status.status === 'deprecated') {
            issues.push({
                normId: n.normId,
                match: n.match,
                index: n.index,
                severity: 'warning',
                message: `${n.normId} foi deprecada${status.replacedBy ? ` — use ${status.replacedBy}` : ''}.`,
                suggestion: status.replacedBy,
            });
        } else if (status.status === 'unknown') {
            issues.push({
                normId: n.normId,
                match: n.match,
                index: n.index,
                severity: 'info',
                message: `${n.normId} não está no registry — verifique vigência manualmente.`,
                suggestion: null,
            });
        }
    }
    return issues;
}

// ──────────────────────────────────────────────────────────────────────
// Format suggestions (sugestões §Spec to Green)
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta formato problemático e sugere correção ABNT canônica.
 * Ex: "nbr 10004" → "ABNT NBR 10004:2004"
 *
 * @param text
 * @returns
 */
export function suggestFormatCorrections(text: string): Array<any> {
    if (typeof text !== 'string') return [];
    const results: any[] = [];

    // "nbr 10004" lowercase → "ABNT NBR 10004:year"
    const nbrLower = /\bnbr\s+(\d+)\b/g;
    let m;
    while ((m = nbrLower.exec(text)) !== null) {
        // Só sugere se não estiver precedido por ABNT
        const before = text.substring(Math.max(0, m.index - 10), m.index).toUpperCase();
        if (before.includes('ABNT')) continue;
        const normId = `ABNT NBR ${m[1]}`;
        const entry = (NORM_REGISTRY as Record<string, any>)[normId];
        const suggestion = entry ? `${normId}:${entry.year}` : normId;
        results.push({ match: m[0], suggestion, index: m.index });
    }

    return results;
}

// ──────────────────────────────────────────────────────────────────────
// Issue summary
// ──────────────────────────────────────────────────────────────────────

/**
 * @param issues
 * @returns
 */
export function summarizeIssues(issues: Array<any>): any {
    const result: any = {
        total: Array.isArray(issues) ? issues.length : 0,
        bySeverity: { error: 0, warning: 0, info: 0 },
    };
    if (!Array.isArray(issues)) return result;
    for (const i of issues) {
        if (i && ISSUE_SEVERITY.includes(i.severity)) {
            result.bySeverity[i.severity]++;
        }
    }
    return result;
}
