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
   WBS MANAGER — Work Breakdown Structure & Earned Value Analysis
   Gerenciador de EAP e Analise de Valor Agregado

   FUNCIONALIDADES:
   - CRUD de itens WBS com estrutura hierarquica (parentId)
   - Calculo completo de EVA (PV, EV, AC, SV, CV, SPI, CPI, EAC, ETC, VAC)
   - Templates ambientais pre-definidos (GRI, CONAMA, Monitoramento)
   - Deteccao de desvios criticos
   - Projecoes customizaveis via CPI

   FORMULAS EVA:
   PV = Planned Value (custo baseline * % programado)
   EV = Earned Value (custo baseline * % realizado)
   AC = Actual Cost (custo real)
   SV = Schedule Variance (EV - PV)
   CV = Cost Variance (EV - AC)
   SPI = Schedule Performance Index (EV / PV)
   CPI = Cost Performance Index (EV / AC)
   EAC = Estimate At Completion
   ETC = Estimate To Complete
   VAC = Variance At Completion
   ================================================================ */

import { generateId } from '../helpers/id.js';
import { idbSet, idbGetWithLegacy } from '../storage/idbStore.js';
// Adopt own pure helpers (Module C extraction commit de33f383) — PMI EVM math.
import { computeEva, aggregateEva, detectEvaDeviations } from './_evaPure.js';

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const IDB_KEY_WBS = 'ecbyts-gov-wbs';
const IDB_KEY_SNAPSHOTS = 'ecbyts-gov-wbs-snapshots';

/** @type {Array<any>} */
let wbsItems: any = [];

/** @type {Array<any>} Project snapshots (status dates) */
let snapshots: any = [];

let _loaded = false;
/** @type {any} */ let _saveTimer: any = null;

// ----------------------------------------------------------------
// PERSISTENCE - IDB (debounced, fire-and-forget)
// ----------------------------------------------------------------

function _save() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        idbSet(
            IDB_KEY_WBS,
            wbsItems.map((w: any) => ({ ...w })),
        ).catch((_e: any) => console.debug('[utils/governance/wbsManager:silent-catch]', _e?.message || _e));
        idbSet(
            IDB_KEY_SNAPSHOTS,
            snapshots.map((s: any) => ({ ...s })),
        ).catch((_e: any) => console.debug('[utils/governance/wbsManager:silent-catch]', _e?.message || _e));
    }, 300);
}

/**
 * Load WBS data from IDB on startup.
 * @returns {Promise<void>}
 */
export async function loadWbs() {
    if (_loaded) return;
    const data = await idbGetWithLegacy(IDB_KEY_WBS);
    if (Array.isArray(data) && data.length > 0) wbsItems = data;
    const snaps = await idbGetWithLegacy(IDB_KEY_SNAPSHOTS);
    if (Array.isArray(snaps) && snaps.length > 0) snapshots = snaps;
    _loaded = true;
}

// ----------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------

/**
 * Add a WBS item.
 * Adiciona item a EAP.
 *
 * @param {any} data - WBS item data
 * @returns {any} - Created WBS item
 */
export function addWbsItem(data: any = {}) {
    const item = {
        id: data.id || generateId('wbs'),
        parentId: data.parentId || null,
        code: data.code || generateNextCode(data.parentId),
        name: data.name || 'New Task',
        baseline: {
            cost: data.baseline?.cost || 0,
            startDate: data.baseline?.startDate || '',
            endDate: data.baseline?.endDate || '',
            weight: data.baseline?.weight || 0,
        },
        planned: {
            cost: data.planned?.cost || 0,
            startDate: data.planned?.startDate || '',
            endDate: data.planned?.endDate || '',
            weight: data.planned?.weight || 0,
        },
        actual: {
            cost: data.actual?.cost || 0,
            startDate: data.actual?.startDate || '',
            endDate: data.actual?.endDate || '',
            percentComplete: data.actual?.percentComplete || 0,
        },
        status: data.status || 'not_started',
        linkedContractId: data.linkedContractId || null,
        costCenterId: data.costCenterId || null,
        createdAt: data.createdAt || new Date().toISOString(),
    };

    wbsItems.push(item);
    _save();
    return item;
}

