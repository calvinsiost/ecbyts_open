// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Radar Chart — Canvas 2D renderer for 10-axis EIS visualization
   SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI.md Fase 2
   ================================================================

   Renderiza um gráfico radar (teia de aranha) puro em Canvas 2D
   para exibir os 10 eixos EIS (Core-6 + Progressive-4).
   Sem dependências de bibliotecas de gráficos externas.
   ================================================================ */

import { listCoreAxes, listProgressiveAxes } from '../../core/eis/axisRegistry.js';

// ── Utilitário: rótulo curto do eixo ──────────────────────────────────────────
// Retorna até 2 chars do ID em maiúsculas como fallback se shortLabel não existir.
/**
 * Extrai o rótulo curto de um eixo para exibição no radar.
 * @param axis - Definição do eixo (AXIS_DEFINITIONS entry)
 * @returns Rótulo curto (até 3 chars)
 */
function _shortLabel(axis: Record<string, any>): string {
    if (axis.shortLabel) return axis.shortLabel;
    return axis.id;
}

// ── Opções padrão ─────────────────────────────────────────────────────────────

/**
 * Retorna as opções padrão para renderização do radar EIS.
 * Usadas como fallback em renderEISRadar quando opts omitido.
 */
export function getDefaultRadarOpts(): {
    size: number;
    bgColor: string;
    gridColor: string;
    fillColor: string;
    strokeColor: string;
    labelColor: string;
    showLabels: boolean;
    showValues: boolean;
    gridLevels: number;
} {
    return {
        size: 300,
        bgColor: 'transparent',
        gridColor: '#cccccc',
        fillColor: 'rgba(34, 139, 34, 0.25)',
        strokeColor: '#228b22',
        labelColor: '#333333',
        showLabels: true,
        showValues: true,
        gridLevels: 5,
    };
}

// ── Matemática pura (sem DOM) ─────────────────────────────────────────────────

/**
 * Calcula os pontos {x, y} do polígono radar para um conjunto de scores.
 * Distribui os eixos uniformemente em 2π radianos, começando no topo (-π/2).
 * Score 0 = centro, score 5 = raio máximo.
 *
 * @param axisIds - IDs dos eixos na ordem desejada
 * @param scores - Mapa axisId → score (0-5)
 * @param center - Ponto central do radar
 * @param radius - Raio máximo (equivalente a score=5)
 * @returns Pontos do polígono na mesma ordem dos axisIds
 */
export function buildRadarPoints(
    axisIds: string[],
    scores: Record<string, number>,
    center: { x: number; y: number },
    radius: number,
): Array<{ x: number; y: number }> {
    const n = axisIds.length;
    const maxScore = 5;
    return axisIds.map((id, i) => {
        // Ângulo começa no topo (-π/2) e distribui em sentido horário
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const rawScore = scores[id];
        const score = rawScore == null || isNaN(rawScore) ? 0 : Math.max(0, Math.min(maxScore, rawScore));
        const r = (score / maxScore) * radius;
        return {
            x: center.x + r * Math.cos(angle),
            y: center.y + r * Math.sin(angle),
        };
    });
}

// ── Funções de desenho (Canvas 2D - apenas browser) ──────────────────────────

/**
 * Limpa o canvas para transparente.
 *
 * @param canvas - Elemento canvas alvo
 */
