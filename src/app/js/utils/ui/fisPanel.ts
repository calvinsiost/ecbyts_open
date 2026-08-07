// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * FIS Panel UI — card visível no painel ECBT Score + modais de cenário e cadastro.
 *
 * Calvin 2026-06-09 "sempre se lembrar da regra UI first!!!!!":
 * FIS-001 estava acessível apenas via console (window.handle*) — viola CLAUDE.md
 * "Every implemented feature must be reachable by the user through the UI".
 *
 * Este módulo entrega:
 *   1. Card "Multas e Infrações" auto-injetado no painel ECBT Score quando aberto
 *      - Mostra FIS badge colorido, breakdown M/A/S/R, capacidade, contagem
 *      - Botão "🧪 Cenário de teste" → modal seleção de tier
 *      - Botão "+ Cadastrar multa" → formulário simples
 *      - Botão "🗑 Limpar" → reset window.__ecbtFines
 *   2. Modal "Cenário de teste" com 4 tiers (Gigante/Média/PME/Catástrofe)
 *      + input seed + dropdown currency
 *   3. Modal "Cadastrar multa manual" com formulário (amount, severity, date,
 *      preset, description) + tabela das multas atuais
 *
 * Standalone deliberadamente (alta contenção em ecbtScorePanel.ts).
 * Auto-init via <script> em app/index.html.
 */

import { generateFineScenario, listScenarioTiers, type ScenarioTier } from '../../core/random/_fineScenarioGeneratorPure.js';
import { t as translate } from '../i18n/translations.js';
import type { FineRecord, SeverityLevel } from '../../core/ecbtScore/_fineImpactPure.js';
import { fetchFinesByCnpj, isValidCnpj } from '../../core/ecbtScore/_ibamaScraperStubPure.js';
import {
    buildEdgeRequest,
    validateEdgeResponse,
    // eslint-disable-next-line
    resolveRealMode,
} from '../../core/ecbtScore/_ibamaEdgeFunctionAdapterPure.js';

const CARD_ID = 'fis-panel-card';
const SCENARIO_MODAL_ID = 'fis-scenario-modal';
const MANAGE_MODAL_ID = 'fis-manage-modal';
const IBAMA_MODAL_ID = 'fis-ibama-modal';
const ECBT_PANEL_OVERLAY_ID = 'ecbt-score-panel-overlay';

let _initialized = false;

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[c] || c;
    });
}