/**
 * Update a WBS item.
 * @param {string} id
 * @param {any} updates
 * @returns {Object|null}
 */
export function updateWbsItem(id: any, updates: any) {
    const item = wbsItems.find((w: any) => w.id === id);
    if (!item) return null;

    for (const [key, value] of Object.entries(updates)) {
        if (key === 'baseline' || key === 'planned' || key === 'actual') {
            Object.assign(item[key], value);
        } else if (key !== 'id' && key !== 'createdAt') {
            item[key] = value;
        }
    }

    _save();
    return item;
}

/**
 * Remove a WBS item and its children.
 * Remove item e seus filhos.
 *
 * @param {string} id
 * @returns {boolean}
 */
/**
 * Clear all WBS items.
 * Remove todos os itens da EAP.
 */
export function clearWbs() {
    wbsItems = [];
    _save();
}

/** @param {string} id */
export function removeWbsItem(id: any) {
    // Find all descendant IDs
    const toRemove = new Set([id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of wbsItems) {
            if (item.parentId && toRemove.has(item.parentId) && !toRemove.has(item.id)) {
                toRemove.add(item.id);
                changed = true;
            }
        }
    }

    const before = wbsItems.length;
    wbsItems = wbsItems.filter((w: any) => !toRemove.has(w.id));
    const removed = wbsItems.length < before;
    if (removed) _save();
    return removed;
}

/**
 * Get all WBS items.
 * @returns {Array<any>}
 */
export function getWbsItems() {
    return wbsItems;
}

/**
 * Get WBS items as a tree structure.
 * Retorna itens WBS como arvore.
 *
 * @returns {Array<any>} - Tree with children[] arrays
 */
