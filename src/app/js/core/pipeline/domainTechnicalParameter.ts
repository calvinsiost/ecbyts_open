// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DOMAIN TECHNICAL PARAMETER - parametros tecnicos por dominio com
   lacunas por atividade (PIPELINE-UNIFIED-PROTOCOL #6).

   "Dados tecnicos genericos: dominio com parametros obrigatorios
   deve reportar lacunas por atividade, nao apenas texto livre."
   (SPEC_PIPELINE_UNIFIED_PROTOCOL.md, blind spot "Dados tecnicos
   genericos").

   Camada de protocolo (core/pipeline/): modelo minimo { domain,
   name, unit, value, gap } para gap analysis por preenchimento.
   O catalogo rico de UX (valueKind, exemplos, prompts) vive em
   core/pipelines/pipelineDomainProfile.ts — este modulo resolve
   "o que falta preencher em cada atividade" de forma pura.

   Pure: sem DOM, sem storage, sem clock. Testavel via node:test.
   ================================================================ */

export type TechnicalParameterDomain = 'gac-dd38' | 'mineral-processing' | 'generic';

export interface DomainTechnicalParameter {
    domain: TechnicalParameterDomain;
    name: string;
    unit: string;
    value: string | number | null;
    gap: boolean;
}

export interface TechnicalParameterSpec {
    name: string;
    unit: string;
    required: boolean;
}

export interface ActivityParameterInput {
    id: string;
    values?: Record<string, unknown> | null;
}

export interface ActivityGapReport {
    activityId: string;
    domain: TechnicalParameterDomain;
    parameters: DomainTechnicalParameter[];
    missing: string[];
    complete: boolean;
}

export interface GapSummary {
    domain: TechnicalParameterDomain;
    activities: number;
    complete: number;
    incomplete: number;
    missingByParameter: Record<string, number>;
}

const GAC_DD38_PARAMETERS: readonly TechnicalParameterSpec[] = Object.freeze([
    Object.freeze({ name: 'Fase DD-38', unit: 'fase', required: true }),
    Object.freeze({ name: 'Parte interessada', unit: 'papel', required: true }),
    Object.freeze({ name: 'Natureza de dados', unit: 'tipo', required: true }),
    Object.freeze({ name: 'Classificacao tecnica', unit: 'classe DD-38', required: true }),
    Object.freeze({ name: 'Evidencia', unit: 'referencia', required: true }),
    Object.freeze({ name: 'Responsavel tecnico', unit: 'ART', required: true }),
]);

const MINERAL_PROCESSING_PARAMETERS: readonly TechnicalParameterSpec[] = Object.freeze([
    Object.freeze({ name: 'Fase produtiva', unit: 'fase', required: true }),
    Object.freeze({ name: 'Granulometria P80', unit: 'um', required: true }),
    Object.freeze({ name: 'Recuperacao', unit: '%', required: true }),
    Object.freeze({ name: 'Balanco de massa', unit: 't/h', required: true }),
    Object.freeze({ name: 'Agua de processo', unit: 'm3/t', required: true }),
    Object.freeze({ name: 'Energia', unit: 'kWh/t', required: true }),
    Object.freeze({ name: 'Rota de rejeitos', unit: 'rota', required: true }),
    Object.freeze({ name: 'Especificacao de produto', unit: 'especificacao', required: false }),
]);

const GENERIC_PARAMETERS: readonly TechnicalParameterSpec[] = Object.freeze([
    Object.freeze({ name: 'Fase do processo', unit: 'fase', required: true }),
    Object.freeze({ name: 'Parte interessada', unit: 'papel', required: true }),
    Object.freeze({ name: 'Natureza de dados', unit: 'tipo', required: true }),
]);

export const PARAMETER_PROFILES: Readonly<Record<TechnicalParameterDomain, readonly TechnicalParameterSpec[]>> = Object.freeze({
    'gac-dd38': GAC_DD38_PARAMETERS,
    'mineral-processing': MINERAL_PROCESSING_PARAMETERS,
    generic: GENERIC_PARAMETERS,
});

const DOMAIN_ALIASES: ReadonlyArray<readonly [TechnicalParameterDomain, readonly string[]]> = Object.freeze([
    Object.freeze([
        'gac-dd38',
        Object.freeze([
            'gac-dd38',
            'gac_dd38',
            'gac dd38',
            'gac/dd38',
            'gac',
            'dd38',
            'dd-38',
            'cetesb dd38',
            'cetesb dd-38',
            'areas contaminadas',
            'gestao de areas contaminadas',
        ]),
    ]),
    Object.freeze([
        'mineral-processing',
        Object.freeze([
            'mineral-processing',
            'mineral_processing',
            'mineral processing',
            'beneficiamento',
            'beneficiamento mineral',
            'mine-beneficiation',
            'mine beneficiation',
            'mineracao',
            'planta de beneficiamento',
            'rom-to-product',
        ]),
    ]),
    Object.freeze([
        'generic',
        Object.freeze([
            'generic',
            'generico',
            'generic-process',
            'generic process',
            'processo generico',
            'default',
        ]),
    ]),
]) as ReadonlyArray<readonly [TechnicalParameterDomain, readonly string[]]>;

function normalizeKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/**
 * Resolve the canonical domain id from a raw domain string using the
 * alias table (accent/case insensitive). Unknown, empty or null input
 * falls back to `generic`.
 *
 * @param {string | null | undefined} domain
 * @returns {TechnicalParameterDomain} canonical domain id
 */
export function resolveParameterDomain(domain?: string | null): TechnicalParameterDomain {
    const normalized = normalizeKey(domain);
    for (const [domainId, aliases] of DOMAIN_ALIASES) {
        if (aliases.some((alias) => normalizeKey(alias) === normalized)) {
            return domainId;
        }
    }
    return 'generic';
}

/**
 * List the parameter specs of a domain (cloned). Accepts any alias
 * accepted by resolveParameterDomain; unknown domains fall back to
 * the generic profile.
 *
 * @param {string | null | undefined} domain
 * @returns {TechnicalParameterSpec[]} specs in catalog order
 */
export function getParameterSpecs(domain?: string | null): TechnicalParameterSpec[] {
    return PARAMETER_PROFILES[resolveParameterDomain(domain)].map((spec) => ({ ...spec }));
}

/**
 * Decide whether a raw input value counts as filled. Filled means:
 * non-empty string (after trim), finite number, or non-empty array.
 * null, undefined, booleans, objects and empty strings/arrays are
 * treated as not filled.
 *
 * @param {unknown} value
 * @returns {boolean} true when the value counts as filled
 */
export function isParameterFilled(value: unknown): boolean {
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    return false;
}

function normalizeValue(value: unknown): string | number | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value) && value.length > 0) {
        const joined = value.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ');
        return joined.length > 0 ? joined : null;
    }
    return null;
}

