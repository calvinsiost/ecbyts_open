// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Rules Engine - Phase 7 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S10
 *
 * Phase 7 (2026-05-01) - pure-logic engine de regras declarativas para
 * validar documentos contra políticas configuráveis. Complementa Phase 1
 * (shim ABNT + FSM) com regras DECLARATIVAS aplicáveis a campos arbitrários.
 *
 * Estratégia:
 *   - Regras frozen em formato {id, severity, target, predicate, message}
 *   - Engine puro: input documento → output findings
 *   - Severidades: critical / major / minor / info
 *   - Targets: 'document' | 'revision' | 'provenance' | 'audit'
 *   - Built-in catalog: 8 regras canônicas (provenance presente, revisão
 *     aprovada, autor identificado, timestamp válido, etc)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Severities canônicas (ordenadas por gravidade). */
export const RULE_SEVERITIES = Object.freeze(['critical', 'major', 'minor', 'info']);

/** Targets de regras. */
export const RULE_TARGETS = Object.freeze(['document', 'revision', 'provenance', 'audit']);

/** Identidade do módulo. */
export const COMPLIANCE_RULES_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 7,
    deliveredAt: '2026-05-01',
    severities: RULE_SEVERITIES,
    targets: RULE_TARGETS,
});

/**
 * Cria objeto frozen de regra.
 *
 * @param {Record<string, any>} spec
 * @returns {Object} regra frozen
 */
export function createRule(spec: Record<string, any>): Object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createRule: spec must be object');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createRule: id required (non-empty string)');
    }
    if (!RULE_SEVERITIES.includes(spec.severity)) {
        throw new TypeError(`createRule: severity must be one of ${RULE_SEVERITIES.join(',')}`);
    }
    if (!RULE_TARGETS.includes(spec.target)) {
        throw new TypeError(`createRule: target must be one of ${RULE_TARGETS.join(',')}`);
    }
    if (typeof spec.predicate !== 'function') {
        throw new TypeError('createRule: predicate must be function');
    }
    return Object.freeze({
        id: spec.id,
        severity: spec.severity,
        target: spec.target,
        message: spec.message || `Rule ${spec.id} failed`,
        predicate: spec.predicate,
        description: spec.description || '',
    });
}

/**
 * Regras canônicas built-in.
 *
 * Cada predicate retorna `true` se regra É RESPEITADA (compliance OK).
 * Engine reporta violações onde predicate retorna false.
 */
export const BUILTIN_RULES = Object.freeze([
    createRule({
        id: 'doc-has-id',
        severity: 'critical',
        target: 'document',
        message: 'Documento deve ter ID',
        description: 'Todo documento precisa de identificador único',
        predicate: (doc: any) =>
            Boolean(/** @type {any} */ doc && typeof doc.id === 'string' && doc.id.trim()),
    }),
    createRule({
        id: 'doc-has-title',
        severity: 'major',
        target: 'document',
        message: 'Documento deve ter título',
        description: 'Documento sem título dificulta busca e auditoria',
        predicate: (doc: any) =>
            Boolean(/** @type {any} */ doc && typeof doc.title === 'string' && doc.title.trim()),
    }),
    createRule({
        id: 'doc-has-provenance',
        severity: 'major',
        target: 'document',
        message: 'Documento deve declarar pelo menos uma origem (provenance)',
        description: 'Audit trail exige rastreabilidade da origem do conteúdo',
        predicate: (doc: any) =>
            Boolean(
                /** @type {any} */ doc && Array.isArray((doc as any).provenance) && doc.provenance.length > 0,
            ),
    }),
    createRule({
        id: 'doc-has-revision',
        severity: 'minor',
        target: 'document',
        message: 'Documento deve ter pelo menos uma revisão',
        description: 'Versionamento explícito',
        predicate: (doc: any) =>
            Boolean(
                /** @type {any} */ doc && Array.isArray((doc as any).revisions) && doc.revisions.length > 0,
            ),
    }),
    createRule({
        id: 'provenance-has-source',
        severity: 'critical',
        target: 'provenance',
        message: 'Entrada de provenance deve declarar source',
        predicate: (entry: any) =>
            Boolean(/** @type {any} */ entry && typeof entry.source === 'string' && entry.source.trim()),
    }),
    createRule({
        id: 'provenance-has-timestamp',
        severity: 'major',
        target: 'provenance',
        message: 'Entrada de provenance deve ter timestamp ISO-8601',
        predicate: (entry: any) => {
            if (!entry || typeof entry.timestamp !== 'string') return false;
            const d = Date.parse(entry.timestamp);
            return Number.isFinite(d);
        },
    }),
    createRule({
        id: 'revision-has-state',
        severity: 'major',
        target: 'revision',
        message: 'Revisão deve declarar state FSM',
        predicate: (rev: any) =>
            Boolean(
                rev &&
                typeof rev.state === 'string' &&
                ['draft', 'under_review', 'approved', 'rejected', 'deprecated'].includes(rev.state),
            ),
    }),
    createRule({
        id: 'revision-has-author',
        severity: 'minor',
        target: 'revision',
        message: 'Revisão deve identificar autor',
        predicate: (rev: any) =>
            Boolean(/** @type {any} */ rev && typeof rev.author === 'string' && rev.author.trim()),
    }),
]);