export function getWbsTree() {
    const map = new Map();
    const roots = [];

    // Create node map
    for (const item of wbsItems) {
        map.set(item.id, { ...item, children: [] });
    }

    // Build tree
    for (const item of wbsItems) {
        const node = map.get(item.id);
        if (item.parentId && map.has(item.parentId)) {
            map.get(item.parentId).children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

// ----------------------------------------------------------------
// EVA CALCULATIONS
// ----------------------------------------------------------------

/**
 * Calculate Earned Value Analysis for a single WBS item.
 * Calcula Analise de Valor Agregado para um item.
 *
 * @param {string} id - WBS item ID
 * @returns {Object|null} - EVA metrics
 */
export function calculateEVA(id: any) {
    const item = wbsItems.find((w: any) => w.id === id);
    if (!item) return null;
    // Delega fórmulas PMI EVM para _evaPure.computeEva (math pura testável).
    const metrics = computeEva({
        bac: item.baseline.cost || 0,
        percentScheduled: calculateScheduledPercent(item),
        percentComplete: item.actual.percentComplete || 0,
        ac: item.actual.cost || 0,
    });
    return { itemId: id, itemName: item.name, ...metrics };
}

/**
 * Calculate aggregate EVA for the entire project.
 * Calcula EVA agregado de todo o projeto.
 *
 * @returns {any} - Aggregated EVA metrics
 */
export function calculateProjectEVA() {
    // Only aggregate root-level items (no parent). Delega roll-up para _evaPure.
    const roots = wbsItems.filter((w: any) => !w.parentId);
    const evaList = roots
        .map((root: any) => calculateEVA(root.id))
        .filter((e: any): e is any => e != null);
    return aggregateEva(evaList as any);
}

/**
 * Detect deviations beyond a threshold.
 * Detecta desvios criticos alem de um limiar.
 *
 * @param {number} spiThreshold - Minimum acceptable SPI (default 0.8)
 * @param {number} cpiThreshold - Minimum acceptable CPI (default 0.8)
 * @returns {Array<any>} - Deviation entries
 */
export function detectDeviations(spiThreshold = 0.8, cpiThreshold = 0.8) {
    // Delega scan de threshold para _evaPure.detectEvaDeviations (pure).
    const evaList = wbsItems
        .map((item: any) => ({ item, eva: calculateEVA(item.id) as any }))
        .filter((entry: any) => entry.eva != null);
    return detectEvaDeviations(evaList as any, spiThreshold, cpiThreshold).map((d: any) => ({
        itemId: d.item.id,
        itemName: d.item.name,
        code: d.item.code,
        status: d.item.status,
        issues: d.issues,
        eva: d.eva,
    }));
}

// ----------------------------------------------------------------
// TEMPLATES
// ----------------------------------------------------------------

/**
 * Get available WBS templates.
 * Retorna templates pre-definidos de EAP.
 *
 * @returns {Array<any>} - Template definitions
 */
export function getWbsTemplates() {
    return [
        {
            id: 'gri-investigation',
            name: 'GRI Investigation',
            nameKey: 'wbsTemplateGRI',
            description: 'Investigacao ambiental conforme GRI/CONAMA',
            items: [
                { code: '1', name: 'Avaliacao Preliminar', weight: 10 },
                { code: '1.1', name: 'Levantamento Historico', parent: '1', weight: 3 },
                { code: '1.2', name: 'Visita Tecnica', parent: '1', weight: 4 },
                { code: '1.3', name: 'Modelo Conceitual Inicial', parent: '1', weight: 3 },
                { code: '2', name: 'Investigacao Confirmatoria', weight: 25 },
                { code: '2.1', name: 'Amostragem de Solo', parent: '2', weight: 10 },
                { code: '2.2', name: 'Amostragem de Agua Subterranea', parent: '2', weight: 10 },
                { code: '2.3', name: 'Analises Laboratoriais', parent: '2', weight: 5 },
                { code: '3', name: 'Investigacao Detalhada', weight: 30 },
                { code: '3.1', name: 'Delimitacao de Pluma', parent: '3', weight: 15 },
                { code: '3.2', name: 'Avaliacao de Risco', parent: '3', weight: 15 },
                { code: '4', name: 'Relatorio Final', weight: 15 },
                { code: '5', name: 'Monitoramento Pos-Investigacao', weight: 20 },
            ],
        },
        {
            id: 'conama-remediation',
            name: 'CONAMA Remediation',
            nameKey: 'wbsTemplateCONAMA',
            description: 'Remediacao completa conforme CONAMA 420/2009',
            items: [
                { code: '1', name: 'Investigacao', weight: 15 },
                { code: '2', name: 'Estudo de Viabilidade', weight: 10 },
                { code: '2.1', name: 'Avaliacao de Tecnologias', parent: '2', weight: 5 },
                { code: '2.2', name: 'Ensaios Piloto', parent: '2', weight: 5 },
                { code: '3', name: 'Projeto de Remediacao', weight: 10 },
                { code: '4', name: 'Remediacao Ativa', weight: 35 },
                { code: '4.1', name: 'Implantacao do Sistema', parent: '4', weight: 15 },
                { code: '4.2', name: 'Operacao e Manutencao', parent: '4', weight: 15 },
                { code: '4.3', name: 'Controle de Qualidade', parent: '4', weight: 5 },
                { code: '5', name: 'Monitoramento', weight: 20 },
                { code: '5.1', name: 'Campanhas Trimestrais', parent: '5', weight: 15 },
                { code: '5.2', name: 'Relatorios de Progresso', parent: '5', weight: 5 },
                { code: '6', name: 'Encerramento', weight: 10 },
                { code: '6.1', name: 'Relatorio de Encerramento', parent: '6', weight: 5 },
                { code: '6.2', name: 'Aprovacao do Orgao Ambiental', parent: '6', weight: 5 },
            ],
        },
        {
            id: 'monitoring-program',
            name: 'Monitoring Program',
            nameKey: 'wbsTemplateMonitoring',
            description: 'Programa de monitoramento ambiental periodico',
            items: [
                { code: '1', name: 'Linha de Base', weight: 20 },
                { code: '1.1', name: 'Instalacao de Pocos', parent: '1', weight: 10 },
                { code: '1.2', name: 'Campanha Baseline', parent: '1', weight: 10 },
                { code: '2', name: 'Campanhas Trimestrais', weight: 50 },
                { code: '2.1', name: 'Q1 — Campanha', parent: '2', weight: 12.5 },
                { code: '2.2', name: 'Q2 — Campanha', parent: '2', weight: 12.5 },
                { code: '2.3', name: 'Q3 — Campanha', parent: '2', weight: 12.5 },
                { code: '2.4', name: 'Q4 — Campanha', parent: '2', weight: 12.5 },
                { code: '3', name: 'Revisao Anual', weight: 15 },
                { code: '4', name: 'Relatorio de Conformidade', weight: 15 },
            ],
        },
    ];
}

/**
 * Apply a WBS template, creating items.
 * Aplica template de EAP, criando os itens.
 *
 * @param {string} templateId - Template ID
 * @returns {Array<any>} - Created WBS items
 */
export function applyTemplate(templateId: any) {
    const template = getWbsTemplates().find((t) => t.id === templateId);
    if (!template) return [];

    const created = [];
    const codeToId = new Map();

    for (const tmpl of template.items) {
        const parentId = tmpl.parent ? codeToId.get(tmpl.parent) || null : null;
        const item = addWbsItem({
            code: tmpl.code,
            name: tmpl.name,
            parentId,
            baseline: { cost: 0, weight: tmpl.weight || 0 },
        });
        codeToId.set(tmpl.code, item.id);
        created.push(item);
    }

    return created;
}

// ----------------------------------------------------------------
// S-CURVE DATA
// ----------------------------------------------------------------

/**
 * Generate S-Curve data: cumulative PV, EV, AC over monthly periods.
 * Gera dados de Curva S: PV, EV, AC acumulados em periodos mensais.
 *
 * @param {Date} [referenceDate] - "today" for EV/AC calc. Default: new Date()
 * @returns {{ labels: string[], pvCumulative: number[], evCumulative: number[], acCumulative: number[], bacTotal: number } | null}
 */
export function generateSCurveData(referenceDate: any) {
    const ref = referenceDate || new Date();
    const parentIds = new Set(wbsItems.map((w: any) => w.parentId).filter(Boolean));

    // Filter leaf items with valid baseline dates and cost
    const qualified = wbsItems.filter((item: any) => {
        if (parentIds.has(item.id)) return false; // not a leaf
        if (!item.baseline.cost || item.baseline.cost <= 0) return false;
        const start = item.baseline.startDate;
        const end = item.baseline.endDate;
        if (!start || !end) return false;
        if (_parseLocal(start) > _parseLocal(end)) {
            console.warn(`[ecbyts] S-Curve: skipping item ${item.code} — startDate > endDate`);
            return false;
        }
        return true;
    });

    if (qualified.length === 0) return null;

    // Determine project range
    let projectStart = null;
    let projectEnd = null;
    for (const item of qualified) {
        const s = _parseLocal(item.planned.startDate || item.baseline.startDate);
        const e = _parseLocal(item.planned.endDate || item.baseline.endDate);
        if (!projectStart || s < projectStart) projectStart = s;
        if (!projectEnd || e > projectEnd) projectEnd = e;
    }

    if (!projectStart || !projectEnd) return null;
    const labels = _generateMonthLabels(projectStart, projectEnd);
    if (labels.length === 0) return null;

    const pvCumulative = new Array(labels.length).fill(0);
    const evCumulative = new Array(labels.length).fill(0);
    const acCumulative = new Array(labels.length).fill(0);
    let bacTotal = 0;

    const refIdx = _monthIndex(labels, ref);

    for (const item of qualified) {
        const bCost = item.baseline.cost;
        bacTotal += bCost;

        // --- PV: distribute baseline.cost linearly across item months ---
        const pvStart = _parseLocal(item.baseline.startDate);
        const pvEnd = _parseLocal(item.baseline.endDate);
        const pvStartIdx = Math.max(_monthIndex(labels, pvStart), 0);
        const pvEndIdx = Math.min(_monthIndex(labels, pvEnd), labels.length - 1);
        const pvMonths = Math.max(pvEndIdx - pvStartIdx + 1, 1);
        const monthlyPV = bCost / pvMonths;

        for (let i = pvStartIdx; i <= pvEndIdx; i++) {
            pvCumulative[i] += monthlyPV;
        }

        // --- EV: distribute earned value up to referenceDate ---
        const pctComplete = Math.min(item.actual.percentComplete || 0, 100);
        const totalEV = bCost * (pctComplete / 100);

        if (totalEV > 0) {
            const evStartDate = _parseLocal(item.actual.startDate || item.baseline.startDate);
            const evEndDate = pctComplete >= 100 ? _parseLocal(item.actual.endDate || item.baseline.endDate) : ref;
            const evStartIdx = Math.max(_monthIndex(labels, evStartDate), 0);
            const evEndIdx = Math.min(
                _monthIndex(labels, evEndDate) >= 0 ? _monthIndex(labels, evEndDate) : labels.length - 1,
                refIdx >= 0 ? refIdx : labels.length - 1,
            );
            const evMonths = Math.max(evEndIdx - evStartIdx + 1, 1);
            const monthlyEV = totalEV / evMonths;

            for (let i = evStartIdx; i <= evEndIdx; i++) {
                evCumulative[i] += monthlyEV;
            }
        }

        // --- AC: distribute actual cost up to referenceDate ---
        const totalAC = item.actual.cost || 0;
        if (totalAC > 0) {
            const acStartDate = _parseLocal(item.actual.startDate || item.baseline.startDate);
            const acStartIdx = Math.max(_monthIndex(labels, acStartDate), 0);
            const acEndIdx = refIdx >= 0 ? refIdx : labels.length - 1;
            const acMonths = Math.max(acEndIdx - acStartIdx + 1, 1);
            const monthlyAC = totalAC / acMonths;

            for (let i = acStartIdx; i <= acEndIdx; i++) {
                acCumulative[i] += monthlyAC;
            }
        }
    }

    // Convert from per-month to cumulative
    for (let i = 1; i < labels.length; i++) {
        pvCumulative[i] += pvCumulative[i - 1];
        evCumulative[i] += evCumulative[i - 1];
        acCumulative[i] += acCumulative[i - 1];
    }

    // EV and AC stay flat after referenceDate
    if (refIdx >= 0 && refIdx < labels.length - 1) {
        for (let i = refIdx + 1; i < labels.length; i++) {
            evCumulative[i] = evCumulative[refIdx];
            acCumulative[i] = acCumulative[refIdx];
        }
    }

    return { labels, pvCumulative, evCumulative, acCumulative, bacTotal };
}

// ----------------------------------------------------------------
// SNAPSHOTS - Status Date System
// ----------------------------------------------------------------

/**
 * Get leaf items qualified for snapshots.
 * @returns {Array<any>}
 */
function _getSnapshotLeaves() {
    const parentIds = new Set(wbsItems.map((w: any) => w.parentId).filter(Boolean));
    return wbsItems.filter((item: any) => {
        if (parentIds.has(item.id)) return false;
        return item.baseline.weight > 0 || item.baseline.cost > 0;
    });
}

/**
 * Freeze current WBS state at referenceDate.
 * Captures all leaf items with weight > 0 OR cost > 0.
 * Deduplicates: same YYYY-MM-DD overwrites.
 *
 * @param {Date} referenceDate
 * @param {'manual'|'auto'} [trigger='manual']
 * @returns {any} ProjectSnapshot
 */
export function saveSnapshot(referenceDate: any, trigger = 'manual') {
    const ref = referenceDate || new Date();
    const dateStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;

    const leaves = _getSnapshotLeaves();
    const items = leaves.map((item: any) => ({
        wbsItemId: item.id,
        percentComplete: Math.min(item.actual.percentComplete || 0, 100),
        actualCost: item.actual.cost || 0,
        actualStartDate: item.actual.startDate || null,
        actualEndDate: item.actual.endDate || null,
    }));

    // Deduplicate - overwrite same date
    const existingIdx = snapshots.findIndex((s: any) => s.snapshotDate === dateStr);
    const snapshot = {
        id: existingIdx >= 0 ? snapshots[existingIdx].id : generateId('snap'),
        snapshotDate: dateStr,
        createdAt: new Date().toISOString(),
        trigger,
        items,
    };

    if (existingIdx >= 0) {
        snapshots[existingIdx] = snapshot;
    } else {
        snapshots.push(snapshot);
    }

    // Sort by date
    snapshots.sort((a: any, b: any) => a.snapshotDate.localeCompare(b.snapshotDate));

    // Enforce limit: 120 max, remove oldest auto-snapshots first
    while (snapshots.length > 120) {
        const autoIdx = snapshots.findIndex((s: any) => s.trigger === 'auto');
        if (autoIdx >= 0) {
            snapshots.splice(autoIdx, 1);
        } else {
            snapshots.shift();
        }
    }

    _save();
    return snapshot;
}

/**
 * Retrieve snapshot closest to (but not after) the given date.
 * @param {Date} date
 * @returns {Object|null}
 */
export function getSnapshotData(date: any) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let best = null;
    for (const s of snapshots) {
        if (s.snapshotDate <= dateStr) best = s;
        else break; // sorted, no need to continue
    }
    return best;
}

/**
 * Return all snapshots sorted by date.
 * @returns {Array<any>}
 */
export function getSnapshotSeries() {
    return [...snapshots];
}

/** Export snapshots for serialization. */
export function exportSnapshots() {
    return snapshots.map((s: any) => ({ ...s, items: s.items.map((/** @type {any} */ i: any) => ({
        ...i
    })) }));
}

/**
 * Import snapshots from model data.
 * @param {any} data
 */
export function importSnapshots(data: any) {
    snapshots = [];
    if (!Array.isArray(data)) return;
    for (const s of data) {
        if (s.snapshotDate && Array.isArray(s.items)) {
            snapshots.push({ ...s });
        }
    }
    snapshots.sort((a: any, b: any) => a.snapshotDate.localeCompare(b.snapshotDate));
    _save();
}

/** Clear all snapshots. */
export function clearSnapshots() {
    snapshots = [];
    _save();
}

// ----------------------------------------------------------------
// PHYSICAL S-CURVE DATA
// ----------------------------------------------------------------

/**
 * Generate Physical S-Curve: planned% vs actual% over time, weighted by baseline.weight.
 * Uses snapshots for actual data when available, falls back to current state.
 *
 * @param {Date} [referenceDate]
 * @returns {{ labels: string[], plannedCumulative: number[], actualCumulative: number[], totalWeight: number, dataSource: 'snapshots'|'current-only' } | null}
 */
export function generatePhysicalSCurveData(referenceDate: any) {
    const ref = referenceDate || new Date();
    const parentIds = new Set(wbsItems.map((w: any) => w.parentId).filter(Boolean));

    // Effective weight: prefer baseline.weight, fallback to baseline.cost
    const _effectiveWeight = (/** @type {any} */ item: any) => item.baseline.weight > 0 ? item.baseline.weight : item.baseline.cost;

    // Filter leaf items with effective weight > 0 and valid dates
    const qualified = wbsItems.filter((item: any) => {
        if (parentIds.has(item.id)) return false;
        if (_effectiveWeight(item) <= 0) return false;
        const start = item.baseline.startDate;
        const end = item.baseline.endDate;
        if (!start || !end) return false;
        if (_parseLocal(start) > _parseLocal(end)) return false;
        return true;
    });

    if (qualified.length === 0) return null;

    const totalWeight = qualified.reduce((sum: any, item: any) => sum + _effectiveWeight(item), 0);
    if (totalWeight === 0) return null;

    // Determine project range
    let projectStart = null;
    let projectEnd = null;
    for (const item of qualified) {
        const s = _parseLocal(item.baseline.startDate);
        const e = _parseLocal(item.baseline.endDate);
        if (!projectStart || s < projectStart) projectStart = s;
        if (!projectEnd || e > projectEnd) projectEnd = e;
    }

    if (!projectStart || !projectEnd) return null;
    const labels = _generateMonthLabels(projectStart, projectEnd);
    if (labels.length === 0) return null;

    // --- Planned% cumulative: distribute weight linearly ---
    const plannedCumulative = new Array(labels.length).fill(0);
    for (const item of qualified) {
        const startIdx = Math.max(_monthIndex(labels, _parseLocal(item.baseline.startDate)), 0);
        const endIdx = Math.min(_monthIndex(labels, _parseLocal(item.baseline.endDate)), labels.length - 1);
        const months = Math.max(endIdx - startIdx + 1, 1);
        const monthlyWeight = _effectiveWeight(item) / months;
        for (let i = startIdx; i <= endIdx; i++) {
            plannedCumulative[i] += monthlyWeight;
        }
    }
    // Accumulate and normalize to %
    for (let i = 1; i < labels.length; i++) {
        plannedCumulative[i] += plannedCumulative[i - 1];
    }
    for (let i = 0; i < labels.length; i++) {
        plannedCumulative[i] = (plannedCumulative[i] / totalWeight) * 100;
    }

    // --- Actual% cumulative ---
    const actualCumulative = new Array(labels.length).fill(0);
    const series = getSnapshotSeries();
    const refIdx = _monthIndex(labels, ref);

    if (series.length > 0) {
        // Build weight map for qualified items
        const weightMap = new Map();
        for (const item of qualified) {
            weightMap.set(item.id, _effectiveWeight(item));
        }

        // Calculate actual% at each snapshot point
        const snapshotPoints = []; // { monthIdx, value }
        for (const snap of series) {
            const snapDate = _parseLocal(snap.snapshotDate);
            const idx = _monthIndex(labels, snapDate);
            if (idx < 0) continue;
            if (refIdx >= 0 && idx > refIdx) continue;

            let weightedProgress = 0;
            for (const si of snap.items) {
                const w = weightMap.get(si.wbsItemId);
                if (w) {
                    weightedProgress += (w * Math.min(si.percentComplete, 100)) / 100;
                }
            }
            snapshotPoints.push({ idx, value: (weightedProgress / totalWeight) * 100 });
        }

        if (snapshotPoints.length > 0) {
            // Fill actual curve: 0 before first snapshot, interpolate between, flat after last
            let prevIdx = 0;
            let prevVal = 0;
            for (const pt of snapshotPoints) {
                // Interpolate from previous point to this one
                for (let i = prevIdx; i <= pt.idx; i++) {
                    if (pt.idx === prevIdx) {
                        actualCumulative[i] = pt.value;
                    } else {
                        const t = (i - prevIdx) / (pt.idx - prevIdx);
                        actualCumulative[i] = prevVal + t * (pt.value - prevVal);
                    }
                }
                prevIdx = pt.idx;
                prevVal = pt.value;
            }
            // Flat after last snapshot
            for (let i = prevIdx + 1; i < labels.length; i++) {
                actualCumulative[i] = prevVal;
            }
        }

        return { labels, plannedCumulative, actualCumulative, totalWeight, dataSource: 'snapshots' };
    }

    // Fallback: current-only (single point at referenceDate)
    console.info(
        '[ecbyts] Physical S-Curve actual% based on current state only. Save snapshots for historical tracking.',
    );
    let currentProgress = 0;
    for (const item of qualified) {
        currentProgress += (_effectiveWeight(item) * Math.min(item.actual.percentComplete || 0, 100)) / 100;
    }
    const currentPct = (currentProgress / totalWeight) * 100;

    // Distribute linearly from 0 to currentPct up to refIdx, then flat
    const effectiveRefIdx = refIdx >= 0 ? refIdx : labels.length - 1;
    for (let i = 0; i < labels.length; i++) {
        if (i <= effectiveRefIdx && effectiveRefIdx > 0) {
            actualCumulative[i] = (i / effectiveRefIdx) * currentPct;
        } else if (i > effectiveRefIdx) {
            actualCumulative[i] = currentPct;
        }
    }

    return { labels, plannedCumulative, actualCumulative, totalWeight, dataSource: 'current-only' };
}

// ----------------------------------------------------------------
// DATE HELPERS
// ----------------------------------------------------------------

/**
 * Parse date string as local (not UTC) to avoid timezone day shifts.
 * '2026-01-01' → Jan 1 local, not Dec 31 in negative UTC offsets.
 */
/** @param {string} dateStr */
function _parseLocal(dateStr: any) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d || 1);
}

