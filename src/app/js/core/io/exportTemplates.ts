// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EXPORT TEMPLATES — SPEC_B5_EXPORT_TEMPLATES

   Templates canônicos para export XLSX espelhando formatos de import:
   - EDD (EPA Electronic Data Deliverable)
   - GHG Protocol (Scopes 1, 2, 3)
   - Generic (configurável)

   Core pure — gera estrutura data → sheets. SheetJS (XLSX blob)
   fica em utils/handlers/export.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Template schemas
// ──────────────────────────────────────────────────────────────────────

export const TEMPLATE_SCHEMAS = Object.freeze({
    edd: {
        id: 'edd',
        label: 'EPA EDD',
        sheets: ['Location', 'Sample', 'TestResultsQC'],
        columns: Object.freeze({
            Location: ['LocationID', 'LocationName', 'Latitude', 'Longitude', 'Elevation'],
            Sample: ['SampleID', 'LocationID', 'SampleDate', 'SampleType', 'MatrixCode'],
            TestResultsQC: ['SampleID', 'AnalyteCode', 'Result', 'Units', 'LabSampleID', 'QCFlag'],
        }),
    },
    ghg: {
        id: 'ghg',
        label: 'GHG Protocol',
        sheets: ['Scope1', 'Scope2', 'Scope3'],
        columns: Object.freeze({
            Scope1: ['Source', 'ActivityData', 'EmissionFactor', 'EmissionKgCO2e', 'Period'],
            Scope2: ['ElectricityMWh', 'GridFactor', 'EmissionKgCO2e', 'Period'],
            Scope3: ['Category', 'Quantity', 'EmissionFactor', 'EmissionKgCO2e', 'Period'],
        }),
    },
    generic: {
        id: 'generic',
        label: 'Genérico',
        sheets: ['Data'],
        columns: Object.freeze({
            Data: [], // configurável — cliente define
        }),
    },
});

export const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATE_SCHEMAS));

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param templateId
 * @returns
 */
export function isValidTemplateId(templateId: string): boolean {
    return typeof templateId === 'string' && TEMPLATE_IDS.includes(templateId);
}

/**
 * Retorna schema de um template, ou null se inválido.
 * @param templateId
 * @returns
 */
export function getTemplateSchema(templateId: string): object | null {
    if (!isValidTemplateId(templateId)) return null;
    return (TEMPLATE_SCHEMAS as Record<string, any>)[templateId];
}

// ──────────────────────────────────────────────────────────────────────
// Mappers - elements/observations → template rows
// ──────────────────────────────────────────────────────────────────────

/**
 * @param element
 * @returns
 */
function _extractLocationRow(element: any): Record<string, any> {
    return {
        LocationID: element.id,
        LocationName: element.name || element.id,
        Latitude: element.lat ?? element.position?.lat ?? null,
        Longitude: element.lng ?? element.position?.lng ?? null,
        Elevation: element.elevation ?? element.position?.z ?? null,
    };
}

/**
 * @param observation
 * @param element
 * @returns
 */
function _extractSampleRow(observation: any, element: any): Record<string, any> {
    return {
        SampleID: observation.id || `${element?.id}-${observation.timestamp || 'na'}`,
        LocationID: element?.id || null,
        SampleDate: observation.timestamp || observation.createdAt || null,
        SampleType: observation.sampleType || 'grab',
        MatrixCode: observation.matrix || observation.matrixCode || null,
    };
}

/**
 * @param observation
 * @param element
 * @returns
 */
function _extractTestResultRow(observation: any, element: any): Record<string, any> {
    return {
        SampleID: observation.id || `${element?.id}-${observation.timestamp || 'na'}`,
        AnalyteCode: observation.parameterId || observation.parameter || null,
        Result: observation.value ?? null,
        Units: observation.unit || null,
        LabSampleID: observation.labSampleId || null,
        QCFlag: observation.qcFlag || null,
    };
}

/**
 * Mapeia elements + observations para estrutura EDD.
 *
 * @param data
 * @returns
 */
export function mapToEdd(
    data: { elements?: Array<any>; observations?: Array<any> } | null | undefined,
): Record<string, Array<Record<string, any>>> {
    const elements: Array<any> = Array.isArray(data?.elements) ? data.elements : [];
    const observations: Array<any> = Array.isArray(data?.observations) ? data.observations : [];

    const elementMap: Map<string, any> = new Map();
    for (const el of elements) {
        if (el?.id) elementMap.set(el.id, el);
    }

    return {
        Location: elements.filter((e: any) => e?.id).map(_extractLocationRow),
        Sample: observations.map((obs: any) => _extractSampleRow(obs, elementMap.get(obs?.elementId))),
        TestResultsQC: observations.map((obs: any) =>
            _extractTestResultRow(obs, elementMap.get(obs?.elementId)),
        ),
    };
}

