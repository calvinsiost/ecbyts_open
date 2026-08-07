// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * HUD-UX-PAIN-DRAIN-001 W2 (F5 da spec-mãe HUD-CARDS-REDESIGN-001) —
 * tooltip runtime dos 6 HUD cards do geo-hud.
 *
 * - Hover (mousemove region-aware) + touch (toggle 4s) + keyboard
 *   (focus mostra tooltip do card; Escape fecha) — WCAG, nunca hover-only.
 * - Conteúdo vem do CATALOG pure (_hudCardTooltipsPure) via i18n t().
 * - Popup position:fixed flip-aware; CSS em app/css/hud-tooltips.css
 *   (.hud-tooltip-*), reduced-motion respeitado no CSS (gate G7).
 * - D09: tooltip do EIS score em tom vermelho ganha CTA "como melhorar".
 * - Flag CONFIG.FEATURES.HUD_TOOLTIPS (default ON) — rollback hatch.
 */
import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import {
    HUD_REGION_MAPS,
    findHudTooltipKeyAt,
    getHudCardTooltip,
    resolvePseudoKey,
    type HudCardTooltipKey,
} from './_hudCardTooltipsPure.js';

const POPUP_ID = 'hud-card-tooltip';
const TOUCH_AUTO_HIDE_MS = 4000;
const EIS_RED_THRESHOLD = 3.5;

let _popup: HTMLDivElement | null = null;
let _currentKey: string | null = null;
let _touchTimer: ReturnType<typeof setTimeout> | null = null;

function _featureOn(): boolean {
    try {
        return (CONFIG as any)?.FEATURES?.HUD_TOOLTIPS !== false;
    } catch {
        return true;
    }
}

function _ensurePopup(): HTMLDivElement {
    if (_popup && document.body.contains(_popup)) return _popup;
    const el = document.createElement('div');
    el.id = POPUP_ID;
    el.className = 'hud-tooltip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    _popup = el;
    return el;
}

export function hideHudTooltip(): void {
    if (_touchTimer) { clearTimeout(_touchTimer); _touchTimer = null; }
    _currentKey = null;
    if (_popup) {
        _popup.classList.remove('hud-tooltip--visible');
        _popup.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Monta o conteúdo do tooltip via DOM API (sem innerHTML interpolado —
 * strings vêm dos locales mas defense-in-depth não custa).
 */
function _buildContent(popup: HTMLDivElement, key: HudCardTooltipKey, canvas: HTMLCanvasElement): void {
    const entry = getHudCardTooltip(key);
    popup.textContent = '';
    if (!entry) return;
    const title = document.createElement('div');
    title.className = 'hud-tooltip__title';
    title.textContent = t(entry.titleKey);
    popup.appendChild(title);
    const desc = document.createElement('div');
    desc.className = 'hud-tooltip__desc';
    desc.textContent = t(entry.descriptionKey);
    popup.appendChild(desc);
    if (entry.formula) {
        const code = document.createElement('code');
        code.className = 'hud-tooltip__formula';
        code.textContent = entry.formula;
        popup.appendChild(code);
    }
    if (entry.thresholds && entry.thresholds.length > 0) {
        const list = document.createElement('div');
        list.className = 'hud-tooltip__thresholds';
        for (const r of entry.thresholds) {
            const chip = document.createElement('span');
            chip.className = `hud-tooltip__chip hud-tooltip__chip--${r.tone}`;
            chip.textContent = t(r.label);
            list.appendChild(chip);
        }
        popup.appendChild(list);
    }
    // D09: CTA acionável quando o EIS está em tom vermelho (< 3.5).
    if (key === 'eisHud.score') {
        const score = Number(canvas.dataset.hudEisScore);
        if (Number.isFinite(score) && score < EIS_RED_THRESHOLD) {
            const cta = document.createElement('div');
            cta.className = 'hud-tooltip__cta';
            cta.textContent = t('hud.eis.cta.improve');
            popup.appendChild(cta);
        }
    }
}

/** Posiciona flip-aware perto do ponteiro, clampado ao viewport. */
function _position(popup: HTMLDivElement, clientX: number, clientY: number): void {
    const margin = 12;
    const rect = popup.getBoundingClientRect();
    let x = clientX + margin;
    let y = clientY + margin;
    if (x + rect.width + margin > window.innerWidth) x = clientX - rect.width - margin;
    if (y + rect.height + margin > window.innerHeight) y = clientY - rect.height - margin;
    popup.style.left = `${Math.max(4, x)}px`;
    popup.style.top = `${Math.max(4, y)}px`;
}

function _showAt(canvas: HTMLCanvasElement, clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const rawKey = findHudTooltipKeyAt(canvas.id, fx, fy);
    if (!rawKey) { hideHudTooltip(); return; }
    const key = resolvePseudoKey(rawKey, {
        hudMode: canvas.dataset.hudMode,
        hudSign: canvas.dataset.hudSign,
    });
    const popup = _ensurePopup();
    if (_currentKey !== key) {
        _buildContent(popup, key, canvas);
        _currentKey = key;
    }
    popup.classList.add('hud-tooltip--visible');
    popup.setAttribute('aria-hidden', 'false');
    _position(popup, clientX, clientY);
}

function _bindCanvas(canvas: HTMLCanvasElement): void {
    if (canvas.dataset.hudTooltipBound === '1') return;
    canvas.dataset.hudTooltipBound = '1';
    canvas.addEventListener('mousemove', (e) => _showAt(canvas, e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', () => hideHudTooltip());
    // Touch: primeiro toque mostra (auto-hide 4s); o click handler do card
    // continua funcionando normalmente (não chamamos preventDefault).
    canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        _showAt(canvas, touch.clientX, touch.clientY);
        if (_touchTimer) clearTimeout(_touchTimer);
        _touchTimer = setTimeout(() => hideHudTooltip(), TOUCH_AUTO_HIDE_MS);
    }, { passive: true });
    // Keyboard: focus mostra o tooltip card-level no centro do card.
    canvas.addEventListener('focus', () => {
        const r = canvas.getBoundingClientRect();
        _showAt(canvas, r.left + r.width / 2, r.top + r.height / 2);
    });
    canvas.addEventListener('blur', () => hideHudTooltip());
}

/**
 * Inicializa o tooltip runtime nos 6 cards — idempotente; canvases ausentes
 * são ignorados (re-chamar após mount tardio é seguro).
 */
export function initHudCardTooltips(): void {
    if (!_featureOn()) return;
    for (const id of Object.keys(HUD_REGION_MAPS)) {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        if (canvas) {
            _bindCanvas(canvas);
            // Cards focáveis por teclado (tooltip acessível sem mouse).
            if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
        }
    }
    if (!document.body.dataset.hudTooltipEscBound) {
        document.body.dataset.hudTooltipEscBound = '1';
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideHudTooltip();
        });
    }
}