/**
 * Gera array de meses YYYY-MM entre duas Dates
 * @param {Date} start
 * @param {Date} end
 */
function _generateMonthLabels(start: any, end: any) {
    const labels = [];
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (d <= endMonth && labels.length < 60) {
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        d.setMonth(d.getMonth() + 1);
    }
    if (labels.length >= 60) console.warn('[ecbyts] S-Curve: truncated to 60 months');
    return labels;
}

/** Retorna index do mes YYYY-MM no array labels, ou -1 */
/**
 * @param {string[]} labels
 * @param {Date} date
 */
function _monthIndex(labels: any, date: any) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return labels.indexOf(key);
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Calculate scheduled percent based on dates.
 * Calcula percentual programado baseado nas datas.
 */
/** @param {any} item */
function calculateScheduledPercent(item: any) {
    const start = item.planned.startDate || item.baseline.startDate;
    const end = item.planned.endDate || item.baseline.endDate;

    if (!start || !end) return 0;

    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();

    if (now <= startDate) return 0;
    if (now >= endDate) return 100;

    const total = endDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    return Math.round((elapsed / total) * 100);
}

/**
 * Generate next WBS code for a parent.
 */
/** @param {string|null} parentId */
function generateNextCode(parentId: any) {
    if (!parentId) {
        const roots = wbsItems.filter((w: any) => !w.parentId);
        return String(roots.length + 1);
    }

    const parent = wbsItems.find((w: any) => w.id === parentId);
    const siblings = wbsItems.filter((w: any) => w.parentId === parentId);
    const parentCode = parent?.code || '0';
    return `${parentCode}.${siblings.length + 1}`;
}

// ----------------------------------------------------------------
// SERIALIZATION
// ----------------------------------------------------------------

/**
 * Export WBS items for model serialization.
 * @returns {Array<any>}
 */
export function exportWbs() {
    return wbsItems.map((w: any) => ({ ...w }));
}

/**
 * Import WBS items from model data.
 * @param {Array<any>} data
 */
export function importWbs(data: any) {
    wbsItems = [];
    if (!Array.isArray(data)) return;
    for (const item of data) {
        wbsItems.push({
            id: item.id || `wbs-${Date.now()}`,
            parentId: item.parentId || null,
            code: item.code || '',
            name: item.name || '',
            baseline: item.baseline || { cost: 0, startDate: '', endDate: '', weight: 0 },
            planned: item.planned || { cost: 0, startDate: '', endDate: '', weight: 0 },
            actual: item.actual || { cost: 0, startDate: '', endDate: '', percentComplete: 0 },
            status: item.status || 'not_started',
            linkedContractId: item.linkedContractId || null,
            createdAt: item.createdAt || new Date().toISOString(),
        });
    }
    _save();
}
