// @ts-check
// This file is part of ecbyts/ECBT. AGPL-3.0-only.
// Quick-access HomeGrid subdomain extracted from app/js/utils/ui/homeGrid.js.

import { QUICK_ACCESS_FEATURES, QUICK_ACCESS_DOCS_MAP, DOCS_STATIC_LINKS } from '../homeGridData.js';

/** @type {any} */
let _quickAccessEl: any = null;
/** @type {() => any[]} */
let _getElements = () => [];
let _executeHandler: (...args: any[]) => any = () => {};
/** @type {(key: string) => string} */
let _t = (key: any) => key;
/** @type {any[] | null} */
let _docsIndexItems: any = null;
let _docsIndexLoading = false;
let _lastRenderSignature: string | null = null;

export function initQuickAccess(container: any, options: any = {}) {
    _quickAccessEl = container || null;
    _lastRenderSignature = null;
    _getElements = typeof options.getElements === 'function' ? options.getElements : _getElements;
    _executeHandler = typeof options.executeHandler === 'function' ? options.executeHandler : _executeHandler;
    _t = typeof options.t === 'function' ? options.t : _t;
    return _quickAccessEl;
}

export function destroyQuickAccess() {
    _quickAccessEl = null;
    _getElements = () => [];
    _executeHandler = () => {};
    _t = (key: any) => key;
    _lastRenderSignature = null;
}

export function escapeAttr(value: any) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export function resolveQuickAccessAction(item: any, { hasHandler = (handlerName: any) => !!handlerName }: any = {}) {
    if (item?.handler && hasHandler(item.handler)) {
        return { type: 'handler', value: item.handler };
    }
    const docsId = item?.docsId || (QUICK_ACCESS_DOCS_MAP as any)[item?.id];
    if (docsId) {
        return { type: 'docs', value: docsId };
    }
    if (item?.url) {
        return { type: 'url', value: item.url };
    }
    if (item?.action) {
        return { type: 'action', value: item.action };
    }
    return null;
}

export function getCategoryTitle(category: any, translate: any = _t) {
    if (category.title) return category.title;
    const key = `qaCat${category.category.charAt(0).toUpperCase() + category.category.slice(1)}`;
    return translate(key) || category.category;
}

export function getVisibleQuickAccessItems(category: any, elements: any[] = []) {
    const hasData = elements.length > 0;
    const wellCount = elements.filter((element: any) => element.family === 'well').length;
    return category.items.filter((item: any) => {
        if (item.id === 'eis-dashboard' && !hasData) return false;
        if (item.id === 'data-audit' && !hasData) return false;
        if (item.id === 'cross-section' && wellCount < 2) return false;
        return true;
    });
}

export function buildQuickAccessRenderSignature(categories: any[] = [], elements: any[] = [], options: any = {}) {
    const hasHandler =
        typeof options.hasHandler === 'function'
            ? options.hasHandler
            : (handlerName: any) => Boolean(handlerName);
    const language = String(options.language || '');
    const elementList = Array.isArray(elements) ? elements : [];
    const wellCount = elementList.filter((element: any) => element?.family === 'well').length;
    const parts = [`lang:${language}`, `elements:${elementList.length}`, `wells:${wellCount}`];
    for (const category of categories || []) {
        const visibleItems = getVisibleQuickAccessItems(category, elementList);
        parts.push(`cat:${category?.category || ''}:${visibleItems.length}`);
        for (const item of visibleItems) {
            const action = resolveQuickAccessAction(item, { hasHandler });
            parts.push(`${item?.id || ''}:${action?.type || 'none'}:${action?.value || ''}`);
        }
    }
    return parts.join('|');
}

