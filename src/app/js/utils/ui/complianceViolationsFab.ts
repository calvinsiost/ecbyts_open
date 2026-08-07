// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Violations FAB — acesso direto à lista de violações sem precisar
 * mexer no banner inferior compliance.
 *
 * Calvin 2026-06-08 "criar botões na UI para o usuário acessar diretamente".
 *
 * Standalone deliberadamente (não fundido em complianceUiBootstrap.ts que tem
 * alta contenção entre sessões LLM paralelas — coordenação multi-LLM).
 *
 * Auto-instala via initComplianceViolationsFab() chamado pelo main.ts pós-shell.
 * Aparece automaticamente quando há violações detectadas. Pode ser dispensado
 * por 30 min via "✕".
 */

const FAB_ID = 'compliance-violations-fab-standalone';
const DISMISSED_KEY = 'ecbyts-compliance-fab-dismissed-until';
const TOGGLE_KEY = 'ecbyts-compliance-violations-toggle';
const OVERLAY_ID_LEGACY = 'compliance-violations-overlay';

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
let _initialized = false;

function _isDismissed(): boolean {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (!raw) return false;
        const until = Number(raw);
        return Number.isFinite(until) && until > Date.now();
    } catch (e: any) {
        console.debug('[fab:dismiss-check]', e?.message || e);
        return false;
    }
}

function _dismissForMinutes(min: number): void {
    try {
        localStorage.setItem(DISMISSED_KEY, String(Date.now() + min * 60_000));
    } catch (e: any) {
        console.debug('[fab:dismiss-write]', e?.message || e);
    }
}

/**
 * Tenta abrir o painel de violações por 3 caminhos resilientes:
 *  (a) handler global window.handleOpenComplianceViolations (se registrado)
 *  (b) clique programático em `.cb-violations-toggle` do banner (se presente)
 *  (c) fallback: set toggle ON + dispatch evento que o banner escuta
 */
function _openViolationsPanel(): void {
    const win = (globalThis as any).window;
    const doc = (globalThis as any).document as Document | undefined;
    if (!win || !doc) return;
    try {
        localStorage.setItem(TOGGLE_KEY, '1');
    } catch (e: any) {
        console.debug('[fab:open:toggle-write]', e?.message || e);
    }
    if (typeof win.handleOpenComplianceViolations === 'function') {
        try {
            win.handleOpenComplianceViolations();
            return;
        } catch (e: any) {
            console.debug('[fab:open:handler]', e?.message || e);
        }
    }
    const bannerBtn = doc.querySelector('.cb-violations-toggle') as HTMLButtonElement | null;
    if (bannerBtn) {
        try {
            bannerBtn.click();
            return;
        } catch (e: any) {
            console.debug('[fab:open:banner-click]', e?.message || e);
        }
    }
    try {
        win.dispatchEvent(new CustomEvent('compliance:open-violations'));
    } catch (e: any) {
        console.debug('[fab:open:event-dispatch]', e?.message || e);
    }
}

async function _computeViolationCounts(): Promise<{ total: number; critical: number }> {
    // Lê elementos + bindings de compliance e infere contagem via heurística
    // mesma do complianceUiBootstrap (espelha pH/ORP/metais).
    try {
        const elementsMod = (await import('../../core/elements/manager.js')) as any;
        const complianceMod = (await import('../../core/compliance/manager.js').catch(() => null as any));
        const elements: any[] = elementsMod.getAllElements?.() || [];
        if (elements.length === 0) return { total: 0, critical: 0 };
        let total = 0;
        let critical = 0;
        const bindings = complianceMod?.getComplianceManager?.()?.getState?.()?.bindings || [];
        if (bindings.length === 0) return { total: 0, critical: 0 };
        for (const el of elements) {
            if (!el || typeof el !== 'object') continue;
            const family = el.family || el.familyId || '';
            if (!['well', 'sample', 'sensor', 'individual', 'plume', 'spring', 'lake', 'tank', 'waste_stream'].includes(family)) continue;
            const observations: any[] = Array.isArray(el?.data?.observations) ? el.data.observations : [];
            let elHasViolation = false;
            let elHasCritical = false;
            for (const obs of observations) {
                if (!obs || typeof obs !== 'object') continue;
                const param = String(obs.parameterId || '').toLowerCase();
                const value = Number(obs.value);
                if (!Number.isFinite(value)) continue;
                if (param === 'ph') {
                    if (value < 4.0 || value > 10.0) { elHasViolation = true; elHasCritical = true; }
                    else if (value < 5.0 || value > 9.0) { elHasViolation = true; }
                } else if (param === 'orp' || param === 'redox') {
                    if (value < -300 || value > 700) { elHasViolation = true; elHasCritical = true; }
                    else if (value < -100 || value > 500) { elHasViolation = true; }
                } else if (['pb', 'lead', 'chumbo', 'hg', 'mercury', 'mercurio', 'as', 'arsenic', 'arsenio', 'cd', 'cadmium', 'cadmio'].includes(param)) {
                    const limits: Record<string, number> = { pb: 10, lead: 10, chumbo: 10, hg: 1, mercury: 1, mercurio: 1, as: 10, arsenic: 10, arsenio: 10, cd: 5, cadmium: 5, cadmio: 5 };
                    const limit = limits[param];
                    if (limit && value > limit * 10) { elHasViolation = true; elHasCritical = true; }
                    else if (limit && value > limit) { elHasViolation = true; }
                }
            }
            if (elHasViolation) {
                total += 1;
                if (elHasCritical) critical += 1;
            }
        }
        return { total, critical };
    } catch (e: any) {
        console.debug('[fab:compute-counts]', e?.message || e);
        return { total: 0, critical: 0 };
    }
}

