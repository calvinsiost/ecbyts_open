// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS COMPLETENESS BASELINE (F1) — Pure-logic premise checker

   Avalia se um modelo ambiental contem o "conjunto minimo" de
   dados que toda area monitorada deveria ter quando aplicavel:

     1. Campanha planejada + executada
     2. Pelo menos uma organizacao/operador
     3. Pelo menos um elemento por familia presente no registro
     4. Pelo menos uma leitura por variavel obrigatoria

   Requisitos marcados "not_applicable" sao excluidos do numerador
   E do denominador (nao penalizam nem inflam o indice). Variaveis
   criticas ausentes geram lacunas criticas (criticalGaps).

   Este modulo APENAS produz o objeto de baseline. NAO importa nem
   modifica o motor EIS / media geometrica / pesos. Deterministico:
   mesma entrada -> mesma saida (sem Date.now / Math.random).

   Referencias:
   - ABNT NBR 15495-1:2007 (malha de monitoramento)
   - CONAMA 420/2009 (valores orientadores)
   - GUM JCGM 100:2008 (rastreabilidade de medicoes)
   ================================================================ */

/**
 * @typedef {'applicable'|'not_applicable'} Applicability
 */

/**
 * Safely read the first array found among a list of candidate keys.
 * Defensive: returns [] when the object or all keys are missing.
 * @param {any} obj - source object (may be null/undefined)
 * @param {string[]} keys - candidate property names (aliases)
 * @returns {any[]} the first array found, otherwise an empty array
 */
function pickArray(obj: any, keys: any) {
    if (!obj || typeof obj !== 'object') return [];
    for (const k of keys) {
        const v = obj[k];
        if (Array.isArray(v)) return v;
    }
    return [];
}

/**
 * Read the first non-empty primitive value among candidate keys.
 * @param {any} obj - source object
 * @param {string[]} keys - candidate property names (aliases)
 * @returns {any} the first defined non-null value, otherwise undefined
 */
function pickValue(obj: any, keys: any) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

/**
 * Resolve the applicability of a requirement from the config.
 * Default (unset / invalid) is always 'applicable' (premise holds).
 * @param {string} requirementId - canonical requirement id
 * @param {Record<string,string>} [applicabilityConfig] - id -> applicability
 * @returns {Applicability} resolved applicability
 */
export function classifyRequirementApplicability(requirementId: any, applicabilityConfig: any) {
    if (!applicabilityConfig || typeof applicabilityConfig !== 'object') {
        return 'applicable';
    }
    return applicabilityConfig[requirementId] === 'not_applicable' ? 'not_applicable' : 'applicable';
}

/**
 * Derive the unique family list from the model (config-driven, never
 * hardcoded). Families come from elements/families plus any family
 * referenced by parameters/variables.
 * @param {any} model - the environmental model
 * @returns {string[]} sorted unique family ids present in the model
 */
function deriveFamilyList(model: any) {
    const elements = pickArray(model, ['elements', 'families']);
    const set = new Set();
    for (const el of elements) {
        const fam = pickValue(el, ['familyId', 'family', 'id']);
        if (typeof fam === 'string' && fam) set.add(fam);
    }
    return Array.from(set).sort();
}

/**
 * Scan the model and report which premise facts are present.
 * Pure: derives presence only from provided data, no side effects.
 * @param {any} model - the environmental model
 * @returns {{
 *   campaignPlanned: boolean,
 *   campaignExecuted: boolean,
 *   hasOrg: boolean,
 *   familiesPresent: Set<string>,
 *   variableReadingKeys: Set<string>
 * }} presence summary
 */
export function scanModelPresence(model: any) {
    const campaigns = pickArray(model, ['campaigns']);
    let campaignPlanned = false;
    let campaignExecuted = false;
    for (const c of campaigns) {
        const status = pickValue(c, ['status']);
        const plannedAt = pickValue(c, ['plannedAt']);
        const executedAt = pickValue(c, ['executedAt']);
        if (status === 'planned' || status === 'executed' || plannedAt) {
            campaignPlanned = true;
        }
        if (status === 'executed' || executedAt) campaignExecuted = true;
    }
    const orgs = pickArray(model, ['orgs', 'operators']);
    const elements = pickArray(model, ['elements', 'families']);
    const familiesPresent = new Set();
    for (const el of elements) {
        const fam = pickValue(el, ['familyId', 'family', 'id']);
        if (typeof fam === 'string' && fam) familiesPresent.add(fam);
    }
    const readings = pickArray(model, ['readings', 'observations']);
    const variableReadingKeys = new Set();
    for (const r of readings) {
        const key = pickValue(r, ['variableKey', 'parameter', 'key']);
        if (typeof key === 'string' && key) variableReadingKeys.add(key);
    }
    return {
        campaignPlanned,
        campaignExecuted,
        hasOrg: orgs.length > 0,
        familiesPresent,
        variableReadingKeys,
    };
}

/**
 * Group readings by variable key for temporal consistency checks.
 * @param {any[]} readings - reading/observation records
 * @returns {Map<string, Array<{ts:number, unit:any}>>} key -> sorted points
 */
function groupTemporalPoints(readings: any) {
    const byKey = new Map();
    for (const r of readings) {
        const key = pickValue(r, ['variableKey', 'parameter', 'key']);
        const rawTs = pickValue(r, ['timestamp', 'date']);
        if (typeof key !== 'string' || !key || rawTs === undefined) continue;
        const ts = typeof rawTs === 'number' ? rawTs : Date.parse(String(rawTs));
        if (Number.isNaN(ts)) continue;
        const unit = pickValue(r, ['unit']);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ ts, unit });
    }
    return byKey;
}

