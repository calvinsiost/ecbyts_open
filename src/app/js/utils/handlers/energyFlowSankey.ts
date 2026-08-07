// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Module: Energy/Mass Flow Sankey Handlers (ECBYTS-ENERGY-SCENARIOS-001#8)
/* ================================================================
   ENERGY / MASS FLOW SANKEY

   Módulo de análise que desenha o diagrama de Sankey do fluxo de
   massa/energia da cadeia (biomassa → conversão → produtos → destinos)
   a partir do grafo de elementos + rotas com payload.

   SVG próprio (sem lib de CDN — compatível com CSP). Padrão de módulo
   de análise: abre painel modal, renderiza, permite tela cheia + export
   do SVG para captura.
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { buildSankeyModel } from '../../core/elements/energyFlowSankey.js';
import { conserveFlow } from '../../core/elements/routeFlowGraph.js';
import type { SankeyModel } from '../../core/elements/energyFlowSankey.js';
import type { FlowType, FlowPayload } from '../../core/elements/routeFlowGraph.js';

const log = createLogger('EnergySankey');
const document = (globalThis.document) as Document & any;

const SVG_NS = 'http://www.w3.org/2000/svg';

// Paleta do tema (navy + ciano/verde) — alinhada aos outros módulos de análise.
const NODE_COLORS = ['#38bdf8', '#22d3ee', '#34d399', '#a78bfa', '#f59e0b', '#f472b6', '#94a3b8'];
const LINK_MASS = '#22d3ee';
const LINK_ENERGY = '#f59e0b';

interface DemoScenario {
    name: string;
    flowType: FlowType;
    nodes: Array<{ id: string; label?: string }>;
    routes: Array<{ id: string; startNodeId: string; endNodeId: string; payload: FlowPayload }>;
}

/**
 * Cenário de demonstração: pirólise de resíduo de biomassa lignocelulósica.
 * Base 100 t/dia de resíduo → biocarvão 35–52 / gás 30–34 / bio-óleo 3–7 / cinza 3–6.
 * (usamos os pontos médios das faixas para o balanço de massa)
 */
export function biomassPyrolysisScenario(): DemoScenario {
    const mass = (value: number, label: string): FlowPayload => ({ flowType: 'mass', value, unit: 't/dia', label });
    return {
        name: 'Biomassa — pirólise do resíduo (massa, t/dia)',
        flowType: 'mass',
        nodes: [
            { id: 'caroco', label: 'Resíduo de biomassa' },
            { id: 'pirolise', label: 'Pirólise' },
            { id: 'biocarvao', label: 'Biocarvão' },
            { id: 'gas', label: 'Gás de síntese' },
            { id: 'biooleo', label: 'Bio-óleo' },
            { id: 'cinza', label: 'Cinza' },
        ],
        routes: [
            { id: 'r1', startNodeId: 'caroco', endNodeId: 'pirolise', payload: mass(100, 'biomassa') },
            { id: 'r2', startNodeId: 'pirolise', endNodeId: 'biocarvao', payload: mass(43, 'biocarvão') },
            { id: 'r3', startNodeId: 'pirolise', endNodeId: 'gas', payload: mass(32, 'gás') },
            { id: 'r4', startNodeId: 'pirolise', endNodeId: 'biooleo', payload: mass(5, 'bio-óleo') },
            { id: 'r5', startNodeId: 'pirolise', endNodeId: 'cinza', payload: mass(4, 'cinza') },
        ],
    };
}

/**
 * Cenário de demonstração em ENERGIA (MJ/dia) — poder calorífico aproximado
 * dos produtos da pirólise de resíduo de biomassa.
 */
export function biomassEnergyScenario(): DemoScenario {
    const en = (value: number, label: string): FlowPayload => ({ flowType: 'energy', value, unit: 'MJ/dia', label });
    return {
        name: 'Biomassa — energia dos produtos (MJ/dia)',
        flowType: 'energy',
        nodes: [
            { id: 'caroco', label: 'Caroço (energia PCI)' },
            { id: 'pirolise', label: 'Pirólise' },
            { id: 'biocarvao', label: 'Biocarvão' },
            { id: 'gas', label: 'Gás de síntese' },
            { id: 'biooleo', label: 'Bio-óleo' },
            { id: 'perdas', label: 'Perdas de processo' },
        ],
        routes: [
            { id: 'e1', startNodeId: 'caroco', endNodeId: 'pirolise', payload: en(1800, 'PCI biomassa') },
            { id: 'e2', startNodeId: 'pirolise', endNodeId: 'biocarvao', payload: en(1290, 'biocarvão') },
            { id: 'e3', startNodeId: 'pirolise', endNodeId: 'gas', payload: en(290, 'gás') },
            { id: 'e4', startNodeId: 'pirolise', endNodeId: 'biooleo', payload: en(130, 'bio-óleo') },
            { id: 'e5', startNodeId: 'pirolise', endNodeId: 'perdas', payload: en(90, 'perdas') },
        ],
    };
}

