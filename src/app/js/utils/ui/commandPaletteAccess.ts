// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Command Palette Access — torna a paleta de comandos existente acessível.
 *
 * Calvin 2026-06-08 "ainda há varios elementos de UI que não estou tendo acesso".
 *
 * O `commandPalette.ts` existente já tem 597 linhas com toggleCommandPalette
 * e atalho Ctrl+Shift+P (escondido em menu dropdown), mas o catálogo de
 * comandos está praticamente vazio e o acesso pouco descobrível.
 *
 * Este módulo suplementa:
 *   1. Acesso à paleta via botão do scene HUD (#palette-toggle-btn, ao lado de
 *      Simbologia e Intangíveis — PALETTE-IN-HUD Calvin 2026-06-17). O FAB
 *      flutuante "⌘ K" do canto inferior esquerdo foi REMOVIDO.
 *   2. Atalho global Ctrl+K (suplementar ao Ctrl+Shift+P existente)
 *   3. Registra ~30 comandos amigáveis mapeados aos window.handle* existentes
 *
 * Standalone deliberadamente — não toca commandPalette.ts nem handlers/index.ts
 * (alta contenção entre sessões LLM). Auto-init via <script> tag em
 * app/index.html.
 *
 * O catálogo de comandos (dado puro) e o filtro de disponibilidade vivem em
 * `_commandPaletteAccessCatalogPure.ts` — este arquivo só faz o binding runtime
 * (`() => window[handlerName]()`) e a wiring de DOM/eventos.
 */

import {
    PALETTE_ACCESS_CATALOG,
    selectAvailableCommands,
    type PaletteAccessCommandDescriptor,
} from './_commandPaletteAccessCatalogPure.js';

const FAB_ID = 'ecbt-cmd-palette-access-fab';

let _initialized = false;
let _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

interface CommandRegistration {
    id: string;
    label: string;
    label_pt: string;
    category: string;
    handler: () => void;
    keywords?: string[];
}

/**
 * Catálogo amigável de comandos — converte os descriptors PUROS
 * (`PALETTE_ACCESS_CATALOG`) em registrations runtime, mantendo só os comandos
 * cujo `window.handle*` existe (fail-soft via `selectAvailableCommands`). O
 * handler é resolvido por nome no momento do disparo (`() => win[name]()`).
 */
function _buildCatalog(): CommandRegistration[] {
    const win = (globalThis as any).window as any;
    if (!win) return [];

    const hasHandler = (name: string): boolean => typeof win[name] === 'function';
    const toRegistration = (desc: PaletteAccessCommandDescriptor): CommandRegistration => ({
        id: desc.id,
        label: desc.label,
        label_pt: desc.label_pt,
        category: desc.category,
        handler: () => win[desc.handlerName](),
        keywords: [...desc.keywords],
    });

    return selectAvailableCommands(hasHandler, PALETTE_ACCESS_CATALOG).map(toRegistration);
}

function _registerCatalogToPalette(): number {
    const win = (globalThis as any).window as any;
    if (!win) return 0;
    const catalog = _buildCatalog();
    if (catalog.length === 0) return 0;
    // Tenta via API global registerCommands (se exposta) ou import dinâmico
    if (typeof win.registerPaletteCommands === 'function') {
        try { win.registerPaletteCommands(catalog); return catalog.length; }
        catch (e: any) { console.debug('[palette-access:register:win]', e?.message || e); }
    }
    // Fallback: lazy import do módulo
    void import('./commandPalette.js')
        .then((mod: any) => {
            if (typeof mod.registerCommands === 'function') {
                mod.registerCommands(catalog);
                console.debug('[palette-access] registered', catalog.length, 'commands via lazy import');
            }
        })
        .catch((e: any) => console.debug('[palette-access:lazy-import]', e?.message || e));
    return catalog.length;
}

function _openPaletteAny(): void {
    const win = (globalThis as any).window as any;
    if (!win) return;
    // 3 caminhos fallback — preferir OPEN (determinístico) a TOGGLE: chamado por
    // botões de menu (ex. "Mais" → Paleta de Comandos) e pelo atalho, onde a
    // intenção é ABRIR; toggle poderia FECHAR se o estado interno estivesse stale.
    if (typeof win.openCommandPalette === 'function') {
        try { win.openCommandPalette(); return; }
        catch (e: any) { console.debug('[palette-access:open:open]', e?.message || e); }
    }
    if (typeof win.toggleCommandPalette === 'function') {
        try { win.toggleCommandPalette(); return; }
        catch (e: any) { console.debug('[palette-access:open:toggle]', e?.message || e); }
    }
    void import('./commandPalette.js')
        .then((mod: any) => {
            if (typeof mod.openCommandPalette === 'function') mod.openCommandPalette();
        })
        .catch((e: any) => console.debug('[palette-access:lazy-open]', e?.message || e));
}