/**
 * Analyze one set of values against the parameter catalog of a domain.
 * Each returned parameter carries the resolved domain, the catalog
 * name/unit, the normalized value (or null) and `gap = true` when the
 * parameter is required and not filled. Optional parameters never
 * produce gaps. Value keys are matched accent/case insensitive.
 *
 * @param {string | null | undefined} domain
 * @param {Record<string, unknown> | null | undefined} values name -> raw value
 * @returns {DomainTechnicalParameter[]} one entry per catalog spec
 */
export function analyzeParameters(
    domain: string | null | undefined,
    values?: Record<string, unknown> | null,
): DomainTechnicalParameter[] {
    const resolvedDomain = resolveParameterDomain(domain);
    const specs = PARAMETER_PROFILES[resolvedDomain];
    const filledValues = new Map<string, unknown>();
    for (const [key, raw] of Object.entries(values ?? {})) {
        filledValues.set(normalizeKey(key), raw);
    }

    return specs.map((spec) => {
        const raw = filledValues.get(normalizeKey(spec.name));
        const value = normalizeValue(raw);
        return {
            domain: resolvedDomain,
            name: spec.name,
            unit: spec.unit,
            value,
            gap: spec.required && !isParameterFilled(raw),
        };
    });
}

/**
 * Report parameter gaps per activity. Each activity contributes one
 * report with its analyzed parameters, the list of missing required
 * parameter names and a `complete` flag. This is the validation rule
 * of the blind spot: domains with required parameters must report
 * gaps per activity, not free text.
 *
 * @param {string | null | undefined} domain
 * @param {readonly ActivityParameterInput[]} activities
 * @returns {ActivityGapReport[]} one report per activity, in input order
 */
export function reportActivityGaps(
    domain: string | null | undefined,
    activities: readonly ActivityParameterInput[],
): ActivityGapReport[] {
    const resolvedDomain = resolveParameterDomain(domain);
    const list = Array.isArray(activities) ? activities : [];
    return list.map((activity) => {
        const parameters = analyzeParameters(resolvedDomain, activity?.values ?? null);
        const missing = parameters.filter((parameter) => parameter.gap).map((parameter) => parameter.name);
        return {
            activityId: String(activity?.id ?? '').trim() || 'atividade-sem-id',
            domain: resolvedDomain,
            parameters,
            missing,
            complete: missing.length === 0,
        };
    });
}

/**
 * Aggregate per-activity gap reports into a summary: how many
 * activities are complete/incomplete and how many activities miss
 * each required parameter.
 *
 * @param {string | null | undefined} domain
 * @param {readonly ActivityParameterInput[]} activities
 * @returns {GapSummary} aggregated gap counts
 */
export function summarizeActivityGaps(
    domain: string | null | undefined,
    activities: readonly ActivityParameterInput[],
): GapSummary {
    const resolvedDomain = resolveParameterDomain(domain);
    const reports = reportActivityGaps(resolvedDomain, activities);
    const missingByParameter: Record<string, number> = {};
    let complete = 0;
    for (const report of reports) {
        if (report.complete) complete += 1;
        for (const name of report.missing) {
            missingByParameter[name] = (missingByParameter[name] ?? 0) + 1;
        }
    }
    return {
        domain: resolvedDomain,
        activities: reports.length,
        complete,
        incomplete: reports.length - complete,
        missingByParameter,
    };
}
