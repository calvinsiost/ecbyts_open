// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   RESIZE HANDLES — Utilitario compartilhado de redimensionamento
   ================================================================

   Fornece funcoes reutilizaveis para adicionar comportamento de
   resize a qualquer elemento da UI (paineis, janelas, modais).

   FUNCOES EXPORTADAS:
   - attachResize(handle, config)         — Liga um handle a resize
   - addFloatingResizeHandles(el, config) — Injeta 8 handles em bordas/cantos

   PATTERN:
   mousedown no handle → cursor muda → mousemove atualiza dimensoes
   → mouseup limpa listeners e cursor.

   ================================================================ */

// Cursors por direcao de resize
const CURSORS: Record<string, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    sw: 'nesw-resize',
};

/**
 * Attach resize behavior to a handle element.
 *
 * @param handle - Elemento que o usuario arrasta
 * @param config
 * @param config.target - Elemento sendo redimensionado
 * @param config.edge - Borda do handle
 * @param config.minWidth
 * @param config.maxWidth
 * @param config.minHeight
 * @param config.maxHeight
 * @param config.onResize - Callback durante resize ({width, height, left, top})
 * @param config.onEnd - Callback ao finalizar resize
 * @returns cleanup - Remove os listeners
 */
export function attachResize(
    handle: HTMLElement,
    config: {
        target: HTMLElement;
        edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
        minWidth?: number;
        maxWidth?: number;
        minHeight?: number;
        maxHeight?: number;
        onResize?: Function;
        onEnd?: Function;
    },
): Function {
    const {
        target,
        edge,
        minWidth = 100,
        maxWidth = Infinity,
        minHeight = 50,
        maxHeight = Infinity,
        onResize,
        onEnd,
    } = config;

    const cursor = CURSORS[edge] || 'nwse-resize';
    handle.style.cursor = cursor;

    let startX: any;
    let startY: any;
    let startW: any;
    let startH: any;
    let startLeft: any;
    let startTop: any;

    function onMouseDown(e: any) {
        if (e.button !== 0) return; // Apenas botao esquerdo
        e.preventDefault();
        e.stopPropagation();

        const rect = target.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;
        startLeft = target.offsetLeft;
        startTop = target.offsetTop;

        // Converter right/bottom para left/top para que resize N/W funcione corretamente
        // quando o elemento usa posicionamento baseado em right ou bottom.
        if (target.style.right && target.style.right !== 'auto') {
            target.style.left = startLeft + 'px';
            target.style.right = 'auto';
        }
        if (target.style.bottom && target.style.bottom !== 'auto') {
            target.style.top = startTop + 'px';
            target.style.bottom = 'auto';
        }

        document.body.style.cursor = cursor;
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        // Safety nets: if pointer leaves the window / tab loses focus / pointer is
        // cancelled, release the drag to avoid orphan document-level listeners.
        window.addEventListener('blur', onMouseUp, { once: true });
        document.addEventListener('mouseleave', onMouseUp, { once: true });
        document.addEventListener('pointercancel', onMouseUp, { once: true });
    }

    function onMouseMove(e: any) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newW = startW;
        let newH = startH;
        let newLeft = startLeft;
        let newTop = startTop;

        // Horizontal resize
        if (edge.includes('e')) {
            newW = Math.max(minWidth, Math.min(maxWidth, startW + dx));
        }
        if (edge.includes('w')) {
            const proposedW = startW - dx;
            newW = Math.max(minWidth, Math.min(maxWidth, proposedW));
            // Ajustar left para manter borda direita fixa
            newLeft = startLeft + (startW - newW);
        }

        // Vertical resize
        if (edge.includes('s')) {
            newH = Math.max(minHeight, Math.min(maxHeight, startH + dy));
        }
        if (edge === 'n' || edge === 'ne' || edge === 'nw') {
            const proposedH = startH - dy;
            newH = Math.max(minHeight, Math.min(maxHeight, proposedH));
            // Ajustar top para manter borda inferior fixa
            newTop = startTop + (startH - newH);
        }

        target.style.width = newW + 'px';
        target.style.height = newH + 'px';

        // Atualizar posicao apenas para bordas N/W (elemento move ao redimensionar)
        if (edge.includes('w') || edge === 'n' || edge === 'ne' || edge === 'nw') {
            if (edge.includes('w')) target.style.left = newLeft + 'px';
            if (edge === 'n' || edge === 'ne' || edge === 'nw') target.style.top = newTop + 'px';
        }

        if (onResize) onResize({ width: newW, height: newH, left: newLeft, top: newTop });
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // The safety-net listeners above use { once: true } and auto-remove on
        // first fire; explicit removal here is a no-op for unfired ones.
        window.removeEventListener('blur', onMouseUp);
        document.removeEventListener('mouseleave', onMouseUp);
        document.removeEventListener('pointercancel', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (onEnd) onEnd();
    }

    // Touch support para tablet
    function onTouchStart(e: any) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        onMouseDown({
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            preventDefault: () => e.preventDefault(),
            stopPropagation: () => e.stopPropagation(),
        });

        function onTouchMove(te: any) {
            if (te.touches.length !== 1) return;
            const t = te.touches[0];
            onMouseMove({ clientX: t.clientX, clientY: t.clientY });
        }
        function onTouchEnd() {
            onMouseUp();
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        }
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }

    handle.addEventListener('mousedown', onMouseDown);
    handle.addEventListener('touchstart', onTouchStart, { passive: false });

    return function cleanup() {
        handle.removeEventListener('mousedown', onMouseDown);
        handle.removeEventListener('touchstart', onTouchStart);
    };
}

/**
 * Add edge and corner resize handles to a floating element.
 * Cria 8 divs invisiveis (n, s, e, w, ne, nw, se, sw) nas bordas e cantos.
 *
 * @param el - Elemento flutuante
 * @param config
 * @param config.minWidth
 * @param config.maxWidth
 * @param config.minHeight
 * @param config.maxHeight
 * @param config.onEnd - Callback ao finalizar qualquer resize
 * @returns cleanup - Remove todos os handles e listeners
 */
export function addFloatingResizeHandles(
    el: HTMLElement,
    config: {
        minWidth?: number;
        maxWidth?: number;
        minHeight?: number;
        maxHeight?: number;
        onResize?: Function;
        onEnd?: Function;
    } = {},
): Function {
    const {
        minWidth = 200,
        maxWidth = window.innerWidth - 40,
        minHeight = 150,
        maxHeight = window.innerHeight - 40,
        onResize,
        onEnd,
    } = config;

    // Garantir position relative para handles absolutos
    const computed = getComputedStyle(el);
    if (computed.position === 'static') {
        el.style.position = 'relative';
    }

    const handles: any[] = [];
    const cleanups: any[] = [];

    const edges: Array<'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'> = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

    for (const edge of edges) {
        const div = document.createElement('div');
        div.className = `float-resize float-resize--${edge}`;
        div.dataset.resizeEdge = edge;
        el.appendChild(div);
        handles.push(div);

        const cleanupFn = attachResize(div, {
            target: el,
            edge,
            minWidth,
            maxWidth,
            minHeight,
            maxHeight,
            onResize,
            onEnd,
        } as any);
        cleanups.push(cleanupFn);
    }

    return function cleanup() {
        cleanups.forEach((fn) => fn());
        handles.forEach((h) => h.remove());
    };
}
