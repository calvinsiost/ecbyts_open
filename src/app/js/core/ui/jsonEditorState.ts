// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-78 - JSON Editor State (pure-logic, zero DOM)
 *
 * Editor de JSON com parser tolerante, formatter, navegacao por
 * JSON Pointer (RFC 6901), validacao de schema simples e diff.
 * Imutavel: todas as operacoes retornam novas estruturas.
 */

// ---------- Parse ----------

/**
 * Parse JSON estrito com mensagem de erro util (linha/coluna/posicao).
 */
export function parseJsonStrict(text: string): {
    valid: boolean;
    value?: any;
    error?: { message: string; line: number; column: number; position: number };
} {
    if (typeof text !== 'string') {
        return { valid: false, error: { message: 'Input must be a string', line: 1, column: 1, position: 0 } };
    }
    try {
        const value = JSON.parse(text);
        return { valid: true, value };
    } catch (err: any) {
        const msg = err && err.message ? err.message : String(err);
        const pos = extractErrorPosition(msg, text);
        const { line, column } = positionToLineCol(text, pos);
        return { valid: false, error: { message: msg, line, column, position: pos } };
    }
}

function extractErrorPosition(message: string, text: string) {
    const match = /position\s+(\d+)/i.exec(message);
    if (match) {
        const p = parseInt(match[1] as string, 10);
        return Math.max(0, Math.min(p, text.length));
    }
    return 0;
}

function positionToLineCol(text: string, position: number) {
    let line = 1;
    let column = 1;
    const limit = Math.min(position, text.length);
    for (let i = 0; i < limit; i++) {
        if (text[i] === '\n') {
            line++;
            column = 1;
        } else {
            column++;
        }
    }
    return { line, column };
}

// ---------- Format ----------

/**
 * Formata valor como JSON.
 */
export function formatJson(value: any, opts: { indent?: number; sortKeys?: boolean } = {}): string {
    const indent = typeof opts.indent === 'number' ? opts.indent : 2;
    const sortKeys = !!opts.sortKeys;
    if (!sortKeys) return JSON.stringify(value, null, indent);
    return JSON.stringify(sortValueKeys(value), null, indent);
}

function sortValueKeys(v: any): any {
    if (Array.isArray(v)) return v.map(sortValueKeys);
    if (v && typeof v === 'object') {
        const out: Record<string, any> = {};
        for (const k of Object.keys(v).sort()) out[k] = sortValueKeys(v[k]);
        return out;
    }
    return v;
}

// ---------- JSON Pointer (RFC 6901) ----------

/**
 * Parse de JSON Pointer em tokens. '~1'->'/', '~0'->'~'.
 */
