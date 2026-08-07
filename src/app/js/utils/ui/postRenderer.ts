// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   POST RENDERER — CSS2DRenderer billboard label for `post` family
   ================================================================
   3D annotation pattern based on Three.js best practices:
     - HTML always faces the camera (no rotation) — ideal for sticky
       notes and tooltips. Source: threejs.org/docs/pages/CSS2DRenderer.html
     - Wrap any DOM element in CSS2DObject and attach to a 3D parent so
       its world position follows the parent. Source: github.com/mrdoob/
       three.js/blob/master/examples/css2d_label.html
     - At ≥200 simultaneous labels, throttle/hide off-screen. Source:
       discourse.threejs.org/t/use-css2drenderer-within-main-webglrenderer

   Public API:
     - attachPostLabel(spec)       → creates / replaces CSS2DObject
     - detachPostLabel(elementId)  → removes label DOM and 3D wrapper
     - buildPostLabelElement(spec) → PURE: returns HTMLElement (testable)
     - getActivePostCount()        → number of placas currently mounted

   Lazy three.js + CSS2DObject import: renderer can be tree-shaken from
   tests / node by guarding all THREE access behind dynamic import.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { postBackgroundForSeverity } from '../../core/post/postCreator.js';
const _activeLabels = new Map();
// ----------------------------------------------------------------
// PURE HELPER — testable DOM builder
// ----------------------------------------------------------------
/**
 * Resolve o texto de exibição da placa a partir do spec.
 */
function _resolveLabelText(safe: any): string {
    const data = safe.data && typeof safe.data === 'object' ? safe.data : {};
    if (typeof data.formattedResult === 'string' && data.formattedResult.length > 0) {
        return data.formattedResult;
    }
    if (typeof safe.label === 'string') {
        return safe.label;
    }
    return '—';
}

/**
 * Cria stub de retorno para ambientes sem DOM (Node/headless).
 */
function _makeHeadlessStub(safe: any, text: string, severity: string | null, fnId: string): any {
    return {
        className: 'ecbt-post-label',
        textContent: text,
        dataset: { postId: safe.id, severity: severity || '', calculatorFnId: fnId },
        style: {},
    };
}

/**
 * Aplica os estilos inline no elemento da placa.
 */
function _applyPostLabelStyles(el: HTMLElement, bg: string): void {
    el.style.cssText = [
        `background:${bg}`,
        'color:#111',
        'font-size:12px',
        'font-weight:600',
        'padding:6px 10px',
        'border-radius:6px',
        'box-shadow:0 2px 6px rgba(0,0,0,0.25)',
        'pointer-events:auto',
        'cursor:pointer',
        'max-width:220px',
        'line-height:1.3',
        'white-space:normal',
        'word-break:break-word',
        'transform:translate(-50%, -100%)',
    ].join(';');
}

/**
 * Build the sticky-note DOM for a placa. Pure (no scene mutation).
 * Reuses design tokens via inline style fallback so it works even when
 * a stylesheet is not yet loaded.
 */
export function buildPostLabelElement(spec: any) {
    const safe = spec && typeof spec === 'object' ? spec : {};
    const data = safe.data && typeof safe.data === 'object' ? safe.data : {};
    const text = _resolveLabelText(safe);
    const severity = typeof data.severity === 'string' ? data.severity : null;
    const bg = postBackgroundForSeverity(severity);
    const fnId = typeof data.calculatorFnId === 'string' ? data.calculatorFnId : '';
    const el = (typeof document !== 'undefined' ? document : globalThis.document)?.createElement('div');
    if (!el) {
        // Headless / Node env: return a stub object with the same shape
        // so tests can still inspect dataset & textContent equivalents.
        return _makeHeadlessStub(safe, text, severity, fnId);
    }
    el.className = 'ecbt-post-label';
    el.dataset.postId = typeof safe.id === 'string' ? safe.id : '';
    if (severity) el.dataset.severity = severity;
    if (fnId) el.dataset.calculatorFnId = fnId;
    el.setAttribute('role', 'note');
    el.setAttribute('aria-label', text);
    _applyPostLabelStyles(el, bg);
    el.innerHTML = `<span aria-hidden="true" style="margin-right:4px;">&#128204;</span>${escapeHtml(text)}`;
    el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
            const w = globalThis.window;
            if (w && typeof w.handleSelectElement === 'function' && typeof safe.id === 'string') {
                w.handleSelectElement(safe.id);
            }
        } catch (err) {
            console.debug('[postRenderer:click]', (err as any)?.message || err);
        }
    });
    return el;
}
// ----------------------------------------------------------------
// SCENE MUTATION (browser-only, defensive)
// ----------------------------------------------------------------
/**
 * @returns resolved CSS2DObject constructor or null
 */