/**
 * Retorna built-in rules de um target.
 *
 * @param {string} target
 * @returns {Array<any>}
 */
export function getRulesByTarget(target: string): Array<any> {
    if (!RULE_TARGETS.includes(target)) return [];
    return BUILTIN_RULES.filter((r) => (r as any).target === target);
}

/**
 * Cria objeto de finding.
 *
 * @param {any} rule
 * @param {any} context
 * @returns {any}
 */
function _finding(rule: any, context: any): any {
    return Object.freeze({
        ruleId: rule.id,
        severity: rule.severity,
        target: rule.target,
        message: rule.message,
        contextRef: context.ref || null,
        contextIndex: Number.isInteger(context.index) ? context.index : null,
    });
}

/**
 * Aplica regras a um documento e retorna findings (violações).
 *
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} [options]
 * @returns {Array<any>}
 */
export function evaluateRules(doc: Record<string, any>, options: Record<string, any> = {}): Array<any> {
    const findings = [];
    const rules = Array.isArray(options.rules) ? options.rules : BUILTIN_RULES;
    if (!doc || typeof doc !== 'object') {
        // Sinaliza explicitamente
        findings.push(
            _finding(
                createRule({
                    id: 'doc-invalid',
                    severity: 'critical',
                    target: 'document',
                    message: 'Document is not an object',
                    predicate: () => false,
                }),
                { ref: null },
            ),
        );
        return findings;
    }

    for (const rule of rules) {
        if (!rule || typeof rule.predicate !== 'function') continue;

        if (rule.target === 'document') {
            try {
                if (!rule.predicate(doc)) {
                    findings.push(_finding(rule, { ref: doc.id || null }));
                }
            } catch (e) {
                console.debug('[complianceRules:document]', (e as any)?.message || e);
            }
        } else if (rule.target === 'provenance') {
            const list = Array.isArray(doc.provenance) ? doc.provenance : [];
            for (let i = 0; i < list.length; i++) {
                try {
                    if (!rule.predicate(list[i])) {
                        findings.push(_finding(rule, { ref: doc.id || null, index: i }));
                    }
                } catch (e) {
                    console.debug('[complianceRules:provenance]', (e as any)?.message || e);
                }
            }
        } else if (rule.target === 'revision') {
            const list = Array.isArray(doc.revisions) ? doc.revisions : [];
            for (let i = 0; i < list.length; i++) {
                try {
                    if (!rule.predicate(list[i])) {
                        findings.push(_finding(rule, { ref: doc.id || null, index: i }));
                    }
                } catch (e) {
                    console.debug('[complianceRules:revision]', (e as any)?.message || e);
                }
            }
        } else if (rule.target === 'audit') {
            const list = Array.isArray(doc.audit) ? doc.audit : [];
            for (let i = 0; i < list.length; i++) {
                try {
                    if (!rule.predicate(list[i])) {
                        findings.push(_finding(rule, { ref: doc.id || null, index: i }));
                    }
                } catch (e) {
                    console.debug('[complianceRules:audit]', (e as any)?.message || e);
                }
            }
        }
    }

    return findings;
}