let _currentScenario: DemoScenario = biomassPyrolysisScenario();

// ──────────────────────────────────────────────────────────────────────
// SVG rendering (self-contained; sem CDN)
// ──────────────────────────────────────────────────────────────────────

function _svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

interface Placed {
    id: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    throughput: number;
}

function _layoutNodes(model: SankeyModel, W: number, H: number): Map<string, Placed> {
    const pad = { t: 40, b: 30, l: 20, r: 20 };
    const innerW = W - pad.l - pad.r;
    const innerH = H - pad.t - pad.b;
    const nodeW = 18;
    const colGap = model.layerCount > 1 ? (innerW - nodeW) / (model.layerCount - 1) : 0;

    // Agrupa por layer.
    const byLayer: Map<number, Array<SankeyModel['nodes'][number]>> = new Map();
    for (const n of model.nodes) {
        if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
        (byLayer.get(n.layer) as Array<any>).push(n);
    }
    const maxThroughput = Math.max(1, ...model.nodes.map((n) => n.throughput));
    // Escala vertical: soma dos throughputs da coluna mais cheia dita a escala.
    let maxColSum = 1;
    for (const arr of byLayer.values()) {
        const sum = arr.reduce((s, n) => s + n.throughput, 0);
        if (sum > maxColSum) maxColSum = sum;
    }
    const vGap = 14;
    const placed: Map<string, Placed> = new Map();
    let colorIdx = 0;
    for (const [layerNum, arr] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
        const totalGap = vGap * (arr.length - 1);
        const scale = (innerH - totalGap) / maxColSum;
        let y = pad.t;
        // centraliza verticalmente a coluna
        const colHeight = arr.reduce((s, n) => s + Math.max(6, n.throughput * scale), 0) + totalGap;
        y = pad.t + Math.max(0, (innerH - colHeight) / 2);
        for (const n of arr) {
            const h = Math.max(6, n.throughput * scale);
            const x = pad.l + layerNum * colGap;
            placed.set(n.id, {
                id: n.id,
                label: n.label,
                x,
                y,
                w: nodeW,
                h,
                // Guard exigido por noUncheckedIndexedAccess; o módulo sempre
                // fica no intervalo válido do array (colorIdx % length).
                color: NODE_COLORS[colorIdx % NODE_COLORS.length] ?? NODE_COLORS[0]!,
                throughput: n.throughput,
            });
            colorIdx++;
            y += h + vGap;
        }
    }
    void maxThroughput;
    return placed;
}

