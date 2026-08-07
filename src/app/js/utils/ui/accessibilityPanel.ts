// @ts-check
// Generated from src/app/js/utils/ui/accessibilityPanel.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   ACCESSIBILITY PANEL — SPEC_CONTRAST_TESTING_9_77 §9.77
   Modal de configuracoes de acessibilidade:
   - Tema visual (auto/light/dark/high-contrast)
   - Boost de contraste + reducao de transparencias
   - Simulador de daltonismo (protanopia, deuteranopia, tritanopia, baixa visao)
   - Informacoes de conformidade WCAG 2.1
   ================================================================ */
import { t } from '../i18n/translations.js';
import { buildModalShell } from './modals.js';
import { contrastRatio, validatePair } from '../../core/a11y/contrast.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────
const LS_THEME = 'ecbyts-a11y-theme';
const LS_BOOST = 'ecbyts-a11y-boost';
const LS_TRANSPARENCY = 'ecbyts-a11y-transparency';
const LS_SIMULATION = 'ecbyts-a11y-simulation';
const ROOT_ID = 'a11y-panel-root';
const SIMULATION_FILTERS: any = {
    normal: 'none',
    protanopia: 'url(#protanopia)',
    deuteranopia: 'url(#deuteranopia)',
    tritanopia: 'url(#tritanopia)',
    lowVision: 'blur(2px) brightness(0.8)',
};
// ──────────────────────────────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────────────────────────────
export function loadA11yPrefs() {
    try {
        const theme = localStorage.getItem(LS_THEME) || 'auto';
        const boost = (localStorage.getItem(LS_BOOST) || '') === 'true';
        const transparency = (localStorage.getItem(LS_TRANSPARENCY) || '') === 'true';
        const simulation = localStorage.getItem(LS_SIMULATION) || 'normal';
        return { theme, boost, transparency, simulation };
    } catch (e: any) {
        console.debug('[a11yPanel] loadPrefs:', /** @type {any} */ (e)?.message || e);
        return { theme: 'auto', boost: false, transparency: false, simulation: 'normal' };
    }
}
/**
 * @param {any} prefs
 */
export function saveA11yPrefs( prefs: any) {
    try {
        if (prefs.theme != null) localStorage.setItem(LS_THEME, prefs.theme);
        if (prefs.boost != null) localStorage.setItem(LS_BOOST, String(prefs.boost));
        if (prefs.transparency != null) localStorage.setItem(LS_TRANSPARENCY, String(prefs.transparency));
        if (prefs.simulation != null) localStorage.setItem(LS_SIMULATION, prefs.simulation);
    } catch (e: any) {
        console.debug('[a11yPanel] savePrefs:', /** @type {any} */ (e)?.message || e);
        /* noop */
    }
}
// ──────────────────────────────────────────────────────────────────────
// Theme application
// ──────────────────────────────────────────────────────────────────────
/**
 * @param {any} theme
 */
export function applyTheme( theme: any) {
    const root = document.documentElement;
    if (!root) return;
    const resolved =
        theme === 'auto' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    if (resolved === 'high-contrast') {
        root.setAttribute('data-theme', 'high-contrast');
        root.setAttribute('data-high-contrast', 'true');
    } else {
        root.setAttribute('data-theme', resolved);
        root.removeAttribute('data-high-contrast');
    }
    // Sync with existing ecbyts-theme if possible
    try {
        localStorage.setItem('ecbyts-theme', resolved === 'high-contrast' ? 'dark' : resolved);
    } catch (e: any) {
        console.debug('[a11yPanel] syncTheme:', /** @type {any} */ (e)?.message || e);
        /* noop */
    }
}
// ──────────────────────────────────────────────────────────────────────
// Contrast boost + transparency
// ──────────────────────────────────────────────────────────────────────
/**
 * @param {any} enabled
 */
export function applyBoost( enabled: any) {
    document.documentElement?.classList.toggle('a11y-boost-contrast', enabled);
}
/**
 * @param {any} enabled
 */