function _fmtCurrency(n: number, currency: string): string {
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1_000_000_000) return `${currency} ${(n / 1_000_000_000).toFixed(1)}bi`;
    if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}k`;
    return `${currency} ${n.toFixed(0)}`;
}

function _fisColor(fis: number): { bg: string; border: string; label: string } {
    if (fis >= 4.5) return { bg: '#16a34a', border: '#15803d', label: 'BOM' };
    if (fis >= 3.5) return { bg: '#facc15', border: '#eab308', label: 'ALERTA' };
    if (fis >= 1.5) return { bg: '#ea580c', border: '#c2410c', label: 'GRAVE' };
    return { bg: '#dc2626', border: '#b91c1c', label: 'CRÍTICO' };
}

function _readFines(): FineRecord[] {
    const w = (globalThis as any).window;
    return Array.isArray(w?.__ecbtFines) ? w.__ecbtFines : [];
}

function _readSnapshot(): any {
    const w = (globalThis as any).window;
    return w?.__ecbtScoreSnapshot ?? null;
}

function _triggerPanelRefresh(): void {
    const w = (globalThis as any).window;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc?.getElementById(ECBT_PANEL_OVERLAY_ID)) return;
    if (typeof w?.handleOpenEcbtScorePanel === 'function') {
        try { w.handleOpenEcbtScorePanel(); } catch (e: any) { console.debug('[fis-panel:refresh]', e?.message || e); }
    }
}

// ----------------------------------------------------------------
// CARD principal — injetado no painel ECBT Score
// ----------------------------------------------------------------

function _buildCard(): HTMLElement {
    const doc = (globalThis as any).document as Document;
    const card = doc.createElement('div');
    card.id = CARD_ID;
    card.style.cssText = [
        'margin-top:14px', 'padding:14px 16px',
        'background:rgba(220,38,38,0.06)',
        'border:1px solid rgba(220,38,38,0.25)',
        'border-radius:8px',
        'display:flex', 'flex-direction:column', 'gap:10px',
    ].join(';');

    const snapshot = _readSnapshot();
    const fines = _readFines();
    const fis = typeof snapshot?.fineImpactScore === 'number' ? snapshot.fineImpactScore : null;
    const fineCount = Number(snapshot?.fineCount || fines.length || 0);

    // Header
    const header = doc.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
    const title = doc.createElement('div');
    title.innerHTML =
        '<div style="font-weight:700;font-size:13px">⚖ Multas e Infrações <span style="opacity:0.6;font-weight:400">(FIS-001)</span></div>' +
        '<div style="font-size:11px;opacity:0.7;margin-top:2px">Tangibiliza penalidade independente do porte da empresa</div>';

    const fisBadge = doc.createElement('div');
    if (fis !== null) {
        const c = _fisColor(fis);
        fisBadge.style.cssText = `padding:6px 12px;border-radius:6px;background:${c.bg};color:#fff;font-weight:700;font-size:14px;border:1px solid ${c.border};text-align:center;min-width:70px;`;
        fisBadge.innerHTML = `<div>FIS ${fis.toFixed(2)}</div><div style="font-size:9px;opacity:0.9;margin-top:2px">${c.label}</div>`;
    } else {
        fisBadge.style.cssText = 'padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.06);color:#94a3b8;font-size:11px;text-align:center';
        fisBadge.textContent = 'Sem dados';
    }
    header.appendChild(title);
    header.appendChild(fisBadge);
    card.appendChild(header);

    // Breakdown M/A/S/R com barras gráficas (Calvin Pixels-Over-DOM Fase 3.5)
    if (snapshot?.fineImpactAudit) {
        const audit = snapshot.fineImpactAudit;
        const breakdown = doc.createElement('div');
        breakdown.id = 'fis-breakdown-bars';
        breakdown.style.cssText = 'display:flex;flex-direction:column;gap:5px;font-size:11px;background:rgba(255,255,255,0.03);padding:8px;border-radius:5px';

        const headerRow = doc.createElement('div');
        headerRow.style.cssText = 'font-size:10px;opacity:0.7;font-weight:600;margin-bottom:2px';
        headerRow.textContent = 'Pressão por dimensão (0 = sem impacto · 1 = saturado)';
        breakdown.appendChild(headerRow);

        const items: Array<[string, number, string, string]> = [
            ['M', audit.M, 'Magnitude relativa (multa/capacidade)', '#3b82f6'],
            ['A', audit.A, 'Magnitude absoluta (valor da multa)', '#8b5cf6'],
            ['S', audit.S, 'Severidade (gravidade da infração)', '#f97316'],
            ['R', audit.R, 'Recorrência (reincidência na janela)', '#dc2626'],
        ];
        for (const [label, value, hint, color] of items) {
            const row = doc.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:18px 1fr 36px;align-items:center;gap:6px';
            row.title = hint;
            const pct = Math.max(0, Math.min(1, value)) * 100;
            row.innerHTML =
                `<span style="font-weight:700;font-size:11px">${label}</span>` +
                `<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;position:relative">` +
                `<div style="height:100%;width:${pct.toFixed(1)}%;background:${color};border-radius:4px;transition:width 0.3s"></div>` +
                `</div>` +
                `<span style="font-family:monospace;font-size:10px;text-align:right;opacity:0.9">${value.toFixed(2)}</span>`;
            breakdown.appendChild(row);
        }
        card.appendChild(breakdown);

        // Métricas adicionais
        const meta = doc.createElement('div');
        meta.style.cssText = 'display:flex;gap:14px;font-size:11px;opacity:0.8;flex-wrap:wrap';
        const currency = audit.currency || 'BRL';
        meta.innerHTML =
            `<span><strong>${audit.finesInWindow}</strong> multa(s) na janela</span>` +
            `<span><strong>${_fmtCurrency(audit.totalFine || audit.totalFineBrl, currency)}</strong> total</span>` +
            `<span><strong>${_fmtCurrency(audit.capacity || audit.capacityBrl, currency)}</strong> capacidade (${audit.capacitySource})</span>` +
            `<span style="opacity:0.6">pior: <strong>${audit.worstSeverity}</strong></span>`;
        card.appendChild(meta);
    } else if (fineCount === 0) {
        const hint = doc.createElement('div');
        hint.style.cssText = 'font-size:11px;opacity:0.7;font-style:italic;line-height:1.5';
        hint.innerHTML =
            'Nenhuma multa cadastrada. <strong>Cenário hipotético é auto-gerado ao gerar modelo random</strong> ' +
            '(menu "Generate"). Cadastro manual disponível no botão abaixo.' +
            '<br>Fórmula: <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px">FIS = (1−P)×5</code> onde ' +
            '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px">P = (M·A·S·R)^(1/4)</code> (não-compensatório).';
        card.appendChild(hint);
    }

    // Calvin 2026-06-09: cenário vem AUTO no modelo random — sem botão "Cenário de teste".
    // Mantém apenas botões de override manual + reset.
    const actions = doc.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    const btnManage = doc.createElement('button');
    btnManage.type = 'button';
    btnManage.textContent = '＋ Cadastrar / Editar';
    btnManage.title = 'Cadastrar multa manualmente / ver lista atual';
    btnManage.style.cssText = _btnStyle('#0ea5e9');
    btnManage.addEventListener('click', () => openManageModal());

    if (fineCount > 0) {
        const btnClear = doc.createElement('button');
        btnClear.type = 'button';
        btnClear.textContent = '🗑 Limpar';
        btnClear.title = 'Remove todas as multas e zera o FIS';
        btnClear.style.cssText = _btnStyle('#dc2626');
        btnClear.addEventListener('click', () => {
            const w = (globalThis as any).window;
            if (typeof w?.handleClearFineScenario === 'function') {
                w.handleClearFineScenario();
            } else {
                if (w) {
                    w.__ecbtFines = undefined;
                    w.__ecbtEbitdaBrl = undefined;
                    w.__ecbtRevenueBrl = undefined;
                    w.__ecbtFinesAutoGenerated = undefined;
                }
                _triggerPanelRefresh();
            }
        });
        actions.appendChild(btnClear);
    }
    actions.appendChild(btnManage);

    // FIS-001 Fase 4 (Calvin 2026-06-09): scraper IBAMA stub via CNPJ
    const btnIbama = doc.createElement('button');
    btnIbama.type = 'button';
    btnIbama.textContent = '🔍 Buscar IBAMA (CNPJ)';
    btnIbama.title = 'Buscar autos de infração no IBAMA via CNPJ (modo stub hipotético — adapter real desabilitado)';
    btnIbama.style.cssText = _btnStyle('#7c3aed');
    btnIbama.addEventListener('click', () => openIbamaScraperModal());
    actions.appendChild(btnIbama);

    card.appendChild(actions);

    return card;
}

