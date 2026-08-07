// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   TAXONOMY FIELD RESOLVER — Resolve fields for elements/observations
   Resolve campos de taxonomia aplicaveis a elementos e observacoes

   Dado um elemento, retorna todos os campos de taxonomia ativos
   aplicaveis a sua familia. Usado pelo inspector (renderizar campos)
   e pelos exportadores (mapear colunas adicionais).
   ================================================================ */
import { getTaxonomiesForFamily } from './manager.js';
import { validateFieldValue } from './schema.js';
// ----------------------------------------------------------------
// ELEMENT-LEVEL FIELDS
// Campos que se aplicam ao elemento (dados estaticos do ponto)
// ----------------------------------------------------------------
/**
 * Get all taxonomy fields applicable to an element.
 * Retorna lista plana de campos agrupados por secao/taxonomia.
 *
 * @param {Record<string, any>} element - Element with .family property
 * @returns {Array<{ taxonomyId: string, taxonomyName: string, sectionId: string, sectionNameKey: string, field: Object }>}
 */
export function getFieldsForElement(element: any) {
    if (!element?.family)
        return [];
    const taxonomies = getTaxonomiesForFamily(element.family);
    const result = [];
    for (const tax of taxonomies) {
        if (!Array.isArray(tax.fieldSections))
            continue;
        for (const section of tax.fieldSections) {
            if (!Array.isArray(section.fields))
                continue;
            for (const field of section.fields) {
                result.push({
                    taxonomyId: tax.id,
                    taxonomyName: tax.name,
                    sectionId: section.id,
                    sectionNameKey: section.nameKey || section.id,
                    field,
                });
            }
        }
    }
    return result;
}
/**
 * Get observation-level taxonomy fields applicable to an element's family.
 * Retorna campos de taxonomia por observacao (sample-level).
 *
 * @param {Record<string, any>} element - Element with .family property
 * @returns {Array<{ taxonomyId: string, taxonomyName: string, field: Object }>}
 */
export function getObservationFieldsForElement(element: any) {
    if (!element?.family)
        return [];
    const taxonomies = getTaxonomiesForFamily(element.family);
    const result = [];
    for (const tax of taxonomies) {
        if (!Array.isArray(tax.observationFields))
            continue;
        for (const field of tax.observationFields) {
            result.push({
                taxonomyId: tax.id,
                taxonomyName: tax.name,
                field,
            });
        }
    }
    return result;
}
// ----------------------------------------------------------------
// READ/WRITE - Access taxonomy field values on elements
// Leitura/escrita de valores de campos de taxonomia
// ----------------------------------------------------------------
/**
 * Get a taxonomy field value from an element.
 * Le valor de campo de taxonomia do element.data.taxonomy[taxId][fieldId].
 *
 * @param {Record<string, any>} element - Element object
 * @param {string} taxonomyId - Taxonomy ID
 * @param {string} fieldId - Field ID
 * @returns {*} Value or undefined
 */
export function getTaxonomyFieldValue(element: any, taxonomyId: any, fieldId: any) {
    return element?.data?.taxonomy?.[taxonomyId]?.[fieldId];
}
/**
 * Set a taxonomy field value on an element.
 * Escreve valor em element.data.taxonomy[taxId][fieldId].
 * Cria objetos intermediarios se necessario (lazy init).
 *
 * @param {Record<string, any>} element - Element object
 * @param {string} taxonomyId - Taxonomy ID
 * @param {string} fieldId - Field ID
 * @param {*} value - Value to set
 * @param {Record<string, any>} [fieldDef] - Field definition for validation
 * @returns {{ valid: boolean, error?: string }}
 */
export function setTaxonomyFieldValue(element: any, taxonomyId: any, fieldId: any, value: any, fieldDef: any) {
    if (!element?.data)
        return { valid: false, error: 'Element has no data object' };
    // Validate if definition provided
    if (fieldDef) {
        const validation = validateFieldValue(fieldDef, value);
        if (!validation.valid)
            return validation;
    }
    // Lazy init: create intermediate objects
    if (!element.data.taxonomy)
        element.data.taxonomy = {};
    if (!element.data.taxonomy[taxonomyId])
        element.data.taxonomy[taxonomyId] = {};
    element.data.taxonomy[taxonomyId][fieldId] = value;
    return { valid: true };
}
/**
 * Get a taxonomy field value from an observation.
 * Le valor de campo de taxonomia de observation.taxonomy[taxId][fieldId].
 *
 * @param {Record<string, any>} observation - Observation object
 * @param {string} taxonomyId
 * @param {string} fieldId
 * @returns {*} Value or undefined
 */