async function _resolveCss2DObject() {
    try {
        // Project ships Three.js self-hosted with this addon path.
        const mod = await import('three/addons/renderers/CSS2DRenderer.js' as string);
        return mod && mod.CSS2DObject ? mod.CSS2DObject : null;
    } catch (err) {
        console.debug('[postRenderer:resolveCss2D]', (err as any)?.message || err);
        return null;
    }
}
/**
 * Resolve the parent 3D object to attach the label to. Falls back to
 * the elementsGroup if a linked mesh is not found.
 */
function _resolveParent(spec: any) {
    try {
        const w = globalThis.window;
        const linkedTo = spec?.data?.linkedTo;
        if (typeof linkedTo === 'string' && linkedTo.length > 0) {
            const getter = w && (w.__ecbtGetMesh || w.getMeshById);
            if (typeof getter === 'function') {
                const mesh = getter(linkedTo);
                if (mesh) return mesh;
            }
        }
        const groupGetter = w && (w.__ecbtGetElementsGroup || w.getElementsGroup);
        if (typeof groupGetter === 'function') return groupGetter();
    } catch (err) {
        console.debug('[postRenderer:resolveParent]', (err as any)?.message || err);
    }
    return null;
}

type AttachResult = { ok: false; reason: string } | { ok: true; reason?: string };

/**
 * Valida o spec antes de anexar uma label.
 */
function _validateAttachSpec(spec: any): AttachResult | null {
    if (!spec || typeof spec !== 'object' || typeof spec.id !== 'string') {
        return { ok: false, reason: 'invalid-spec' };
    }
    if (typeof document === 'undefined') {
        return { ok: false, reason: 'no-dom' };
    }
    return null;
}

/**
 * Aplica a posição 3D no objeto CSS2DObject quando disponível.
 */
function _setObjectPosition(obj: any, pos: any): void {
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
        if (obj.position && typeof obj.position.set === 'function') {
            obj.position.set(pos.x, pos.y, pos.z);
        }
    }
}

/**
 * Attach (or replace) a CSS2DRenderer label for a `post` element spec.
 * Idempotent — repeated calls for the same id replace the previous DOM.
 */
export async function attachPostLabel(spec: any): Promise<AttachResult> {
    const validation = _validateAttachSpec(spec);
    if (validation) return validation;

    // Remove previous if exists (idempotent replace)
    detachPostLabel(spec.id);
    const CSS2DObject = await _resolveCss2DObject();
    const dom = buildPostLabelElement(spec);
    if (!CSS2DObject) {
        // Fallback: append DOM to body so the placa is still visible
        // (less than ideal positioning, but better than silent failure).
        document.body.appendChild(dom as any);
        _activeLabels.set(spec.id, { obj: null, dom: dom });
        return { ok: true, reason: 'fallback-dom' };
    }
    const obj = new CSS2DObject(dom);
    _setObjectPosition(obj, spec.data && spec.data.position);
    const parent = _resolveParent(spec);
    if (parent && typeof parent.add === 'function') {
        parent.add(obj);
    } else if (typeof document !== 'undefined') {
        // No scene parent available — keep DOM floating
        document.body.appendChild(dom as any);
    }
    _activeLabels.set(spec.id, { obj, dom: dom });
    return { ok: true };
}
/**
 * Remove a placa label by post element id. Safe to call when missing.
 * @returns true if removed
 */
export function detachPostLabel(elementId: string) {
    if (typeof elementId !== 'string') return false;
    const entry = _activeLabels.get(elementId);
    if (!entry) return false;
    try {
        if (entry.obj && entry.obj.parent && typeof entry.obj.parent.remove === 'function') {
            entry.obj.parent.remove(entry.obj);
        }
        if (entry.dom && entry.dom.parentNode) {
            entry.dom.parentNode.removeChild(entry.dom);
        }
    } catch (err) {
        console.debug('[postRenderer:detach]', (err as any)?.message || err);
    }
    _activeLabels.delete(elementId);
    return true;
}
export function getActivePostCount() {
    return _activeLabels.size;
}
/**
 * Reset all labels — used by tests and scene tear-down.
 */
export function clearAllPostLabels() {
    const ids = Array.from(_activeLabels.keys());
    for (const id of ids) detachPostLabel(id);
}
//# sourceMappingURL=postRenderer.js.map