export function parseJsonPointer(pointer: string): string[] {
    if (typeof pointer !== 'string') {
        throw new Error('JSON pointer must be a string');
    }
    if (pointer === '') return [];
    if (pointer[0] !== '/') {
        throw new Error('JSON pointer must start with "/" or be empty');
    }
    return pointer
        .slice(1)
        .split('/')
        .map((tok: string) => tok.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function escapeToken(tok: any) {
    return String(tok).replace(/~/g, '~0').replace(/\//g, '~1');
}

export function getValueAtPointer(obj: any, pointer: string) {
    const tokens = parseJsonPointer(pointer);
    let cur = obj;
    for (const tok of tokens) {
        if (cur === null || cur === undefined) return undefined;
        if (Array.isArray(cur)) {
            const idx = tok === '-' ? cur.length : parseInt(tok, 10);
            if (Number.isNaN(idx)) return undefined;
            cur = cur[idx];
        } else if (typeof cur === 'object') {
            if (!Object.prototype.hasOwnProperty.call(cur, tok)) return undefined;
            cur = cur[tok];
        } else {
            return undefined;
        }
    }
    return cur;
}

function cloneShallow(v: any) {
    if (Array.isArray(v)) return v.slice();
    if (v && typeof v === 'object') return { ...v };
    return v;
}

/**
 * Imutavel; cria caminho em objetos quando ausente; OOB em array lanca.
 */
export function setValueAtPointer(obj: any, pointer: string, value: any) {
    const tokens = parseJsonPointer(pointer);
    if (tokens.length === 0) return value;
    const root = cloneShallow(obj == null ? {} : obj);
    let cur = root;
    for (let i = 0; i < tokens.length - 1; i++) {
        const tok = tokens[i] as string;
        if (Array.isArray(cur)) {
            const idx = parseInt(tok, 10);
            if (Number.isNaN(idx) || idx < 0 || idx >= cur.length) {
                throw new Error(`Invalid array index "${tok}" at pointer segment ${i}`);
            }
            const next = cloneShallow(cur[idx] == null ? {} : cur[idx]);
            cur[idx] = next;
            cur = next;
        } else if (cur && typeof cur === 'object') {
            const existing = cur[tok];
            const next = cloneShallow(existing == null ? {} : existing);
            cur[tok] = next;
            cur = next;
        } else {
            throw new Error(`Cannot traverse non-object at segment "${tok}"`);
        }
    }
    const last = tokens[tokens.length - 1] as string;
    if (Array.isArray(cur)) {
        const idx = last === '-' ? cur.length : parseInt(last, 10);
        if (Number.isNaN(idx) || idx < 0 || idx > cur.length) {
            throw new Error(`Invalid array index "${last}"`);
        }
        cur[idx] = value;
    } else if (cur && typeof cur === 'object') {
        cur[last] = value;
    } else {
        throw new Error('Cannot set value on non-object');
    }
    return root;
}

export function removeAtPointer(obj: any, pointer: string) {
    const tokens = parseJsonPointer(pointer);
    if (tokens.length === 0) return undefined;
    const root = cloneShallow(obj);
    let cur = root;
    for (let i = 0; i < tokens.length - 1; i++) {
        const tok = tokens[i] as string;
        if (Array.isArray(cur)) {
            const idx = parseInt(tok, 10);
            if (Number.isNaN(idx) || idx < 0 || idx >= cur.length) {
                throw new Error(`Invalid array index "${tok}"`);
            }
            const next = cloneShallow(cur[idx]);
            cur[idx] = next;
            cur = next;
        } else if (cur && typeof cur === 'object') {
            if (!Object.prototype.hasOwnProperty.call(cur, tok)) {
                throw new Error(`Path segment "${tok}" not found`);
            }
            const next = cloneShallow(cur[tok]);
            cur[tok] = next;
            cur = next;
        } else {
            throw new Error('Cannot traverse non-object');
        }
    }
    const last = tokens[tokens.length - 1] as string;
    if (Array.isArray(cur)) {
        const idx = parseInt(last, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= cur.length) {
            throw new Error(`Invalid array index "${last}"`);
        }
        cur.splice(idx, 1);
    } else if (cur && typeof cur === 'object') {
        if (!Object.prototype.hasOwnProperty.call(cur, last)) {
            throw new Error(`Property "${last}" not found`);
        }
        delete cur[last];
    }
    return root;
}

/**
 * Lista todos os JSON Pointers (depth-first).
 */
export function getAllPaths(obj: any, prefix: string = ''): string[] {
    const out: string[] = [];
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return prefix ? [prefix] : [];
    }
    if (prefix) out.push(prefix);
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const child = `${prefix}/${i}`;
            const v = obj[i];
            if (v && typeof v === 'object') {
                out.push(...getAllPaths(v, child));
            } else {
                out.push(child);
            }
        }
    } else {
        for (const k of Object.keys(obj)) {
            const child = `${prefix}/${escapeToken(k)}`;
            const v = obj[k];
            if (v && typeof v === 'object') {
                out.push(...getAllPaths(v, child));
            } else {
                out.push(child);
            }
        }
    }
    return out;
}

// ---------- Schema validation (simples) ----------

export function validateAgainstSchema(
    obj: any,
    schema: object,
): { valid: boolean; errors: Array<{ path: string; message: string }> } {
    const errors: Array<{ path: string; message: string }> = [];
    validateNode(obj, schema, '', errors);
    return { valid: errors.length === 0, errors };
}

function jsonType(v: any) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (Number.isInteger(v)) return 'integer';
    return typeof v;
}

