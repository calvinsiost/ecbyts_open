// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Analytics Library Adapter - bridge between AnalyticsModuleMeta exports
// and the utils/libraries marketplace manifest format.
//
// Spec: SPEC_TYPESCRIPT_MIGRATION_PROGRAM.md "Analytics Library Exposure".

import type {
    AnalyticsJsonSchema,
    AnalyticsModuleEntry,
    AnalyticsModuleMeta,
} from '../../../../../types/app/analytics-library.js';

export interface AnalyticsLibraryManifestItem {
    id: string;
    name: string;
    description: string;
    familyTags: string[];
    path: string;
    schema: {
        input: AnalyticsJsonSchema;
        output: AnalyticsJsonSchema;
    };
    provenance: AnalyticsModuleMeta['provenance'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function schemaHasProperties(schema: AnalyticsJsonSchema): boolean {
    return Object.keys(schema.properties || {}).length > 0;
}

/**
 * Validate an AnalyticsModuleMeta at runtime. Returns an empty array when valid.
 * Used by the registry seed step and by cheap gates to catch regressions early.
 */
export function validateAnalyticsMeta(meta: unknown): string[] {
    const errors: string[] = [];
    if (!isRecord(meta)) {
        return ['meta must be a non-null object'];
    }

    if (typeof meta.name !== 'string' || !meta.name) errors.push('meta.name must be a non-empty string');
    if (typeof meta.description !== 'string') errors.push('meta.description must be a string');
    if (meta.category !== 'analytics') errors.push("meta.category must equal 'analytics'");
    if (!Array.isArray(meta.familyTags)) errors.push('meta.familyTags must be an array');

    if (!isRecord(meta.provenance)) {
        errors.push('meta.provenance must be an object');
    } else {
        const provenance = meta.provenance;
        if (typeof provenance.generatedBy !== 'string') errors.push('meta.provenance.generatedBy must be a string');
        if (typeof provenance.version !== 'string') errors.push('meta.provenance.version must be a string');
        if (typeof provenance.validatedByHuman !== 'boolean') {
            errors.push('meta.provenance.validatedByHuman must be a boolean');
        }
        if (typeof provenance.disclaimerAcknowledged !== 'boolean') {
            errors.push('meta.provenance.disclaimerAcknowledged must be a boolean');
        }
        if (typeof provenance.specRef !== 'string') errors.push('meta.provenance.specRef must be a string');
    }

    if (!isRecord(meta.inputSchema)) errors.push('meta.inputSchema must be an object');
    if (!isRecord(meta.outputSchema)) errors.push('meta.outputSchema must be an object');
    return errors;
}

/**
 * Determine if a module is publishable to the public Library marketplace.
 * Requires populated input/output schemas and human validation.
 */
export function isPublishable(meta: AnalyticsModuleMeta): boolean {
    if (!meta || meta.category !== 'analytics') return false;
    return (
        schemaHasProperties(meta.inputSchema) &&
        schemaHasProperties(meta.outputSchema) &&
        meta.provenance.validatedByHuman === true
    );
}

/**
 * Convert an analytics module entry into a Library manifest fragment compatible
 * with app/js/utils/libraries/loader.js.
 */
export function toLibraryManifestItem(entry: AnalyticsModuleEntry): AnalyticsLibraryManifestItem {
    const meta = entry.meta;
    return {
        id: meta.name,
        name: meta.name,
        description: meta.description,
        familyTags: [...meta.familyTags],
        path: entry.sourcePath,
        schema: {
            input: meta.inputSchema,
            output: meta.outputSchema,
        },
        provenance: { ...meta.provenance },
    };
}

/**
 * Build a registry entry from an imported module namespace and source path.
 * The namespace must export a <basename>Meta constant matching AnalyticsModuleMeta.
 */
export function buildRegistryEntry(mod: unknown, sourcePath: string): AnalyticsModuleEntry | null {
    if (!isRecord(mod)) return null;
    const metaKey = Object.keys(mod).find((key) => key.endsWith('Meta'));
    if (!metaKey) return null;

    const meta = mod[metaKey] as AnalyticsModuleMeta;
    const errors = validateAnalyticsMeta(meta);
    if (errors.length > 0) return null;

    return {
        meta,
        module: mod,
        sourcePath,
    };
}
