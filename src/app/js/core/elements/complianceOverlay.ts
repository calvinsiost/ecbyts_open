// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta

/* ================================================================
   COMPLIANCE OVERLAY — 3D visual indicators
   ================================================================

   Adiciona halos visuais aos meshes 3D dos elementos baseado
   no pior severity de compliance das observacoes.

   - Intervention (VI/CMA): anel vermelho pulsante
   - Prevention (VP): anel amarelo
   - Reference (VR): anel azul sutil
   - null: sem overlay

   ================================================================ */

import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { getThresholds, getExceededThreshold } from '../validation/rules.js';
import { resolveRegulatoryContext } from '../calculator/contextResolver.js';
import {
    selectObservationsForCampaign,
    groupAndAggregateObservations,
    type AggregationFactor,
} from '../analytics/_campaignAggregationPure.js';

// ----------------------------------------------------------------
// SEVERITY RANKING
// ----------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { intervention: 4, prevention: 3, reference: 2, info: 1 };
let _severityColors: Record<string, any> | null = null;
function _getSeverityColors(): Record<string, any> {
    if (!_severityColors) {
        _severityColors = {
            intervention: new THREE.Color(0xef4444),
            prevention: new THREE.Color(0xfbbf24),
            reference: new THREE.Color(0x60a5fa),
        };
    }
    return _severityColors;
}

// Track overlays by element ID for cleanup
const _overlays = new Map<string, any>();

// ----------------------------------------------------------------
// COMPUTE COMPLIANCE
// ----------------------------------------------------------------

/**
 * Compute worst compliance severity for an element.
 *
 * GRAPH-KPI-001 (Calvin 2026-06-14): `options` permite escopar a severidade a
 * uma campanha (`campaignId`) e/ou agregar múltiplas observações por parâmetro
 * num único valor representativo (`aggregation`: média/mediana/primeiro/último/
 * mín/máx) antes de avaliar o limite — usado pela navegação "<"/">" do painel de
 * Relações. Sem `options`, mantém o comportamento legado (avalia cada observação).
 */
export function computeElementCompliance(
    element: any,
    options: { campaignId?: string | null; aggregation?: AggregationFactor | null } = {},
): string | null {
    let worstSeverity: string | null = null;
    let worstRank = 0;
    const el: any = element;
    let observations: any[] = el.data?.observations || [];
    if (options.campaignId) {
        observations = selectObservationsForCampaign(observations, options.campaignId);
    }
    if (options.aggregation) {
        observations = groupAndAggregateObservations(observations, options.aggregation);
    }
    for (const obs of observations) {
        if (obs.value == null || isNaN(obs.value)) continue;
        const matrix = resolveRegulatoryContext(obs.variables, el.family);
        const thresholds = getThresholds(obs.parameterId, matrix);
        if (thresholds.length === 0) continue;
        const exceeded = getExceededThreshold(obs.value, thresholds);
        if (exceeded) {
            const rank = (SEVERITY_RANK as any)[exceeded.severity] || 0;
            if (rank > worstRank) {
                worstRank = rank;
                worstSeverity = exceeded.severity;
            }
        }
    }
    return worstSeverity;
}

interface _ParameterSeverity {
    parameterId: string;
    value: number;
    severity: string | null;
    exceedance: string | null;
    rank: number;
}

function _severityForObservation(obs: any, family: any): _ParameterSeverity | null {
    if (obs.value == null || isNaN(obs.value) || !obs.parameterId) return null;
    const matrix = resolveRegulatoryContext(obs.variables, family);
    const thresholds = getThresholds(obs.parameterId, matrix);
    const exceeded = thresholds.length ? getExceededThreshold(obs.value, thresholds) : null;
    const severity: string | null = exceeded ? exceeded.severity : null;
    const rank = severity ? (SEVERITY_RANK as any)[severity] || 0 : 0;
    return {
        parameterId: obs.parameterId,
        value: Number(obs.value),
        severity,
        exceedance: exceeded ? exceeded.exceedance : null,
        rank,
    };
}

