// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   DRONE LOGISTICS KPI PANEL — ECBYTS-ENERGY-SCENARIOS-001#5

   Painel flutuante com KPIs logísticos de drone/UAV sobre rotas de voo
   (route_flow type 'flight_route'): nº de viagens/dia para X kg, custo por
   kg transportado, tempo de ciclo e comparação com rota terrestre quando
   ambas existem entre os mesmos pontos (caso biomassa: várzea → cooperativa).

   Cálculo puro em core/elements/families/drone/_droneLogisticsPure.ts.
   Padrão: exporta droneLogisticsHandlers (funções window.*).
   ================================================================ */
import { getAllElements } from '../../core/elements/manager.js';
import {
    computeDroneLogisticsKpis,
    compareDroneVsGround,
} from '../../core/elements/families/drone/_droneLogisticsPure.js';
import { createDroneDefaults } from '../../core/elements/families/drone/droneSchema.js';
import { escapeHtml } from '../helpers/html.js';

const PANEL_ID = 'drone-logistics-panel';

/** Comprimento (m) de um path de cena [{x,y,z}] — Euclidiano 3D. */
export function scenePathLengthM(path: any[]): number {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1] || {};
        const b = path[i] || {};
        const dx = (Number(b.x) || 0) - (Number(a.x) || 0);
        const dy = (Number(b.y) || 0) - (Number(a.y) || 0);
        const dz = (Number(b.z) || 0) - (Number(a.z) || 0);
        total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
}

function routeTypeOf(el: any): string {
    return el?.data?.type ?? el?.data?.route_type ?? '';
}

function routeLengthOf(el: any): number {
    const explicit = Number(el?.data?.route_properties?.total_distance);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return scenePathLengthM(el?.data?.path || el?.data?.points || []);
}

function fmt(v: number | null | undefined, digits = 1): string {
    return v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits);
}

/**
 * Coleta o cenário atual: drones, rotas de voo e rotas terrestres.
 * Exportada para teste (recebe elements para ficar pura).
 */
export function collectDroneScenario(elements?: any[]): {
    drones: any[];
    flightRoutes: any[];
    groundRoutes: any[];
} {
    const els = elements || getAllElements() || [];
    const drones = els.filter((e: any) => e?.family === 'drone');
    const routes = els.filter((e: any) => e?.family === 'route_flow');
    return {
        drones,
        flightRoutes: routes.filter((e: any) => routeTypeOf(e) === 'flight_route'),
        groundRoutes: routes.filter((e: any) => ['vehicle_route', 'access_path'].includes(routeTypeOf(e))),
    };
}

function buildKpiRowsHtml(title: string, k: any): string {
    return `
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.15)">
        <div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>
        <div>Rota: <b>${fmt(k.routeLengthKm, 2)} km</b> · Ciclo: <b>${fmt(k.cycleTimeMin)} min</b> (voo ${fmt(k.flightTimeMinPerTrip)} min)</div>
        <div>Viagens/dia necessárias: <b>${k.tripsNeededPerDay}</b> · possíveis: <b>${k.tripsPossiblePerDay}</b> ${k.demandFeasible ? '✔' : '✖ insuficiente'}</div>
        <div>Capacidade: <b>${fmt(k.kgPerDayCapacity, 0)} kg/dia</b> (${fmt(k.kgPerTrip, 0)} kg/viagem)</div>
        <div>Custo: <b>${k.costPerKg != null ? fmt(k.costPerKg, 2) + '/kg' : '—'}</b> · viagem ${fmt(k.costPerTrip, 2)} · dia ${fmt(k.totalDailyCost, 2)}</div>
        ${k.withinAutonomy === false ? '<div style="color:#ff8a65">⚠ Ida+volta excede a autonomia do drone</div>' : ''}
      </div>`;
}

/**
 * Monta o HTML interno do painel (exportado para teste sem DOM real).
 */
