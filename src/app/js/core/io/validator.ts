// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ECO1 IMPORT VALIDATOR — Schema validation & HTML sanitization
   ================================================================

   Valida estrutura de modelos ECO1 decodificados antes de aplicar
   ao modelo ativo. Garante integridade de dados e sanitiza HTML
   de relatorios contra XSS.

   Chamado por importFromString() ANTES de applyModel().

   Estrategia: elementos invalidos sao filtrados (nao aborta tudo),
   erros estruturais (ex: elements nao e array) abortam o import.

   Tambem garante backward-compat: observacoes importadas sem id
   recebem um ID gerado, e bindings sao validados estruturalmente.
   ================================================================ */
import { generateId } from '../../utils/helpers/id.js';
import { escapeHtml } from '../../utils/helpers/html.js';
// Adopt pure helper from Module C extraction (commit 22287c10): removes transitive
// imports of session/CONFIG/elements that come with permissions.ts. Pure boundary
// suffices for ECBT import validation.
import { sanitizeActionOverrides } from '../../utils/auth/_permissionsPure.js';
import { validateBindings as _validateBindingsPure } from './_validatorBindingsPure.js';
// ----------------------------------------------------------------
// SCHEMA VALIDATION
// Validacao estrutural do modelo decodificado
// ----------------------------------------------------------------
/**
 * Validate decoded ECO1 model structure.
 * Filtra elementos invalidos, corrige tipos e sanitiza HTML.
 *
 * @param {any} model - Decoded model object
 * @returns {{ valid: boolean, errors: string[], warnings: string[], model: any }}
 */
