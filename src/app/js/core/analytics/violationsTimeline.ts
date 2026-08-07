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
   VIOLATIONS TIMELINE — Regulatory violations over time
   ================================================================

   Grafico de barras empilhadas mostrando violacoes por mes.
   Vermelho = intervention (VI/CMA), Amarelo = prevention (VP),
   Azul = reference (VR). Inclui linha de tendencia e estatisticas.

   ================================================================ */
import { validateObservationFull } from '../validation/rules.js';
import { resolveRegulatoryContext } from '../calculator/contextResolver.js';
import { linearRegression } from './statistics.js';
import { t } from '../../utils/i18n/translations.js';
// ----------------------------------------------------------------
// VIOLATIONS TIMELINE CLASS
// ----------------------------------------------------------------
export class ViolationsTimeline {
    canvas: any;
    canvasWrapper: any;
    container: any;
    headerEl: any;
    tensor: any;
    totalObs: number;
    violations: any[];
    constructor(container: any) {
        this.container = container;
        /** @type {any} */
        this.tensor = null;
        /** @type {any[]} */
        this.violations = []; // [{label, intervention, prevention, reference}]
        this.totalObs = 0;
        /** @type {any} */
        this.headerEl = null;
        /** @type {any} */
        this.canvasWrapper = null;
        /** @type {HTMLCanvasElement} */
        this.canvas = /** @type {any} */ (null);
        this._setupDOM();
    }
    /**
     * Receive data tensor.
     * Recebe tensor de dados do gerenciador.
     */
    setTensor(tensor: any) {
        this.tensor = tensor;
        this._computeViolations();
        this._render();
    }
    // ----------------------------------------------------------------
    // DOM SETUP
    // ----------------------------------------------------------------
    _setupDOM() {
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        // Header with stats
        this.headerEl = document.createElement('div');
        this.headerEl.className = 'violations-header';
        this.container.appendChild(this.headerEl);
        // Canvas wrapper
        this.canvasWrapper = document.createElement('div');
        this.canvasWrapper.className = 'violations-canvas-wrapper';
        this.container.appendChild(this.canvasWrapper);
        this.canvas = document.createElement('canvas');
        this.canvasWrapper.appendChild(this.canvas);
    }
    // ----------------------------------------------------------------
    // DATA PROCESSING
    // ----------------------------------------------------------------
    _computeViolations() {
        if (!this.tensor) {
            this.violations = [];
            return;
        }
        const data = this.tensor.getAll();
        this.totalObs = data.length;
        const byMonth = new Map();
        data.forEach((point: any) => {
            if (point.value == null || isNaN(point.value))
                return;
            const regContext = resolveRegulatoryContext(point.variables, point.family);
            const results = validateObservationFull({ value: point.value, unitId: point.unit }, point.parameterId, regContext);
            if (results.length === 0)
                return;
            const d = new Date(point.timestamp);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!byMonth.has(key))
                byMonth.set(key, { label: key, intervention: 0, prevention: 0, reference: 0 });
            const m = (byMonth.get(key));
            const sev = (results[0]).severity;
            if (sev === 'intervention')
                m.intervention++;
            else if (sev === 'prevention')
                m.prevention++;
            else if (sev === 'reference')
                m.reference++;
            else
                m.intervention++; // fallback
        });
        this.violations = Array.from(byMonth.values()).sort((a: any, b: any) => a.label.localeCompare(b.label));
    }
    // ----------------------------------------------------------------
    // RENDERING
    // ----------------------------------------------------------------
    _render() {
        // Header stats
        const totalViolations = this.violations.reduce((s: number, v: any) => s + v.intervention + v.prevention + v.reference, 0);
        const totalInterv = this.violations.reduce((s: number, v: any) => s + v.intervention, 0);
        const totalPrev = this.violations.reduce((s: number, v: any) => s + v.prevention, 0);
        const pct = this.totalObs > 0 ? ((totalViolations / this.totalObs) * 100).toFixed(1) : '0.0';
        // Trend direction
        let trendText = '';
        if (this.violations.length >= 3) {
            const totals = this.violations.map((v: any) => v.intervention + v.prevention + v.reference);
            const xs = totals.map((_, i) => i);
            const reg: any = linearRegression(xs, totals);
            if (reg && reg.slope != null) {
                trendText = reg.slope > 0.5 ? ' ↑' : reg.slope < -0.5 ? ' ↓' : ' →';
            }
        }
        const intervPct = totalViolations > 0 ? Math.round((totalInterv / totalViolations) * 100) : 0;
        const prevPct = totalViolations > 0 ? Math.round((totalPrev / totalViolations) * 100) : 0;
        this.headerEl.innerHTML = `
            <span><strong>${totalViolations}</strong> ${t('violations') || 'violations'} (${pct}%)${trendText}</span>
            <span class="violations-stat">${totalInterv} VI (${intervPct}%), ${totalPrev} VP (${prevPct}%)</span>
        `;
        // Empty state
        if (this.violations.length === 0) {
            this.canvasWrapper.innerHTML = `<div class="violations-empty">${t('noViolations') || 'No violations detected'}</div>`;
            return;
        }
        if (!this.canvasWrapper.contains(this.canvas)) {
            this.canvasWrapper.innerHTML = '';
            this.canvasWrapper.appendChild(this.canvas);
        }
        requestAnimationFrame(() => this._draw());
    }
    _draw() {
        const rect = this.canvasWrapper.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10)
            return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        const ctx = (this.canvas.getContext('2d'));
        if (!ctx)
            return;
        ctx.scale(dpr, dpr);
        const W = rect.width, H = rect.height;
        const margin = { top: 12, right: 16, bottom: 44, left: 44 };
        const plotW = W - margin.left - margin.right;
        const plotH = H - margin.top - margin.bottom;
        if (plotW < 20 || plotH < 20)
            return;
        const maxCount = Math.max(...this.violations.map((v: any) => v.intervention + v.prevention + v.reference), 1);
        const barWidth = Math.min(36, plotW / this.violations.length - 2);
        const step = plotW / this.violations.length;
        // Background grid
        ctx.strokeStyle = '#e5e5e5';
        ctx.lineWidth = 0.5;
        const gridLines = Math.min(5, maxCount);
        for (let i = 0; i <= gridLines; i++) {
            const y = margin.top + plotH - (i / gridLines) * plotH;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(W - margin.right, y);
            ctx.stroke();
            ctx.fillStyle = '#999';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round((maxCount * i) / gridLines).toString(), margin.left - 4, y + 3);
        }
        // Stacked bars - reference (base), prevention (middle), intervention (top)
        /** @type {number[]} */
        const totals: number[] = [];
        this.violations.forEach((v: any, i: number) => {
            const x = margin.left + i * step + (step - barWidth) / 2;
            const baseY = margin.top + plotH;
            const refH = (v.reference / maxCount) * plotH;
            const prevH = (v.prevention / maxCount) * plotH;
            const intervH = (v.intervention / maxCount) * plotH;
            totals.push(v.intervention + v.prevention + v.reference);
            let y = baseY;
            // Reference (base - azul)
            if (refH > 0) {
                y -= refH;
                ctx.fillStyle = '#60a5fa';
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, refH, [0, 0, 2, 2]);
                ctx.fill();
            }
            // Prevention (middle - amarelo)
            if (prevH > 0) {
                const prevY = y - prevH;
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.roundRect(x, prevY, barWidth, prevH, refH > 0 ? [0, 0, 0, 0] : [0, 0, 2, 2]);
                ctx.fill();
                y = prevY;
            }
            // Intervention (top - vermelho)
            if (intervH > 0) {
                const intY = y - intervH;
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.roundRect(x, intY, barWidth, intervH, [2, 2, 0, 0]);
                ctx.fill();
            }
            // X label
            ctx.fillStyle = '#999';
            ctx.font = '8px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.save();
            ctx.translate(x + barWidth / 2, baseY + 10);
            ctx.rotate(-Math.PI / 5);
            ctx.fillText(v.label, 0, 0);
            ctx.restore();
        });
        // Trend line
        if (totals.length >= 3) {
            const xs = totals.map((_, i) => i);
            const reg: any = linearRegression(xs, totals);
            if (reg && reg.slope != null) {
                ctx.strokeStyle = 'rgba(99,102,241,0.6)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 3]);
                ctx.beginPath();
                for (let i = 0; i < totals.length; i++) {
                    const predicted = reg.intercept + reg.slope * i;
                    const x = margin.left + i * step + step / 2;
                    const y = margin.top + plotH - (predicted / maxCount) * plotH;
                    if (i === 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        // Legend - 3 tiers
        const legendY = H - 8;
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'left';
        let lx = margin.left;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(lx, legendY - 7, 8, 8);
        ctx.fillStyle = '#888';
        ctx.fillText('VI', lx + 12, legendY);
        lx += 36;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(lx, legendY - 7, 8, 8);
        ctx.fillStyle = '#888';
        ctx.fillText('VP', lx + 12, legendY);
        lx += 36;
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(lx, legendY - 7, 8, 8);
        ctx.fillStyle = '#888';
        ctx.fillText('VR', lx + 12, legendY);
    }
    // ----------------------------------------------------------------
    // LIFECYCLE
    // ----------------------------------------------------------------
    destroy() {
        this.container.innerHTML = '';
        this.tensor = null;
        this.violations = [];
    }
}
//# sourceMappingURL=violationsTimeline.js.map
