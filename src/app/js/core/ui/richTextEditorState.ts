// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-75 Rich Text Editor State - pure-logic, zero DOM, contentEditable-agnostic.
 * Documento estruturado: blocks com inline segments + marks. Imutável.
 */

const VALID_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);
const VALID_BLOCK_TYPES = new Set([
    'paragraph',
    'heading-1',
    'heading-2',
    'heading-3',
    'list-bullet',
    'list-numbered',
    'quote',
    'code',
    'divider',
]);
const MAX_HISTORY = 50;

let _idCounter = 0;
function genBlockId() {
    _idCounter += 1;
    return `b${Date.now().toString(36)}-${_idCounter}`;
}

function freezeSegment(seg: any) {
    const marks = seg.marks instanceof Set ? new Set(seg.marks) : new Set(seg.marks || []);
    for (const m of marks) {
        if (!VALID_MARKS.has(m as string)) throw new Error(`invalid mark: ${m}`);
    }
    const out: any = { text: String(seg.text ?? ''), marks: Object.freeze(new Set(marks)) };
    if (marks.has('link')) out.linkUrl = String(seg.linkUrl ?? '');
    return Object.freeze(out);
}

function freezeBlock(block: any) {
    if (!VALID_BLOCK_TYPES.has(block.type)) {
        throw new Error(`invalid block type: ${block.type}`);
    }
    const segments = (block.segments && block.segments.length ? block.segments : [{ text: '', marks: new Set() }]).map(
        freezeSegment,
    );
    return Object.freeze({
        id: block.id || genBlockId(),
        type: block.type,
        segments: Object.freeze(segments),
        indent: Number.isInteger(block.indent) ? block.indent : 0,
    });
}

function freezeState(state: any) {
    return Object.freeze({
        blocks: Object.freeze(state.blocks.map((b: any) => (Object.isFrozen(b) ? b : freezeBlock(b)))),
        selection: state.selection
            ? Object.freeze({
                  anchor: Object.freeze({ ...state.selection.anchor }),
                  focus: Object.freeze({ ...state.selection.focus }),
              })
            : null,
        history: Object.freeze({
            past: Object.freeze([...(state.history?.past || [])]),
            future: Object.freeze([...(state.history?.future || [])]),
        }),
    });
}

/** Cria editor state com blocos iniciais. */
export function createEditorState(initialBlocks: any[] = []) {
    const blocks = initialBlocks.length
        ? initialBlocks.map(freezeBlock)
        : [freezeBlock({ type: 'paragraph', segments: [{ text: '', marks: new Set() }] })];
    const first = blocks[0] as any;
    const last = blocks[blocks.length - 1] as any;
    const lastLen = blockTextLength(last);
    return freezeState({
        blocks,
        selection: {
            anchor: { blockId: first.id, offset: 0 },
            focus: { blockId: last.id, offset: lastLen },
        },
        history: { past: [], future: [] },
    });
}

function blockTextLength(block: any) {
    return block.segments.reduce((sum: number, s: any) => sum + s.text.length, 0);
}

function findBlockIndex(state: any, blockId: any) {
    const idx = state.blocks.findIndex((b: any) => b.id === blockId);
    if (idx === -1) throw new Error(`block not found: ${blockId}`);
    return idx;
}

function normalizeRange(state: any) {
    const sel = state.selection;
    if (!sel) return null;
    const aIdx = findBlockIndex(state, sel.anchor.blockId);
    const fIdx = findBlockIndex(state, sel.focus.blockId);
    if (aIdx < fIdx || (aIdx === fIdx && sel.anchor.offset <= sel.focus.offset)) {
        return { startIdx: aIdx, startOffset: sel.anchor.offset, endIdx: fIdx, endOffset: sel.focus.offset };
    }
    return { startIdx: fIdx, startOffset: sel.focus.offset, endIdx: aIdx, endOffset: sel.anchor.offset };
}

// Split block segments at a given char offset. Returns { left:[], right:[] }
function splitSegmentsAt(segments: any[], offset: number) {
    const left: any[] = [];
    const right: any[] = [];
    let consumed = 0;
    for (const seg of segments) {
        const end = consumed + seg.text.length;
        if (end <= offset) {
            left.push(seg);
        } else if (consumed >= offset) {
            right.push(seg);
        } else {
            const cut = offset - consumed;
            left.push(freezeSegment({ text: seg.text.slice(0, cut), marks: seg.marks, linkUrl: seg.linkUrl }));
            right.push(freezeSegment({ text: seg.text.slice(cut), marks: seg.marks, linkUrl: seg.linkUrl }));
        }
        consumed = end;
    }
    return { left, right };
}