function _installFab(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc || doc.getElementById(FAB_ID)) return;
    const fab = doc.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Abrir painel de violações de conformidade');
    fab.style.cssText = [
        'position:fixed', 'right:18px', 'bottom:80px', 'z-index:600',
        'display:none', 'min-width:170px', 'padding:12px 18px', 'border:0',
        'border-radius:30px',
        'background:linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
        'color:#fff', 'font-size:13px', 'font-weight:700', 'cursor:pointer',
        'box-shadow:0 8px 24px rgba(220,38,38,0.45), 0 2px 6px rgba(0,0,0,0.3)',
        'transition:transform 0.15s, box-shadow 0.15s',
        'gap:8px', 'align-items:center', 'font-family:inherit',
    ].join(';');
    fab.innerHTML =
        '<span aria-hidden="true" style="font-size:16px">⚠</span>' +
        '<span class="fab-text">Violações</span>' +
        '<span class="fab-count" style="display:inline-block;min-width:22px;padding:2px 7px;' +
        'border-radius:12px;background:rgba(0,0,0,0.35);font-size:11px;font-weight:700">0</span>';
    fab.addEventListener('mouseenter', () => { fab.style.transform = 'translateY(-2px) scale(1.03)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = ''; });
    fab.addEventListener('click', () => { _openViolationsPanel(); });
    const dismiss = doc.createElement('span');
    dismiss.textContent = '✕';
    dismiss.title = 'Ocultar este botão por 30 minutos';
    dismiss.setAttribute('role', 'button');
    dismiss.setAttribute('aria-label', 'Ocultar botão de violações por 30 minutos');
    dismiss.style.cssText =
        'display:inline-block;margin-left:8px;padding:0 6px;' +
        'background:rgba(0,0,0,0.25);border-radius:10px;font-size:10px;opacity:0.8;cursor:pointer;';
    dismiss.addEventListener('click', (e) => {
        e.stopPropagation();
        _dismissForMinutes(30);
        fab.style.display = 'none';
    });
    fab.appendChild(dismiss);
    doc.body.appendChild(fab);
}

function _scheduleRefresh(delayMs: number = 250): void {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => { void _updateFab(); }, delayMs);
}

async function _updateFab(): Promise<void> {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    let fab = doc.getElementById(FAB_ID) as HTMLButtonElement | null;
    if (!fab) {
        _installFab();
        fab = doc.getElementById(FAB_ID) as HTMLButtonElement | null;
        if (!fab) return;
    }
    if (_isDismissed()) { fab.style.display = 'none'; return; }
    if (doc.getElementById(OVERLAY_ID_LEGACY)) { fab.style.display = 'none'; return; }
    const { total, critical } = await _computeViolationCounts();
    const countEl = fab.querySelector('.fab-count') as HTMLElement | null;
    const textEl = fab.querySelector('.fab-text') as HTMLElement | null;
    if (countEl) countEl.textContent = String(total);
    if (textEl) textEl.textContent = critical > 0 ? `Violações ${critical} crítica(s)` : 'Violações';
    fab.style.display = total > 0 ? 'inline-flex' : 'none';
}

/**
 * Inicialização pública — chamar do main.ts após DOM ready.
 * Idempotente.
 */
export function initComplianceViolationsFab(): void {
    if (_initialized) return;
    const doc = (globalThis as any).document as Document | undefined;
    const win = (globalThis as any).window;
    if (!doc || !win) return;
    _initialized = true;
    _installFab();
    _scheduleRefresh(1500); // 1ª medição após boot estabilizar
    // Reagir a mudanças do modelo
    const events = [
        'ecbt:elementsBatchAdded', 'elementsBatchAdded',
        'ecbt:elementAdded', 'elementAdded',
        'ecbt:elementRemoved', 'ecbt:elementsCleared', 'ecbt:elementUpdated',
    ];
    for (const evt of events) {
        win.addEventListener(evt, () => _scheduleRefresh(800));
    }
    // Re-checa periodicamente como fallback (bindings ativados via outro caminho)
    setInterval(() => _scheduleRefresh(0), 30_000);
    // Expõe handler global para discovery via menu/ribbon
    if (typeof win.handleOpenViolationsFab !== 'function') {
        win.handleOpenViolationsFab = () => _openViolationsPanel();
    }
    // HUD-CARDS-REDESIGN-001 M3 (Calvin 2026-06-10): handler canônico para o
    // novo violations-hud-canvas (click do tile). Alias semantically claro
    // de handleOpenViolationsFab.
    if (typeof win.handleOpenViolationsPanel !== 'function') {
        win.handleOpenViolationsPanel = () => _openViolationsPanel();
    }
}

export function disposeComplianceViolationsFab(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const fab = doc.getElementById(FAB_ID);
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    _initialized = false;
}

// AUTO-INIT side-effect — Calvin 2026-06-08
// Garantia adicional caso main.ts perca o wire por contenção multi-LLM.
(function _autoInitFab() {
    if (typeof globalThis === 'undefined') return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const startup = () => {
        setTimeout(() => {
            try { initComplianceViolationsFab(); }
            catch (e: any) { console.debug('[fab:auto-init]', e?.message || e); }
        }, 5000);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        startup();
    } else {
        doc.addEventListener('DOMContentLoaded', startup, { once: true });
    }
})();
