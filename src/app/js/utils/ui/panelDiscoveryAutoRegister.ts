// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Panel Discovery Auto-Register.
//
// Calvin diretiva 2026-05-27: referenciar painéis órfãos no ribbon "Mais" +
// systemCatalog de forma programática (futuros painéis automaticamente
// descobertos).
//
// Como funciona:
//   1. Lê ORPHAN_PANELS_REGISTRY (canonical, em _panelDiscoveryRegistry.ts)
//   2. Para cada entrada:
//      a. Cria window.handleOpen<X> (lazy import + invoke openExport)
//      b. Injeta <button> no #dd-more dropdown sob seção apropriada
//   3. systemCatalogModal já descobre via window.handle* prefix loop
//      → painel aparece automaticamente no catálogo de sistema
//
// IDEMPOTENTE: chamada múltipla é safe (skip se handler já existe).
//
// Caller: registerAllHandlers() em utils/handlers/index.ts ou main.ts boot.

import { getDiscoveryEntriesWithHandlers } from './_panelDiscoveryRegistry.js';
import type { PanelDiscoveryEntry } from './_panelDiscoveryRegistry.js';

interface RegistryEntryWithHandler extends PanelDiscoveryEntry {
    handlerName: string;
}

let _registered = false;

/**
 * Lazy-invoke the exported open function from a panel module.
 * Caches the import promise so multiple invocations share a single fetch.
 */
function createLazyOpener(entry: RegistryEntryWithHandler): () => Promise<unknown> {
    let cached: Promise<Record<string, unknown>> | null = null;
    return async () => {
        try {
            if (!cached) {
                cached = import(entry.module as string) as Promise<Record<string, unknown>>;
            }
            const mod = await cached;
            const fn = mod[entry.openExport];
            if (typeof fn !== 'function') {
                console.warn(
                    `[panelDiscovery] ${entry.id}: export "${entry.openExport}" not found or not a function`,
                );
                return;
            }
            const args = entry.defaultArgs ? [{ ...entry.defaultArgs }] : [];
            return (fn as (...args: unknown[]) => unknown)(...args);
        } catch (e) {
            console.error(
                `[panelDiscovery] ${entry.id}: lazy open failed —`,
                (e as Error)?.message || e,
            );
        }
    };
}

/**
 * Inject a <button> for an entry into the #dd-more dropdown (or a sub-section).
 * Skips if button already exists.
 */
function injectDropdownButton(entry: RegistryEntryWithHandler): void {
    if (typeof document === 'undefined') return;
    const ddMore = document.getElementById('dd-more');
    if (!ddMore) return;
    const existingBtnId = `dd-more-panel-${entry.id}`;
    if (document.getElementById(existingBtnId)) return;
    // De-dup (2026-06-14): se já existe um botão ESTÁTICO no #dd-more apontando
    // para o mesmo handler (ex.: index.html "Treinamento" na seção Simulação),
    // NÃO injetar uma segunda entrada — evita item duplicado no dropdown.
    if (entry.handlerName && ddMore.querySelector(`[data-handler="${entry.handlerName}"]`)) {
        return;
    }
    const btn = document.createElement('button');
    btn.id = existingBtnId;
    btn.type = 'button';
    btn.className = 'toolbar-dropdown-item';
    btn.dataset.panelDiscovery = entry.id;
    btn.dataset.panelCategory = entry.category;
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span class="icon" data-icon="${entry.icon}" aria-hidden="true"></span><span>${entry.label}</span>`;
    // UI-EVAL-COVERAGE-001#overflow-sem-handler (Calvin, 2026-08-06): aqui havia
    // um addEventListener('click', ...). Funcionava no #dd-more e MORRIA no
    // #dd-overflow — o menu que a busca "Localizar..." revela é montado com
    // cloneNode(true), e cloneNode copia ATRIBUTOS, nunca listeners. Timekeeper,
    // Orçamento Cotado, Descobrir Modelos, Saúde Ocupacional, Risco CETESB e
    // Catálogos do ECBT ficavam clicáveis e mudos (R3-F-a: morte silenciosa).
    // `data-handler` é a MESMA rota dos ~317 botões estáticos do app (delegação
    // global em main/dataHandlerDelegation.ts, com deferred-handler-guard para o
    // boot lento) — e, por ser atributo, sobrevive a qualquer clone.
    btn.dataset.handler = entry.handlerName;
    // Group by category — find or create the section
    const sectionId = `dd-more-section-${entry.category}`;
    let section = document.getElementById(sectionId);
    if (!section) {
        section = document.createElement('div');
        section.id = sectionId;
        section.className = 'toolbar-dd-section';
        section.dataset.ddSection = `panel-discovery-${entry.category}`;
        ddMore.appendChild(section);
    }
    section.appendChild(btn);
}

/**
 * Auto-register all orphan panels:
 *   - window.handleOpen<X> created (lazy import + invoke)
 *   - <button> injected into #dd-more dropdown
 *
 * Idempotent: safe to call multiple times.
 *
 * @returns Number of newly-registered handlers.
 */
export function registerOrphanPanels(): number {
    if (_registered) return 0;
    const entries = getDiscoveryEntriesWithHandlers();
    const win = window as unknown as Record<string, unknown>;
    let count = 0;
    for (const entry of entries) {
        // 1. Window handler (idempotent)
        if (typeof win[entry.handlerName] !== 'function') {
            win[entry.handlerName] = createLazyOpener(entry);
            count++;
        }
        // 2. Dropdown button (best-effort — DOM may not be ready yet)
        try {
            injectDropdownButton(entry);
        } catch (e) {
            console.debug(
                `[panelDiscovery] inject button ${entry.id}:`,
                (e as Error)?.message || e,
            );
        }
    }
    _registered = true;
    if (count > 0) {
        console.log(`[panelDiscovery] registered ${count} orphan panel handler(s) + dropdown items`);
    }
    return count;
}

/**
 * Force re-registration (e.g., after dropdown DOM was rebuilt).
 * Bypasses the _registered flag.
 */
export function forceReregisterOrphanPanels(): number {
    _registered = false;
    return registerOrphanPanels();
}
