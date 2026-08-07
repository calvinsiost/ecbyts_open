// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Violation Details Modal — tabela detalhada por elemento.
 *
 * Calvin 2026-06-08 "para as tabelas de violações deveriam existir botões
 * que levassem a elas na própria interface ao clicar nos labels ainda não
 * funcionam tbm".
 *
 * Standalone deliberadamente — função foi removida do complianceUiBootstrap.ts
 * por contenção multi-LLM e desapareceu. Este módulo:
 *
 *   1. Implementa modal de tabela detalhada (severidade × parâmetro × valor
 *      × campanha × norma × mensagem)
 *   2. Expõe `window.handleOpenViolationDetailsForElement(elementId)` global
 *   3. Usa MutationObserver para auto-wire botão "🔍 Detalhar" em cada row do
 *      painel #compliance-violations-overlay quando for montado
 *   4. Auto-wire click nos labels 3D com halo `[data-compliance-violation-halo]`
 *      para abrir o mesmo modal
 *
 * Calvin pediu "botões NA interface": cada row do painel ganha botão visível.
 * Auto-init via <script> em app/index.html.
 */

const MODAL_ID = 'ecbt-violation-details-modal';

interface ViolationLike {
    elementId: string;
    elementName?: string;
    family?: string;
    severity: 'critical' | 'violation' | 'warn';
    reason: string;
    presetId: string;
    presetLabel?: string;
    parameters?: ReadonlyArray<string>;
    campaignIds?: ReadonlyArray<string>;
}

function _escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[c] || c;
    });
}

function _severityStyle(s: ViolationLike['severity']): { color: string; bg: string; label: string } {
    switch (s) {
        case 'critical': return { color: '#fff', bg: '#dc2626', label: 'CRÍTICO' };
        case 'violation': return { color: '#fff', bg: '#ea580c', label: 'VIOLAÇÃO' };
        case 'warn': return { color: '#0b1220', bg: '#facc15', label: 'ALERTA' };
    }
}

// Calvin 2026-06-08 BUG FIX — heurística re-implementada não batia com o
// painel (resultava em "Sem violações detectadas"). Solução: cache populado
// pelo MutationObserver ao parser o que o painel JÁ renderizou.
//
// O painel #compliance-violations-overlay tem rows com estrutura conhecida.
// Parser extrai elementId + severity + reason + presetLabel + family +
// elementName direto do DOM, sem depender de getComplianceManager async.

const _violationCache = new Map<string, ViolationLike[]>();
const _allDomViolationsCache: ViolationLike[] = [];

function _parseRowSeverity(badgeEl: HTMLElement | null): ViolationLike['severity'] {
    if (!badgeEl) return 'warn';
    const txt = (badgeEl.textContent || '').trim().toUpperCase();
    if (txt.includes('CRÍTICO') || txt.includes('CRITICO') || txt.includes('CRITICAL')) return 'critical';
    if (txt.includes('VIOLAÇÃO') || txt.includes('VIOLACAO') || txt.includes('VIOLATION')) return 'violation';
    return 'warn';
}

