// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ESG EXPORT — G5: Export assistido com vocabulário GRI/ISSB

   Gera exports com cabeçalhos mapeados para terminologia ESG
   reconhecida globalmente (GRI 303/304/306, IFRS S1/S2 ISSB),
   mais um template DOCX estruturado para relatório ISSB com
   seções pré-preenchidas e marcadores [PREENCHER] para campos
   que exigem input humano.

   IMPORTANTE: não é "geração automática de relatório ISSB"
   (seria over-promise). É "export assistido" — vocabulário ESG
   aplicado automaticamente + seções pré-estruturadas.

   Vocabulário:
   - GRI 303 (Water & Effluents): water_withdrawal, water_discharge, water_quality
   - GRI 304 (Biodiversity): operations_in_protected_areas, habitat_impact
   - GRI 306 (Waste): waste_generated, waste_diverted, hazardous_waste
   - IFRS S1: governance_metrics, strategy_metrics, risk_metrics
   - IFRS S2: climate_risks, transition_risks, physical_risks

   Entrada pura (model + stats) → saída pura (string CSV, objeto DOCX sections).
   Sem side effects, sem IDB, sem DOM — testável diretamente em Node.

   Referência: GRI Standards 2021, IFRS S1/S2 (ISSB, jun/2023)
   Spec: docs/specs/features/SPEC_ESG_GOVERNANCE.md (G5)
   ================================================================ */

interface GriMapping {
    griCode: string;
    griLabel: string;
    issbCategory: string;
    unit: string;
}

/**
 * Mapa de parâmetros PDPL-U → vocabulário GRI/ISSB.
 * Chave: parameterId (CAS number or identifier).
 * Valor: { griCode, griLabel, issbCategory, unit, severity }
 */
export const PDPLU_TO_GRI_MAP: Readonly<Record<string, GriMapping>> = Object.freeze({
    // Water quality parameters (GRI 303)
    benzene: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - benzene',
        issbCategory: 'IFRS S1 §55 - pollution risk',
        unit: 'μg/L',
    },
    toluene: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - toluene',
        issbCategory: 'IFRS S1 §55 - pollution risk',
        unit: 'μg/L',
    },
    xylenes: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - xylenes',
        issbCategory: 'IFRS S1 §55 - pollution risk',
        unit: 'μg/L',
    },
    ethylbenzene: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - ethylbenzene',
        issbCategory: 'IFRS S1 §55 - pollution risk',
        unit: 'μg/L',
    },
    lead: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - lead',
        issbCategory: 'IFRS S1 §55 - heavy metals',
        unit: 'μg/L',
    },
    ph: {
        griCode: 'GRI 303-2',
        griLabel: 'Water physical-chemical - pH',
        issbCategory: 'IFRS S1 §54 - water stewardship',
        unit: 'pH',
    },
    do: {
        griCode: 'GRI 303-2',
        griLabel: 'Dissolved oxygen',
        issbCategory: 'IFRS S1 §54 - water stewardship',
        unit: 'mg/L',
    },
    conductivity: {
        griCode: 'GRI 303-2',
        griLabel: 'Electrical conductivity',
        issbCategory: 'IFRS S1 §54 - water stewardship',
        unit: 'μS/cm',
    },
    // Generic fallback category for unmapped params (keeps export structure)
    _default: {
        griCode: 'GRI 303-2',
        griLabel: 'Water discharge quality - parameter',
        issbCategory: 'IFRS S1 §54 - environmental metric',
        unit: '',
    },
});

/**
 * Family → GRI category mapping.
 */
export const FAMILY_TO_GRI: Readonly<Record<string, string>> = Object.freeze({
    well: 'GRI 303-1 (Water withdrawal)',
    lake: 'GRI 303-3 (Surface water)',
    river: 'GRI 303-3 (Surface water)',
    spring: 'GRI 303-3 (Surface water)',
    plume: 'GRI 303-2 (Water discharge - contamination)',
    tank: 'GRI 306-3 (Waste storage)',
    waste: 'GRI 306-3 (Waste)',
    building: 'IFRS S1 §25 (Operational asset)',
    boundary: 'GRI 304-1 (Protected area boundary)',
    blueprint: 'IFRS S1 §25 (Spatial reference)',
    remediation: 'GRI 306-4 (Waste diverted from disposal)',
});