function _btnStyle(bg: string): string {
    return [
        'padding:7px 14px', 'background:' + bg, 'color:#fff', 'border:0',
        'border-radius:5px', 'cursor:pointer', 'font-size:11px', 'font-weight:600',
        'transition:opacity 0.12s',
    ].join(';');
}

function _wireCardIntoPanel(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const overlay = doc.getElementById(ECBT_PANEL_OVERLAY_ID);
    if (!overlay) return;
    const body = overlay.querySelector('.ecbt-panel-body');
    if (!body) return;
    if (body.querySelector('#' + CARD_ID)) return; // já existe
    const card = _buildCard();
    body.appendChild(card);
}

// ----------------------------------------------------------------
// MODAL 1 — Cenário de teste (4 tiers)
// ----------------------------------------------------------------

function openScenarioModal(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    doc.getElementById(SCENARIO_MODAL_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = SCENARIO_MODAL_ID;
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
        'background:rgba(0,0,0,0.7)', 'z-index:9502',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:20px',
    ].join(';');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background:#0f172a', 'color:#e5e7eb', 'border:1px solid #1f2937',
        'border-radius:10px', 'max-width:680px', 'width:100%',
        'padding:20px', 'box-shadow:0 16px 48px rgba(0,0,0,0.6)',
    ].join(';');

    const header = doc.createElement('div');
    header.innerHTML =
        '<div style="font-weight:700;font-size:15px;margin-bottom:4px">🧪 Gerar cenário hipotético de multas</div>' +
        '<div style="font-size:12px;opacity:0.7;margin-bottom:16px">Empresas fictícias sem nomes reais — apenas para teste do FIS-001</div>';
    dialog.appendChild(header);

    const tiers = listScenarioTiers();
    const grid = doc.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px';
    for (const t of tiers) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        const tierIcon: Record<ScenarioTier, string> = {
            gigante: '🏢', media: '🏭', pme: '🏪', catastrofe: '☣',
        };
        const labelKey = `fisScenario.tier.${t.tier}.label`;
        const descKey = `fisScenario.tier.${t.tier}.description`;
        const labelI18n = translate(labelKey);
        const descI18n = translate(descKey);
        const label = labelI18n === labelKey ? t.label : labelI18n;
        const description = descI18n === descKey ? t.description : descI18n;
        btn.innerHTML =
            `<div style="font-size:18px;margin-bottom:4px">${tierIcon[t.tier]}</div>` +
            `<div style="font-weight:700;font-size:12px;margin-bottom:2px">${_escapeHtml(label)}</div>` +
            `<div style="font-size:10px;opacity:0.7;line-height:1.4">${_escapeHtml(description)}</div>`;
        btn.style.cssText = [
            'padding:14px 12px',
            'background:rgba(30,64,175,0.18)',
            'border:1px solid #1e40af',
            'border-radius:8px', 'color:#e5e7eb',
            'cursor:pointer', 'text-align:center',
            'transition:background 0.12s',
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(30,64,175,0.3)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(30,64,175,0.18)'; });
        btn.addEventListener('click', () => {
            const seedRaw = (dialog.querySelector('#fis-seed') as HTMLInputElement)?.value;
            const currency = (dialog.querySelector('#fis-currency') as HTMLSelectElement)?.value || 'BRL';
            const seed = seedRaw && seedRaw.length > 0 ? Number(seedRaw) : Date.now() & 0x7fffffff;
            const result = generateFineScenario({
                tier: t.tier, currency, seed,
                nowIso: new Date().toISOString(),
            });
            const w = (globalThis as any).window;
            if (w) {
                w.__ecbtFines = result.fines;
                w.__ecbtEbitdaBrl = result.ebitda;
                w.__ecbtRevenueBrl = result.revenue;
                w.__ecbtFineScenario = result;
            }
            overlay.remove();
            _triggerPanelRefresh();
        });
        grid.appendChild(btn);
    }
    dialog.appendChild(grid);

    // Inputs (seed + currency)
    const inputs = doc.createElement('div');
    inputs.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;align-items:flex-end';
    inputs.innerHTML =
        '<div style="flex:1">' +
        '<div style="font-size:10px;opacity:0.7;margin-bottom:4px">Seed (vazio = aleatório)</div>' +
        '<input type="number" id="fis-seed" placeholder="ex: 42" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px">' +
        '</div>' +
        '<div style="flex:1">' +
        '<div style="font-size:10px;opacity:0.7;margin-bottom:4px">Moeda</div>' +
        '<select id="fis-currency" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px">' +
        '<option value="BRL">BRL — Real</option><option value="USD">USD — Dólar</option><option value="EUR">EUR — Euro</option>' +
        '</select></div>';
    dialog.appendChild(inputs);

    // Footer
    const footer = doc.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:11px;opacity:0.7';
    footer.innerHTML =
        '<span>4 tiers canônicos — anti-PII, anti-conflito legal (sem empresas reais)</span>';
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = 'Cancelar';
    close.style.cssText = _btnStyle('rgba(255,255,255,0.08)');
    close.addEventListener('click', () => overlay.remove());
    footer.appendChild(close);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    doc.body.appendChild(overlay);

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay.remove();
            doc.removeEventListener('keydown', escHandler);
        }
    };
    doc.addEventListener('keydown', escHandler);
}