function joinSegments(a: any[], b: any[]) {
    const out = [...a, ...b].filter((s: any, i: number, arr: any[]) => s.text.length > 0 || (i === 0 && arr.length === 1));
    if (out.length === 0) return [freezeSegment({ text: '', marks: new Set() })];
    return out;
}

function rebuildBlock(block: any, segments: any[]) {
    return freezeBlock({ id: block.id, type: block.type, segments, indent: block.indent });
}

/** Push current state (blocks+selection) to history, clear future. */
export function pushHistory(state: any) {
    const snapshot = { blocks: state.blocks, selection: state.selection };
    const past = [...state.history.past, snapshot].slice(-MAX_HISTORY);
    return freezeState({ blocks: state.blocks, selection: state.selection, history: { past, future: [] } });
}

/** Substitui state mantendo seleção/blocos e adicionando previous a history.past. */
function withHistoryPush(prev: any, next: any) {
    const snapshot = { blocks: prev.blocks, selection: prev.selection };
    const past = [...prev.history.past, snapshot].slice(-MAX_HISTORY);
    return freezeState({ blocks: next.blocks, selection: next.selection, history: { past, future: [] } });
}

/** Delete current selection range; returns state with collapsed selection at start. */
export function deleteSelection(state: any) {
    const range = normalizeRange(state);
    if (!range) return state;
    if (range.startIdx === range.endIdx && range.startOffset === range.endOffset) return state;

    const startBlock = state.blocks[range.startIdx];
    const endBlock = state.blocks[range.endIdx];
    const { left } = splitSegmentsAt(startBlock.segments, range.startOffset);
    const { right } = splitSegmentsAt(endBlock.segments, range.endOffset);
    const merged = rebuildBlock(startBlock, joinSegments(left, right));

    const newBlocks = [...state.blocks.slice(0, range.startIdx), merged, ...state.blocks.slice(range.endIdx + 1)];
    const sel = {
        anchor: { blockId: merged.id, offset: range.startOffset },
        focus: { blockId: merged.id, offset: range.startOffset },
    };
    return withHistoryPush(state, { blocks: newBlocks, selection: sel });
}

/** Inserts text at selection (replaces range if non-collapsed). */
export function insertText(state: any, text: string) {
    if (typeof text !== 'string') throw new Error('insertText: text must be string');
    let s = state;
    const range = normalizeRange(s);
    if (range && !(range.startIdx === range.endIdx && range.startOffset === range.endOffset)) {
        s = deleteSelection(s);
        // After delete, re-pop the history we just pushed so we batch as single op
        const past = s.history.past.slice(0, -1);
        s = freezeState({ blocks: s.blocks, selection: s.selection, history: { past, future: [] } });
    }
    if (!s.selection) return s;
    const blockIdx = findBlockIndex(s, s.selection.anchor.blockId);
    const block = s.blocks[blockIdx];
    const offset = s.selection.anchor.offset;
    const { left, right } = splitSegmentsAt(block.segments, offset);
    // Append to last left segment if exists, else create new
    let newSegments;
    if (left.length > 0) {
        const lastL = left[left.length - 1];
        const merged = freezeSegment({ text: lastL.text + text, marks: lastL.marks, linkUrl: lastL.linkUrl });
        newSegments = [...left.slice(0, -1), merged, ...right];
    } else {
        newSegments = [freezeSegment({ text, marks: new Set() }), ...right];
    }
    const newBlock = rebuildBlock(block, newSegments);
    const newBlocks = [...s.blocks.slice(0, blockIdx), newBlock, ...s.blocks.slice(blockIdx + 1)];
    const newOffset = offset + text.length;
    const sel = {
        anchor: { blockId: newBlock.id, offset: newOffset },
        focus: { blockId: newBlock.id, offset: newOffset },
    };
    return withHistoryPush(state, { blocks: newBlocks, selection: sel });
}

/** Toggle a mark across current selection range. */
export function applyMark(state: any, mark: string) {
    if (!VALID_MARKS.has(mark)) throw new Error(`invalid mark: ${mark}`);
    const range = normalizeRange(state);
    if (!range) return state;
    if (range.startIdx === range.endIdx && range.startOffset === range.endOffset) {
        return state; // collapsed: marks toggle handled via getActiveMarks UI layer
    }

    // Determine if all chars in range have the mark → if yes, remove; else add
    const hasAll = rangeHasMarkAll(state, range, mark);
    const newBlocks = state.blocks.map((b: any, i: number) => {
        if (i < range.startIdx || i > range.endIdx) return b;
        const fromOff = i === range.startIdx ? range.startOffset : 0;
        const toOff = i === range.endIdx ? range.endOffset : blockTextLength(b);
        return rebuildBlock(b, applyMarkToBlockSegments(b.segments, fromOff, toOff, mark, !hasAll));
    });
    return withHistoryPush(state, { blocks: newBlocks, selection: state.selection });
}