/**
 * PALETTE-IN-HUD (Calvin 2026-06-17): o FAB flutuante foi removido — a paleta
 * agora é o botão #palette-toggle-btn do scene HUD. Mantido como no-op (apenas
 * garante remoção de FAB legado) para não quebrar callers do view menu/hudRefresh.
 */
export function togglePaletteFab(): void {
    _installFab(); // limpa FAB legado se existir
}

/**
 * PALETTE-IN-HUD: idempotente; remove qualquer FAB legado remanescente.
 * Consumido por hudRefresh.ts — mantido para compatibilidade.
 */
export function refreshPaletteFab(): void {
    _installFab(); // limpa FAB legado se existir
}

// PALETTE-IN-HUD (Calvin 2026-06-17): o FAB flutuante "⌘ K" do canto inferior
// esquerdo foi REMOVIDO — o acesso à paleta agora é o botão #palette-toggle-btn
// do scene HUD (ao lado de Simbologia e Intangíveis, em index.html, data-handler
// =handleOpenPaletteAccess). _installFab vira no-op e também limpa qualquer FAB
// legado que tenha ficado no DOM (sessões antigas / cache).
function _installFab(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const legacy = doc.getElementById(FAB_ID);
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
}

/**
 * Inicialização pública. Idempotente.
 *  - Atalho Ctrl+K (suplementar ao Ctrl+Shift+P existente)
 *  - Limpa FAB legado (acesso migrou p/ #palette-toggle-btn do scene HUD)
 *  - Registra catálogo de ~30 comandos amigáveis
 */
export function initCommandPaletteAccess(): void {
    if (_initialized) return;
    const doc = (globalThis as any).document as Document | undefined;
    const win = (globalThis as any).window;
    if (!doc || !win) return;
    _initialized = true;

    _keydownHandler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
            e.preventDefault();
            _openPaletteAny();
        }
    };
    doc.addEventListener('keydown', _keydownHandler);
    _installFab();

    // Registra catálogo após 1s (dá tempo aos handlers serem registrados)
    setTimeout(() => {
        const n = _registerCatalogToPalette();
        if (n > 0) console.debug('[palette-access] catalog registered:', n, 'commands');
        // UI-STD-PALETTE-001: registrar catálogo de padronização UI (densidade,
        // tema, paleta, fonte, reset) separado para evitar acoplamento com
        // _buildCatalog e permitir cheap-test isolado.
        void import('./uiStandardizationCommands.js' as string)
            .then((mod: any) => {
                if (typeof mod.registerUiStandardizationCommands === 'function') {
                    return mod.registerUiStandardizationCommands();
                }
                return 0;
            })
            .then((m: number) => {
                if (m > 0) console.debug('[palette-access] ui-std registered:', m, 'commands');
            })
            .catch((e: any) => console.debug('[palette-access:ui-std]', e?.message || e));
    }, 1000);

    if (typeof win.handleOpenPaletteAccess !== 'function') {
        win.handleOpenPaletteAccess = _openPaletteAny;
    }
    // HUD-UX 2026-06-11: toggle do FAB ⌘K consumido pelo view menu
    if (typeof win.handleTogglePaletteFab !== 'function') {
        win.handleTogglePaletteFab = togglePaletteFab;
    }
}

export function disposeCommandPaletteAccess(): void {
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    if (_keydownHandler) {
        doc.removeEventListener('keydown', _keydownHandler);
        _keydownHandler = null;
    }
    const fab = doc.getElementById(FAB_ID);
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
    _initialized = false;
}

// AUTO-INIT side-effect — Calvin 2026-06-08 (resiliente a perda de wire)
(function _autoInit() {
    if (typeof globalThis === 'undefined') return;
    const doc = (globalThis as any).document as Document | undefined;
    if (!doc) return;
    const startup = () => {
        setTimeout(() => {
            try { initCommandPaletteAccess(); }
            catch (e: any) { console.debug('[palette-access:auto-init]', e?.message || e); }
        }, 4000);
    };
    if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        startup();
    } else {
        doc.addEventListener('DOMContentLoaded', startup, { once: true });
    }
})();
