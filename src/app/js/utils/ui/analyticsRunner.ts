// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Analytics Runner Modal - standardized UI for executing pure-logic
// analytics module. Tier 2 MVP per SPEC_ANALYTICS_LIBRARY_UI.md.

import { escapeHtml } from '../helpers/html.js';
import { ANALYTICS_REGISTRY } from '../../core/analytics/_registryData.js';
// AUDIT-HEURISTIC-001 — gate de badge automático "⚠ heurístico"
import {
    classifyHeuristic,
    renderHeuristicBadge,
} from '../../core/analytics/_analyticsHeuristicGatePure.js';

const OVERLAY_Z = 9000;
const DEBOUNCE_MS = 300;

interface AnalyticsRegistryEntry {
    readonly name: string;
    readonly description: string;
    readonly familyTags: readonly string[];
    readonly specRef: string;
    readonly sourcePath: string;
}

type CallableExport = (...args: unknown[]) => unknown;
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface CallableEntry {
    readonly name: string;
    readonly fn: CallableExport;
}

let activeController: AbortController | null = null;

/**
 * Open the runner for a single analytics module by its registry name.
 */
export async function openAnalyticsRunner(moduleName: string): Promise<void> {
    const entry = (ANALYTICS_REGISTRY as readonly AnalyticsRegistryEntry[]).find((item) => item.name === moduleName);
    if (!entry) {
        await showRunnerToast(`Analytics module not found: ${moduleName}`, 'error');
        return;
    }
    closeAnalyticsRunner();
    const overlay = buildOverlay(entry);
    document.body.appendChild(overlay);
    activeController = new AbortController();
    await loadAndRender(entry, overlay, activeController.signal);
}

/**
 * Open the runner with a family group. The user picks a module when the family
 * contains more than one module.
 */
export async function openAnalyticsFamilyRunner(familyTag: string): Promise<void> {
    const modules = (ANALYTICS_REGISTRY as readonly AnalyticsRegistryEntry[]).filter((entry) =>
        entry.familyTags.includes(familyTag),
    );
    if (modules.length === 0) {
        await showRunnerToast(`No analytics modules in family: ${familyTag}`, 'error');
        return;
    }
    const onlyModule = modules.length === 1 ? modules[0] : null;
    if (onlyModule) {
        return openAnalyticsRunner(onlyModule.name);
    }
    closeAnalyticsRunner();
    const overlay = buildFamilyOverlay(familyTag, modules);
    document.body.appendChild(overlay);
}

/** Close the current runner overlay. */
export function closeAnalyticsRunner(): void {
    if (activeController) {
        activeController.abort();
        activeController = null;
    }
    const existing = document.getElementById('analytics-runner-overlay');
    if (existing) existing.remove();
}

function buildOverlay(entry: AnalyticsRegistryEntry): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'analytics-runner-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'analytics-runner-title');
    overlay.style.cssText = `position:fixed;inset:0;z-index:${OVERLAY_Z};background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;`;
    overlay.innerHTML = `
        <div class="analytics-runner-modal" style="background:#0d1922;color:#e8f0f5;border-radius:10px;max-width:980px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);overflow:hidden;">
            <header style="padding:14px 20px;border-bottom:1px solid #1f3340;display:flex;align-items:center;gap:12px;">
                <div style="flex:1;min-width:0;">
                    <div id="analytics-runner-title" style="font-weight:600;font-size:15px;color:#7fd9c2;">${escapeHtml(entry.name)}</div>
                    <div style="font-size:12px;color:#8aa1ad;margin-top:2px;">${escapeHtml(entry.description)} &middot; <code style="color:#7fa3b8;">${escapeHtml(entry.specRef)}</code></div>
                </div>
                <button type="button" class="analytics-runner-close" aria-label="Fechar" style="background:transparent;border:0;color:#8aa1ad;font-size:20px;cursor:pointer;">&times;</button>
            </header>
            <div class="analytics-runner-body" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 20px;overflow:auto;flex:1;">
                <section class="analytics-runner-form" style="min-width:0;"><p style="color:#8aa1ad;">&#8635; Carregando modulo...</p></section>
                <section class="analytics-runner-result" style="min-width:0;background:#0a1419;border:1px solid #1f3340;border-radius:6px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#a0c4d4;overflow:auto;">
                    <em style="color:#5d7280;">// Execute uma funcao para ver o resultado</em>
                </section>
            </div>
            <footer style="padding:10px 20px;border-top:1px solid #1f3340;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#5d7280;">
                <span>Tier 2 MVP &middot; <a href="../../../docs/specs/_archived/SPEC_ANALYTICS_LIBRARY_UI.md" style="color:#7fd9c2;">SPEC</a></span>
                <span>${escapeHtml(entry.familyTags.join(' - '))}</span>
            </footer>
        </div>
    `;
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAnalyticsRunner();
    });
    const closeBtn = overlay.querySelector('.analytics-runner-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAnalyticsRunner);
    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape') closeAnalyticsRunner();
        },
        { once: true },
    );
    return overlay;
}