function applyMarkToBlockSegments(segments: any[], fromOff: number, toOff: number, mark: string, add: boolean) {
    const out: any[] = [];
    let consumed = 0;
    for (const seg of segments) {
        const segEnd = consumed + seg.text.length;
        if (segEnd <= fromOff || consumed >= toOff) {
            out.push(seg);
        } else {
            const a = Math.max(fromOff, consumed);
            const b = Math.min(toOff, segEnd);
            if (a > consumed) {
                out.push(
                    freezeSegment({ text: seg.text.slice(0, a - consumed), marks: seg.marks, linkUrl: seg.linkUrl }),
                );
            }
            const newMarks = new Set(seg.marks);
            if (add) newMarks.add(mark);
            else newMarks.delete(mark);
            out.push(
                freezeSegment({
                    text: seg.text.slice(a - consumed, b - consumed),
                    marks: newMarks,
                    linkUrl: seg.linkUrl,
                }),
            );
            if (b < segEnd) {
                out.push(freezeSegment({ text: seg.text.slice(b - consumed), marks: seg.marks, linkUrl: seg.linkUrl }));
            }
        }
        consumed = segEnd;
    }
    return out.filter((s: any) => s.text.length > 0) || [freezeSegment({ text: '', marks: new Set() })];
}

function rangeHasMarkAll(state: any, range: any, mark: string) {
    for (let i = range.startIdx; i <= range.endIdx; i += 1) {
        const b = state.blocks[i];
        const fromOff = i === range.startIdx ? range.startOffset : 0;
        const toOff = i === range.endIdx ? range.endOffset : blockTextLength(b);
        let consumed = 0;
        for (const seg of b.segments) {
            const segEnd = consumed + seg.text.length;
            if (segEnd > fromOff && consumed < toOff) {
                if (!seg.marks.has(mark)) return false;
            }
            consumed = segEnd;
        }
    }
    return true;
}

/** Change block type for all blocks in selection. */
export function setBlockType(state: any, blockType: string) {
    if (!VALID_BLOCK_TYPES.has(blockType)) throw new Error(`invalid block type: ${blockType}`);
    const range = normalizeRange(state);
    if (!range) return state;
    const newBlocks = state.blocks.map((b: any, i: number) => {
        if (i < range.startIdx || i > range.endIdx) return b;
        return freezeBlock({ id: b.id, type: blockType, segments: b.segments, indent: b.indent });
    });
    return withHistoryPush(state, { blocks: newBlocks, selection: state.selection });
}

/** Split current block at selection (Enter behavior). */
export function splitBlockAtSelection(state: any) {
    let s = state;
    const range = normalizeRange(s);
    if (!range) return s;
    if (!(range.startIdx === range.endIdx && range.startOffset === range.endOffset)) {
        s = deleteSelection(s);
        const past = s.history.past.slice(0, -1);
        s = freezeState({ blocks: s.blocks, selection: s.selection, history: { past, future: [] } });
    }
    const blockIdx = findBlockIndex(s, s.selection.anchor.blockId);
    const block = s.blocks[blockIdx];
    const offset = s.selection.anchor.offset;
    const { left, right } = splitSegmentsAt(block.segments, offset);
    const leftBlock = rebuildBlock(block, left.length ? left : [freezeSegment({ text: '', marks: new Set() })]);
    const rightBlock = freezeBlock({
        id: genBlockId(),
        type:
            block.type === 'heading-1' || block.type === 'heading-2' || block.type === 'heading-3'
                ? 'paragraph'
                : block.type,
        segments: right.length ? right : [freezeSegment({ text: '', marks: new Set() })],
        indent: block.indent,
    });
    const newBlocks = [...s.blocks.slice(0, blockIdx), leftBlock, rightBlock, ...s.blocks.slice(blockIdx + 1)];
    const sel = {
        anchor: { blockId: rightBlock.id, offset: 0 },
        focus: { blockId: rightBlock.id, offset: 0 },
    };
    return withHistoryPush(state, { blocks: newBlocks, selection: sel });
}

/** Merge two adjacent blocks (Backspace at start). */
export function mergeBlocks(state: any, blockId: any, otherId: any) {
    const aIdx = findBlockIndex(state, blockId);
    const bIdx = findBlockIndex(state, otherId);
    if (Math.abs(aIdx - bIdx) !== 1) throw new Error('mergeBlocks: blocks must be adjacent');
    const firstIdx = Math.min(aIdx, bIdx);
    const first = state.blocks[firstIdx];
    const second = state.blocks[firstIdx + 1];
    const firstLen = blockTextLength(first);
    const merged = rebuildBlock(first, joinSegments(first.segments, second.segments));
    const newBlocks = [...state.blocks.slice(0, firstIdx), merged, ...state.blocks.slice(firstIdx + 2)];
    const sel = {
        anchor: { blockId: merged.id, offset: firstLen },
        focus: { blockId: merged.id, offset: firstLen },
    };
    return withHistoryPush(state, { blocks: newBlocks, selection: sel });
}