const DEFAULT_GRI_MAPPING: GriMapping = {
    griCode: 'GRI 303-2',
    griLabel: 'Water discharge quality - parameter',
    issbCategory: 'IFRS S1 §54 - environmental metric',
    unit: '',
};

/**
 * Lookup GRI mapping for a given parameter id.
 * @param parameterId
 * @returns
 */
export function getGriMapping(parameterId: string): GriMapping {
    if (!parameterId || typeof parameterId !== 'string') {
        return { ...(PDPLU_TO_GRI_MAP._default ?? DEFAULT_GRI_MAPPING) };
    }
    const key = parameterId.toLowerCase().trim();
    return PDPLU_TO_GRI_MAP[key] || { ...(PDPLU_TO_GRI_MAP._default ?? DEFAULT_GRI_MAPPING) };
}

/**
 * Lookup GRI category for an element family.
 * @param family
 * @returns
 */
export function getFamilyGriCategory(family: string): string {
    return FAMILY_TO_GRI[family] || 'IFRS S1 §25 (Operational asset)';
}

// ── CSV Generator with ESG headers ──────────────────────────────────────────

/**
 * ESG-aware CSV headers (bilingual: internal | GRI label).
 */
const ESG_HEADERS: string[] = [
    'element_id',
    'element_name',
    'family',
    'gri_category', // GRI 303/304/306 lookup from family
    'parameter_id',
    'gri_code', // GRI 303-X from parameter
    'issb_category', // IFRS S1/S2 category
    'value',
    'unit',
    'date',
    'campaign_id',
    'compliance_status', // ok | exceeded | pending
    'data_quality_score', // 0..5 from EIS if provided
];

/**
 * Escape a CSV field per RFC 4180.
 * @param value
 * @param sep
 * @returns
 */
import {
    csvEscape,
    sectionsToPlainText as _sectionsToPlainTextPure,
    sectionsToHtml as _sectionsToHtmlPure,
} from './_esgFormattersPure.js';

/**
 * Generate an ESG-aware CSV export for the given model.
 * Returns the CSV string (no BOM, no file I/O - caller handles Blob).
 *
 * @param model - { elements: [...] }
 * @param options
 * @returns CSV content
 */
export function generateEsgCsv(
    model: { elements?: Array<any> } & Record<string, any>,
    options: { separator?: string; eisScore?: number | null } = {}
): string {
    if (!model || !Array.isArray(model.elements)) {
        throw new Error('generateEsgCsv: model.elements array required');
    }
    const { separator = ',', eisScore = null } = options;
    const rows = [ESG_HEADERS.join(separator)];

    for (const el of model.elements) {
        const familyGri = getFamilyGriCategory(el.family);
        const observations = (el.data && el.data.observations) || el.observations || [];

        if (observations.length === 0) {
            // Emit a row per element even without observations (keeps element visible)
            rows.push(
                [
                    csvEscape(el.id, separator),
                    csvEscape(el.name || '', separator),
                    csvEscape(el.family || '', separator),
                    csvEscape(familyGri, separator),
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    'no-data',
                    eisScore != null ? String(eisScore) : '',
                ].join(separator)
            );
            continue;
        }

        for (const obs of observations) {
            const paramId = obs.parameterId || obs.parameter || '';
            const griMap = getGriMapping(paramId);
            const complianceStatus = obs.status || obs.complianceStatus || 'pending';

            rows.push(
                [
                    csvEscape(el.id, separator),
                    csvEscape(el.name || '', separator),
                    csvEscape(el.family || '', separator),
                    csvEscape(familyGri, separator),
                    csvEscape(paramId, separator),
                    csvEscape(griMap.griCode, separator),
                    csvEscape(griMap.issbCategory, separator),
                    obs.value != null ? obs.value : '',
                    csvEscape(obs.unit || obs.unitId || griMap.unit, separator),
                    csvEscape(obs.date || '', separator),
                    csvEscape(obs.campaignId || '', separator),
                    csvEscape(complianceStatus, separator),
                    eisScore != null ? String(eisScore) : '',
                ].join(separator)
            );
        }
    }

    return rows.join('\n');
}

// ── DOCX Template Builder ──────────────────────────────────────────────────

interface DocxSection {
    /** Section title */
    heading: string;
    /** Body text (may contain [PREENCHER] markers) */
    content: string;
    /** True if content was generated from model data */
    autoFilled?: boolean;
}