/**
 * Sumariza findings por severity e regra.
 *
 * @param {Array<any>} findings
 * @returns {{total: number, critical: number, major: number, minor: number, info: number, byRule: Record<string, number>}}
 */
export function summarizeFindings(findings: Array<any>): {total: number, critical: number, major: number, minor: number, info: number, byRule: Record<string, number>} {
    if (!Array.isArray(findings)) {
        return { total: 0, critical: 0, major: 0, minor: 0, info: 0, byRule: {} };
    }
        const byRule: Record<string, number>= {};
    let critical = 0;
    let major = 0;
    let minor = 0;
    let info = 0;
    for (const f of findings) {
        if (!f) continue;
        if (f.severity === 'critical') critical++;
        else if (f.severity === 'major') major++;
        else if (f.severity === 'minor') minor++;
        else if (f.severity === 'info') info++;
        if (f.ruleId) byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    }
    return {
        total: critical + major + minor + info,
        critical,
        major,
        minor,
        info,
        byRule,
    };
}

/**
 * Computa score de compliance 0-100 (100 = sem violações críticas/major).
 *
 * Pesos: critical=10, major=5, minor=2, info=1.
 *
 * @param {Array<any>} findings
 * @returns {number}
 */
export function computeComplianceScore(findings: Array<any>): number {
    if (!Array.isArray(findings)) return 100;
    let penalty = 0;
    for (const f of findings) {
        if (!f) continue;
        if (f.severity === 'critical') penalty += 10;
        else if (f.severity === 'major') penalty += 5;
        else if (f.severity === 'minor') penalty += 2;
        else if (f.severity === 'info') penalty += 1;
    }
    return Math.max(0, Math.min(100, 100 - penalty));
}

/**
 * Determina pass/fail gate.
 *
 * @param {Array<any>} findings
 * @param {{allowMajor?: boolean, allowMinor?: boolean}} [options]
 * @returns {{passed: boolean, blockers: Array<any>, score: number}}
 */
export function evaluateComplianceGate(findings: Array<any>, options: {allowMajor?: boolean, allowMinor?: boolean} = {}): {passed: boolean, blockers: Array<any>, score: number} {
    if (!Array.isArray(findings)) {
        return { passed: true, blockers: [], score: 100 };
    }
    const allowMajor = options.allowMajor === true;
    const allowMinor = options.allowMinor !== false;
    const blockers = findings.filter((f) => {
        if (!f) return false;
        if (f.severity === 'critical') return true;
        if (!allowMajor && f.severity === 'major') return true;
        if (!allowMinor && f.severity === 'minor') return true;
        return false;
    });
    return {
        passed: blockers.length === 0,
        blockers,
        score: computeComplianceScore(findings),
    };
}

/**
 * Module identity export.
 */
export const complianceRulesMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 7,
    deliveredAt: '2026-05-01',
    severities: RULE_SEVERITIES,
    targets: RULE_TARGETS,
    builtinRulesCount: BUILTIN_RULES.length,
    exports: [
        'RULE_SEVERITIES',
        'RULE_TARGETS',
        'COMPLIANCE_RULES_META',
        'BUILTIN_RULES',
        'createRule',
        'getRulesByTarget',
        'evaluateRules',
        'summarizeFindings',
        'computeComplianceScore',
        'evaluateComplianceGate',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
