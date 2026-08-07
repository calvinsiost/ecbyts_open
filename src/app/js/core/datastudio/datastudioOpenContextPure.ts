// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export type DataStudioModuleId = 'extraction' | 'processing' | 'analytics' | 'radar';

export interface DataStudioOpenContext {
    readonly moduleId: DataStudioModuleId;
    readonly hasContext: boolean;
    readonly label: string;
    readonly hint: string;
    readonly returnLabel: string;
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly source: string;
    readonly purpose: string;
    readonly rawInput: unknown;
}

const VALID_MODULES = new Set(['extraction', 'processing', 'analytics', 'radar']);
const MODULE_ALIASES: Readonly<Record<string, DataStudioModuleId>> = Object.freeze({
    collection: 'extraction',
    intake: 'extraction',
});

function text(value: unknown, fallback = ''): string {
    return String(value ?? fallback).trim();
}

function numberOrNull(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function readObjectValue(input: Record<string, unknown>, keys: readonly string[], fallback = ''): string {
    for (const key of keys) {
        const value = text(input[key]);
        if (value) return value;
    }
    return fallback;
}

function normalizeModule(value: unknown): DataStudioModuleId {
    const raw = text(value, 'processing').toLowerCase();
    const aliased = MODULE_ALIASES[raw] || raw;
    return (VALID_MODULES.has(aliased) ? aliased : 'processing') as DataStudioModuleId;
}

function buildHint(input: {
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly purpose: string;
}): string {
    const parts: string[] = [];
    if (input.course) parts.push(`curso ${input.course}`);
    if (input.slide) parts.push(`slide ${input.slide}`);
    if (input.presetId) parts.push(`preset ${input.presetId}`);
    if (input.purpose) parts.push(`uso ${input.purpose}`);
    return parts.length ? `Aberto a partir da aula: ${parts.join(' · ')}.` : '';
}

function computeHasContext(fields: {
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly source: string;
    readonly purpose: string;
}): boolean {
    return Boolean(fields.course || fields.slide || fields.presetId || fields.source === 'training' || fields.purpose);
}

function buildEmptyContext(input: unknown): DataStudioOpenContext {
    return Object.freeze({
        moduleId: normalizeModule(input),
        hasContext: false,
        label: '',
        hint: '',
        returnLabel: 'Voltar',
        course: '',
        slide: null,
        presetId: '',
        source: '',
        purpose: '',
        rawInput: input,
    });
}

interface ExtractedFields {
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly source: string;
    readonly purpose: string;
}

function extractFields(obj: Record<string, unknown>): ExtractedFields {
    return {
        course: readObjectValue(obj, ['course', 'courseId', 'trainingId']),
        slide: numberOrNull(obj.slide ?? obj.slideNumber ?? obj.lessonNumber),
        presetId: readObjectValue(obj, ['presetId', 'modelPresetId', 'preset']),
        source: readObjectValue(obj, ['source', 'origin']),
        purpose: readObjectValue(obj, ['purpose', 'mode']),
    };
}

function buildContextFromObject(input: Record<string, unknown>): DataStudioOpenContext {
    const moduleId = normalizeModule(input.module ?? input.moduleId ?? input.id ?? input.target);
    const fields = extractFields(input);
    const hasContext = computeHasContext(fields);
    const label = readObjectValue(input, ['label', 'contextLabel'], hasContext ? 'DataStudio da aula' : '');
    const returnLabel = readObjectValue(input, ['returnLabel'], hasContext ? 'Voltar ao slide' : 'Voltar');
    const explicitHint = readObjectValue(input, ['hint', 'contextHint']);
    const hint = explicitHint || (hasContext ? buildHint(fields) : '');

    return Object.freeze({
        moduleId,
        hasContext,
        label,
        hint,
        returnLabel,
        course: fields.course,
        slide: fields.slide,
        presetId: fields.presetId,
        source: fields.source,
        purpose: fields.purpose,
        rawInput: input,
    });
}

export function normalizeDataStudioOpenContext(input: unknown): DataStudioOpenContext {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return buildEmptyContext(input);
    }

    return buildContextFromObject(input as Record<string, unknown>);
}