function _parseRowsFromOverlay(overlay: HTMLElement): void {
    // Limpa cache e re-popula a cada render do painel
    _violationCache.clear();
    _allDomViolationsCache.length = 0;
    const rows = overlay.querySelectorAll('div[style*="border-left"]');
    rows.forEach((row) => {
        const r = row as HTMLElement;
        // div com font-monospace contém "elementId · presetLabel"
        const monoDivs = r.querySelectorAll('div[style*="monospace"]');
        if (monoDivs.length === 0) return;
        const monoText = (monoDivs[0]!.textContent || '').trim();
        // Formato: "elementId · presetLabel"
        const parts = monoText.split('·').map((s) => s.trim());
        const elementId = parts[0] || '';
        const presetLabel = parts.slice(1).join(' · ') || 'preset';
        if (!elementId) return;
        // Header: "<badge>elementName <span>[family]</span>"
        const headerDiv = r.querySelector('div[style*="font-weight:600"]') as HTMLElement | null;
        const badge = headerDiv?.querySelector('span[style*="font-weight:700"]') as HTMLElement | null;
        const severity = _parseRowSeverity(badge);
        // family — entre colchetes [family]
        const headerText = (headerDiv?.textContent || '').trim();
        const familyMatch = headerText.match(/\[([^\]]+)\]/);
        const family = familyMatch?.[1] ?? '';
        // elementName = headerText sem badge label e sem [family]
        let elementName = headerText
            .replace(/CRÍTICO|VIOLAÇÃO|ALERTA/gi, '')
            .replace(/\[[^\]]+\]/, '')
            .trim();
        if (!elementName) elementName = elementId;
        // reason: div com opacity 0.75
        const reasonDiv = r.querySelector('div[style*="opacity:0.75"]') as HTMLElement | null;
        const reason = (reasonDiv?.textContent || '').trim() || '(sem detalhes)';
        // Extrair parameter da reason (heurística — ex "ORP -249 mV (violação)" → "orp")
        const parameters: string[] = [];
        const orpMatch = reason.match(/\bORP\b/i);
        if (orpMatch) parameters.push('ORP');
        const phMatch = reason.match(/\bpH\b/);
        if (phMatch) parameters.push('pH');
        const metalMatch = reason.match(/\b(Pb|Hg|As|Cd)\b/i);
        if (metalMatch?.[1]) parameters.push(metalMatch[1]);

        const viol: ViolationLike = {
            elementId, elementName, family, severity, reason,
            presetId: presetLabel, presetLabel,
            parameters: Object.freeze(parameters),
            campaignIds: Object.freeze([]),
        };
        const arr = _violationCache.get(elementId) || [];
        arr.push(viol);
        _violationCache.set(elementId, arr);
        _allDomViolationsCache.push(viol);
    });
}

function _findViolationsForElement(elementId: string): ViolationLike[] {
    // Cache populado pelo MutationObserver — retorna direto do painel
    return _violationCache.get(elementId) || [];
}

async function _findObservationValues(elementId: string, paramId: string): Promise<string> {
    try {
        const elementsMod = (await import('../../core/elements/manager.js')) as any;
        const el = elementsMod.getElement?.(elementId)
            || (elementsMod.getAllElements?.() || []).find((e: any) => e?.id === elementId);
        const observations: any[] = Array.isArray(el?.data?.observations) ? el.data.observations : [];
        const matching = observations.filter((o) =>
            String(o?.parameterId || '').toLowerCase() === paramId.toLowerCase()
        );
        if (matching.length === 0) return '—';
        const samples = matching.slice(0, 3).map((o) => {
            const val = Number(o.value);
            const unit = o.unitId || o.unit || '';
            return Number.isFinite(val) ? `${val.toFixed(2)} ${unit}`.trim() : '?';
        });
        return samples.join(', ') + (matching.length > 3 ? ` (+${matching.length - 3})` : '');
    } catch (e: any) {
        console.debug('[viol-details:obs]', e?.message || e);
        return '—';
    }
}

