// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   REGULATORY REPORT — Compliance extraction + provenance trail
   Extrai conformidade de core/validation e monta a estrutura de
   dados do relatório regulatório (CETESB GAC / CONAMA Standard).

   PURE module: sem DOM, sem rede. A análise de conformidade já é
   feita por rules.js — aqui apenas agregamos e estruturamos
   (ver SPEC_REGULATORY_REPORT_GENERATOR §14: NÃO reimplementa
   a análise de conformidade).
   ================================================================ */

import { validateObservationFull } from './rules.js';

/** @typedef {{ id: string, label: string, matrix: string }} ReportTemplate */
type ReportTemplate = { id: string; label: string; matrix: string };

/** Supported regulatory templates (MVP — Must Have). */
export const REPORT_TEMPLATES = ([
    { id: 'CETESB_GAC', label: 'CETESB GAC', matrix: 'groundwater' },
    { id: 'CONAMA_STD', label: 'CONAMA Standard', matrix: 'groundwater' },
] as ReportTemplate[]);

/**
 * Resolve a template descriptor by id, falling back to CONAMA Standard.
 * @param {string} templateId
 * @returns {ReportTemplate}
 */
export function resolveTemplate(templateId: any) {
    return REPORT_TEMPLATES.find((t) => t.id === templateId) || REPORT_TEMPLATES[1];
}

/**
 * Flatten model elements into a single observation list.
 * Cada observação carrega o id do elemento de origem (data source).
 * @param {Array<any>} elements
 * @returns {Array<any>}
 */
export function collectObservations(elements: any) {
    const out = [];
    for (const el of elements || []) {
        const obs = el?.data?.observations || [];
        for (const o of obs) {
            if (!o || o.parameterId == null || o.value == null || o.value === '') continue;
            const value = Number(o.value);
            if (!Number.isFinite(value)) continue;
            out.push({ ...o, value, _sourceId: el.id, _sourceName: el.name || el.id });
        }
    }
    return out;
}

/**
 * Run core/validation against every observation and aggregate compliance.
 * Reaproveita validateObservationFull (rules.js) — não reimplementa limites.
 * @param {Array<any>} elements
 * @param {string} matrix - regulatory matrix (e.g. 'groundwater')
 * @returns {{ total: number, assessed: number, violations: Array<any>, complianceRate: number, dataSourceIds: string[] }}
 */
export function extractComplianceSummary(elements: any, matrix = 'groundwater') {
    const observations = collectObservations(elements);
    const violations = [];
    const dataSources = new Set();
    let assessed = 0;

    for (const obs of observations) {
        dataSources.add(obs._sourceId);
        const results = validateObservationFull(obs, obs.parameterId, obs.matrix || matrix);
        if (results.length === 0) continue;
        assessed++;
        for (const r of results) {
            if (r.type === 'regulatory' || r.type === 'regulatory_uncertain') {
                violations.push({
                    sourceId: obs._sourceId,
                    sourceName: obs._sourceName,
                    parameterId: obs.parameterId,
                    value: r.value,
                    limit: r.limit,
                    thresholdType: r.thresholdType,
                    severity: r.severity,
                    source: r.source,
                    message: r.message,
                });
            }
        }
    }

    const complianceRate = assessed === 0 ? 1 : Math.max(0, 1 - violations.length / assessed);
    return {
        total: observations.length,
        assessed,
        violations,
        complianceRate,
        dataSourceIds: [...dataSources],
    };
}

/**
 * Compute a SHA-256 provenance hash over the report payload.
 * Usa Web Crypto (crypto.subtle) — sem dependência de core/crypto,
 * mantém o módulo dentro do escopo da spec.
 * @param {Object} payload
 * @returns {Promise<string>} hex digest
 */
export async function computeProvenanceHash(payload: any) {
    const json = JSON.stringify(payload);
    const cryptoObj = (globalThis as any).crypto;
    if (!cryptoObj?.subtle) return _fallbackHash(json);
    const bytes = new TextEncoder().encode(json);
    const digest = await cryptoObj.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministic non-cryptographic fallback (test/Node-without-subtle).
 * @param {string} str
 * @returns {string}
 */
function _fallbackHash(str: any) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
}