export function applyReduceTransparency( enabled: any) {
    document.documentElement?.classList.toggle('a11y-reduce-transparency', enabled);
}
// ──────────────────────────────────────────────────────────────────────
// Color-blind simulation
// ──────────────────────────────────────────────────────────────────────
/**
 * @param {any} type
 */
export function simulateColorBlind( type: any) {
    const root = document.documentElement;
    if (!root) return;
    const filter = SIMULATION_FILTERS[type] || SIMULATION_FILTERS.normal;
    if (filter === 'none') {
        root.style.removeProperty('--a11y-simulation-filter');
    } else {
        root.style.setProperty('--a11y-simulation-filter', filter);
    }
}
// ──────────────────────────────────────────────────────────────────────
// Contrast info (Section 4)
// ──────────────────────────────────────────────────────────────────────
/**
 * Pilha de fundo da PÁGINA, do topo para o fundo, para compor superfícies
 * translúcidas (A11Y-ALPHA-001).
 *
 * Vários tokens de superfície do app são `rgba(...)`; medir contraste contra
 * eles sem compor devolve a luminância da TINTA, não a do pixel. Aqui a pilha é
 * LIDA do documento (body sobre html) em vez de chutada, e só o último elo — o
 * canvas do browser, branco quando nada é opaco — é convenção, não adivinhação.
 */
function _pageBackdrop(): string[] {
    const layers: string[] = [];
    for (const el of [document.body, document.documentElement]) {
        if (!el) continue;
        const bg = getComputedStyle(el).backgroundColor;
        if (bg) layers.push(bg);
    }
    layers.push('#ffffff');
    return layers;
}

export function getContrastInfo() {
    const style = getComputedStyle(document.documentElement);
    /**
     * @param {any} title
     * @param {any} fallback
     */
    const get = (name: any, fallback: any) => {
        const v = style.getPropertyValue(name).trim();
        return v || fallback;
    };
    const textPrimary = get('--text-color', '#e2e8f0');
    const textMuted = get('--text-muted', '#94a3b8');
    const bgPrimary = get('--bg-primary', '#060a12');
    const bgSurface = get('--surface-1', '#0d1117');
    const accent = get('--accent', '#38bdf8');
    const pairs = [
        { id: 'text-on-bg', fg: textPrimary, bg: bgPrimary },
        { id: 'muted-on-bg', fg: textMuted, bg: bgPrimary },
        { id: 'text-on-surface', fg: textPrimary, bg: bgSurface },
        { id: 'accent-on-bg', fg: accent, bg: bgPrimary },
    ];
    const over = _pageBackdrop();
    const results = pairs.map((p: any) => {
        const ratio = contrastRatio(p.fg, p.bg, { over });
        const v = validatePair(p.fg, p.bg, { over });
        // ratio null = par NÃO-MENSURÁVEL (cor inválida / alpha que não fecha).
        // Fica null de propósito: antes virava 0, um número que não existe na
        // escala WCAG (mínimo 1) e escondia a ausência de medida.
        return { id: p.id, fg: p.fg, bg: p.bg, ...v, ratio: ratio ?? null };
    });
    const allPass = results.every((r: any) => r.aa);
    return {
        pairs: results,
        allPass,
        aaaRate: results.filter((r: any) => r.aaa).length / results.length,
        /** Pares que o motor não conseguiu medir — nunca contam como verdes. */
        unmeasurable: results.filter((r: any) => r.ratio == null).map((r: any) => ({ id: r.id, reason: r.reason })),
    };
}
// ──────────────────────────────────────────────────────────────────────
// Modal UI
// ──────────────────────────────────────────────────────────────────────
export function openAccessibilityPanel() {
    const root = _ensureRoot();
    root.innerHTML = '';
    root.appendChild(_buildModal());
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('accessibility');
}
export function closeAccessibilityPanel() {
    const root = (document.getElementById(ROOT_ID)) as any;
    if (root) {
        root.innerHTML = '';
        clearDeepLinkUrl();
    }
}
function _ensureRoot() {
    let root = /** @type {any} */ (document.getElementById(ROOT_ID));
    if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        document.body.appendChild(root);
    }
    return root;
}
/**
 * @param {any} title
 */