function _renderSankeySvg(model: SankeyModel): SVGElement {
    const W = 900;
    const H = 480;
    const svg = _svgEl('svg', {
        viewBox: `0 0 ${W} ${H}`,
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'xMidYMid meet',
        style: 'background:var(--bg-secondary,#0f172a);border-radius:8px;',
        'font-family': 'ui-sans-serif, system-ui, sans-serif',
    });

    if (!model.nodes.length) {
        const txt = _svgEl('text', { x: W / 2, y: H / 2, fill: '#94a3b8', 'text-anchor': 'middle', 'font-size': 14 });
        txt.textContent = 'Sem fluxo de massa/energia para exibir (nenhuma rota com payload).';
        svg.appendChild(txt);
        return svg;
    }

    const placed = _layoutNodes(model, W, H);
    const linkColor = model.flowType === 'energy' ? LINK_ENERGY : LINK_MASS;

    // Track offsets acumulados nas bordas dos nós para empilhar links.
    const outOff: Map<string, number> = new Map();
    const inOff: Map<string, number> = new Map();

    // Links primeiro (atrás dos nós).
    const linkGroup = _svgEl('g', { 'fill-opacity': '0.45' });
    for (const link of model.links) {
        const s = placed.get(link.source);
        const tg = placed.get(link.target);
        if (!s || !tg) continue;
        const totalOut = model.nodes.find((n) => n.id === link.source)?.outflow || 1;
        const totalIn = model.nodes.find((n) => n.id === link.target)?.inflow || 1;
        const thickS = (link.value / totalOut) * s.h;
        const thickT = (link.value / totalIn) * tg.h;
        const soff = outOff.get(link.source) || 0;
        const toff = inOff.get(link.target) || 0;
        const x0 = s.x + s.w;
        const y0 = s.y + soff;
        const x1 = tg.x;
        const y1 = tg.y + toff;
        const mx = (x0 + x1) / 2;
        // banda com curva de Bézier (borda superior → borda inferior)
        const d =
            `M ${x0} ${y0} ` +
            `C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1} ` +
            `L ${x1} ${y1 + thickT} ` +
            `C ${mx} ${y1 + thickT}, ${mx} ${y0 + thickS}, ${x0} ${y0 + thickS} Z`;
        const path = _svgEl('path', { d, fill: linkColor });
        const title = _svgEl('title', {});
        title.textContent = `${s.label} → ${tg.label}: ${link.value} ${link.unit}${link.label ? ` (${link.label})` : ''}`;
        path.appendChild(title);
        linkGroup.appendChild(path);
        // rótulo de valor no meio da faixa
        const lbl = _svgEl('text', {
            x: mx,
            y: (y0 + y1) / 2 + thickS / 2 - 3,
            fill: '#e2e8f0',
            'text-anchor': 'middle',
            'font-size': 10,
            'fill-opacity': '1',
        });
        lbl.textContent = `${link.value} ${link.unit}`;
        linkGroup.appendChild(lbl);
        outOff.set(link.source, soff + thickS);
        inOff.set(link.target, toff + thickT);
    }
    svg.appendChild(linkGroup);

    // Nós.
    for (const p of placed.values()) {
        const rect = _svgEl('rect', {
            x: p.x,
            y: p.y,
            width: p.w,
            height: p.h,
            rx: 3,
            fill: p.color,
        });
        const title = _svgEl('title', {});
        title.textContent = `${p.label}: ${p.throughput} ${model.unit || ''}`;
        rect.appendChild(title);
        svg.appendChild(rect);
        const text = _svgEl('text', {
            x: p.x + p.w + 6,
            y: p.y + p.h / 2 + 4,
            fill: '#e2e8f0',
            'font-size': 11,
            'font-weight': '600',
        });
        text.textContent = `${p.label} (${p.throughput}${model.unit ? ' ' + model.unit : ''})`;
        svg.appendChild(text);
    }

    // Título.
    const titleTxt = _svgEl('text', { x: 20, y: 24, fill: '#f8fafc', 'font-size': 15, 'font-weight': '700' });
    titleTxt.textContent = model.flowType === 'energy' ? 'Fluxo de energia' : 'Fluxo de massa';
    svg.appendChild(titleTxt);
    if (model.unit) {
        const unitTxt = _svgEl('text', { x: 20, y: 24, fill: '#94a3b8', 'font-size': 11, dx: 130 });
        unitTxt.textContent = `unidade: ${model.unit}`;
        svg.appendChild(unitTxt);
    }
    return svg;
}

// ──────────────────────────────────────────────────────────────────────
// Modal / painel
// ──────────────────────────────────────────────────────────────────────

function _createModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.id = 'energy-sankey-modal';
    modal.style.cssText =
        'position:fixed;inset:0;background:rgba(2,6,23,.72);display:none;align-items:center;justify-content:center;z-index:9600;';
    modal.innerHTML = `
        <div id="energy-sankey-panel" style="background:var(--bg-primary,#0b1220);border:1px solid var(--border,#1e293b);border-radius:12px;width:min(1000px,94vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border,#1e293b);">
                <div style="font-size:14px;font-weight:700;color:var(--text-primary,#f8fafc);">Fluxo de energia/massa — Sankey</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <select id="energy-sankey-scenario" style="background:var(--bg-secondary,#0f172a);color:var(--text-primary,#e2e8f0);border:1px solid var(--border,#1e293b);border-radius:6px;padding:5px 8px;font-size:11px;">
                        <option value="mass">Biomassa — massa (t/dia)</option>
                        <option value="energy">Biomassa — energia (MJ/dia)</option>
                    </select>
                    <button id="energy-sankey-fullscreen" title="Tela cheia" style="background:var(--bg-secondary,#0f172a);border:1px solid var(--border,#1e293b);color:#94a3b8;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">⛶ Tela cheia</button>
                    <button id="energy-sankey-export" title="Baixar SVG" style="background:var(--bg-secondary,#0f172a);border:1px solid var(--border,#1e293b);color:#94a3b8;padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">⭳ SVG</button>
                    <button id="energy-sankey-close" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1;">×</button>
                </div>
            </div>
            <div id="energy-sankey-body" style="flex:1;min-height:0;overflow:auto;padding:14px 16px;">
                <div id="energy-sankey-canvas" style="width:100%;height:480px;"></div>
                <div id="energy-sankey-balance" style="margin-top:12px;font-size:11px;color:#94a3b8;"></div>
            </div>
        </div>
    `;
    return modal;
}