/**
 * Build an ISSB-aligned DOCX template as structured sections.
 * Caller renders the sections into an actual DOCX binary via the
 * existing docxExport utility (dependency injection keeps core pure).
 *
 * Sections follow IFRS S1 (General Requirements for Sustainability
 * Disclosures) numbering: §§25-28 Governance, §§32-40 Strategy,
 * §§41-53 Risk, §§54-71 Metrics & Targets.
 *
 * @param model - Model data { elements, campaigns }
 * @param metrics
 * @returns Ordered list of sections
 */
export function buildIssbDocxTemplate(
    model: { elements?: Array<any>; campaigns?: Array<any> } & Record<string, any>,
    metrics: {
        eisScore?: number | null;
        complianceRate?: number | null;
        auditEntryCount?: number | null;
        decisionCount?: number | null;
    } & Record<string, any> = {}
): DocxSection[] {
    if (!model || !Array.isArray(model.elements)) {
        throw new Error('buildIssbDocxTemplate: model.elements array required');
    }

    const eisScore = metrics.eisScore != null ? Number(metrics.eisScore).toFixed(2) : '[PREENCHER]';
    const complianceRate =
        metrics.complianceRate != null ? (Number(metrics.complianceRate) * 100).toFixed(1) + '%' : '[PREENCHER]';
    const auditCount = metrics.auditEntryCount != null ? metrics.auditEntryCount : '[PREENCHER]';
    const decisionCount = metrics.decisionCount != null ? metrics.decisionCount : '[PREENCHER]';
    const elementCount = model.elements.length;
    const campaignCount = (model.campaigns || []).length;

    const _eisVal = Number(metrics.eisScore ?? NaN);
    const eisVerdict =
        _eisVal >= 4.5
            ? 'Audit Ready'
            : _eisVal >= 3.5
              ? 'Management Ready'
              : _eisVal >= 0
                ? 'Critical Data - investigation required'
                : '[PREENCHER]';

    const sections: DocxSection[] = [
        {
            heading: 'IFRS S1 §§25-28 — Governance',
            content: [
                `Environmental data governance is monitored via the Environmental Integrity Score (EIS), `,
                `a non-compensatory weighted geometric mean across 6 core axes (TCCCA+T framework: `,
                `Transparency, Accuracy, Completeness, Timeliness, Consistency, Comparability) plus up to `,
                `9 progressive axes when enabled: Governance, Biodiversity, Safety EHS, Reporting Transparency, `,
                `Legal Conformance (Fine Impact Score), Validity (domain conformance), Uniqueness (no duplicates), `,
                `Uncertainty (GUM u_rel quality), Exception Context (QA outliers qualified). Total framework `,
                `canonical: 15 axes (CCC-001 CC-15b reconciliation 2026-06-10). Source of truth: axisRegistry.ts.`,
                ``,
                `Current EIS: ${eisScore} (${eisVerdict}).`,
                `Compliance rate: ${complianceRate}.`,
                `Audit trail entries in reporting period: ${auditCount}.`,
                `Formal decisions logged: ${decisionCount}.`,
                ``,
                `Oversight body: [PREENCHER — board/committee responsible for sustainability oversight]`,
                `Management role: [PREENCHER — executive position accountable for ESG data]`,
            ].join('\n'),
            autoFilled: true,
        },
        {
            heading: 'IFRS S1 §§32-40 — Strategy',
            content: [
                `The environmental strategy is grounded in traceable field data from ${elementCount} `,
                `monitored elements across ${campaignCount} sampling campaigns.`,
                ``,
                `[PREENCHER — Describe the entity's strategy for addressing sustainability-related risks `,
                `and opportunities, including: (a) significant sustainability-related risks and opportunities `,
                `reasonably expected to affect prospects; (b) effects on business model and value chain; `,
                `(c) effects on strategy and decision-making; (d) effects on financial position and cash flows.]`,
            ].join('\n'),
            autoFilled: false,
        },
        {
            heading: 'IFRS S1 §§41-53 — Risk Management',
            content: [
                `Data integrity risks are continuously assessed via:`,
                `- Hash chain (SHA-256) for tamper detection`,
                `- Append-only audit trail (${auditCount} entries)`,
                `- Compliance validation against CONAMA 420/2009, CETESB Decisão DD-256/2016`,
                `- Greenwashing detection (Benford's law + rule-based + LLM triangulation)`,
                ``,
                `[PREENCHER — Describe processes to identify, assess, prioritize and monitor `,
                `sustainability-related risks, and how they are integrated into overall risk management.]`,
            ].join('\n'),
            autoFilled: true,
        },
        {
            heading: 'IFRS S1 §§54-71 — Metrics & Targets',
            content: [
                `See attached CSV export with full observation table mapped to GRI 303 `,
                `(Water), GRI 304 (Biodiversity) and GRI 306 (Waste) vocabulary.`,
                ``,
                `Summary:`,
                `- Elements monitored: ${elementCount}`,
                `- Sampling campaigns: ${campaignCount}`,
                `- EIS (data quality): ${eisScore} / 5.00`,
                `- Compliance rate: ${complianceRate}`,
                ``,
                `Targets: [PREENCHER — quantitative targets set by the entity to monitor progress]`,
                `Baseline period: [PREENCHER]`,
                `Performance against targets: [PREENCHER]`,
            ].join('\n'),
            autoFilled: true,
        },
        {
            heading: 'GRI 2-9 to 2-21 — Governance Disclosures',
            content: [
                `[PREENCHER — Disclose: (2-9) governance structure and composition; (2-10) nomination `,
                `and selection of highest governance body; (2-11) chair of highest governance body; `,
                `(2-12) role in overseeing impacts; (2-13) delegation of responsibility for managing impacts; `,
                `(2-14) role in sustainability reporting; (2-19) remuneration policies; (2-20) process to `,
                `determine remuneration; (2-21) annual total compensation ratio.]`,
            ].join('\n'),
            autoFilled: false,
        },
    ];

    return sections;
}