function _decodeHtml(raw: string) {
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

async function _loadDocsIndex() {
    if (_docsIndexLoading || Array.isArray(_docsIndexItems)) return;
    _docsIndexLoading = true;
    try {
        const response = await fetch('./docs.html', { cache: 'force-cache' });
        if (!response.ok) throw new Error(`docs status ${response.status}`);
        const html = await response.text();
        const re = /<(h2|h3)\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
        const seen = new Set();
        const items = [];
        let match;
        while ((match = re.exec(html))) {
            const level = match[1];
            const id = match[2];
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const label = _decodeHtml(match[3] as string);
            if (!label) continue;
            items.push({
                id: `docs-${id}`,
                icon: level === 'h3' ? 'chevron-right' : 'bookmark',
                label,
                desc: 'Open docs section',
                docsId: id,
            });
        }
        _docsIndexItems = items;
    } catch (err: any) {
        console.warn('[ecbyts:home] quick-access docs index unavailable:', /** @type {any} */ err?.message || err);
        _docsIndexItems = [];
    } finally {
        _docsIndexLoading = false;
        renderQuickAccess();
    }
}

export function getDocumentationIndexCategory() {
    if (!Array.isArray(_docsIndexItems) && !_docsIndexLoading && typeof fetch === 'function') {
        void _loadDocsIndex();
    }
    return {
        category: 'documentation',
        title: 'Documentation Index',
        icon: 'book-copy',
        items: [...DOCS_STATIC_LINKS, ...(_docsIndexItems || [])],
    };
}

function _openDocsSection(sectionId: any) {
    const safeId = String(sectionId || '').trim();
    const href = safeId ? `./docs.html#${safeId}` : './docs.html';
    window.open(href, '_blank', 'noopener');
}

function _printDocsAsPdf() {
    const popup = window.open('./docs.html', '_blank');
    if (!popup) return;
    const run = () => {
        try {
            popup.focus();
            popup.print();
        } catch (e: any) {
            console.debug('[homeGrid] printDocsAsPdf:', /** @type {any} */ e?.message || e);
        }
    };
    const printAfterRender = () => popup.requestAnimationFrame(run);
    if (popup.document?.readyState === 'complete') {
        printAfterRender();
    } else {
        popup.addEventListener('load', printAfterRender, { once: true });
    }
}

export function executeQuickAccessAction(type: string, value: any) {
    if (type === 'handler') {
        _executeHandler(value);
        return;
    }
    if (type === 'docs') {
        _openDocsSection(value);
        return;
    }
    if (type === 'url') {
        window.open(value, '_blank', 'noopener');
        return;
    }
    if (type === 'action' && value === 'print-docs') {
        _printDocsAsPdf();
    }
}

export function renderQuickAccess() {
    if (!_quickAccessEl) return;

    _quickAccessEl.style.display = 'block';

    const elements = _getElements();
    const categories = [...QUICK_ACCESS_FEATURES, getDocumentationIndexCategory()];
    const signature = buildQuickAccessRenderSignature(categories, elements, {
        language: typeof document !== 'undefined' ? document.documentElement?.lang || '' : '',
        hasHandler: (handlerName: any) =>
            typeof window !== 'undefined' && typeof (/** @type {any} */ window[handlerName]) === 'function',
    });
    if (_lastRenderSignature === signature && _quickAccessEl.querySelector('#quick-access-grid')) {
        return;
    }
    _lastRenderSignature = signature;

    let html = `
        <div class="home-quick-access-header">
            <div class="home-quick-access-title">
                <span data-icon="grid-2x2" data-icon-size="18px"></span>
                <span>${_t('homeQuickAccessTitle') || 'Quick Access'}</span>
            </div>
            <div class="home-quick-access-search">
                <input data-field-meta="true" data-field-meta-key="auto-pos:homeGrid:input:L2222" type="text"
                       id="quick-access-search"
                       placeholder="${escapeAttr(_t('homeQuickAccessSearch') || 'Search features...')}"
                       aria-label="${escapeAttr(_t('homeQuickAccessSearch') || 'Search features...')}">
            </div>
        </div>
        <div class="home-quick-access-grid" id="quick-access-grid">
    `;

    for (const category of categories) {
        const visibleItems = getVisibleQuickAccessItems(category, elements);
        if (visibleItems.length === 0) continue;
        const categoryTitle = getCategoryTitle(category, _t);

        html += `
            <div class="home-quick-access-category" data-category="${escapeAttr(category.category)}">
                <div class="home-quick-access-category-header">
                    <span data-icon="${escapeAttr(category.icon)}" data-icon-size="16px"></span>
                    <span class="home-quick-access-category-title">${escapeAttr(categoryTitle)}</span>
                    <span class="home-quick-access-category-count">${visibleItems.length}</span>
                </div>
                <div class="home-quick-access-items">
        `;

        for (const item of visibleItems) {
            const action = resolveQuickAccessAction(item, {
                hasHandler: (handlerName: any) =>
                    typeof window !== 'undefined' && typeof (/** @type {any} */ window[handlerName]) === 'function',
            });
            const unavailable = !action;
            const label = _t(item.label) || item.label;
            const desc = _t(item.desc) || item.desc;
            const actionType = action?.type || '';
            const actionValue = action?.value || '';
            const searchText = `${label} ${desc} ${categoryTitle}`.toLowerCase();

            html += `
                <div class="home-quick-access-item ${unavailable ? 'disabled' : ''}"
                     data-item-id="${escapeAttr(item.id)}"
                     data-search="${escapeAttr(searchText)}"
                     data-action-type="${escapeAttr(actionType)}"
                     data-action-value="${escapeAttr(actionValue)}"
                     title="${escapeAttr(desc)}"
                     role="button"
                     tabindex="${unavailable ? '-1' : '0'}"
                     aria-disabled="${unavailable ? 'true' : 'false'}">
                    <span data-icon="${escapeAttr(item.icon)}" data-icon-size="18px"></span>
                    <span class="home-quick-access-item-label">${escapeAttr(label)}</span>
                    ${actionType === 'docs' ? '<span class="home-quick-access-item-tag">Docs</span>' : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    }

    html += '</div>';
    _quickAccessEl.innerHTML = html;

    const inputEl = _quickAccessEl.querySelector('#quick-access-search');
    if (inputEl) {
        inputEl.addEventListener('input', (ev: any) => filterQuickAccess(ev.target?.value || ''));
    }

    const itemEls = _quickAccessEl.querySelectorAll('.home-quick-access-item');
    itemEls.forEach((itemEl: any) => {
        if (itemEl.classList.contains('disabled')) return;
        const run = () => {
            itemEl.classList.add('quick-access-loading');
            itemEl.setAttribute('aria-busy', 'true');
            requestAnimationFrame(() => {
                try {
                    executeQuickAccessAction(itemEl.dataset.actionType, itemEl.dataset.actionValue);
                } finally {
                    setTimeout(() => {
                        itemEl.classList.remove('quick-access-loading');
                        itemEl.removeAttribute('aria-busy');
                    }, 600);
                }
            });
        };
        itemEl.addEventListener('click', run);
        itemEl.addEventListener('keydown', (ev: any) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                run();
            }
        });
    });

    if (typeof window !== 'undefined' && typeof (/** @type {any} */ window.hydrateIcons) === 'function') {
        /** @type {any} */ window.hydrateIcons(_quickAccessEl);
    }
}

export function filterQuickAccess(query: string) {
    const grid = document.getElementById('quick-access-grid');
    if (!grid) return;

    const term = String(query || '')
        .toLowerCase()
        .trim();
    const categories = grid.querySelectorAll('.home-quick-access-category');

    categories.forEach((category: any) => {
        const items = category.querySelectorAll('.home-quick-access-item');
        let visibleCount = 0;

        items.forEach((item: any) => {
            const search = item.getAttribute('data-search')?.toLowerCase() || '';
            const matches = !term || search.includes(term);
            item.style.display = matches ? 'flex' : 'none';
            if (matches) visibleCount++;
        });

        category.style.display = visibleCount > 0 ? 'block' : 'none';
    });
}