function _renderBalance(el: HTMLElement, scenario: DemoScenario): void {
    const result = conserveFlow(scenario.routes as any, scenario.flowType);
    const badge = result.conserved
        ? `<span style="color:#34d399;">✓ Balanço fechado</span>`
        : `<span style="color:#f59e0b;">⚠ ${result.imbalanced.length} nó(s) com desbalanço</span>`;
    const rows = result.nodes
        .map((n) => {
            const tag = n.isSource ? 'fonte' : n.isSink ? 'destino' : n.balanced ? 'ok' : `Δ ${n.delta.toFixed(1)}`;
            const color = n.isSource || n.isSink || n.balanced ? '#64748b' : '#f59e0b';
            return `<span style="display:inline-block;margin:2px 8px 2px 0;color:${color};">${escapeHtml(n.nodeId)}: e=${n.inflow} s=${n.outflow} <em>(${tag})</em></span>`;
        })
        .join('');
    el.innerHTML = `<div style="margin-bottom:4px;font-weight:600;">Balanço (${escapeHtml(scenario.flowType)}) — ${badge} · entrada total ${result.totalInflow}, saída total ${result.totalOutflow}</div><div>${rows}</div>`;
}

function _renderScenario(scenario: DemoScenario): void {
    _currentScenario = scenario;
    const canvas = document.getElementById('energy-sankey-canvas');
    if (!canvas) return;
    const model = buildSankeyModel(scenario.nodes as any, scenario.routes as any, scenario.flowType);
    canvas.innerHTML = '';
    canvas.appendChild(_renderSankeySvg(model));
    const balanceEl = document.getElementById('energy-sankey-balance');
    if (balanceEl) _renderBalance(balanceEl as HTMLElement, scenario);
}

function _wire(modal: HTMLElement): void {
    modal.querySelector('#energy-sankey-close')?.addEventListener('click', handleCloseEnergySankeyModal);
    modal.addEventListener('click', (e: any) => {
        if (e.target === modal) handleCloseEnergySankeyModal();
    });
    modal.querySelector('#energy-sankey-scenario')?.addEventListener('change', (e: any) => {
        const v = e.target.value;
        _renderScenario(v === 'energy' ? biomassEnergyScenario() : biomassPyrolysisScenario());
    });
    modal.querySelector('#energy-sankey-fullscreen')?.addEventListener('click', () => {
        const panel = document.getElementById('energy-sankey-panel');
        if (panel?.requestFullscreen) panel.requestFullscreen().catch((err: any) => log.warn('fullscreen', err?.message));
    });
    modal.querySelector('#energy-sankey-export')?.addEventListener('click', _exportSvg);
}

function _exportSvg(): void {
    const canvas = document.getElementById('energy-sankey-canvas');
    const svg = canvas?.querySelector('svg');
    if (!svg) return;
    try {
        const source = new XMLSerializer().serializeToString(svg);
        const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + source], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sankey-${_currentScenario.flowType}-${Date.now()}.svg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Sankey exportado (SVG)', 'success');
    } catch (err: any) {
        log.error('export svg', err?.message);
        showToast('Falha ao exportar SVG', 'error');
    }
}

/** Abre o painel de Sankey de fluxo de energia/massa. */
export function handleOpenEnergySankeyModal(): void {
    let modal = document.getElementById('energy-sankey-modal');
    if (!modal) {
        modal = _createModal();
        document.body.appendChild(modal);
        _wire(modal as HTMLElement);
    }
    modal.style.display = 'flex';
    _renderScenario(biomassPyrolysisScenario());
}

/** Fecha o painel. */
export function handleCloseEnergySankeyModal(): void {
    const modal = document.getElementById('energy-sankey-modal');
    if (modal) modal.style.display = 'none';
}

export const energyFlowSankeyHandlers = {
    handleOpenEnergySankeyModal,
    handleCloseEnergySankeyModal,
};