/**
 * Build the report metadata + provenance trail object (SPEC §4.3).
 * @param {Object} args
 * @param {string} args.templateId
 * @param {{ total: number, assessed: number, violations: Array<any>, complianceRate: number, dataSourceIds: string[] }} args.summary
 * @param {string} [args.userId]
 * @param {string} [args.modelVersion]
 * @returns {Promise<Object>}
 */
export async function buildReportMetadata({
    templateId,
    summary,
    userId,
    modelVersion
}: any) {
    const generatedAt = new Date().toISOString();
    const tpl: any = resolveTemplate(templateId);
    const provenanceCore = {
        template: tpl.id,
        generatedAt,
        dataSources: summary.dataSourceIds,
        userId: userId || 'anonymous',
        modelVersion: modelVersion || 'unknown',
        complianceRate: summary.complianceRate,
        violations: summary.violations.length,
    };
    const modelHash = await computeProvenanceHash(provenanceCore);
    return {
        reportId: `rr-${Date.now()}`,
        template: tpl.id,
        templateLabel: tpl.label,
        generatedAt,
        provenance: {
            modelHash,
            dataSources: summary.dataSourceIds,
            userId: provenanceCore.userId,
            modelVersion: provenanceCore.modelVersion,
        },
        contentSummary: {
            complianceRate: summary.complianceRate,
            violations: summary.violations.length,
            assessed: summary.assessed,
            total: summary.total,
        },
    };
}

/**
 * Render the report as report-editor HTML (consumed by utils/report
 * manager → PDF/DOCX export). Escapa todo conteúdo dinâmico.
 * @param {Object} meta - from buildReportMetadata
 * @param {{ violations: Array<any> }} summary
 * @param {(s: string) => string} summary - escapeHtml from utils/helpers/html.js
 * @returns {string} HTML
 */
export function renderReportHtml(meta: any, summary: any, esc: any) {
    const e = typeof esc === 'function' ? esc : (s: any) => String(s ?? '');
    const rate = (meta.contentSummary.complianceRate * 100).toFixed(1);
    const rows = summary.violations
        .map(
            (v: any) => `<tr><td>${e(v.sourceName)}</td><td>${e(v.parameterId)}</td>` +
            `<td>${e(String(v.value))}</td><td>${e(String(v.limit))}</td>` +
            `<td>${e(String(v.thresholdType).toUpperCase())}</td><td>${e(v.source)}</td></tr>`,
        )
        .join('');
    const tableBody =
        rows ||
        '<tr><td colspan="6">Nenhuma violação de conformidade detectada / No compliance violations detected.</td></tr>';
    return [
        `<h1>${e(meta.templateLabel)} — Relatório Regulatório</h1>`,
        `<p><strong>Gerado em / Generated at:</strong> ${e(meta.generatedAt)}</p>`,
        `<p><strong>Taxa de conformidade / Compliance rate:</strong> ${e(rate)}%</p>`,
        `<p><strong>Pontos avaliados / Assessed points:</strong> ${e(String(meta.contentSummary.assessed))} / ${e(String(meta.contentSummary.total))}</p>`,
        `<h2>Violações / Violations (${e(String(meta.contentSummary.violations))})</h2>`,
        `<table border="1"><thead><tr><th>Fonte</th><th>Parâmetro</th><th>Valor</th><th>Limite</th><th>Tipo</th><th>Norma</th></tr></thead><tbody>${tableBody}</tbody></table>`,
        `<hr/>`,
        `<p style="font-size:11px;color:#555;"><strong>Provenance Trail:</strong><br/>`,
        `Hash: ${e(meta.provenance.modelHash)}<br/>`,
        `Model version: ${e(meta.provenance.modelVersion)}<br/>`,
        `User: ${e(meta.provenance.userId)}<br/>`,
        `Data sources: ${e(meta.provenance.dataSources.join(', ') || '—')}</p>`,
    ].join('\n');
}
