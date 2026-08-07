// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FAULT INTERSECTION REPORT — Risk assessment for well × fault
   ================================================================
   P1-8 Family Fault Wells Directional Phase 5 parte 2/3 (Claude-owner).
   DoD §"Interseções": "Relatório de interseções" + "Cálculo automático".

   Pipeline:
   1. Para cada par (well, fault), detecta interseções via Phase 1
      `intersectFaultWellTrajectory` + plane equation.
   2. Calcula MD do hit (interpola na trajetória).
   3. Classifica risco: high (cruza screen interval), medium (cruza casing),
      low (intersect mas não na zona crítica).
   4. Agrega em report estruturado por well + por fault.

   Contexto de uso:
   - Gestão de riscos hidráulicos: poço cruzando falha = potencial conexão
     entre aquíferos separados.
   - Compliance ambiental: CONAMA 396/2008 (águas subterrâneas) + CETESB.
   - Decisão técnica: requalificar poço, vedar com bentonita, abandonar.

   Spec: docs/specs/features/SPEC_FAMILY_FAULT_WELLS_DIRECTIONAL.md §"Interseções"
   ================================================================ */

import { planeEquation, intersectFaultWellTrajectory } from './faultGeometry.js';
// eslint-disable-next-line
import { interpolateTrajectoryAtMD } from './wellLithology.js';

/**
 * @typedef {Object} FaultRiskClassification
 * @property {'high'|'medium'|'low'} severity
 * @property {string} category - 'screen_breach' | 'casing_breach' | 'cement_breach' | 'general'
 * @property {string} recommendation
 */

/**
 * Classifica risco de uma interseção dado o MD do hit + design do poço.
 *
 * @param {number} hitMD - MD onde o poço cruza a falha
 * @param {any} well - Well com data { screenTop, screenBottom, casingTop, casingBottom }
 * @returns {FaultRiskClassification}
 */
export function classifyIntersectionRisk(hitMD: any, well: any) {
    if (!Number.isFinite(hitMD)) {
        return {
            severity: 'low',
            category: 'general',
            recommendation: 'MD da interseção indeterminado; revisar dados de survey.',
        };
    }
    const data = (well && well.data) || {};
    const screenTop = Number(data.screenTop);
    const screenBottom = Number(data.screenBottom);
    const casingTop = Number(data.casingTop);
    const casingBottom = Number(data.casingBottom);

    // High: dentro do intervalo de screen (filtro)
    if (
        Number.isFinite(screenTop) &&
        Number.isFinite(screenBottom) &&
        hitMD >= Math.min(screenTop, screenBottom) &&
        hitMD <= Math.max(screenTop, screenBottom)
    ) {
        return {
            severity: 'high',
            category: 'screen_breach',
            recommendation:
                'Falha cruza intervalo de filtro do poço. Risco crítico de conexão hidráulica entre aquíferos. Considerar abandono ou recompletação com vedação por bentonita/cimento.',
        };
    }

    // Medium: dentro do intervalo de casing (revestimento)
    if (
        Number.isFinite(casingTop) &&
        Number.isFinite(casingBottom) &&
        hitMD >= Math.min(casingTop, casingBottom) &&
        hitMD <= Math.max(casingTop, casingBottom)
    ) {
        return {
            severity: 'medium',
            category: 'casing_breach',
            recommendation:
                'Falha cruza revestimento do poço. Verificar integridade do cimento na altura da interseção; risco de migração via espaço anular.',
        };
    }

    // Low: intersecta mas fora das zonas críticas
    return {
        severity: 'low',
        category: 'general',
        recommendation: 'Interseção fora de filtro/revestimento. Documentar para auditoria geológica.',
    };
}

/**
 * Calcula interseções de UM poço com UMA falha.
 *
 * @param {any} well - { id, name, data: { trajectory: CartesianStation[] } }
 * @param {any} fault - { id, name, data: { strike, dip, position?, point0? } }
 * @param {any} [opts]
 * @returns {{ok:boolean, intersections:Array<any>, error?:string}}
 */
