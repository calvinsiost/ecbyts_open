// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Split Pane State - UX-69 pure-logic n-pane splitter
// Modelo de splitter: orientacao horizontal/vertical, panes com mins/maxes, drag de gutters.
// Zero DOM. Imutavel. Cada operacao retorna novo state congelado.

const TOLERANCE = 0.5;

function freeze(state: any): any {
    const panes = state.config.panes.map((p: any) => Object.freeze({ ...p }));
    const config = Object.freeze({ ...state.config, panes: Object.freeze(panes) });
    let dragState = state.dragState;
    if (dragState) {
        dragState = Object.freeze({
            ...dragState,
            startSizes: Object.freeze([...dragState.startSizes]),
        });
    }
    const collapsedSizes = state.collapsedSizes ? Object.freeze({ ...state.collapsedSizes }) : Object.freeze({});
    return Object.freeze({ config, dragState, collapsedSizes });
}

function totalGutters(config: any): number {
    return Math.max(0, config.panes.length - 1) * config.gutterSize;
}

function sumPaneSizes(panes: any): number {
    return panes.reduce((acc: any, p: any) => acc + p.currentSize, 0);
}

function validateConfig(config: any): void {
    if (!config || (config.orientation !== 'horizontal' && config.orientation !== 'vertical')) {
        throw new Error('splitPane: orientation must be "horizontal" or "vertical"');
    }
    if (!Array.isArray(config.panes) || config.panes.length < 1) {
        throw new Error('splitPane: panes must be a non-empty array');
    }
    if (typeof config.totalSize !== 'number' || config.totalSize <= 0) {
        throw new Error('splitPane: totalSize must be a positive number');
    }
    const ids = new Set();
    for (const p of config.panes) {
        if (!p || typeof p.id !== 'string' || p.id.length === 0) {
            throw new Error('splitPane: each pane must have a string id');
        }
        if (ids.has(p.id)) throw new Error(`splitPane: duplicate pane id "${p.id}"`);
        ids.add(p.id);
        if (typeof p.minSize !== 'number' || p.minSize < 0) {
            throw new Error(`splitPane: pane "${p.id}" minSize invalid`);
        }
        if (p.maxSize != null && (typeof p.maxSize !== 'number' || p.maxSize < p.minSize)) {
            throw new Error(`splitPane: pane "${p.id}" maxSize invalid`);
        }
        if (typeof p.currentSize !== 'number' || p.currentSize < 0) {
            throw new Error(`splitPane: pane "${p.id}" currentSize invalid`);
        }
        if (!p.collapsed && p.currentSize + TOLERANCE < p.minSize) {
            throw new Error(`splitPane: pane "${p.id}" currentSize below minSize`);
        }
    }
    const expected = config.totalSize - totalGutters(config);
    const got = sumPaneSizes(config.panes);
    if (Math.abs(got - expected) > TOLERANCE) {
        throw new Error(`splitPane: pane sizes sum (${got}) does not match available space (${expected})`);
    }
}

export function createSplitPane({ orientation, totalSize, panes, gutterSize = 4 }: any): any {
    const normalized = panes.map((p: any) => ({
        id: p.id,
        label: p.label || p.id,
        minSize: p.minSize,
        maxSize: p.maxSize,
        currentSize: p.currentSize,
        collapsed: !!p.collapsed,
    }));
    const config = { orientation, totalSize, panes: normalized, gutterSize };
    validateConfig(config);
    return freeze({ config, dragState: null, collapsedSizes: {} });
}

function findPaneIndex(state: any, paneId: any): number {
    const idx = state.config.panes.findIndex((p: any) => p.id === paneId);
    if (idx === -1) throw new Error(`splitPane: pane id "${paneId}" not found`);
    return idx;
}

export function startResize(state: any, gutterIndex: any, position: any): any {
    const n = state.config.panes.length;
    if (!Number.isInteger(gutterIndex) || gutterIndex < 0 || gutterIndex >= n - 1) {
        throw new Error(`splitPane: gutterIndex ${gutterIndex} out of bounds (panes=${n})`);
    }
    if (typeof position !== 'number') {
        throw new Error('splitPane: startResize position must be a number');
    }
    const startSizes = state.config.panes.map((p: any) => p.currentSize);
    return freeze({
        ...state,
        dragState: { gutterIndex, startSizes, startPosition: position },
    });
}