// ----------------------------------------------------------------
// MODAL 2 — Cadastrar/Editar multa manualmente
// ----------------------------------------------------------------

function openManageModal(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    doc.getElementById(MANAGE_MODAL_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = MANAGE_MODAL_ID;
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
        'background:rgba(0,0,0,0.7)', 'z-index:9502',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:20px',
    ].join(';');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background:#0f172a', 'color:#e5e7eb', 'border:1px solid #1f2937',
        'border-radius:10px', 'max-width:780px', 'width:100%',
        'max-height:88vh', 'display:flex', 'flex-direction:column',
        'overflow:hidden', 'box-shadow:0 16px 48px rgba(0,0,0,0.6)',
    ].join(';');

    const header = doc.createElement('div');
    header.style.cssText = 'padding:14px 18px;border-bottom:1px solid #1f2937;display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
    header.innerHTML = '<div style="font-weight:700;font-size:14px">⚖ Cadastrar / Editar multas</div>';
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = '✕ Fechar';
    close.style.cssText = _btnStyle('#dc2626');
    close.addEventListener('click', () => overlay.remove());
    header.appendChild(close);
    dialog.appendChild(header);

    const body = doc.createElement('div');
    body.style.cssText = 'flex:1;overflow:auto;padding:14px 18px';

    // Form de cadastro
    const formSection = doc.createElement('div');
    formSection.innerHTML =
        '<div style="font-weight:600;font-size:12px;margin-bottom:10px">Nova multa</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
        '<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Valor</div><input type="number" id="fis-form-amount" placeholder="10000000" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>' +
        '<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Moeda</div><select id="fis-form-currency" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"><option>BRL</option><option>USD</option><option>EUR</option></select></div>' +
        '<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Severidade</div><select id="fis-form-severity" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"><option value="light">Leve</option><option value="moderate" selected>Moderada</option><option value="severe">Grave</option><option value="gravissima">Gravíssima</option></select></div>' +
        '<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Data</div><input type="date" id="fis-form-date" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>' +
        '<div style="grid-column:span 2"><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Norma/Preset (opcional)</div><input type="text" id="fis-form-preset" placeholder="ex: CONAMA-420-2009" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>' +
        '<div style="grid-column:span 2"><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Descrição (opcional)</div><input type="text" id="fis-form-desc" placeholder="ex: Vazamento em tanque" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>' +
        '</div>';
    const addBtn = doc.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '＋ Adicionar à lista';
    addBtn.style.cssText = _btnStyle('#16a34a');
    addBtn.addEventListener('click', () => {
        const amount = Number((body.querySelector('#fis-form-amount') as HTMLInputElement).value);
        const currency = (body.querySelector('#fis-form-currency') as HTMLSelectElement).value;
        const severity = (body.querySelector('#fis-form-severity') as HTMLSelectElement).value as SeverityLevel;
        const dateIso = (body.querySelector('#fis-form-date') as HTMLInputElement).value;
        const presetId = (body.querySelector('#fis-form-preset') as HTMLInputElement).value || undefined;
        const description = (body.querySelector('#fis-form-desc') as HTMLInputElement).value || undefined;
        if (!Number.isFinite(amount) || amount <= 0 || !dateIso) {
            (globalThis as any).window?.alert?.('Preencha valor e data válidos.');
            return;
        }
        const w = (globalThis as any).window;
        const current: FineRecord[] = Array.isArray(w?.__ecbtFines) ? [...w.__ecbtFines] : [];
        current.push(Object.freeze({
            id: `MAN-${Date.now()}`,
            amount, amountBrl: amount, currency,
            severity, dateIso,
            ...(presetId ? { presetId } : {}),
            ...(description ? { description } : {}),
        }));
        if (w) {
            w.__ecbtFines = current;
            if (!w.__ecbtEbitdaBrl) w.__ecbtEbitdaBrl = 100_000_000; // default 100M
        }
        overlay.remove();
        _triggerPanelRefresh();
        setTimeout(() => openManageModal(), 100);
    });
    formSection.appendChild(addBtn);
    body.appendChild(formSection);

    // Tabela atual
    const sep = doc.createElement('hr');
    sep.style.cssText = 'border:0;border-top:1px solid #1f2937;margin:16px 0';
    body.appendChild(sep);

    const listTitle = doc.createElement('div');
    listTitle.style.cssText = 'font-weight:600;font-size:12px;margin-bottom:10px';
    const fines = _readFines();
    listTitle.textContent = `Multas atuais (${fines.length})`;
    body.appendChild(listTitle);

    if (fines.length === 0) {
        const empty = doc.createElement('div');
        empty.style.cssText = 'padding:20px;text-align:center;opacity:0.6;font-size:11px';
        empty.textContent = 'Nenhuma multa cadastrada. Use o formulário acima ou gere cenário de teste.';
        body.appendChild(empty);
    } else {
        const tbl = doc.createElement('table');
        tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px';
        tbl.innerHTML = '<thead><tr style="background:rgba(255,255,255,0.04);text-align:left">' +
            '<th style="padding:6px">ID</th><th style="padding:6px">Severidade</th>' +
            '<th style="padding:6px">Valor</th><th style="padding:6px">Data</th>' +
            '<th style="padding:6px">Norma</th><th style="padding:6px;width:60px"></th>' +
            '</tr></thead><tbody></tbody>';
        const tbody = tbl.querySelector('tbody') as HTMLTableSectionElement;
        fines.forEach((f, i) => {
            const tr = doc.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.04)';
            tr.innerHTML =
                `<td style="padding:6px;font-family:monospace;opacity:0.8">${_escapeHtml(f.id)}</td>` +
                `<td style="padding:6px">${_escapeHtml(f.severity)}</td>` +
                `<td style="padding:6px;font-family:monospace">${_fmtCurrency(Number(f.amount ?? f.amountBrl ?? 0), f.currency || 'BRL')}</td>` +
                `<td style="padding:6px">${_escapeHtml(f.dateIso)}</td>` +
                `<td style="padding:6px;opacity:0.7">${_escapeHtml(f.presetId || '—')}</td>` +
                `<td style="padding:6px;text-align:right"></td>`;
            const removeBtn = doc.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '🗑';
            removeBtn.title = 'Remover esta multa';
            removeBtn.style.cssText = 'background:transparent;border:0;color:#dc2626;cursor:pointer;font-size:13px';
            removeBtn.addEventListener('click', () => {
                const w = (globalThis as any).window;
                const cur: FineRecord[] = Array.isArray(w?.__ecbtFines) ? [...w.__ecbtFines] : [];
                cur.splice(i, 1);
                if (w) w.__ecbtFines = cur;
                overlay.remove();
                _triggerPanelRefresh();
                setTimeout(() => openManageModal(), 100);
            });
            (tr.lastElementChild as HTMLElement).appendChild(removeBtn);
            tbody.appendChild(tr);
        });
        body.appendChild(tbl);
    }

    // EBITDA / Revenue input
    const sep2 = doc.createElement('hr');
    sep2.style.cssText = 'border:0;border-top:1px solid #1f2937;margin:16px 0';
    body.appendChild(sep2);

    const capacitySection = doc.createElement('div');
    const w0 = (globalThis as any).window;
    const ebitdaCur = Number(w0?.__ecbtEbitdaBrl || 0);
    const revenueCur = Number(w0?.__ecbtRevenueBrl || 0);
    capacitySection.innerHTML =
        '<div style="font-weight:600;font-size:12px;margin-bottom:10px">Capacidade econômica</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        `<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">EBITDA (mesma moeda das multas)</div><input type="number" id="fis-form-ebitda" value="${ebitdaCur || ''}" placeholder="ex: 200000000000" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>` +
        `<div><div style="font-size:10px;opacity:0.7;margin-bottom:3px">Receita (fallback)</div><input type="number" id="fis-form-revenue" value="${revenueCur || ''}" placeholder="ex: 500000000000" style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid #334155;border-radius:4px;color:#e5e7eb;font-size:12px"></div>` +
        '</div>';
    const saveCapBtn = doc.createElement('button');
    saveCapBtn.type = 'button';
    saveCapBtn.textContent = '💾 Salvar capacidade';
    saveCapBtn.style.cssText = _btnStyle('#0ea5e9') + ';margin-top:10px';
    saveCapBtn.addEventListener('click', () => {
        const ebit = Number((body.querySelector('#fis-form-ebitda') as HTMLInputElement).value);
        const rev = Number((body.querySelector('#fis-form-revenue') as HTMLInputElement).value);
        const w = (globalThis as any).window;
        if (w) {
            if (Number.isFinite(ebit) && ebit > 0) w.__ecbtEbitdaBrl = ebit;
            if (Number.isFinite(rev) && rev > 0) w.__ecbtRevenueBrl = rev;
        }
        overlay.remove();
        _triggerPanelRefresh();
    });
    capacitySection.appendChild(saveCapBtn);
    body.appendChild(capacitySection);

    dialog.appendChild(body);
    overlay.appendChild(dialog);
    doc.body.appendChild(overlay);

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { overlay.remove(); doc.removeEventListener('keydown', escHandler); }
    };
    doc.addEventListener('keydown', escHandler);

    // Pré-popular data
    const dateInput = body.querySelector('#fis-form-date') as HTMLInputElement | null;
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().slice(0, 10);
    }
}