export function detectIntersections(well: any, fault: any, opts: any = {}) {
    if (!well || !well.data) return { ok: false, intersections: [], error: 'well_required' };
    if (!fault || !fault.data) return { ok: false, intersections: [], error: 'fault_required' };
    const trajectory = well.data.trajectory;
    if (!Array.isArray(trajectory) || trajectory.length < 2) {
        return { ok: false, intersections: [], error: 'trajectory_min_2_points' };
    }
    const strike = Number(fault.data.strike);
    const dip = Number(fault.data.dip);
    if (!Number.isFinite(strike) || !Number.isFinite(dip)) {
        return { ok: false, intersections: [], error: 'fault_strike_dip_required' };
    }

    const point0 = fault.data.point0 || fault.data.position || { x: 0, y: 0, z: 0 };
    const plane = planeEquation(strike, dip, point0);

    // Converte trajectory para {x,y,z} se vier como {easting,northing,tvd}
    const points = trajectory.map((/** @type {any} */ s) => {
        if (Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)) {
            return { x: s.x, y: s.y, z: s.z, md: s.md };
        }
        const elev = Number(opts.wellElevationY) || 0;
        return {
            x: Number(s.easting) || 0,
            y: elev - (Number(s.tvd) || 0),
            z: Number(s.northing) || 0,
            md: Number(s.md) || 0,
        };
    });

    const hits = intersectFaultWellTrajectory(points, plane);

    // Para cada hit, interpola MD usando segment t e MD dos endpoints
    const enriched = hits.map((/** @type {any} */ hit: any) => {
        const segIdx = hit.segmentIndex;
        const a = points[segIdx]!;
        const b = points[segIdx + 1]!;
        const md = (a.md || 0) + (hit.t || 0) * ((b.md || 0) - (a.md || 0));
        const risk = classifyIntersectionRisk(md, well);
        return {
            wellId: well.id,
            wellName: well.name || well.id,
            faultId: fault.id,
            faultName: fault.name || fault.id,
            position: { x: hit.x, y: hit.y, z: hit.z },
            md,
            segmentIndex: segIdx,
            ...risk,
        };
    });

    return { ok: true, intersections: enriched };
}

/**
 * Relatório completo: cruza N poços × M falhas, agrega por well + por fault +
 * por severidade.
 *
 * @param {Array<any>} wells
 * @param {Array<any>} faults
 * @param {any} [opts]
 * @returns {{ok:boolean, intersections:Array<any>, summary:any, errors:string[]}}
 */
export function buildIntersectionReport(wells: any, faults: any, opts = {}) {
    if (!Array.isArray(wells) || !Array.isArray(faults)) {
        return {
            ok: false,
            intersections: [],
            summary: {},
            errors: ['wells_and_faults_arrays_required'],
        };
    }
    /** @type {any[]} */
    const allIntersections = [];
    /** @type {string[]} */
    const errors = [];
    for (const well of wells) {
        for (const fault of faults) {
            const r = detectIntersections(well, fault, opts);
            if (!r.ok) {
                errors.push(`${well?.id || '?'}×${fault?.id || '?'}: ${r.error}`);
                continue;
            }
            allIntersections.push(...r.intersections);
        }
    }

    // Agregações
    /** @type {Record<string, number>} */
    const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
    /** @type {Record<string, number>} */
    const byWell: Record<string, number> = {};
    /** @type {Record<string, number>} */
    const byFault: Record<string, number> = {};
    for (const x of allIntersections) {
        bySeverity[x.severity] = (bySeverity[x.severity] || 0) + 1;
        byWell[x.wellId] = (byWell[x.wellId] || 0) + 1;
        byFault[x.faultId] = (byFault[x.faultId] || 0) + 1;
    }

    return {
        ok: true,
        intersections: allIntersections,
        summary: {
            total: allIntersections.length,
            bySeverity,
            byWell,
            byFault,
            wellCount: wells.length,
            faultCount: faults.length,
            highSeverityCount: bySeverity.high,
        },
        errors,
    };
}

/**
 * Exporta report em formato Markdown legível para incident response /
 * documentação compliance.
 *
 * @param {any} report - Output de buildIntersectionReport
 * @returns {string}
 */
export function exportReportAsMarkdown(report: any) {
    if (!report || !Array.isArray(report.intersections)) {
        return '# Relatório de Interseções\n\nSem dados.\n';
    }
    const { intersections, summary } = report;
    const lines = ['# Relatório de Interseções Falha × Poço', ''];
    lines.push(`**Total interseções:** ${summary.total}`);
    lines.push(`**Poços analisados:** ${summary.wellCount}`);
    lines.push(`**Falhas analisadas:** ${summary.faultCount}`);
    lines.push('');
    lines.push('## Por severidade');
    lines.push('');
    lines.push(`- 🔴 High (screen breach): ${summary.bySeverity.high}`);
    lines.push(`- 🟡 Medium (casing breach): ${summary.bySeverity.medium}`);
    lines.push(`- 🟢 Low (general): ${summary.bySeverity.low}`);
    lines.push('');
    if (intersections.length > 0) {
        lines.push('## Detalhamento');
        lines.push('');
        lines.push('| Severidade | Poço | Falha | MD (m) | Categoria | Recomendação |');
        lines.push('| --- | --- | --- | --- | --- | --- |');
        for (const x of intersections) {
            const sev = x.severity === 'high' ? '🔴' : x.severity === 'medium' ? '🟡' : '🟢';
            lines.push(
                `| ${sev} ${x.severity} | ${x.wellName} | ${x.faultName} | ${x.md.toFixed(1)} | ${x.category} | ${x.recommendation} |`,
            );
        }
    }
    return lines.join('\n') + '\n';
}