/**
 * Mapeia ghg emissions para scope 1/2/3.
 *
 * @param data
 * @returns
 */
export function mapToGhg(data: { emissions?: Array<any> } | null | undefined): {
    Scope1: Array<Record<string, any>>;
    Scope2: Array<Record<string, any>>;
    Scope3: Array<Record<string, any>>;
} {
    const emissions: Array<any> = Array.isArray(data?.emissions) ? data.emissions : [];
    const out: {
        Scope1: Array<Record<string, any>>;
        Scope2: Array<Record<string, any>>;
        Scope3: Array<Record<string, any>>;
    } = { Scope1: [], Scope2: [], Scope3: [] };
    for (const e of emissions) {
        if (!e || typeof e !== 'object') continue;
        const scope = Number(e.scope);
        if (scope === 1) {
            out.Scope1.push({
                Source: e.source,
                ActivityData: e.activityData,
                EmissionFactor: e.emissionFactor,
                EmissionKgCO2e: e.emissionKgCO2e,
                Period: e.period,
            });
        } else if (scope === 2) {
            out.Scope2.push({
                ElectricityMWh: e.electricityMWh,
                GridFactor: e.gridFactor,
                EmissionKgCO2e: e.emissionKgCO2e,
                Period: e.period,
            });
        } else if (scope === 3) {
            out.Scope3.push({
                Category: e.category,
                Quantity: e.quantity,
                EmissionFactor: e.emissionFactor,
                EmissionKgCO2e: e.emissionKgCO2e,
                Period: e.period,
            });
        }
    }
    return out;
}

/**
 * Mapeia array de objetos para sheet "Data" com colunas do schema custom.
 *
 * @param rows
 * @param columns
 * @returns
 */
export function mapToGeneric(
    rows: Array<Record<string, any>>,
    columns: Array<string> = [],
): { Data: Array<Record<string, any>> } {
    if (!Array.isArray(rows)) return { Data: [] };
    const cols = Array.isArray(columns) && columns.length > 0 ? columns : null;
    if (!cols) return { Data: rows.slice() };
    return {
        Data: rows.map((row: Record<string, any>) => {
            const out: Record<string, any> = {};
            for (const col of cols) out[col] = row?.[col] ?? null;
            return out;
        }),
    };
}

/**
 * Dispatcher principal. Retorna { sheets: { name → rows[] }, template }.
 *
 * @param templateId
 * @param data
 * @param opts
 * @returns
 */
export function buildExport(
    templateId: string,
    data: any,
    opts: { columns?: Array<string> } = {},
): { template: string | null; sheets: Record<string, any>; errors: Array<string> } {
    if (!isValidTemplateId(templateId)) {
        return { template: null, sheets: {}, errors: [`invalid template: ${templateId}`] };
    }
    try {
        if (templateId === 'edd') return { template: 'edd', sheets: mapToEdd(data), errors: [] };
        if (templateId === 'ghg') return { template: 'ghg', sheets: mapToGhg(data), errors: [] };
        if (templateId === 'generic') {
            return {
                template: 'generic',
                sheets: mapToGeneric(data?.rows, opts.columns),
                errors: [],
            };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'export failed';
        return { template: templateId, sheets: {}, errors: [msg] };
    }
    return { template: templateId, sheets: {}, errors: ['unhandled'] };
}

// ──────────────────────────────────────────────────────────────────────
// Preview helper (§UI preview)
// ──────────────────────────────────────────────────────────────────────

/**
 * Preview das primeiras N linhas de cada sheet do export.
 *
 * @param buildResult - ReturnType<buildExport>
 * @param limit
 * @returns
 */
export function previewExport(
    buildResult: { sheets?: Record<string, any> } | null | undefined,
    limit = 5,
): Record<string, Array<any>> {
    if (!buildResult || !buildResult.sheets) return {};
    const out: Record<string, Array<any>> = {};
    for (const [name, rows] of Object.entries(buildResult.sheets)) {
        out[name] = Array.isArray(rows) ? rows.slice(0, Math.max(0, limit)) : [];
    }
    return out;
}