/**
 * Severidade POR PARÂMETRO monitorado de um elemento (GRAPH-KPI-001 F2, Calvin
 * 2026-06-14: "expandir o gráfico por parâmetro monitorado"). Para cada
 * parâmetro presente nas observações (escopadas por campanha + agregadas pelo
 * fator), retorna a PIOR severidade frente aos limites. Permite drillar o
 * elemento em nós-parâmetro no grafo de Relações.
 *
 * @returns Array<{ parameterId, value, severity, exceedance }> — um por parâmetro.
 */
export function computeParameterSeverities(
    element: any,
    options: { campaignId?: string | null; aggregation?: AggregationFactor | null } = {},
): Array<{ parameterId: string; value: number; severity: string | null; exceedance: string | null }> {
    const el: any = element;
    let observations: any[] = el.data?.observations || [];
    if (options.campaignId) observations = selectObservationsForCampaign(observations, options.campaignId);
    if (options.aggregation) observations = groupAndAggregateObservations(observations, options.aggregation);
    const byParam = new Map<string, _ParameterSeverity>();
    for (const obs of observations) {
        const current = _severityForObservation(obs, el.family);
        if (!current) continue;
        const prev = byParam.get(current.parameterId);
        if (!prev || current.rank > prev.rank) {
            byParam.set(current.parameterId, current);
        }
    }
    return Array.from(byParam.values()).map(({ rank: _rank, ...rest }) => rest);
}

// ----------------------------------------------------------------
// 3D OVERLAY
// ----------------------------------------------------------------

/**
 * Update compliance halo on an element mesh.
 */
export function updateMeshOverlay(elementId: string, mesh: any, severity: string | null): void {
    // Remove existing overlay
    const existing = _overlays.get(elementId);
    if (existing) {
        mesh.remove(existing);
        existing.geometry.dispose();
        existing.material.dispose();
        _overlays.delete(elementId);
    }
    if (!severity || !(_getSeverityColors() as any)[severity]) return;
    // Create halo ring
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.6;
    const geometry = new THREE.RingGeometry(radius, radius + 0.15, 32);
    const material = new THREE.MeshBasicMaterial({
        color: (_getSeverityColors() as any)[severity],
        transparent: true,
        opacity: severity === 'intervention' ? 0.7 : severity === 'prevention' ? 0.5 : 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2; // Lay flat
    ring.position.y = 0.02; // Slightly above ground
    // Pulse animation data for intervention
    if (severity === 'intervention') {
        ring.userData.compliancePulse = true;
        ring.userData.pulseTime = 0;
    }
    ring.userData.complianceOverlay = true;
    mesh.add(ring);
    _overlays.set(elementId, ring);
}

/**
 * Update pulse animation for intervention halos.
 */
export function updatePulseAnimations(deltaTime: number): void {
    for (const ring of _overlays.values()) {
        if (!ring.userData.compliancePulse) continue;
        ring.userData.pulseTime += deltaTime;
        const t = ring.userData.pulseTime;
        ring.material.opacity = 0.4 + 0.3 * Math.sin(t * 3);
    }
}

/**
 * Remove all overlays (cleanup).
 */
export function clearAllOverlays(): void {
    for (const [_id, ring] of _overlays) {
        if (ring.parent) ring.parent.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
    }
    _overlays.clear();
}

/**
 * Get current overlay severity for an element.
 */
export function getOverlaySeverity(elementId: string): string | null {
    const ring = _overlays.get(elementId);
    if (!ring) return null;
    for (const [sev, color] of Object.entries(_getSeverityColors())) {
        if (ring.material.color.equals(color)) return sev;
    }
    return null;
}

/**
 * Check if at least one overlay has pulse animation enabled.
 */
export function hasPulsingOverlays(): boolean {
    for (const ring of _overlays.values()) {
        if (ring?.userData?.compliancePulse) return true;
    }
    return false;
}