// ----------------------------------------------------------------
// MODAL 3 — Buscar IBAMA via CNPJ (Fase 4 stub)
// ----------------------------------------------------------------

function openIbamaScraperModal(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    doc.getElementById(IBAMA_MODAL_ID)?.remove();

    const overlay = doc.createElement('div');
    overlay.id = IBAMA_MODAL_ID;
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
        'background:rgba(0,0,0,0.7)', 'z-index:10001',
        'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background:#1f2937', 'color:#e5e7eb', 'border-radius:8px',
        'padding:20px', 'max-width:560px', 'width:90%', 'max-height:85vh',
        'overflow-y:auto', 'box-shadow:0 10px 40px rgba(0,0,0,0.6)',
    ].join(';');

    const header = doc.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #374151';
    header.innerHTML = '<div style="font-weight:700;font-size:14px">🔍 Buscar autos de infração IBAMA</div>';
    const btnClose = doc.createElement('button');
    btnClose.type = 'button';
    btnClose.textContent = '✕';
    btnClose.style.cssText = 'background:transparent;border:0;color:#9ca3af;font-size:18px;cursor:pointer;padding:0 6px';
    btnClose.addEventListener('click', () => overlay.remove());
    header.appendChild(btnClose);
    dialog.appendChild(header);

    const warn = doc.createElement('div');
    warn.style.cssText = 'background:rgba(124,58,237,0.12);border-left:3px solid #7c3aed;padding:10px 12px;border-radius:4px;font-size:11px;line-height:1.5;margin-bottom:14px';
    warn.innerHTML =
        '<strong>Modo stub hipotético</strong> — adapter IBAMA real não está configurado. ' +
        'Esta busca gera multas hipotéticas determinísticas baseadas no CNPJ informado, ' +
        'para validar a integração FIS sem precisar de scraping real. ' +
        '<br><br>Para ativar modo real (Edge Function Supabase), precisamos da sua autorização ' +
        '(decisão pendente <code>D-FIS-3</code>).';
    dialog.appendChild(warn);

    const form = doc.createElement('div');
    form.style.cssText = 'display:flex;flex-direction:column;gap:10px';

    const labelCnpj = doc.createElement('label');
    labelCnpj.textContent = 'CNPJ:';
    labelCnpj.style.cssText = 'font-size:11px;color:#9ca3af;font-weight:600';
    const inputCnpj = doc.createElement('input');
    inputCnpj.type = 'text';
    inputCnpj.placeholder = '00.000.000/0000-00 (ou 14 dígitos)';
    inputCnpj.value = '11.222.333/0001-81'; // CNPJ de teste válido (módulo 11 OK)
    inputCnpj.style.cssText = 'background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:8px 10px;font-size:12px;font-family:monospace';

    const labelYears = doc.createElement('label');
    labelYears.textContent = 'Janela (anos):';
    labelYears.style.cssText = 'font-size:11px;color:#9ca3af;font-weight:600';
    const inputYears = doc.createElement('input');
    inputYears.type = 'number';
    inputYears.value = '5';
    inputYears.min = '1';
    inputYears.max = '20';
    inputYears.style.cssText = 'background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:4px;padding:8px 10px;font-size:12px;width:80px';

    form.appendChild(labelCnpj);
    form.appendChild(inputCnpj);
    form.appendChild(labelYears);
    form.appendChild(inputYears);

    const resultBox = doc.createElement('div');
    resultBox.style.cssText = 'margin-top:12px;padding:10px;background:rgba(255,255,255,0.04);border-radius:5px;font-size:11px;line-height:1.5;min-height:40px';
    resultBox.textContent = 'Aguardando busca...';

    const actions = doc.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:14px';

    const btnFetch = doc.createElement('button');
    btnFetch.type = 'button';
    btnFetch.textContent = '🔍 Buscar (modo stub)';
    btnFetch.style.cssText = _btnStyle('#7c3aed');
    btnFetch.addEventListener('click', () => {
        const cnpj = inputCnpj.value.trim();
        const windowYears = Math.max(1, Math.min(20, Number(inputYears.value) || 5));
        if (!isValidCnpj(cnpj)) {
            resultBox.innerHTML = '<span style="color:#dc2626">❌ CNPJ inválido — verifique os 14 dígitos.</span>';
            return;
        }
        const out = fetchFinesByCnpj({ cnpj, mode: 'stub', windowYears });
        const cnpjNorm = _escapeHtml(out.cnpjNormalized);
        const msg = _escapeHtml(out.message);
        const verdictColor = out.verdict === 'success_mock' ? '#16a34a'
            : out.verdict === 'success_empty' ? '#facc15'
            : '#dc2626';
        let html = `<div style="color:${verdictColor};font-weight:600">▸ ${msg}</div>`;
        if (out.fines.length > 0) {
            html += `<div style="margin-top:8px;font-size:10px;opacity:0.85">CNPJ normalizado: <code>${cnpjNorm}</code></div>`;
            html += '<table style="width:100%;margin-top:8px;border-collapse:collapse;font-size:10px"><thead><tr style="border-bottom:1px solid #374151">';
            html += '<th style="text-align:left;padding:4px 6px">Data</th><th style="text-align:left;padding:4px 6px">Severidade</th><th style="text-align:right;padding:4px 6px">Valor (BRL)</th></tr></thead><tbody>';
            for (const f of out.fines) {
                html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">`;
                html += `<td style="padding:4px 6px">${_escapeHtml(f.dateIso)}</td>`;
                html += `<td style="padding:4px 6px">${_escapeHtml(f.severity)}</td>`;
                html += `<td style="padding:4px 6px;text-align:right">${_fmtCurrency(Number(f.amount || 0), 'BRL')}</td>`;
                html += `</tr>`;
            }
            html += '</tbody></table>';
        }
        resultBox.innerHTML = html;

        // Botão importar
        if (out.fines.length > 0) {
            const btnImport = doc.createElement('button');
            btnImport.type = 'button';
            btnImport.textContent = `⬇ Importar ${out.fines.length} multa(s) para o card FIS`;
            btnImport.style.cssText = _btnStyle('#16a34a') + ';margin-top:10px;width:100%';
            btnImport.addEventListener('click', () => {
                const w = (globalThis as any).window;
                if (w) {
                    const existing = Array.isArray(w.__ecbtFines) ? w.__ecbtFines : [];
                    w.__ecbtFines = [...existing, ...out.fines];
                    w.__ecbtFinesAutoGenerated = true; // marca como auto para idempotência
                    w.__ecbtFineIbamaImport = {
                        cnpj: out.cnpjNormalized,
                        fetchedAtIso: out.fetchedAtIso,
                        verdict: out.verdict,
                        count: out.fines.length,
                    };
                }
                overlay.remove();
                _triggerPanelRefresh();
            });
            resultBox.appendChild(btnImport);
        }
    });

    // Botão Edge Function (Calvin 2026-06-09 "seguir com demais")
    const btnEdge = doc.createElement('button');
    btnEdge.type = 'button';
    btnEdge.textContent = '🌐 Edge Function';
    btnEdge.title = 'Chamar Supabase Edge Function ibama-fine-fetch (modo stub server-side)';
    btnEdge.style.cssText = _btnStyle('#0891b2');
    btnEdge.addEventListener('click', async () => {
        const cnpj = inputCnpj.value.trim();
        const windowYears = Math.max(1, Math.min(20, Number(inputYears.value) || 5));
        const reqVerdict = buildEdgeRequest({ cnpj, windowYears, mode: 'stub' });
        if (!reqVerdict.ok || !reqVerdict.payload) {
            resultBox.innerHTML = `<span style="color:#dc2626">❌ Request inválido: ${reqVerdict.reason}</span>`;
            return;
        }
        const w = (globalThis as any).window;
        const SUPABASE_URL = w?.__SUPABASE_URL || w?.SUPABASE_CONFIG?.url || '';
        if (!SUPABASE_URL) {
            resultBox.innerHTML =
                '<span style="color:#facc15">⚠ Edge Function não configurada (sem URL Supabase).</span>' +
                '<div style="font-size:10px;opacity:0.8;margin-top:4px">Modo stub local continua disponível via "Buscar (modo stub)".</div>';
            return;
        }
        resultBox.innerHTML = '<span style="opacity:0.7">⏳ Chamando Edge Function...</span>';
        try {
            const url = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/ibama-fine-fetch`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqVerdict.payload),
            });
            const raw = await resp.json().catch(() => ({}));
            const validateVerdict = validateEdgeResponse(raw);
            if (!validateVerdict.ok || !validateVerdict.value) {
                resultBox.innerHTML =
                    `<span style="color:#dc2626">❌ Resposta inválida: ${validateVerdict.reason}</span>` +
                    `<div style="font-size:10px;opacity:0.8;margin-top:4px">HTTP ${resp.status}</div>`;
                return;
            }
            const out = validateVerdict.value;
            const cnpjNorm = _escapeHtml(out.cnpjNormalized);
            const msg = _escapeHtml(out.message);
            const verdictColor =
                out.verdict === 'success_mock' ? '#16a34a' :
                out.verdict === 'success_empty' ? '#facc15' : '#dc2626';
            let html =
                `<div style="color:${verdictColor};font-weight:600">▸ ${msg}</div>` +
                `<div style="font-size:10px;opacity:0.6;margin-top:4px">Via Edge Function · CNPJ: <code>${cnpjNorm}</code></div>`;
            if (out.fines.length > 0) {
                html += '<table style="width:100%;margin-top:8px;border-collapse:collapse;font-size:10px">' +
                    '<thead><tr style="border-bottom:1px solid #374151">' +
                    '<th style="text-align:left;padding:4px 6px">Data</th>' +
                    '<th style="text-align:left;padding:4px 6px">Severidade</th>' +
                    '<th style="text-align:right;padding:4px 6px">Valor (BRL)</th>' +
                    '</tr></thead><tbody>';
                for (const f of out.fines) {
                    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">` +
                        `<td style="padding:4px 6px">${_escapeHtml(f.dateIso)}</td>` +
                        `<td style="padding:4px 6px">${_escapeHtml(f.severity)}</td>` +
                        `<td style="padding:4px 6px;text-align:right">${_fmtCurrency(Number(f.amount || 0), 'BRL')}</td></tr>`;
                }
                html += '</tbody></table>';
            }
            resultBox.innerHTML = html;
        } catch (e: any) {
            resultBox.innerHTML =
                `<span style="color:#dc2626">❌ Erro de rede: ${_escapeHtml(e?.message || 'unknown')}</span>` +
                '<div style="font-size:10px;opacity:0.8;margin-top:4px">Use "Buscar (modo stub)" como fallback offline.</div>';
        }
    });

    const btnCancel = doc.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = _btnStyle('#6b7280');
    btnCancel.addEventListener('click', () => overlay.remove());

    actions.appendChild(btnFetch);
    actions.appendChild(btnEdge);
    actions.appendChild(btnCancel);

    dialog.appendChild(form);
    dialog.appendChild(resultBox);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    doc.body.appendChild(overlay);

    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) overlay.remove();
    });
}