function buildFamilyOverlay(familyTag: string, modules: readonly AnalyticsRegistryEntry[]): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'analytics-runner-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = `position:fixed;inset:0;z-index:${OVERLAY_Z};background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;`;
    const list = modules
        .map(
            (moduleEntry) => `
                <li style="padding:10px 12px;border:1px solid #1f3340;border-radius:6px;margin-bottom:6px;cursor:pointer;background:#0a1419;" data-module-name="${escapeHtml(moduleEntry.name)}">
                    <div style="font-weight:600;color:#7fd9c2;">${escapeHtml(moduleEntry.name)}</div>
                    <div style="font-size:12px;color:#8aa1ad;margin-top:2px;">${escapeHtml(moduleEntry.description)}</div>
                </li>
            `,
        )
        .join('');
    overlay.innerHTML = `
        <div style="background:#0d1922;color:#e8f0f5;border-radius:10px;max-width:720px;width:100%;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">
            <header style="padding:14px 20px;border-bottom:1px solid #1f3340;display:flex;align-items:center;">
                <div style="flex:1;font-weight:600;color:#7fd9c2;">Analytics - ${escapeHtml(familyTag)} &middot; ${modules.length} modulo(s)</div>
                <button type="button" class="analytics-runner-close" aria-label="Fechar" style="background:transparent;border:0;color:#8aa1ad;font-size:20px;cursor:pointer;">&times;</button>
            </header>
            <ul class="analytics-runner-family-list" style="list-style:none;margin:0;padding:14px 20px;overflow:auto;flex:1;">${list}</ul>
        </div>
    `;
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAnalyticsRunner();
        const target = event.target;
        const li = target instanceof Element ? target.closest('li[data-module-name]') : null;
        const name = li instanceof HTMLElement ? li.getAttribute('data-module-name') : null;
        if (name) {
            closeAnalyticsRunner();
            void openAnalyticsRunner(name);
        }
    });
    const closeBtn = overlay.querySelector('.analytics-runner-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAnalyticsRunner);
    return overlay;
}