export function validateModel(model: any) {
    /** @type {string[]} */
    const errors: any[] = [];
    const warnings: any[] = [];
    if (!model || typeof model !== 'object') {
        return { valid: false, errors: ['Model is not an object'], warnings, model };
    }
    // --- Elements ---
    if (model.elements !== undefined) {
        if (!Array.isArray(model.elements)) {
            errors.push('elements must be an array');
        }
        else {
            const seenIds = new Set();
            model.elements = model.elements.filter((el: any, i: any) => {
                if (!el || typeof el !== 'object') {
                    warnings.push(`Element [${i}]: not an object, skipped`);
                    return false;
                }
                if (typeof el.id !== 'string' || !el.id.trim()) {
                    warnings.push(`Element [${i}]: missing or empty id, skipped`);
                    return false;
                }
                if (seenIds.has(el.id)) {
                    warnings.push(`Element [${i}]: duplicate id "${el.id}", skipped`);
                    return false;
                }
                seenIds.add(el.id);
                // Family: aceita qualquer string (pode ser family customizada)
                // Mas se nao for string, aplica default
                if (typeof el.family !== 'string' || !el.family.trim()) {
                    warnings.push(`Element "${el.id}": missing family, defaulting to "well"`);
                    el.family = 'well';
                }
                // Name: garante string
                if (typeof el.name !== 'string') {
                    el.name = el.id;
                }
                // Observations: garante IDs estaveis + valida bindings
                if (Array.isArray(el.data?.observations)) {
                    for (const obs of el.data.observations) {
                        if (!obs || typeof obs !== 'object')
                            continue;
                        // Backward-compat: gera ID se ausente
                        if (!obs.id || typeof obs.id !== 'string') {
                            obs.id = generateId('obs');
                        }
                        // Valida bindings (se presente)
                        _validateBindings(obs, warnings, el.id);
                    }
                }
                // Hierarchy: garante estrutura padrao e corrige self-ref
                if (!el.hierarchy || typeof el.hierarchy !== 'object') {
                    el.hierarchy = { level: 'element', parentId: null, order: 0 };
                }
                else {
                    if (el.hierarchy.parentId === el.id) {
                        warnings.push(`Element "${el.id}": hierarchy.parentId is self-reference, corrected to null`);
                        el.hierarchy.parentId = null;
                    }
                    if (el.hierarchy.parentId === undefined)
                        el.hierarchy.parentId = null;
                    if (!Number.isFinite(el.hierarchy.order))
                        el.hierarchy.order = 0;
                    if (typeof el.hierarchy.level !== 'string')
                        el.hierarchy.level = 'element';
                }
                return true;
            });
        }
    }
    // --- Campaigns ---
    if (model.campaigns !== undefined) {
        if (!Array.isArray(model.campaigns)) {
            warnings.push('campaigns is not an array, resetting to empty');
            model.campaigns = [];
        }
    }
    // --- Scenes ---
    if (model.scenes !== undefined) {
        if (!Array.isArray(model.scenes)) {
            warnings.push('scenes is not an array, resetting to empty');
            model.scenes = [];
        }
    }
    // --- Edges ---
    if (model.edges !== undefined && !Array.isArray(model.edges)) {
        warnings.push('edges is not an array, resetting to empty');
        model.edges = [];
    }
    // --- Contracts ---
    if (model.contracts !== undefined && !Array.isArray(model.contracts)) {
        warnings.push('contracts is not an array, resetting to empty');
        model.contracts = [];
    }
    // --- WBS ---
    if (model.wbs !== undefined && !Array.isArray(model.wbs)) {
        warnings.push('wbs is not an array, resetting to empty');
        model.wbs = [];
    }
    // --- Project Registry / Timesheets ---
    if (model.projectRegistry !== undefined &&
        (typeof model.projectRegistry !== 'object' ||
            model.projectRegistry === null ||
            Array.isArray(model.projectRegistry))) {
        warnings.push('projectRegistry is not an object, resetting to null');
        model.projectRegistry = null;
    }
    if (model.projectRegistry?.timesheets !== undefined && !Array.isArray(model.projectRegistry.timesheets)) {
        warnings.push('projectRegistry.timesheets is not an array, resetting to empty');
        model.projectRegistry.timesheets = [];
    }
    // --- Report content sanitization (XSS boundary) ---
    if (model.report) {
        _sanitizeReportContent(model.report);
    }
    // --- Issues sanitization (XSS boundary) ---
    if (Array.isArray(model.issues)) {
        for (const issue of model.issues) {
            if (issue.title)
                issue.title = escapeHtml(String(issue.title));
            if (issue.description)
                issue.description = escapeHtml(String(issue.description));
            if (issue.resolution)
                issue.resolution = escapeHtml(String(issue.resolution));
            if (Array.isArray(issue.comments)) {
                for (const c of issue.comments) {
                    if (c.text)
                        c.text = escapeHtml(String(c.text));
                }
            }
        }
    }
    // --- Access rules - sanitize actionOverrides (RBAC boundary) ---
    // Garante que actionOverrides importados contem apenas acoes/valores validos.
    if (model.access && Array.isArray(model.access.rules)) {
        for (const rule of model.access.rules) {
            if (rule && typeof rule === 'object') {
                rule.actionOverrides = sanitizeActionOverrides(rule.actionOverrides);
            }
        }
    }
    return { valid: errors.length === 0, errors, warnings, model };
}
// ----------------------------------------------------------------
// REPORT HTML SANITIZATION
// Sanitiza HTML de relatorios contra XSS na fronteira de import
// ----------------------------------------------------------------
/**
 * Sanitize report HTML content in-place.
 * Remove scripts, iframes, event handlers e javascript: URIs.
 * Preserva formatacao legitima (negrito, italico, listas, tabelas).
 *
 * @param {any} report - Report object (single or multi-report format)
 */
function _sanitizeReportContent(report: any) {
    // Multi-report format
    if (Array.isArray(report.reports)) {
        for (const r of report.reports) {
            if (r.content && typeof r.content === 'string') {
                r.content = _sanitizeHtml(r.content);
            }
        }
    }
    // Single-report / legacy format
    if (report.content && typeof report.content === 'string') {
        report.content = _sanitizeHtml(report.content);
    }
}
/**
 * Strip dangerous HTML elements and attributes.
 * Usa DOM parsing para remover scripts, iframes e event handlers
 * sem depender de bibliotecas externas (zero CDN dependency).
 *
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML
 */
function _sanitizeHtml(html: any) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // Remove dangerous tags
    const dangerousTags = 'script,iframe,object,embed,link,style,base,form,meta';
    for (const el of div.querySelectorAll(dangerousTags)) {
        el.remove();
    }
    // Remove event handlers and javascript: URIs from all elements
    for (const el of div.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            const value = attr.value.toLowerCase().trim();
            if (name.startsWith('on') || value.startsWith('javascript:')) {
                el.removeAttribute(attr.name);
            }
        }
    }
    return div.innerHTML;
}
// ----------------------------------------------------------------
// BINDING VALIDATION
// Delegate para _validatorBindingsPure (extraído Module C)
// ----------------------------------------------------------------
function _validateBindings(obj: any, warnings: any, parentId: any) {
    _validateBindingsPure(obj, warnings, parentId);
}