export function updateResize(state: any, position: any): any {
    if (!state.dragState) {
        throw new Error('splitPane: updateResize called without active drag');
    }
    if (typeof position !== 'number') {
        throw new Error('splitPane: updateResize position must be a number');
    }
    const { gutterIndex, startSizes, startPosition } = state.dragState;
    const delta = position - startPosition;
    const a = state.config.panes[gutterIndex];
    const b = state.config.panes[gutterIndex + 1];
    let newA = startSizes[gutterIndex] + delta;
    let newB = startSizes[gutterIndex + 1] - delta;
    // clamp by mins
    if (newA < a.minSize) {
        newB -= a.minSize - newA;
        newA = a.minSize;
    }
    if (newB < b.minSize) {
        newA -= b.minSize - newB;
        newB = b.minSize;
    }
    // clamp by maxes
    if (a.maxSize != null && newA > a.maxSize) {
        newB += newA - a.maxSize;
        newA = a.maxSize;
    }
    if (b.maxSize != null && newB > b.maxSize) {
        newA += newB - b.maxSize;
        newB = b.maxSize;
    }
    // re-clamp mins after max adjust
    if (newA < a.minSize) newA = a.minSize;
    if (newB < b.minSize) newB = b.minSize;
    const panes = state.config.panes.map((p: any, i: any) => {
        if (i === gutterIndex) return { ...p, currentSize: newA };
        if (i === gutterIndex + 1) return { ...p, currentSize: newB };
        return { ...p };
    });
    return freeze({ ...state, config: { ...state.config, panes } });
}

export function endResize(state: any): any {
    if (!state.dragState) return state;
    return freeze({ ...state, dragState: null });
}

export function cancelResize(state: any): any {
    if (!state.dragState) return state;
    const { startSizes } = state.dragState;
    const panes = state.config.panes.map((p: any, i: any) => ({ ...p, currentSize: startSizes[i] }));
    return freeze({ ...state, config: { ...state.config, panes }, dragState: null });
}

export function setTotalSize(state: any, newTotal: any): any {
    if (typeof newTotal !== 'number' || newTotal <= 0) {
        throw new Error('splitPane: setTotalSize must be positive');
    }
    const oldAvailable = state.config.totalSize - totalGutters(state.config);
    const newAvailable = newTotal - totalGutters(state.config);
    if (newAvailable <= 0) {
        throw new Error('splitPane: newTotal too small for gutters');
    }
    const ratio = newAvailable / oldAvailable;
    const panes = state.config.panes.map((p: any) => {
        if (p.collapsed) return { ...p };
        let s = p.currentSize * ratio;
        if (s < p.minSize) s = p.minSize;
        if (p.maxSize != null && s > p.maxSize) s = p.maxSize;
        return { ...p, currentSize: s };
    });
    // Normalize residual into last non-collapsed pane within bounds
    const sum = sumPaneSizes(panes);
    const diff = newAvailable - sum;
    if (Math.abs(diff) > TOLERANCE) {
        for (let i = panes.length - 1; i >= 0; i--) {
            if (panes[i].collapsed) continue;
            const adjusted = panes[i].currentSize + diff;
            if (adjusted >= panes[i].minSize && (panes[i].maxSize == null || adjusted <= panes[i].maxSize)) {
                panes[i] = { ...panes[i], currentSize: adjusted };
                break;
            }
        }
    }
    return freeze({
        ...state,
        config: { ...state.config, totalSize: newTotal, panes },
    });
}