async function loadAndRender(entry: Pick<AnalyticsRegistryEntry, 'name' | 'sourcePath'>, overlay: HTMLElement, signal: AbortSignal): Promise<void> {
    const formEl = overlay.querySelector('.analytics-runner-form');
    const resultEl = overlay.querySelector('.analytics-runner-result');
    if (!formEl || !resultEl) return;

    let moduleNamespace: Record<string, unknown>;
    try {
        const importPath = '/' + entry.sourcePath.replace(/^app\//, '');
        const loaded: unknown = await import(/* @vite-ignore */ importPath);
        moduleNamespace = isRecord(loaded) ? loaded : {};
    } catch (error) {
        if (signal.aborted) return;
        formEl.innerHTML = `<div style="color:#ff8a8a;">Falha ao carregar modulo: ${escapeHtml(getErrorMessage(error))}</div>`;
        return;
    }
    if (signal.aborted) return;

    const callables = listCallableExports(moduleNamespace);
    if (callables.length === 0) {
        formEl.innerHTML = `<div style="color:#ff8a8a;">Modulo nao expoe funcoes executaveis.</div>`;
        return;
    }

    let activeFn = callables[0]?.name || '';
    const fnPicker =
        callables.length === 1
            ? ''
            : `<select class="analytics-runner-fn-picker" style="margin-bottom:10px;width:100%;padding:6px;background:#0a1419;color:#e8f0f5;border:1px solid #1f3340;border-radius:4px;">${callables
                  .map((callable) => `<option value="${escapeHtml(callable.name)}">${escapeHtml(callable.name)}()</option>`)
                  .join('')}</select>`;

    const renderForActive = (): void => {
        const callable = callables.find((candidate) => candidate.name === activeFn);
        if (!callable) return;
        const params = parseSignature(callable.fn);
        formEl.innerHTML = `
            ${fnPicker}
            <div style="font-weight:600;margin-bottom:6px;color:#a0c4d4;">${escapeHtml(callable.name)}(${params.map((param) => escapeHtml(param)).join(', ')})</div>
            <form class="analytics-runner-form-fields" style="display:flex;flex-direction:column;gap:8px;">
                ${params.map((param, index) => renderParamField(param, index)).join('')}
                <button type="submit" class="analytics-runner-run-btn" style="margin-top:6px;padding:8px;background:#1c5e72;color:#fff;border:0;border-radius:4px;cursor:pointer;font-weight:600;">Executar &#9654;</button>
            </form>
            <div class="analytics-runner-error" style="margin-top:8px;color:#ff8a8a;font-size:12px;"></div>
        `;
        const formFields = formEl.querySelector('.analytics-runner-form-fields');
        if (formFields instanceof HTMLFormElement) {
            const debounced = debounce(() => execute(callable.fn, callable.name, formFields, params, resultEl, formEl, moduleNamespace), DEBOUNCE_MS);
            formFields.addEventListener('input', debounced);
            formFields.addEventListener('submit', (event) => {
                event.preventDefault();
                execute(callable.fn, callable.name, formFields, params, resultEl, formEl, moduleNamespace);
            });
        }
    };

    renderForActive();
    if (callables.length > 1) {
        const picker = formEl.querySelector('.analytics-runner-fn-picker');
        if (picker instanceof HTMLSelectElement) {
            picker.addEventListener('change', () => {
                activeFn = picker.value;
                renderForActive();
            });
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function showRunnerToast(message: string, type: ToastType): Promise<void> {
    try {
        const toastPath = './toast.js';
        const toastModule = (await import(/* @vite-ignore */ toastPath)) as {
            showToast?: (message: string, type?: ToastType) => void;
        };
        toastModule.showToast?.(message, type);
    } catch (error) {
        console.warn('[analyticsRunner] toast unavailable:', getErrorMessage(error));
    }
}

function listCallableExports(moduleNamespace: Record<string, unknown>): CallableEntry[] {
    const callables: CallableEntry[] = [];
    for (const [name, exportedValue] of Object.entries(moduleNamespace)) {
        if (name.endsWith('Meta') || typeof exportedValue !== 'function') continue;
        callables.push({ name, fn: exportedValue as CallableExport });
    }
    return callables;
}

function renderParamField(param: string, index: number): string {
    const isObjectInput = /^opts$|^options$|^params$|^config$/i.test(param);
    const placeholder = isObjectInput ? '{ }' : placeholderForParam(param);
    const escapedParam = escapeHtml(param);
    const field = isObjectInput
        ? `<textarea data-param-idx="${index}" rows="3" placeholder="${escapeHtml(placeholder)}" style="margin-top:3px;padding:6px;background:#0a1419;color:#e8f0f5;border:1px solid #1f3340;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:12px;"></textarea>`
        : `<input type="text" data-param-idx="${index}" placeholder="${escapeHtml(placeholder)}" style="margin-top:3px;padding:6px;background:#0a1419;color:#e8f0f5;border:1px solid #1f3340;border-radius:4px;" />`;
    return `
        <label style="display:flex;flex-direction:column;font-size:12px;color:#8aa1ad;">
            <span>${escapedParam}${isObjectInput ? ' (JSON)' : ''}</span>
            ${field}
        </label>
    `;
}

function parseSignature(fn: CallableExport): string[] {
    const source = Function.prototype.toString.call(fn);
    const match = source.match(/^[^(]*\(([^)]*)\)/);
    if (!match) return [];
    return (match[1] || '')
        .split(',')
        .map((param) => param.trim().split('=')[0]?.trim() || '')
        .filter(Boolean);
}

function placeholderForParam(param: string): string {
    if (/_kg$|_mg$|_l$|_m$|_cm$|_pct$|_yr$|_deg$|_h$|_min$/i.test(param)) return '0';
    if (/_ratio$|_factor$/i.test(param)) return '1.0';
    if (/^id$|name$|label$/i.test(param)) return 'string';
    return '';
}

function coerce(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    const numericValue = Number(trimmed);
    if (!Number.isNaN(numericValue) && /^-?\d+(\.\d+)?$/.test(trimmed)) return numericValue;
    return trimmed;
}

function execute(
    fn: CallableExport,
    fnName: string,
    formFields: HTMLFormElement,
    params: readonly string[],
    resultEl: Element,
    formEl: Element,
    moduleNamespace: Record<string, unknown>,
): void {
    const errEl = formEl.querySelector('.analytics-runner-error');
    if (errEl) errEl.textContent = '';
    const args: unknown[] = [];
    for (let index = 0; index < params.length; index += 1) {
        const input = formFields.querySelector(`[data-param-idx="${index}"]`);
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
            args.push(undefined);
            continue;
        }
        const rawValue = input.value;
        if (input instanceof HTMLTextAreaElement && rawValue.trim() !== '') {
            try {
                args.push(JSON.parse(rawValue) as unknown);
            } catch (error) {
                if (errEl) errEl.textContent = `Param "${params[index] || index}": JSON invalido (${getErrorMessage(error)})`;
                return;
            }
        } else {
            args.push(coerce(rawValue));
        }
    }

    let output: unknown;
    try {
        output = fn(...args);
    } catch (error) {
        const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        if (errEl) errEl.textContent = errMsg;
        resultEl.innerHTML = `<em style="color:#ff8a8a;">// ${escapeHtml(errMsg)}</em>`;
        return;
    }
    renderResult(resultEl, fnName, args, output, moduleNamespace);
}

/**
 * AUDIT-HEURISTIC-001 — detecta meta-shape em qualquer export *_META / META
 * do namespace. Retorna null se nenhum encontrado (não classifica).
 */
function detectModuleMeta(ns: Record<string, unknown>): unknown {
    if (!ns || typeof ns !== 'object') return null;
    for (const key of Object.keys(ns)) {
        if (!/META$|^META$|MODULE_META$/i.test(key)) continue;
        const v = ns[key];
        if (v && typeof v === 'object') return v;
    }
    return null;
}

function renderResult(
    resultEl: Element,
    fnName: string,
    args: readonly unknown[],
    output: unknown,
    moduleNamespace?: Record<string, unknown>,
): void {
    const inputsJson = JSON.stringify(args, null, 2);
    const outputJson = JSON.stringify(output, null, 2);
    // AUDIT-HEURISTIC-001 — badge automático se módulo é heurístico
    let heuristicBadge = '';
    try {
        const meta = moduleNamespace ? detectModuleMeta(moduleNamespace) : null;
        if (meta) {
            const verdict = classifyHeuristic(meta);
            heuristicBadge = renderHeuristicBadge(verdict, { variant: 'block', showReasons: true });
        }
    } catch (e: any) {
        console.debug('[analyticsRunner:heuristicBadge]', e?.message || e);
        /* badge é additive, não bloqueia render */
    }
    let table = '';
    if (output && typeof output === 'object' && !Array.isArray(output)) {
        const rows = Object.entries(output as Record<string, unknown>)
            .map(([key, value]) => {
                const cell =
                    typeof value === 'number'
                        ? value.toString()
                        : typeof value === 'string'
                          ? escapeHtml(value)
                          : escapeHtml(JSON.stringify(value));
                return `<tr><td style="padding:3px 8px;border-bottom:1px solid #1f3340;color:#7fd9c2;">${escapeHtml(key)}</td><td style="padding:3px 8px;border-bottom:1px solid #1f3340;">${cell}</td></tr>`;
            })
            .join('');
        table = `<table style="margin-top:10px;width:100%;border-collapse:collapse;font-size:12px;">${rows}</table>`;
    }
    resultEl.innerHTML = `
        ${heuristicBadge}
        <div style="color:#5d7280;">// inputs</div>
        <pre style="margin:4px 0 10px;color:#a0c4d4;white-space:pre-wrap;word-break:break-all;">${escapeHtml(inputsJson)}</pre>
        <div style="color:#5d7280;">// ${escapeHtml(fnName)}() =&gt;</div>
        <pre style="margin:4px 0;color:#7fd9c2;white-space:pre-wrap;word-break:break-all;">${escapeHtml(outputJson)}</pre>
        ${table}
    `;
}

function debounce(fn: () => void, ms: number): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return function debounced(): void {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}

export const __testing = Object.freeze({
    coerce,
    listCallableExports,
    parseSignature,
    placeholderForParam,
    renderResult,
});