function _section( title: any) {
    const s = document.createElement('div');
    s.className = 'a11y-section';
    const h = document.createElement('h3');
    h.className = 'a11y-section-title';
    h.textContent = title;
    s.appendChild(h);
    return s;
}
/**
 * @param {any} name
 * @param {any} value
 * @param {any} label
 * @param {any} checked
 * @param {any} onChange
 */
function _radioRow( name: any, value: any, label: any, checked: any, onChange: any) {
    const labelEl = document.createElement('label');
    labelEl.className = 'a11y-radio-label';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.value = value;
    radio.checked = checked;
    radio.addEventListener('change', onChange);
    const span = document.createElement('span');
    span.textContent = label;
    labelEl.appendChild(radio);
    labelEl.appendChild(span);
    return labelEl;
}
/**
 * @param {any} id
 * @param {any} label
 * @param {any} checked
 * @param {any} onChange
 */
function _checkbox( id: any, label: any, checked: any, onChange: any) {
    const labelEl = document.createElement('label');
    labelEl.className = 'a11y-checkbox-label';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = id;
    box.checked = checked;
    box.addEventListener('change', onChange);
    const span = document.createElement('span');
    span.textContent = label;
    labelEl.appendChild(box);
    labelEl.appendChild(span);
    return labelEl;
}
function _buildModal() {
    const prefs = loadA11yPrefs();
    const { overlay, body, footer, close } =
        /** @type {{ overlay: HTMLElement, body: HTMLElement, footer: HTMLElement, close: () => void }} */ (
            buildModalShell({
                title: t('a11y.title') || 'Acessibilidade',
                width: '640px',
                onClose: closeAccessibilityPanel,
            })
        );
    overlay.classList.add('a11y-panel-overlay');
    // ── Section 1: Visual Theme ──
    const themeSection = _section(t('a11y.theme.label') || 'Tema visual');
    const themeRow = document.createElement('div');
    themeRow.className = 'a11y-radio-row';
    const themes = [
        { key: 'auto', label: t('a11y.theme.auto') || 'Automatico' },
        { key: 'light', label: t('a11y.theme.light') || 'Claro' },
        { key: 'dark', label: t('a11y.theme.dark') || 'Escuro' },
        { key: 'high-contrast', label: t('a11y.theme.highContrast') || 'Alto contraste' },
    ];
    for (const th of themes) {
        themeRow.appendChild(
            _radioRow('a11y-theme', th.key, th.label, prefs.theme === th.key, () => {
                applyTheme(th.key);
                saveA11yPrefs({ theme: th.key });
                _refreshInfo(infoBody);
            }),
        );
    }
    themeSection.appendChild(themeRow);
    body.appendChild(themeSection);
    // ── Section 2: Contrast Boost ──
    const contrastSection = _section(t('a11y.contrast.label') || 'Contraste');
    contrastSection.appendChild(
        _checkbox(
            'a11y-boost',
            t('a11y.contrast.boost') || 'Aumentar contraste',
            prefs.boost,
            (e: any) => {
                applyBoost(e.target.checked);
                saveA11yPrefs({ boost: e.target.checked });
            },
        ),
    );
    contrastSection.appendChild(
        _checkbox(
            'a11y-transparency',
            t('a11y.contrast.reduceTransparency') || 'Reduzir transparencias',
            prefs.transparency,
            (e: any) => {
                applyReduceTransparency(e.target.checked);
                saveA11yPrefs({ transparency: e.target.checked });
            },
        ),
    );
    body.appendChild(contrastSection);
    // ── Section 3: Daltonism Simulation ──
    const simSection = _section(t('a11y.simulation.label') || 'Simulacao');
    const simButtons = document.createElement('div');
    simButtons.className = 'a11y-sim-buttons';
    const simTypes = [
        { key: 'normal', label: t('a11y.simulation.normal') || 'Normal' },
        { key: 'protanopia', label: t('a11y.simulation.protanopia') || 'Protanopia' },
        { key: 'deuteranopia', label: t('a11y.simulation.deuteranopia') || 'Deuteranopia' },
        { key: 'tritanopia', label: t('a11y.simulation.tritanopia') || 'Tritanopia' },
        { key: 'lowVision', label: t('a11y.simulation.lowVision') || 'Baixa visao' },
    ];
    let activeSim = prefs.simulation;
    /**
     * @param {any} type
     */
    function setSim( type: any) {
        activeSim = type;
        simulateColorBlind(type);
        saveA11yPrefs({ simulation: type });
        /** @type {any} */ (simButtons.querySelectorAll('.a11y-sim-btn')).forEach((btn: any) => {
            btn.classList.toggle('active', btn.dataset.sim === type);
        });
        // Update preview filter
        const filter = SIMULATION_FILTERS[type] || SIMULATION_FILTERS.normal;
        previewBox.style.filter = filter === 'none' ? 'none' : filter;
    }
    for (const s of simTypes) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'a11y-sim-btn' + (activeSim === s.key ? ' active' : '');
        btn.dataset.sim = s.key;
        btn.textContent = s.label;
        btn.addEventListener('click', () => setSim(s.key));
        simButtons.appendChild(btn);
    }
    simSection.appendChild(simButtons);
    // Preview box
    const previewWrap = document.createElement('div');
    previewWrap.className = 'a11y-preview-wrap';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'a11y-preview-label';
    previewLabel.textContent = t('a11y.preview.label') || 'Pre-visualizacao';
    previewWrap.appendChild(previewLabel);
    const previewBox = document.createElement('div');
    previewBox.className = 'a11y-preview-box';
    const filter = SIMULATION_FILTERS[activeSim] || SIMULATION_FILTERS.normal;
    previewBox.style.filter = filter === 'none' ? 'none' : filter;
    // Sample UI inside preview
    previewBox.innerHTML = `
        <div class="a11y-preview-sample">
            <button class="a11y-preview-btn">Botao</button>
            <p class="a11y-preview-text">Texto de exemplo para verificar legibilidade.</p>
            <a href="#" class="a11y-preview-link">Link de exemplo</a>
        </div>
    `;
    previewWrap.appendChild(previewBox);
    simSection.appendChild(previewWrap);
    body.appendChild(simSection);
    // ── Section 4: Information ──
    const infoSection = _section('WCAG 2.1');
    const infoBody = document.createElement('div');
    infoBody.className = 'a11y-info-body';
    infoSection.appendChild(infoBody);
    body.appendChild(infoSection);
    _refreshInfo(infoBody);
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-primary';
    closeBtn.textContent = t('close') || 'Fechar';
    closeBtn.onclick = close;
    footer.appendChild(closeBtn);
    return overlay;
}
/**
 * @param {any} container
 */