/** Set selection (validates blockIds). */
export function setSelection(state: any, anchor: any, focus: any) {
    findBlockIndex(state, anchor.blockId);
    findBlockIndex(state, focus.blockId);
    return freezeState({
        blocks: state.blocks,
        selection: {
            anchor: { blockId: anchor.blockId, offset: Math.max(0, anchor.offset | 0) },
            focus: { blockId: focus.blockId, offset: Math.max(0, focus.offset | 0) },
        },
        history: state.history,
    });
}

/** Undo: pops past, pushes current to future. */
export function undo(state: any) {
    if (state.history.past.length === 0) return state;
    const past = [...state.history.past];
    const prev = past.pop();
    const future = [{ blocks: state.blocks, selection: state.selection }, ...state.history.future].slice(
        0,
        MAX_HISTORY,
    );
    return freezeState({ blocks: prev.blocks, selection: prev.selection, history: { past, future } });
}

/** Redo: pops future, pushes current to past. */
export function redo(state: any) {
    if (state.history.future.length === 0) return state;
    const future = [...state.history.future];
    const next = future.shift();
    const past = [...state.history.past, { blocks: state.blocks, selection: state.selection }].slice(-MAX_HISTORY);
    return freezeState({ blocks: next.blocks, selection: next.selection, history: { past, future } });
}

export function canUndo(state: any) {
    return state.history.past.length > 0;
}

export function canRedo(state: any) {
    return state.history.future.length > 0;
}

/** Serialize blocks to plain text with \n between blocks. */
export function serializeToPlainText(state: any) {
    return state.blocks
        .map((b: any) => {
            if (b.type === 'divider') return '---';
            return b.segments.map((s: any) => s.text).join('');
        })
        .join('\n');
}

function getCollapsedActiveMarks(block: any, offset: number): Set<string> {
    let consumed = 0;
    for (const seg of block.segments) {
        const segEnd = consumed + seg.text.length;
        if (offset > consumed && offset <= segEnd) {
            return new Set(seg.marks);
        }
        consumed = segEnd;
    }
    // At offset 0 of empty block: first segment's marks
    const firstSegment = block.segments[0];
    return new Set(firstSegment ? firstSegment.marks : []);
}

function intersectWithSegmentMarks(intersection: Set<string>, seg: any): Set<string> {
    const next = new Set<string>();
    for (const m of intersection) {
        if (seg.marks.has(m)) next.add(m);
    }
    return next;
}

function getRangeActiveMarks(blocks: any[], range: any): Set<string> {
    let intersection: Set<string> | null = null;
    for (let i = range.startIdx; i <= range.endIdx; i += 1) {
        const b = blocks[i];
        if (!b) continue;
        const fromOff = i === range.startIdx ? range.startOffset : 0;
        const toOff = i === range.endIdx ? range.endOffset : blockTextLength(b);
        let consumed = 0;
        for (const seg of b.segments) {
            const segEnd = consumed + seg.text.length;
            if (segEnd > fromOff && consumed < toOff) {
                intersection = intersection === null ? new Set(seg.marks) : intersectWithSegmentMarks(intersection, seg);
            }
            consumed = segEnd;
        }
    }
    return intersection || new Set();
}

/** Returns Set of marks active at caret (intersection across selection). */
export function getActiveMarks(state: any) {
    if (!state.selection) return new Set();
    const range = normalizeRange(state);
    if (!range) return new Set();

    // Collapsed selection: marks of segment to left of caret
    if (range.startIdx === range.endIdx && range.startOffset === range.endOffset) {
        const block = state.blocks[range.startIdx];
        if (!block) return new Set();
        return getCollapsedActiveMarks(block, range.startOffset);
    }

    // Range: intersection of marks across all chars
    return getRangeActiveMarks(state.blocks, range);
}

/** Summary stats for editor state. */
export function summarizeEditor(state: any) {
    const blockCount = state.blocks.length;
    const charCount = state.blocks.reduce((sum: number, b: any) => sum + blockTextLength(b), 0);
    const sel = state.selection;
    const hasSelection = !!(
        sel && !(sel.anchor.blockId === sel.focus.blockId && sel.anchor.offset === sel.focus.offset)
    );
    return {
        blockCount,
        charCount,
        hasSelection,
        historyDepth: state.history.past.length,
    };
}

export const __internals = { VALID_MARKS, VALID_BLOCK_TYPES, MAX_HISTORY };
