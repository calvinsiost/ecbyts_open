// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PATH TRAVERSAL GUARD (utils/helpers — cross-spec pure-logic)
   ================================================================

   Prevenção de directory traversal (CWE-22, CWE-23). Detecta:
     - Parent traversal (../, ..\\, percent-encoded %2e%2e/, etc.)
     - Absolute paths (/etc/passwd, C:\\...)
     - Null bytes (\\x00 — trunca string em C-based libs)
     - Control chars (< 0x20)
     - Reserved Windows names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
     - Path too long (anti-DoS)
     - UNC paths (\\\\server\\share)

   Cross-spec consumers:
     - utils/files/* (file upload/download)
     - supabase/functions/* (storage upload paths)
     - core/io/* (export filename sanitization)
     - utils/api/* (any user-provided path)
     - core/photolog/* (photo file naming)
     - core/ingestion/documents/* (PDF/DOCX path validation)

   Pure-logic: caller injeta path string + optional rootDir. Sem fs.
   Sem path.resolve nativo (cross-platform unsafe). Determinístico.

   IMPORTANTE: NÃO substitui filesystem permission. Defesa em
   profundidade — caller AINDA deve verificar permissões reais
   no fs após esta validação.

   Reference: OWASP Path Traversal Prevention + CWE-22.
   ================================================================ */

export const MAX_PATH_LEN = 1024;
export const MAX_FILENAME_LEN = 255;

export const RESERVED_WINDOWS_NAMES: readonly string[] = Object.freeze([
    'con', 'prn', 'aux', 'nul',
    'com0', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt0', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export type PathSafetyAction = 'allow' | 'deny';

export type PathReason =
    | 'empty'
    | 'too_long'
    | 'absolute_path'
    | 'parent_traversal'
    | 'null_byte'
    | 'control_chars'
    | 'invalid_chars'
    | 'reserved_name'
    | 'unc_path'
    | 'escapes_root'
    | 'safe';

export interface PathSafetyVerdict {
    readonly action: PathSafetyAction;
    readonly reason: PathReason;
    readonly normalized: string;
}

export interface PathOptions {
    readonly rootDir?: string;
    readonly allowAbsolute?: boolean;
    readonly maxLength?: number;
    readonly allowedExtensions?: readonly string[];
}

function clampMaxLength(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return MAX_PATH_LEN;
    if (value > MAX_PATH_LEN) return MAX_PATH_LEN;
    return Math.floor(value);
}

function decodePercentEncoding(input: string): string {
    try {
        let decoded = input;
        for (let i = 0; i < 3; i++) {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        }
        return decoded;
    } catch {
        return input;
    }
}

export function containsNullByte(input: string): boolean {
    if (typeof input !== 'string') return false;
    return input.indexOf('\x00') >= 0;
}

export function containsControlChars(input: string): boolean {
    if (typeof input !== 'string') return false;
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

export function containsTraversal(input: string): boolean {
    if (typeof input !== 'string' || input.length === 0) return false;
    const decoded = decodePercentEncoding(input);
    if (decoded.includes('../') || decoded.includes('..\\')) return true;
    if (decoded === '..') return true;
    const segments = decoded.split(/[\\/]/);
    for (const seg of segments) {
        if (seg === '..') return true;
    }
    return false;
}

export function isAbsolutePath(input: string): boolean {
    if (typeof input !== 'string' || input.length === 0) return false;
    if (input.startsWith('/')) return true;
    if (/^[A-Za-z]:[\\/]/.test(input)) return true;
    if (input.startsWith('\\\\') || input.startsWith('//')) return true;
    return false;
}

export function isUncPath(input: string): boolean {
    if (typeof input !== 'string') return false;
    return input.startsWith('\\\\') || input.startsWith('//');
}

export function isReservedWindowsName(name: string): boolean {
    if (typeof name !== 'string' || name.length === 0) return false;
    const base = name.toLowerCase().split('.')[0]!;
    return RESERVED_WINDOWS_NAMES.includes(base);
}

export function normalizePath(input: unknown): string {
    if (typeof input !== 'string' || input.length === 0) return '';
    const decoded = decodePercentEncoding(input).replace(/\\/g, '/');
    const segments = decoded.split('/').filter(s => s !== '' && s !== '.');
    const stack: string[] = [];
    for (const seg of segments) {
        if (seg === '..') {
            if (stack.length > 0) stack.pop();
        } else {
            stack.push(seg);
        }
    }
    return stack.join('/');
}

export function sanitizeFilename(name: unknown): string {
    if (typeof name !== 'string' || name.length === 0) return '';
    let safe = name
        // eslint-disable-next-line no-control-regex -- intentional: strip C0/DEL control chars from filenames (security)
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\.+$/, '')
        .replace(/^\.+/, '');
    if (safe.length > MAX_FILENAME_LEN) safe = safe.slice(0, MAX_FILENAME_LEN);
    if (isReservedWindowsName(safe)) safe = `_${safe}`;
    return safe;
}

function endsWithAllowedExtension(filename: string, allowed: readonly string[] | undefined): boolean {
    if (!allowed || allowed.length === 0) return true;
    const lower = filename.toLowerCase();
    return allowed.some(ext => {
        const norm = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
        return lower.endsWith(norm);
    });
}

export function decidePathSafety(input: unknown, options?: PathOptions): PathSafetyVerdict {
    if (typeof input !== 'string' || input.length === 0) {
        return Object.freeze({ action: 'deny' as const, reason: 'empty' as PathReason, normalized: '' });
    }
    const maxLen = clampMaxLength(options?.maxLength);
    if (input.length > maxLen) {
        return Object.freeze({ action: 'deny' as const, reason: 'too_long' as PathReason, normalized: '' });
    }
    if (containsNullByte(input)) {
        return Object.freeze({ action: 'deny' as const, reason: 'null_byte' as PathReason, normalized: '' });
    }
    if (containsControlChars(input)) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'control_chars' as PathReason,
            normalized: '',
        });
    }
    if (isUncPath(input)) {
        return Object.freeze({ action: 'deny' as const, reason: 'unc_path' as PathReason, normalized: '' });
    }
    if (isAbsolutePath(input) && !options?.allowAbsolute) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'absolute_path' as PathReason,
            normalized: '',
        });
    }
    if (containsTraversal(input)) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'parent_traversal' as PathReason,
            normalized: '',
        });
    }
    const normalized = normalizePath(input);
    const lastSegment = normalized.split('/').pop() ?? '';
    if (isReservedWindowsName(lastSegment)) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'reserved_name' as PathReason,
            normalized,
        });
    }
    if (options?.allowedExtensions && !endsWithAllowedExtension(lastSegment, options.allowedExtensions)) {
        return Object.freeze({
            action: 'deny' as const,
            reason: 'invalid_chars' as PathReason,
            normalized,
        });
    }
    if (options?.rootDir) {
        const rootNorm = normalizePath(options.rootDir);
        if (rootNorm.length > 0) {
            const combined = `${rootNorm}/${normalized}`;
            const finalNorm = normalizePath(combined);
            if (!finalNorm.startsWith(`${rootNorm}/`) && finalNorm !== rootNorm) {
                return Object.freeze({
                    action: 'deny' as const,
                    reason: 'escapes_root' as PathReason,
                    normalized,
                });
            }
        }
    }
    return Object.freeze({ action: 'allow' as const, reason: 'safe' as PathReason, normalized });
}

export function isPathSafe(input: unknown, options?: PathOptions): boolean {
    return decidePathSafety(input, options).action === 'allow';
}