export function buildDroneLogisticsPanelHtml(elements?: any[], demandKgPerDay = 200): string {
    const { drones, flightRoutes, groundRoutes } = collectDroneScenario(elements);
    if (drones.length === 0 || flightRoutes.length === 0) {
        return `<div style="opacity:0.8">Crie ao menos 1 elemento <b>Drone/UAV</b> e 1 rota <b>flight_route</b> (família Rotas e Fluxos) para ver os KPIs.</div>`;
    }
    const drone = drones[0];
    const d = { ...createDroneDefaults(), ...(drone?.data || {}) };
    let html = `<div style="opacity:0.75;font-size:11px">Drone: ${escapeHtml(drone?.name || drone?.id || 'drone')} · payload ${fmt(d.payloadKg, 0)} kg · ${fmt(d.speedKmh, 0)} km/h · demanda ${fmt(demandKgPerDay, 0)} kg/dia</div>`;

    for (const route of flightRoutes) {
        const routeLengthM = routeLengthOf(route);
        const kpis = computeDroneLogisticsKpis({
            routeLengthM,
            demandKgPerDay,
            payloadKg: d.payloadKg,
            speedKmh: d.speedKmh,
            turnaroundMin: d.turnaroundMin,
            autonomyKm: d.autonomyKm,
            costPerHour: d.costPerHour,
            costPerKm: d.costPerKm,
            operatingHoursPerDay: d.operatingHoursPerDay,
        });
        if (!kpis) continue;
        html += buildKpiRowsHtml(`✈ ${route?.name || route?.id || 'flight_route'}`, kpis);

        // Comparação com rota terrestre entre os MESMOS pontos (mesmos nós de
        // início/fim quando definidos; fallback: primeira rota terrestre).
        const sameEndpoints = groundRoutes.find((g: any) => {
            const gs = g?.data?.geometry?.start_node?.id ?? g?.data?.startNodeId;
            const ge = g?.data?.geometry?.end_node?.id ?? g?.data?.endNodeId;
            const fs = route?.data?.geometry?.start_node?.id ?? route?.data?.startNodeId;
            const fe = route?.data?.geometry?.end_node?.id ?? route?.data?.endNodeId;
            return fs != null && ge != null && ((gs === fs && ge === fe) || (gs === fe && ge === fs));
        });
        const ground = sameEndpoints || groundRoutes[0];
        if (ground) {
            const cmp = compareDroneVsGround(
                {
                    routeLengthM,
                    demandKgPerDay,
                    payloadKg: d.payloadKg,
                    speedKmh: d.speedKmh,
                    turnaroundMin: d.turnaroundMin,
                    autonomyKm: d.autonomyKm,
                    costPerHour: d.costPerHour,
                    costPerKm: d.costPerKm,
                    operatingHoursPerDay: d.operatingHoursPerDay,
                },
                {
                    routeLengthM: routeLengthOf(ground),
                    payloadKg: Number(ground?.data?.payloadKg) || 500,
                    speedKmh: Number(ground?.data?.speedKmh) || 30,
                    turnaroundMin: Number(ground?.data?.turnaroundMin) || 20,
                    costPerHour: Number(ground?.data?.costPerHour) || 120,
                    costPerKm: Number(ground?.data?.costPerKm) || null,
                    operatingHoursPerDay: d.operatingHoursPerDay,
                },
                demandKgPerDay,
            );
            if (cmp) {
                html += buildKpiRowsHtml(`🚚 ${ground?.name || ground?.id || 'ground route'} (terrestre)`, cmp.ground);
                html += `<div style="margin-top:6px;font-weight:600">Comparação: ${
                    cmp.cheaperMode ? `mais barato/kg: <b>${cmp.cheaperMode}</b> (Δ ${fmt(cmp.costPerKgDeltaPct, 0)}%)` : 'sem custos p/ comparar'
                } · ciclo mais rápido: <b>${cmp.fasterMode}</b> (Δ ${fmt(cmp.cycleTimeDeltaPct, 0)}%)</div>`;
            }
        }
    }
    return html;
}

function renderPanel(demandKgPerDay: number): void {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Drone logistics KPIs');
        panel.style.cssText =
            'position:fixed;top:70px;right:16px;z-index:9000;width:340px;max-height:70vh;overflow:auto;' +
            'background:rgba(20,28,42,0.94);color:#eceff1;font:12px/1.5 system-ui,sans-serif;' +
            'border:1px solid rgba(41,182,246,0.5);border-radius:8px;padding:12px;box-shadow:0 6px 24px rgba(0,0,0,0.4)';
        document.body.appendChild(panel);
    }
    panel.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">` +
        `<b>KPIs logísticos — Drone/UAV</b>` +
        `<button aria-label="Fechar" style="background:none;border:none;color:#eceff1;cursor:pointer;font-size:14px" ` +
        `onclick="window.closeDroneLogisticsPanel && window.closeDroneLogisticsPanel()">✕</button></div>` +
        buildDroneLogisticsPanelHtml(undefined, demandKgPerDay);
}

export const droneLogisticsHandlers = {
    /** Abre/atualiza o painel de KPIs. @param demandKgPerDay demanda diária (kg), default 200. */
    showDroneLogisticsPanel(demandKgPerDay: number = 200): void {
        renderPanel(Number(demandKgPerDay) > 0 ? Number(demandKgPerDay) : 200);
    },
    closeDroneLogisticsPanel(): void {
        document.getElementById(PANEL_ID)?.remove();
    },
};