export function getObservationTaxonomyValue(observation: any, taxonomyId: any, fieldId: any) {
    return observation?.taxonomy?.[taxonomyId]?.[fieldId];
}
/**
 * Set a taxonomy field value on an observation.
 * Escreve valor em observation.taxonomy[taxId][fieldId].
 *
 * @param {Record<string, any>} observation
 * @param {string} taxonomyId
 * @param {string} fieldId
 * @param {*} value
 * @param {Record<string, any>} [fieldDef]
 * @returns {{ valid: boolean, error?: string }}
 */
export function setObservationTaxonomyValue(observation: any, taxonomyId: any, fieldId: any, value: any, fieldDef: any) {
    if (!observation)
        return { valid: false, error: 'No observation object' };
    if (fieldDef) {
        const validation = validateFieldValue(fieldDef, value);
        if (!validation.valid)
            return validation;
    }
    if (!observation.taxonomy)
        observation.taxonomy = {};
    if (!observation.taxonomy[taxonomyId])
        observation.taxonomy[taxonomyId] = {};
    observation.taxonomy[taxonomyId][fieldId] = value;
    return { valid: true };
}
// ----------------------------------------------------------------
// EXPORT HELPERS - For format exporters
// Funcoes auxiliares para exportadores de formato
// ----------------------------------------------------------------
/**
 * Get augmented columns for an element based on active taxonomies.
 * Retorna colunas extras (header + value) para exportadores tabulares.
 * Usado por CSV e XLSX exporters.
 *
 * @param {Record<string, any>} element - Element object
 * @returns {Array<{ header: string, value: *, taxonomyId: string, fieldId: string, exportMapping: Object }>}
 */
export function getAugmentedColumns(element: any) {
    const fields = getFieldsForElement(element);
    return fields.map((entry) => {
        const field = entry.field;
        return {
            header: field.nameKey || field.id,
            value: getTaxonomyFieldValue(element, entry.taxonomyId, field.id),
            taxonomyId: entry.taxonomyId,
            fieldId: field.id,
            exportMapping: field.exportMapping ?? {},
        };
    });
}
/**
 * Get all unique taxonomy column headers across all elements of a family.
 * Retorna headers unicos para exportacao tabular (deduplicados por fieldId).
 *
 * @param {string} familyId - Element family ID
 * @returns {Array<{ taxonomyId: string, fieldId: string, header: string, exportMapping: Object }>}
 */
export function getTaxonomyHeaders(familyId: any) {
    const taxonomies = getTaxonomiesForFamily(familyId);
    const seen = new Set();
    const headers = [];
    for (const tax of taxonomies) {
        if (!Array.isArray(tax.fieldSections))
            continue;
        for (const section of tax.fieldSections) {
            if (!Array.isArray(section.fields))
                continue;
            for (const field of section.fields) {
                const key = `${tax.id}:${field.id}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                headers.push({
                    taxonomyId: tax.id,
                    fieldId: field.id,
                    header: field.nameKey || field.id,
                    exportMapping: field.exportMapping ?? {},
                });
            }
        }
    }
    return headers;
}
/**
 * Get all unique observation-level taxonomy headers for a family.
 * @param {string} familyId
 * @returns {Array<{ taxonomyId: string, fieldId: string, header: string, exportMapping: Object }>}
 */
export function getObservationTaxonomyHeaders(familyId: any) {
    const taxonomies = getTaxonomiesForFamily(familyId);
    const seen = new Set();
    const headers = [];
    for (const tax of taxonomies) {
        if (!Array.isArray(tax.observationFields))
            continue;
        for (const field of tax.observationFields) {
            const key = `${tax.id}:${field.id}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            headers.push({
                taxonomyId: tax.id,
                fieldId: field.id,
                header: field.nameKey || field.id,
                exportMapping: field.exportMapping ?? {},
            });
        }
    }
    return headers;
}
//# sourceMappingURL=fieldResolver.js.map