export function togglePaneCollapse(state: any, paneId: any): any {
    const idx = findPaneIndex(state, paneId);
    const pane = state.config.panes[idx];
    const collapsedSizes = { ...state.collapsedSizes };
    let panes;
    if (pane.collapsed) {
        // restore
        const restored = collapsedSizes[paneId] != null ? collapsedSizes[paneId] : pane.minSize;
        delete collapsedSizes[paneId];
        // take space from largest non-collapsed neighbor
        panes = state.config.panes.map((p: any) => ({ ...p }));
        panes[idx].collapsed = false;
        panes[idx].currentSize = restored;
        let remaining = restored;
        const order = [];
        for (let i = idx + 1; i < panes.length; i++) order.push(i);
        for (let i = idx - 1; i >= 0; i--) order.push(i);
        for (const i of order) {
            if (remaining <= TOLERANCE) break;
            if (panes[i].collapsed) continue;
            const slack = panes[i].currentSize - panes[i].minSize;
            if (slack <= 0) continue;
            const take = Math.min(slack, remaining);
            panes[i].currentSize -= take;
            remaining -= take;
        }
        if (remaining > TOLERANCE) {
            throw new Error(`splitPane: cannot uncollapse "${paneId}" — insufficient space (${remaining}px)`);
        }
    } else {
        // collapse
        collapsedSizes[paneId] = pane.currentSize;
        panes = state.config.panes.map((p: any) => ({ ...p }));
        const freed = pane.currentSize;
        panes[idx].collapsed = true;
        panes[idx].currentSize = 0;
        // distribute freed to neighbors
        let remaining = freed;
        const order = [];
        for (let i = idx + 1; i < panes.length; i++) order.push(i);
        for (let i = idx - 1; i >= 0; i--) order.push(i);
        for (const i of order) {
            if (remaining <= TOLERANCE) break;
            if (panes[i].collapsed) continue;
            const headroom = panes[i].maxSize != null ? panes[i].maxSize - panes[i].currentSize : remaining;
            if (headroom <= 0) continue;
            const give = Math.min(headroom, remaining);
            panes[i].currentSize += give;
            remaining -= give;
        }
    }
    return freeze({
        ...state,
        config: { ...state.config, panes },
        collapsedSizes,
    });
}

export function setPaneSize(state: any, paneId: any, size: any): any {
    if (typeof size !== 'number' || size < 0) {
        throw new Error('splitPane: setPaneSize size must be non-negative number');
    }
    const idx = findPaneIndex(state, paneId);
    const pane = state.config.panes[idx];
    if (size + TOLERANCE < pane.minSize) {
        throw new Error(`splitPane: size ${size} below minSize ${pane.minSize} for "${paneId}"`);
    }
    if (pane.maxSize != null && size > pane.maxSize + TOLERANCE) {
        throw new Error(`splitPane: size ${size} above maxSize ${pane.maxSize} for "${paneId}"`);
    }
    const delta = size - pane.currentSize;
    const panes = state.config.panes.map((p: any) => ({ ...p }));
    panes[idx].currentSize = size;
    let remaining = delta;
    // distribute negative remaining among following panes proportionally
    const followers = [];
    for (let i = idx + 1; i < panes.length; i++) {
        if (!panes[i].collapsed) followers.push(i);
    }
    if (followers.length === 0) {
        for (let i = idx - 1; i >= 0; i--) {
            if (!panes[i].collapsed) followers.push(i);
        }
    }
    if (followers.length === 0 && Math.abs(remaining) > TOLERANCE) {
        throw new Error(`splitPane: no panes to absorb ${remaining}px from "${paneId}"`);
    }
    // proportional by current size
    let guard = 10;
    while (Math.abs(remaining) > TOLERANCE && guard-- > 0) {
        const totalCur = followers.reduce((acc, i) => acc + panes[i].currentSize, 0) || 1;
        let absorbed = 0;
        for (const i of followers) {
            const share = remaining * (panes[i].currentSize / totalCur);
            let next = panes[i].currentSize - share;
            if (next < panes[i].minSize) next = panes[i].minSize;
            if (panes[i].maxSize != null && next > panes[i].maxSize) next = panes[i].maxSize;
            const actualDelta = panes[i].currentSize - next;
            panes[i].currentSize = next;
            absorbed += actualDelta;
        }
        remaining -= absorbed;
        if (Math.abs(absorbed) < TOLERANCE) break;
    }
    if (Math.abs(remaining) > TOLERANCE) {
        throw new Error(`splitPane: cannot resize "${paneId}" — ${remaining}px unabsorbed`);
    }
    return freeze({ ...state, config: { ...state.config, panes } });
}

export function getPaneSize(state: any, paneId: any): any {
    return state.config.panes[findPaneIndex(state, paneId)].currentSize;
}

export function getPanePositions(state: any): any {
    const positions: any[] = [];
    let cursor = 0;
    state.config.panes.forEach((p: any, i: any) => {
        const start = cursor;
        const end = start + p.currentSize;
        positions.push({ paneId: p.id, start, end });
        cursor = end;
        if (i < state.config.panes.length - 1) cursor += state.config.gutterSize;
    });
    return positions;
}

export function isResizing(state: any): any {
    return state.dragState !== null;
}

export function summarizeSplitPane(state: any): any {
    const panes = state.config.panes;
    return {
        paneCount: panes.length,
        collapsedCount: panes.filter((p: any) => p.collapsed).length,
        orientation: state.config.orientation,
        totalUsed: sumPaneSizes(panes) + totalGutters(state.config),
    };
}