export async function openViolationDetailsForElement(elementId: string): Promise<void> {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc || !elementId) return;
    doc.getElementById(MODAL_ID)?.remove();

    const violations = _findViolationsForElement(elementId);
    if (violations.length === 0) {
        // Mensagem amigável quando elemento não tem violações
        const overlay = doc.createElement('div');
        overlay.id = MODAL_ID;
        overlay.style.cssText =
            'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);' +
            'z-index:9501;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        overlay.addEventListener('click', () => overlay.remove());
        const box = doc.createElement('div');
        box.style.cssText =
            'background:#0f172a;color:#e5e7eb;border:1px solid #1f2937;border-radius:10px;' +
            'padding:24px;max-width:400px;text-align:center;cursor:default';
        box.innerHTML =
            `<h3 style="margin:0 0 12px;font-size:14px">${_escapeHtml(elementId)}</h3>` +
            `<p style="margin:0;font-size:12px;opacity:0.8">Sem violações detectadas para este elemento ` +
            `nos presets ativos.<br><br>Verifique se há presets ativados no banner inferior.</p>` +
            `<button type="button" style="margin-top:16px;padding:6px 14px;background:#1e40af;color:#fff;` +
            `border:0;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">Fechar</button>`;
        box.querySelector('button')?.addEventListener('click', () => overlay.remove());
        overlay.appendChild(box);
        doc.body.appendChild(overlay);
        return;
    }

    const firstV = violations[0]!; // empty-state retornou em 184 → não-vazio aqui
    const elementName = firstV.elementName || elementId;
    const family = firstV.family || '';

    const overlay = doc.createElement('div');
    overlay.id = MODAL_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `Violações detalhadas de ${elementName}`);
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
        'background:rgba(0,0,0,0.65)', 'z-index:9501',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:20px', 'cursor:pointer',
    ].join(';');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    const dialog = doc.createElement('div');
    dialog.style.cssText = [
        'background:#0f172a', 'color:#e5e7eb', 'border:1px solid #1f2937',
        'border-radius:10px', 'max-width:920px', 'width:100%',
        'max-height:88vh', 'display:flex', 'flex-direction:column',
        'cursor:default', 'box-shadow:0 16px 48px rgba(0,0,0,0.6)',
    ].join(';');

    const sevCounts = violations.reduce(
        (acc, v) => { acc[v.severity]++; return acc; },
        { critical: 0, violation: 0, warn: 0 },
    );

    const header = doc.createElement('div');
    header.style.cssText =
        'padding:14px 18px;border-bottom:1px solid #1f2937;' +
        'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    const titleEl = doc.createElement('div');
    titleEl.innerHTML =
        `<div style="font-weight:700;font-size:14px;margin-bottom:3px">` +
        `⚠ Violações de ${_escapeHtml(elementName)} ` +
        `<span style="opacity:0.5;font-weight:400;font-size:12px">[${_escapeHtml(family)}]</span></div>` +
        `<div style="font-size:11px;font-family:monospace;opacity:0.8">` +
        (sevCounts.critical > 0 ? `<span style="color:#dc2626">🔴 ${sevCounts.critical} crítico</span> · ` : '') +
        (sevCounts.violation > 0 ? `<span style="color:#ea580c">🟠 ${sevCounts.violation} violação</span> · ` : '') +
        (sevCounts.warn > 0 ? `<span style="color:#facc15">🟡 ${sevCounts.warn} alerta</span> · ` : '') +
        `<span style="opacity:0.6">${_escapeHtml(elementId)}</span></div>`;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕ Fechar';
    closeBtn.setAttribute('aria-label', 'Fechar tabela de violações');
    closeBtn.style.cssText =
        'background:#dc2626;color:#fff;border:0;border-radius:6px;padding:6px 14px;' +
        'font-size:12px;font-weight:700;cursor:pointer;';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const body = doc.createElement('div');
    body.style.cssText = 'flex:1;overflow:auto;padding:14px 18px;';

    const presetsAffected = new Set<string>();
    for (const v of violations) presetsAffected.add(v.presetLabel || v.presetId);
    if (presetsAffected.size > 0) {
        const presetsBar = doc.createElement('div');
        presetsBar.style.cssText =
            'margin-bottom:14px;padding:8px 12px;background:rgba(30,64,175,0.10);' +
            'border-left:3px solid #1e40af;border-radius:4px;font-size:12px;';
        presetsBar.innerHTML =
            `<strong>Normas/presets violados:</strong> ` +
            [...presetsAffected].map((p) => `<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px">${_escapeHtml(p)}</code>`).join(' · ');
        body.appendChild(presetsBar);
    }

    const table = doc.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    table.innerHTML = `<thead>
        <tr style="background:rgba(255,255,255,0.04);text-align:left">
            <th style="padding:8px;border-bottom:1px solid #1f2937">Severidade</th>
            <th style="padding:8px;border-bottom:1px solid #1f2937">Parâmetro</th>
            <th style="padding:8px;border-bottom:1px solid #1f2937">Valor</th>
            <th style="padding:8px;border-bottom:1px solid #1f2937">Campanha</th>
            <th style="padding:8px;border-bottom:1px solid #1f2937">Norma</th>
            <th style="padding:8px;border-bottom:1px solid #1f2937">Mensagem</th>
        </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody') as HTMLTableSectionElement;

    for (const v of violations) {
        const sev = _severityStyle(v.severity);
        const params = (v.parameters && v.parameters.length > 0) ? v.parameters : ['—'];
        const campaigns = (v.campaignIds && v.campaignIds.length > 0) ? v.campaignIds : ['—'];
        const valueStr = params[0] && params[0] !== '—' ? await _findObservationValues(elementId, params[0]) : '—';
        const tr = doc.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.05)';
        const sevBadge =
            `<span style="display:inline-block;padding:2px 8px;border-radius:3px;` +
            `background:${sev.bg};color:${sev.color};font-size:10px;font-weight:700">${sev.label}</span>`;
        tr.innerHTML =
            `<td style="padding:8px;vertical-align:top">${sevBadge}</td>` +
            `<td style="padding:8px;vertical-align:top;font-family:monospace;font-size:11px">${_escapeHtml(params.join(', '))}</td>` +
            `<td style="padding:8px;vertical-align:top;font-family:monospace;font-size:11px">${_escapeHtml(valueStr)}</td>` +
            `<td style="padding:8px;vertical-align:top;font-family:monospace;font-size:11px;opacity:0.8">${_escapeHtml(campaigns.join(', '))}</td>` +
            `<td style="padding:8px;vertical-align:top">${_escapeHtml(v.presetLabel || v.presetId)}</td>` +
            `<td style="padding:8px;vertical-align:top;opacity:0.85;line-height:1.45">${_escapeHtml(v.reason)}</td>`;
        tbody.appendChild(tr);
    }
    body.appendChild(table);

    const footer = doc.createElement('div');
    footer.style.cssText =
        'padding:10px 18px;border-top:1px solid #1f2937;display:flex;gap:8px;' +
        'justify-content:space-between;align-items:center;flex-shrink:0;font-size:11px;';
    const footerLeft = doc.createElement('div');
    footerLeft.style.cssText = 'opacity:0.6';
    footerLeft.textContent = `${violations.length} entrada(s) · use ESC para fechar`;
    const footerRight = doc.createElement('div');
    footerRight.style.cssText = 'display:flex;gap:8px';
    const selectBtn = doc.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = 'Selecionar elemento no 3D';
    selectBtn.style.cssText =
        'padding:6px 12px;background:rgba(255,255,255,0.05);color:#e5e7eb;' +
        'border:1px solid #334155;border-radius:4px;cursor:pointer;font-size:11px';
    selectBtn.addEventListener('click', () => {
        const win = (globalThis as any).window;
        if (win && typeof win.handleSelectElement === 'function') {
            try { win.handleSelectElement(elementId); } catch (e: any) { console.debug('[viol-details:select]', e?.message || e); }
        }
    });
    const closeFooter = doc.createElement('button');
    closeFooter.type = 'button';
    closeFooter.textContent = 'Fechar';
    closeFooter.style.cssText =
        'padding:6px 14px;background:#1e40af;color:#fff;border:0;border-radius:4px;' +
        'cursor:pointer;font-size:11px;font-weight:600';
    closeFooter.addEventListener('click', () => overlay.remove());
    footerRight.appendChild(selectBtn);
    footerRight.appendChild(closeFooter);
    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    dialog.appendChild(body);
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