/**
 * Convert DOCX sections to a plain-text report (fallback when a
 * DOCX engine is not available - still useful for preview or email).
 * @param sections
 * @returns
 */
export function sectionsToPlainText(sections: DocxSection[]): string {
    return _sectionsToPlainTextPure(sections);
}

/**
 * Convert DOCX sections to minimal HTML (for preview or DOCX lib input).
 * @param sections
 * @returns
 */
/**
 * Generate an ESG-aware JSON export for the given model.
 * Returns a structured object suitable for API responses or file download.
 *
 * @param model - { elements: [...] }
 * @param options
 * @returns JSON export object
 */
export function generateEsgJson(
    model: { elements?: Array<any> } & Record<string, any>,
    options: { eisScore?: number | null } = {}
): object {
    if (!model || !Array.isArray(model.elements)) {
        throw new Error('generateEsgJson: model.elements array required');
    }
    const { eisScore = null } = options;
    const rows: Array<Record<string, any>> = [];

    for (const el of model.elements) {
        const familyGri = getFamilyGriCategory(el.family);
        const observations = (el.data && el.data.observations) || el.observations || [];

        if (observations.length === 0) {
            rows.push({
                element_id: el.id,
                element_name: el.name || '',
                family: el.family || '',
                gri_category: familyGri,
                parameter_id: '',
                gri_code: '',
                issb_category: '',
                value: '',
                unit: '',
                date: '',
                campaign_id: '',
                compliance_status: 'no-data',
                data_quality_score: eisScore != null ? eisScore : '',
            });
            continue;
        }

        for (const obs of observations) {
            const paramId = obs.parameterId || obs.parameter || '';
            const griMap = getGriMapping(paramId);
            rows.push({
                element_id: el.id,
                element_name: el.name || '',
                family: el.family || '',
                gri_category: familyGri,
                parameter_id: paramId,
                gri_code: griMap.griCode,
                issb_category: griMap.issbCategory,
                value: obs.value != null ? obs.value : '',
                unit: obs.unit || obs.unitId || griMap.unit,
                date: obs.date || '',
                campaign_id: obs.campaignId || '',
                compliance_status: obs.status || obs.complianceStatus || 'pending',
                data_quality_score: eisScore != null ? eisScore : '',
            });
        }
    }

    return {
        meta: {
            exported_at: new Date().toISOString(),
            standard: 'GRI 303/304/306 + IFRS S1/S2',
            row_count: rows.length,
            eis_score: eisScore,
        },
        rows,
    };
}

/**
 * @param sections
 * @returns
 */
export function sectionsToHtml(sections: Array<any>): string {
    return _sectionsToHtmlPure(sections);
}
