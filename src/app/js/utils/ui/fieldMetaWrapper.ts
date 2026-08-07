// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { CONFIG } from '../../config.js';

/* ================================================================
   FIELD-META-001 Fase 1a — field wrapper (prototype)

   Transforms an input element into a metadata-aware field.
   Opt-in via data-field-meta="true" attribute (ADR A2).

   Triggers (three, per WCAG — ADR A1):
   - Middle-click (mouse button 1 in `mousedown`) — power user
   - Ctrl+M when field has focus — keyboard a11y (WCAG 2.1.1)
   - Click on adjacent ⓘ info button — discoverable (WCAG 2.5.1)

   Popover implementation is Fase 1b. For now, wrapper registers
   handlers that dispatch a custom event `ecbyts:field-meta-open`
   which the popover module (or a dev stub) can listen to.
   ================================================================ */

const INFO_BTN_CLASS = 'field-meta-info-btn';
const WRAPPED_FLAG = '__ecbytsFieldMetaWrapped';

/**
 * Wrap an input/select/textarea with field-meta triggers.
 *
 * @param {HTMLElement} inputEl  the input element
 * @param {{field_key?: string, getMeta?: Function, setMeta?: Function}} [context]
 * @returns {() => void} cleanup function
 */
export function wrapFieldWithMeta(inputEl: any, context: any = {}): () => void {
    const _inp = (inputEl as any);
    if (!inputEl || _inp[WRAPPED_FLAG]) return () => {};
    if (CONFIG.FEATURES?.FIELD_META_V1 === false) return () => {};
    const { field_key } = context;
    if (!field_key) {
        console.warn('[fieldMeta] wrapFieldWithMeta: field_key missing, skipping wrap');
        return () => {};
    }
    _inp[WRAPPED_FLAG] = true;
    inputEl.dataset.fieldMeta = 'true';
    inputEl.dataset.fieldMetaKey = field_key;

    const open = (source: any) => {
        inputEl.dispatchEvent(
            new CustomEvent('ecbyts:field-meta-open', {
                bubbles: true,
                detail: { field_key, source, context },
            }),
        );
    };

    // Trigger 1 - middle-click (mouse button 1)
    const onMouseDown = (ev: any) => {
        if (ev.button === 1) {
            ev.preventDefault(); // suppress default auto-scroll
            open('middle-click');
        }
    };
    inputEl.addEventListener('mousedown', onMouseDown);

    // Trigger 2 - Ctrl+M when focused (WCAG 2.1.1)
    const onKeyDown = (ev: any) => {
        if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && (ev.key === 'm' || ev.key === 'M')) {
            ev.preventDefault();
            open('keyboard');
        }
    };
    inputEl.addEventListener('keydown', onKeyDown);

    // Trigger 3 - adjacent ⓘ button (WCAG 2.5.1 fallback, discoverable)
    const btn = _renderInfoButton(field_key, open);
    const container = inputEl.parentElement;
    if (container && !container.querySelector(`.${INFO_BTN_CLASS}[data-for="${CSS.escape(field_key)}"]`)) {
        inputEl.insertAdjacentElement('afterend', btn);
    }

    // Paint Q2Q class + inherited + censored + compromised attrs from
    // stored FieldMeta (gaps #3 and #17 fix). Fire-and-forget.
    _paintMetaAttributes(inputEl, field_key).catch((e: any) =>
        console.debug('[fieldMeta] paint skipped:', e?.message),
    );

    return function cleanup() {
        inputEl.removeEventListener('mousedown', onMouseDown);
        inputEl.removeEventListener('keydown', onKeyDown);
        btn.remove();
        delete _inp[WRAPPED_FLAG];
        delete inputEl.dataset.fieldMeta;
        delete inputEl.dataset.fieldMetaKey;
        delete inputEl.dataset.q2qClass;
        delete inputEl.dataset.uInherited;
        delete inputEl.dataset.censored;
        delete inputEl.dataset.compromised;
    };
}

/** @param {HTMLElement} inputEl @param {string} field_key */
async function _paintMetaAttributes(inputEl: any, field_key: any) {
    const { getFieldMeta } = await import('../../core/fieldMeta/store.js');
    const meta = await getFieldMeta(field_key);
    if (!meta) return;
    if (meta.uncertainty?.class) inputEl.dataset.q2qClass = meta.uncertainty.class;
    if (meta.uncertainty?.sources?.includes('inherited') && meta.uncertainty?.value == null) {
        inputEl.dataset.uInherited = 'true';
    }
    if (meta.censored?.is_censored && meta.censored?.limit_type) {
        inputEl.dataset.censored = '< ' + meta.censored.limit_type;
    }
    if (Array.isArray(meta.qc_flags) && meta.qc_flags.includes('compromised_sample')) {
        inputEl.dataset.compromised = 'true';
    }
}

// Re-paint on save event - subscribe once at module load.
if (typeof document !== 'undefined') {
    document.addEventListener('ecbyts:field-meta-saved', (ev: any) => {
        const fk = ev.detail?.field_key;
        if (!fk) return;
        const input = (
            document.querySelector(`[data-field-meta-key="${CSS.escape(fk)}"]`) as any);
        if (input)
            _paintMetaAttributes(input, fk).catch((_e: any) =>
                console.debug('[fieldMetaWrapper]', _e?.message || _e),
            );
    });
}

/** @param {string} field_key @param {Function} openFn */
function _renderInfoButton(field_key: any, openFn: any) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = INFO_BTN_CLASS;
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Abrir metadados do campo (incerteza, proveniência, revisões, fontes)');
    btn.setAttribute('title', 'Metadados (Ctrl+M ou middle-click)');
    btn.dataset.for = field_key;
    btn.innerHTML = '&#9432;'; // ⓘ circled information
    btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation(); // evita race com listener de outside-click-dismiss
        openFn('info-button');
    });
    // Também impede mousedown de bubblar para containers que possuem
    // handlers de drag/click-away (painéis flutuantes, context menus).
    btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
    return btn;
}

/**
 * Auto-wrap every input marked with data-field-meta="true" in a container.
 * Useful for forms that render server-side or from templates.
 *
 * @param {HTMLElement|Document} [root=document] search root
 * @param {((el: HTMLElement) => Object) | null} [contextBuilder]
 * @returns {() => void} cleanup for all wrapped
 */
export function autoWrapFieldsWithMeta(root = document, contextBuilder: any = null): () => void {
    if (!root || typeof root.querySelectorAll !== 'function') return () => {};
    if (CONFIG.FEATURES?.FIELD_META_V1 === false) return () => {};
    /** @type {Array<(() => void) | undefined>} */
    const cleanups: any = [];
    const nodes = root.querySelectorAll('[data-field-meta="true"]:not([data-field-meta-wrapped])');
    nodes.forEach((el: Element) => {
        const htmlEl = (el as HTMLElement);
        const ctx = contextBuilder
            ? contextBuilder(htmlEl)
            : { field_key: htmlEl.dataset.fieldMetaKey || (htmlEl as any).name || htmlEl.id };
        const cleanup = wrapFieldWithMeta(htmlEl, ctx);
        htmlEl.dataset.fieldMetaWrapped = 'true';
        cleanups.push(cleanup);
    });
    return function cleanupAll() {
        cleanups.forEach((fn: any) => fn && fn());
    };
}