function _refreshInfo( container: any) {
    container.innerHTML = '';
    const info = getContrastInfo();
    const grid = document.createElement('div');
    grid.className = 'a11y-info-grid';
    for (const p of info.pairs) {
        const row = document.createElement('div');
        row.className = 'a11y-info-row';
        const ratio = p.ratio != null ? p.ratio.toFixed(2) : '—';
        const badge = document.createElement('span');
        badge.className = 'a11y-info-badge' + (p.aa ? ' pass' : ' fail');
        badge.textContent = p.aa ? 'AA' : 'FAIL';
        row.innerHTML = `<span class="a11y-info-id">${p.id}</span><span class="a11y-info-ratio">${ratio}:1</span>`;
        row.appendChild(badge);
        grid.appendChild(row);
    }
    container.appendChild(grid);
    const compliance = document.createElement('div');
    compliance.className = 'a11y-compliance';
    if (info.allPass) {
        compliance.innerHTML = `<span class="a11y-compliance-badge aa">${t('a11y.compliance.aa') || 'Conforme WCAG AA'}</span>`;
    }
    if (info.aaaRate === 1) {
        const aaa = document.createElement('span');
        aaa.className = 'a11y-compliance-badge aaa';
        aaa.textContent = t('a11y.compliance.aaa') || 'Conforme WCAG AAA';
        compliance.appendChild(aaa);
    }
    container.appendChild(compliance);
}
// ──────────────────────────────────────────────────────────────────────
// Global wiring
// ──────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.openAccessibilityPanel = openAccessibilityPanel;
    window.closeAccessibilityPanel = closeAccessibilityPanel;
}