/**
 * MutationObserver — adiciona botão "🔍 Detalhar" nas rows do painel
 * #compliance-violations-overlay sempre que ele for renderizado.
 */
function _attachDetailButtonsToOverlay(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;

    const wireRows = (overlay: HTMLElement) => {
        const rows = overlay.querySelectorAll('div[style*="border-left"]');
        rows.forEach((row) => {
            const r = row as HTMLElement;
            if (r.dataset.detailButtonWired === '1') return;
            // Procurar elementId no texto da row (formato "elementId · presetLabel")
            const monoEl = r.querySelector('div[style*="monospace"]') as HTMLElement | null;
            const text = (monoEl?.textContent || '').trim();
            const idMatch = text.match(/^([a-zA-Z0-9_-]+)/);
            if (!idMatch) return;
            const elementId = idMatch[1]!;
            r.dataset.detailButtonWired = '1';
            // Adiciona botão "🔍" inline no canto direito
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.textContent = '🔍 Detalhar';
            btn.title = 'Abrir tabela detalhada de violações deste elemento';
            btn.style.cssText =
                'float:right;padding:3px 8px;margin-top:-2px;background:#1e40af;color:#fff;' +
                'border:0;border-radius:3px;cursor:pointer;font-size:10px;font-weight:600;' +
                'transition:background 0.12s';
            btn.addEventListener('mouseenter', () => { btn.style.background = '#2563eb'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#1e40af'; });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                void openViolationDetailsForElement(elementId);
            });
            r.appendChild(btn);
            // Wire também click na row toda (mantém comportamento de select)
            if (!r.dataset.rowClickWired) {
                r.dataset.rowClickWired = '1';
                r.addEventListener('click', () => {
                    void openViolationDetailsForElement(elementId);
                });
            }
        });
    };

    const observer = new MutationObserver(() => {
        const overlay = doc.getElementById('compliance-violations-overlay');
        if (overlay) _parseRowsFromOverlay(overlay); // Calvin bugfix — popula cache
        if (overlay) wireRows(overlay);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
}

/**
 * Auto-wire click em labels 3D com halo de violação.
 */
function _attachClickToHaloLabels(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const wireHalos = () => {
        const haloed = doc.querySelectorAll('[data-compliance-violation-halo]');
        haloed.forEach((el) => {
            const h = el as HTMLElement;
            if (h.dataset.violationClickWired === '1') return;
            h.dataset.violationClickWired = '1';
            const elementId = h.getAttribute('data-element-id');
            if (!elementId) return;
            h.style.cursor = 'pointer';
            if (!h.title) {
                h.title = 'Clique para ver violações detalhadas';
            }
            h.addEventListener('click', (e) => {
                e.stopPropagation();
                void openViolationDetailsForElement(elementId);
            });
        });
    };

    const observer = new MutationObserver(() => wireHalos());
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-compliance-violation-halo'] });
    wireHalos();
}

let _initialized = false;

export function initViolationDetailsModal(): void {
    if (_initialized) return;
    const doc = (globalThis as any).document as Document | undefined;
    const win = (globalThis as any).window;
    if (!doc || !win) return;
    _initialized = true;

    _attachDetailButtonsToOverlay();
    _attachClickToHaloLabels();

    if (typeof win.handleOpenViolationDetailsForElement !== 'function') {
        win.handleOpenViolationDetailsForElement = (id: string) => openViolationDetailsForElement(id);
    }
}

// AUTO-INIT side-effect
(function _autoInit() {
    if (typeof globalThis === 'undefined') return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const startup = () => {
        setTimeout(() => {
            try { initViolationDetailsModal(); }
            catch (e: any) { console.debug('[viol-details:auto-init]', e?.message || e); }
        }, 2500);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        startup();
    } else {
        doc.addEventListener('DOMContentLoaded', startup, { once: true });
    }
})();