// ----------------------------------------------------------------
// INIT — MutationObserver detecta painel ECBT Score aberto e injeta card
// ----------------------------------------------------------------

export function initFisPanel(): void {
    if (_initialized) return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    _initialized = true;

    const observer = new MutationObserver(() => {
        _wireCardIntoPanel();
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    // Expor handlers globais
    const w = (globalThis as any).window;
    if (w) {
        if (typeof w.handleOpenFisScenarioModal !== 'function') {
            w.handleOpenFisScenarioModal = openScenarioModal;
        }
        if (typeof w.handleOpenFisManageModal !== 'function') {
            w.handleOpenFisManageModal = openManageModal;
        }
        if (typeof w.handleOpenFisIbamaModal !== 'function') {
            w.handleOpenFisIbamaModal = openIbamaScraperModal;
        }
    }

    // Tentar wire imediatamente caso painel já esteja aberto
    _wireCardIntoPanel();
}

// AUTO-INIT side-effect
(function _autoInit() {
    if (typeof globalThis === 'undefined') return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const startup = () => {
        setTimeout(() => {
            try { initFisPanel(); }
            catch (e: any) { console.debug('[fis-panel:auto-init]', e?.message || e); }
        }, 3500);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') startup();
    else doc.addEventListener('DOMContentLoaded', startup, { once: true });
})();