export function clearRadar(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Renderiza o gráfico radar EIS 10-eixos no canvas fornecido.
 * Limpa e redesenha completamente a cada chamada.
 *
 * Ordem dos eixos: Core-6 (T, A, Cp, Ty, Cs, Cm) seguido de Progressive-4 (Gc, Bi, Se, Tr).
 * Eixos ausentes no mapa de scores assumem valor 0.
 *
 * @param canvas - Elemento canvas onde renderizar
 * @param axisScores - Mapa axisId → score (0-5)
 * @param opts - Opções de renderização (sobrescreve defaults)
 */
export function renderEISRadar(
    canvas: HTMLCanvasElement,
    axisScores: Record<string, number>,
    opts: object = {},
): void {
    // Mesclar opções com defaults
    const o = Object.assign(getDefaultRadarOpts(), opts);

    // Dimensionar canvas
    canvas.width = o.size;
    canvas.height = o.size;

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, o.size, o.size);

    // Fundo opcional
    if (o.bgColor && o.bgColor !== 'transparent') {
        ctx.fillStyle = o.bgColor;
        ctx.fillRect(0, 0, o.size, o.size);
    }

    // Obter eixos em ordem canônica: core primeiro, depois progressivos
    const coreAxes = listCoreAxes();
    const progAxes = listProgressiveAxes();
    const allAxes = [...coreAxes, ...progAxes];
    const axisIds = allAxes.map((ax: any) => ax.id);
    const n = axisIds.length;

    // Padding para labels e valores ao redor do radar
    const padding = o.showLabels ? 36 : 16;
    const center = { x: o.size / 2, y: o.size / 2 };
    const radius = o.size / 2 - padding;

    // ── 1. Desenhar grid concêntrico ──────────────────────────────────────────
    ctx.strokeStyle = o.gridColor;
    ctx.lineWidth = 0.8;
    for (let level = 1; level <= o.gridLevels; level++) {
        const r = (level / o.gridLevels) * radius;
        const gridPts = axisIds.map((_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            return { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) };
        });
        ctx.beginPath();
        ctx.moveTo(gridPts[0]!.x, gridPts[0]!.y);
        for (let i = 1; i < gridPts.length; i++) {
            ctx.lineTo(gridPts[i]!.x, gridPts[i]!.y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // ── 2. Desenhar raios (spokes) ────────────────────────────────────────────
    ctx.strokeStyle = o.gridColor;
    ctx.lineWidth = 0.8;
    axisIds.forEach((_, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const tipX = center.x + radius * Math.cos(angle);
        const tipY = center.y + radius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
    });

    // ── 3. Desenhar polígono dos scores ───────────────────────────────────────
    const scorePoints = buildRadarPoints(axisIds, axisScores, center, radius);

    ctx.beginPath();
    ctx.moveTo(scorePoints[0]!.x, scorePoints[0]!.y);
    for (let i = 1; i < scorePoints.length; i++) {
        ctx.lineTo(scorePoints[i]!.x, scorePoints[i]!.y);
    }
    ctx.closePath();
    ctx.fillStyle = o.fillColor;
    ctx.fill();
    ctx.strokeStyle = o.strokeColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // ── 4. Labels dos eixos ───────────────────────────────────────────────────
    if (o.showLabels) {
        ctx.fillStyle = o.labelColor;
        ctx.font = `bold 11px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        allAxes.forEach((axis: any, i: number) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            // Label posicionado além da ponta do raio
            const labelR = radius + 20;
            const lx = center.x + labelR * Math.cos(angle);
            const ly = center.y + labelR * Math.sin(angle);
            const label = _shortLabel(axis);
            // Eixos progressivos em cor distinta (itálico não disponível sem ctx.save/restore)
            ctx.fillStyle = axis.tier === 'progressive' ? '#666688' : o.labelColor;
            ctx.fillText(label, lx, ly);
        });
    }

    // ── 5. Valores numéricos nos vértices do polígono de score ────────────────
    if (o.showValues) {
        ctx.font = `10px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        axisIds.forEach((id: string, i: number) => {
            const pt = scorePoints[i]!;
            const rawScore = axisScores[id];
            const score = rawScore == null || isNaN(rawScore) ? 0 : Math.max(0, Math.min(5, rawScore));
            // Exibir apenas se score > 0 para não poluir o centro
            if (score > 0) {
                const axis = allAxes[i] as any;
                ctx.fillStyle = axis.tier === 'progressive' ? '#444466' : o.strokeColor;
                ctx.fillText(score.toFixed(1), pt.x, pt.y - 8);
            }
        });
    }
}
