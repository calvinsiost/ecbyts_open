// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// IMPORT-UX-001 RF-7 — Pré-análise do arquivo antes do pipeline de ingestão.
// Pure-logic: zero DOM, zero browser APIs. Callers compose File → FileDescriptor.

export type DetectedFileType = 'csv' | 'xlsx' | 'pdf' | 'json' | 'ifc' | 'vpp' | 'unknown';

export interface FileDescriptor {
    name: string;
    size: number;
    type?: string;
    head?: string | Uint8Array;
}

export interface PreAnalysisResult {
    type: DetectedFileType;
    size: number;
    encoding: string | null;
    preview: string[];
    warnings: string[];
}

const SIZE_WARN_BYTES = 50 * 1024 * 1024;
const PDF_PAGE_WARN = 100;
const PREVIEW_LINES = 5;

const EXT_MAP: Record<string, DetectedFileType> = {
    '.csv': 'csv',
    '.tsv': 'csv',
    '.xlsx': 'xlsx',
    '.xls': 'xlsx',
    '.pdf': 'pdf',
    '.json': 'json',
    '.geojson': 'json',
    '.ifc': 'ifc',
    '.vpp': 'vpp',
};

const MIME_MAP: Record<string, DetectedFileType> = {
    'text/csv': 'csv',
    'text/tab-separated-values': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xlsx',
    'application/pdf': 'pdf',
    'application/json': 'json',
    'application/geo+json': 'json',
};

function extOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function headToString(head: string | Uint8Array | undefined): string {
    if (head == null) return '';
    if (typeof head === 'string') return head;
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(head);
    } catch {
        return '';
    }
}

function headToBytes(head: string | Uint8Array | undefined): Uint8Array | null {
    if (head == null) return null;
    if (head instanceof Uint8Array) return head;
    try {
        return new TextEncoder().encode(head);
    } catch {
        return null;
    }
}

export function detectType(fd: FileDescriptor): DetectedFileType {
    const byExt = EXT_MAP[extOf(fd.name)];
    if (byExt) return byExt;

    if (fd.type && MIME_MAP[fd.type]) return MIME_MAP[fd.type] as DetectedFileType;

    const bytes = headToBytes(fd.head);
    if (bytes && bytes.length >= 4) {
        if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
        if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'xlsx';
    }

    const text = headToString(fd.head).trimStart();
    if (text.startsWith('{') || text.startsWith('[')) {
        try {
            JSON.parse(text.length > 4096 ? text.slice(0, 4096) + ']' : text);
            return 'json';
        } catch {
            if (text.startsWith('{') || text.startsWith('[')) return 'json';
        }
    }
    if (text.startsWith('ISO-10303-21') || text.includes('IFC2X') || text.includes('IFC4')) return 'ifc';

    return 'unknown';
}

export function detectEncoding(fd: FileDescriptor): string | null {
    const bytes = headToBytes(fd.head);
    if (!bytes || bytes.length < 2) return null;

    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8-bom';
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

    const type = detectType(fd);
    if (type === 'csv' || type === 'json' || type === 'ifc') {
        let highCount = 0;
        const sample = bytes.subarray(0, Math.min(bytes.length, 2048));
        for (let i = 0; i < sample.length; i++) {
            if (sample[i]! > 0x7e) highCount++;
        }
        if (highCount > sample.length * 0.1) return 'latin-1-suspect';
        return 'utf-8';
    }

    return null;
}

export function estimatePdfPages(head: string | Uint8Array | undefined): number | null {
    const text = headToString(head);
    if (!text) return null;

    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch) return parseInt(countMatch[1]!, 10);

    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches && pageMatches.length > 0) return pageMatches.length;

    return null;
}

export function buildPreview(fd: FileDescriptor, type: DetectedFileType): string[] {
    if (type === 'xlsx') return ['Planilha Excel (binário — preview indisponível)'];
    if (type === 'vpp') return ['Projeto Visual Paradigm (binário — preview indisponível)'];

    const text = headToString(fd.head);
    if (!text) return [];

    switch (type) {
        case 'csv': {
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            return lines.slice(0, PREVIEW_LINES);
        }
        case 'json': {
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            return lines.slice(0, PREVIEW_LINES);
        }
        case 'pdf': {
            const out: string[] = [];
            const ver = text.match(/%PDF-(\d+\.\d+)/);
            if (ver) out.push(`PDF ${ver[1]!}`);
            const pages = estimatePdfPages(fd.head);
            if (pages != null) out.push(`${pages} página(s) estimada(s)`);
            return out;
        }
        case 'ifc': {
            const out: string[] = [];
            const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
            if (schema) out.push(`Schema: ${schema[1]!}`);
            else out.push('IFC (STEP)');
            return out;
        }
        default:
            return [];
    }
}

export function buildWarnings(fd: FileDescriptor, type: DetectedFileType, encoding: string | null): string[] {
    const w: string[] = [];

    if (fd.size === 0) {
        w.push('Arquivo vazio (0 bytes).');
        return w;
    }

    if (fd.size > SIZE_WARN_BYTES) {
        w.push(`Arquivo muito grande (${(fd.size / (1024 * 1024)).toFixed(1)} MB). O processamento pode demorar vários minutos.`);
    }

    if (type === 'unknown') {
        w.push('Tipo de arquivo não reconhecido. Formatos aceitos: CSV, XLSX, PDF, JSON, IFC, VPP.');
    }

    if (encoding === 'latin-1-suspect') {
        w.push('Encoding suspeito (possível Latin-1/Windows-1252). Caracteres acentuados podem ser corrompidos.');
    }

    if (type === 'pdf') {
        const pages = estimatePdfPages(fd.head);
        if (pages != null && pages > PDF_PAGE_WARN) {
            w.push(`PDF com ${pages} páginas (> ${PDF_PAGE_WARN}). Considere importar um intervalo de páginas.`);
        }
    }

    return w;
}

export function preAnalyze(fd: FileDescriptor): PreAnalysisResult {
    const type = detectType(fd);
    const encoding = detectEncoding(fd);
    const preview = buildPreview(fd, type);
    const warnings = buildWarnings(fd, type, encoding);

    return {
        type,
        size: fd.size,
        encoding,
        preview,
        warnings,
    };
}