function validateNode(
    value: any,
    schema: any,
    path: string,
    errors: Array<{ path: string; message: string }>,
): void {
    if (!schema || typeof schema !== 'object') return;
    if (schema.type) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        const actual = jsonType(value);
        const ok = types.some((t: any) => t === actual || (t === 'number' && actual === 'integer'));
        if (!ok) {
            errors.push({ path: path || '/', message: `Expected type ${types.join('|')} but got ${actual}` });
            return;
        }
    }
    if (schema.enum && Array.isArray(schema.enum)) {
        if (!schema.enum.some((e: any) => deepEqual(e, value))) {
            errors.push({ path: path || '/', message: `Value not in enum [${schema.enum.join(', ')}]` });
        }
    }
    if (typeof value === 'number') {
        if (typeof schema.minimum === 'number' && value < schema.minimum) {
            errors.push({ path: path || '/', message: `Value ${value} < minimum ${schema.minimum}` });
        }
        if (typeof schema.maximum === 'number' && value > schema.maximum) {
            errors.push({ path: path || '/', message: `Value ${value} > maximum ${schema.maximum}` });
        }
    }
    if (typeof value === 'string' && schema.pattern) {
        try {
            const re = new RegExp(schema.pattern);
            if (!re.test(value)) {
                errors.push({ path: path || '/', message: `String does not match pattern ${schema.pattern}` });
            }
        } catch (e: any) {
            console.debug('[jsonEditorState] regexPattern:', e?.message || e);
            // pattern invalido - ignora
        }
    }
    if (jsonType(value) === 'object' && schema.properties) {
        if (Array.isArray(schema.required)) {
            for (const req of schema.required) {
                if (!Object.prototype.hasOwnProperty.call(value, req)) {
                    errors.push({ path: `${path}/${escapeToken(req)}`, message: `Missing required property "${req}"` });
                }
            }
        }
        for (const k of Object.keys(schema.properties)) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                validateNode(value[k], schema.properties[k], `${path}/${escapeToken(k)}`, errors);
            }
        }
    }
    if (Array.isArray(value) && schema.items) {
        for (let i = 0; i < value.length; i++) {
            validateNode(value[i], schema.items, `${path}/${i}`, errors);
        }
    }
}

// ---------- Diff ----------

function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
        if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
}

/**
 * Diff basico entre a e b - retorna add/remove/change por path.
 */
export function diffJson(
    a: any,
    b: any,
): Array<{ path: string; type: 'add' | 'remove' | 'change'; oldValue?: any; newValue?: any }> {
    const out: Array<{ path: string; type: 'add' | 'remove' | 'change'; oldValue?: any; newValue?: any }> = [];
    diffNode(a, b, '', out);
    return out;
}

function diffNode(
    a: any,
    b: any,
    path: string,
    out: Array<{ path: string; type: 'add' | 'remove' | 'change'; oldValue?: any; newValue?: any }>,
): void {
    if (deepEqual(a, b)) return;
    const ta = jsonType(a);
    const tb = jsonType(b);
    const isObjA = ta === 'object' || ta === 'array';
    const isObjB = tb === 'object' || tb === 'array';
    if (!isObjA || !isObjB || ta !== tb) {
        out.push({ path: path || '/', type: 'change', oldValue: a, newValue: b });
        return;
    }
    if (ta === 'array') {
        const max = Math.max(a.length, b.length);
        for (let i = 0; i < max; i++) {
            const child = `${path}/${i}`;
            if (i >= a.length) out.push({ path: child, type: 'add', newValue: b[i] });
            else if (i >= b.length) out.push({ path: child, type: 'remove', oldValue: a[i] });
            else diffNode(a[i], b[i], child, out);
        }
        return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        const child = `${path}/${escapeToken(k)}`;
        const inA = Object.prototype.hasOwnProperty.call(a, k);
        const inB = Object.prototype.hasOwnProperty.call(b, k);
        if (inA && !inB) out.push({ path: child, type: 'remove', oldValue: a[k] });
        else if (!inA && inB) out.push({ path: child, type: 'add', newValue: b[k] });
        else diffNode(a[k], b[k], child, out);
    }
}

// ---------- Utilidades ----------

/**
 * Snippet de erro com '^' apontando posicao.
 */
export function prettifyError(
    text: string,
    error: { line: number; column: number; position: number; message?: string },
): string {
    if (!error) return '';
    const lines = String(text).split('\n');
    const lineIdx = Math.max(0, (error.line || 1) - 1);
    const line = lines[lineIdx] || '';
    const col = Math.max(1, error.column || 1);
    const pointer = ' '.repeat(col - 1) + '^';
    const header = `Line ${error.line}, Column ${error.column}: ${error.message || ''}`;
    return `${header}\n${line}\n${pointer}`;
}

export function summarizeJson(obj: any): {
    nodeCount: number;
    depth: number;
    type: string;
    byType: Record<string, number>;
} {
    const byType: Record<string, number> = {};
    let nodeCount = 0;
    let maxDepth = 0;
    function walk(v: any, d: number) {
        nodeCount++;
        if (d > maxDepth) maxDepth = d;
        const t = jsonType(v);
        byType[t] = (byType[t] || 0) + 1;
        if (Array.isArray(v)) {
            for (const it of v) walk(it, d + 1);
        } else if (v && typeof v === 'object') {
            for (const k of Object.keys(v)) walk(v[k], d + 1);
        }
    }
    walk(obj, 0);
    return { nodeCount, depth: maxDepth, type: jsonType(obj), byType };
}