/**
 * Evaluate temporal consistency: a variable needs >=2 comparable
 * points (same unit) for a baseline (earliest) and current (latest).
 * Never invents a score — returns 'unavailable' when impossible.
 * @param {any} model - the environmental model
 * @returns {'unavailable'|{evaluated:true,variables:Array<{key:string,baselineAt:number,currentAt:number}>}}
 */
export function evaluateConsistency(model: any) {
    const readings = pickArray(model, ['readings', 'observations']);
    const byKey = groupTemporalPoints(readings);
    const variables = [];
    for (const [key, pts] of byKey) {
        if (pts.length < 2) continue;
        const firstUnit = pts[0].unit;
        const comparable = pts.filter((p: any) => p.unit === firstUnit);
        if (comparable.length < 2) continue;
        let baselineAt = comparable[0].ts;
        let currentAt = comparable[0].ts;
        for (const p of comparable) {
            if (p.ts < baselineAt) baselineAt = p.ts;
            if (p.ts > currentAt) currentAt = p.ts;
        }
        if (baselineAt === currentAt) continue;
        variables.push({ key, baselineAt, currentAt });
    }
    if (variables.length === 0) return 'unavailable';
    variables.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { evaluated: true, variables };
}

/**
 * Build the ordered list of canonical requirements the model is
 * assumed to need (the minimum-set premise), driven by the model.
 * @param {any} model - the environmental model
 * @returns {Array<{id:string, kind:string, meta?:any}>} requirement defs
 */
function buildRequirements(model: any) {
    const reqs: Array<{ id: string; kind: string; meta?: any }> = [
        { id: 'campaign.planned', kind: 'campaign' },
        { id: 'campaign.executed', kind: 'campaign' },
        { id: 'org.present', kind: 'org' },
    ];
    for (const fam of deriveFamilyList(model)) {
        reqs.push({ id: `family.${fam}`, kind: 'family', meta: { fam } });
    }
    const params = pickArray(model, ['parameters', 'variables']);
    for (const p of params) {
        const key = pickValue(p, ['key']);
        if (typeof key !== 'string' || !key) continue;
        if (p.mandatory !== true) continue;
        reqs.push({
            id: `variable.${key}`,
            kind: 'variable',
            meta: { key, critical: p.critical === true },
        });
    }
    return reqs;
}

/**
 * Decide whether a single requirement is satisfied by model presence.
 * @param {{id:string,kind:string,meta?:any}} req - requirement def
 * @param {ReturnType<typeof scanModelPresence>} req - scan result
 * @returns {boolean} true when the premise fact is present
 */
function isRequirementPresent(req: any, presence: any) {
    switch (req.kind) {
        case 'campaign':
            return req.id === 'campaign.executed' ? presence.campaignExecuted : presence.campaignPlanned;
        case 'org':
            return presence.hasOrg;
        case 'family':
            return presence.familiesPresent.has(req.meta.fam);
        case 'variable':
            return presence.variableReadingKeys.has(req.meta.key);
        default:
            return false;
    }
}

/**
 * Compute the EIS Completeness Baseline for an environmental model.
 *
 * Pure-logic: deterministic, no DOM/network/THREE. Defensive on
 * missing fields (absent => not-present, never throws).
 *
 * @param {any} model - environmental model (campaigns/orgs/elements/parameters/readings)
 * @param {Record<string,string>} [applicabilityConfig] - requirementId -> 'applicable'|'not_applicable'
 * @param {{}} [options] - reserved for future use (kept for API stability)
 * @returns {{
 *   required: string[],
 *   present: string[],
 *   missing: string[],
 *   naExcluded: string[],
 *   completenessRatio: number,
 *   criticalGaps: Array<{requirement:string, reason:string}>,
 *   consistency: any,
 *   audit: Array<{requirement:string, status:'present'|'missing'|'na', noApplicableRequirements?:boolean}>
 * }} baseline result (no raw measurement values leak into audit)
 */
export function computeCompletenessBaseline(model: any, applicabilityConfig: any, options: any) {
    void options;
    const presence = scanModelPresence(model);
    const requirements = buildRequirements(model);

    const required = [];
    const present = [];
    const missing = [];
    const naExcluded = [];
    const criticalGaps = [];
    const audit = [];

    let applicableTotal = 0;
    let applicableSatisfied = 0;

    for (const req of requirements) {
        const applicability = classifyRequirementApplicability(req.id, applicabilityConfig);
        if (applicability === 'not_applicable') {
            naExcluded.push(req.id);
            audit.push({ requirement: req.id, status: 'na' });
            continue;
        }
        required.push(req.id);
        applicableTotal += 1;
        const ok = isRequirementPresent(req, presence);
        if (ok) {
            present.push(req.id);
            applicableSatisfied += 1;
            audit.push({ requirement: req.id, status: 'present' });
        } else {
            missing.push(req.id);
            audit.push({ requirement: req.id, status: 'missing' });
            if (req.kind === 'variable' && req.meta && req.meta.critical) {
                criticalGaps.push({
                    requirement: req.id,
                    reason: 'critical mandatory variable has no reading',
                });
            }
        }
    }

    let completenessRatio;
    if (applicableTotal === 0) {
        // Vacuous truth (documented): nothing applicable => fully complete.
        completenessRatio = 1;
        audit.push({
            requirement: '__meta__',
            status: 'na',
            noApplicableRequirements: true,
        });
    } else {
        completenessRatio = applicableSatisfied / applicableTotal;
    }

    return {
        required,
        present,
        missing,
        naExcluded,
        completenessRatio,
        criticalGaps,
        consistency: evaluateConsistency(model),
        audit,
    };
}
