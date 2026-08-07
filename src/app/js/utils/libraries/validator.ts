// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global require */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   LIBRARY MANIFEST VALIDATOR
   Validacao de manifesto de bibliotecas

   Valida estrutura, campos obrigatorios, formato de versao,
   dependencias e conflitos de ID antes da instalacao.
   ================================================================ */

// ----------------------------------------------------------------
// MANIFEST SCHEMA
// Campos obrigatorios e formatos esperados
// ----------------------------------------------------------------

const REQUIRED_FIELDS = ['ecbytsLibrary', 'id', 'name', 'version', 'contents'];

const VALID_LOCK_TYPES = ['ticker_badge', 'parameter_value', 'family_enabled', 'module', 'disclaimer'];
const VALID_LOCK_LEVELS = ['display', 'value', 'module'];

// eslint-disable-next-line
const VALID_CONTENT_SECTIONS = [
    'families',
    'elements',
    'units',
    'parameters',
    'validationRules',
    'agents',
    'chatTools',
    'tickerItems',
    'reportTemplate',
    'i18n',
    'lockedFields',
    'bots',
    'imagery',
    'vectorLayers',
    'taxonomies',
    'naturalAssetCatalog',
];

type LibraryManifest = Record<string, any>;
interface InstalledLibrary {
    manifest: LibraryManifest;
    active?: boolean;
    injectedIds?: { families?: string[]; parameters?: string[]; units?: string[] };
}

// ----------------------------------------------------------------
// SEMVER UTILITIES
// Comparacao simples de versoes semanticas
// ----------------------------------------------------------------

/**
 * Parse semver string to [major, minor, patch].
 * @param {string} v - Version string like "1.2.3"
 * @returns {number[]} [major, minor, patch]
 */
function parseSemver(v: string): number[] {
    const match = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1]!), parseInt(match[2]!), parseInt(match[3]!)];
}

/**
 * Compare two semver arrays. Returns -1, 0, or 1.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function compareSemver(a: number[], b: number[]): number {
    for (let i = 0; i < 3; i++) {
        if (a[i]! < b[i]!) return -1;
        if (a[i]! > b[i]!) return 1;
    }
    return 0;
}

/**
 * Check if version satisfies a range expression.
 * Suporta: ">=1.2.0", "^1.2.0", "1.2.0" (exata).
 *
 * @param {string} version - Actual version
 * @param {string} range - Range expression
 * @returns {boolean}
 */
export function semverSatisfies(version: string, range: string): boolean {
    const ver = parseSemver(version);
    const trimmed = range.trim();

    if (trimmed.startsWith('>=')) {
        const min = parseSemver(trimmed.slice(2));
        return compareSemver(ver, min) >= 0;
    }

    if (trimmed.startsWith('^')) {
        // ^1.2.3 means >=1.2.3 and <2.0.0 (same major)
        const min = parseSemver(trimmed.slice(1));
        if (compareSemver(ver, min) < 0) return false;
        return ver[0] === min[0];
    }

    // Exact match
    const exact = parseSemver(trimmed);
    return compareSemver(ver, exact) === 0;
}

// ----------------------------------------------------------------
// MANIFEST VALIDATION
// Valida estrutura do manifesto
// ----------------------------------------------------------------

/**
 * Validate a library manifest.
 * Verifica campos obrigatorios, tipos, formato de versao e locked fields.
 *
 * @param {LibraryManifest} manifest - Library manifest object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest: LibraryManifest): { valid: boolean; errors: string[] } {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Manifest must be a non-null object'] };
    }

    // Required fields
    for (const field of REQUIRED_FIELDS) {
        if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // ID format (lowercase, hyphens, no spaces)
    if (manifest.id && !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
        errors.push('ID must be lowercase alphanumeric with hyphens (e.g., "conama-420-groundwater")');
    }

    // Version format
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        errors.push('Version must follow semver format (e.g., "1.0.0")');
    }

    // Contents must be an object
    if (manifest.contents && typeof manifest.contents !== 'object') {
        errors.push('Contents must be an object');
    }

    // Validate locked fields if present
    if (manifest.contents?.lockedFields) {
        if (!Array.isArray(manifest.contents.lockedFields)) {
            errors.push('lockedFields must be an array');
        } else {
            manifest.contents.lockedFields.forEach((lock: any, i: any) => {
                if (!lock.id) errors.push(`lockedFields[${i}]: missing id`);
                if (!VALID_LOCK_TYPES.includes(lock.type)) {
                    errors.push(
                        `lockedFields[${i}]: invalid type "${lock.type}". Must be one of: ${VALID_LOCK_TYPES.join(', ')}`,
                    );
                }
                if (!VALID_LOCK_LEVELS.includes(lock.lock)) {
                    errors.push(
                        `lockedFields[${i}]: invalid lock level "${lock.lock}". Must be one of: ${VALID_LOCK_LEVELS.join(', ')}`,
                    );
                }
            });
        }
    }

    // Validate families if present
    if (manifest.contents?.families) {
        if (typeof manifest.contents.families !== 'object' || Array.isArray(manifest.contents.families)) {
            errors.push('Contents.families must be an object keyed by family ID');
        }
    }

    // Validate units if present
    if (manifest.contents?.units) {
        if (!Array.isArray(manifest.contents.units)) {
            errors.push('Contents.units must be an array');
        }
    }

    // Validate parameters if present
    if (manifest.contents?.parameters) {
        if (!Array.isArray(manifest.contents.parameters)) {
            errors.push('Contents.parameters must be an array');
        }
    }

    // Validate agents if present
    if (manifest.contents?.agents) {
        if (!Array.isArray(manifest.contents.agents)) {
            errors.push('Contents.agents must be an array');
        }
    }

    // Validate imagery if present
    if (manifest.contents?.imagery) {
        if (!Array.isArray(manifest.contents.imagery)) {
            errors.push('Contents.imagery must be an array');
        } else {
            manifest.contents.imagery.forEach((img: any, i: any) => {
                if (!img.id) errors.push(`imagery[${i}]: missing id`);
                if (!img.name) errors.push(`imagery[${i}]: missing name`);
                if (!Array.isArray(img.bbox) || img.bbox.length !== 4) {
                    errors.push(`imagery[${i}]: bbox must be an array of 4 numbers [south, west, north, east]`);
                } else if (img.bbox.some((v: any) => typeof v !== 'number')) {
                    errors.push(`imagery[${i}]: bbox values must be numbers`);
                }
            });
        }
    }

    // Validate vectorLayers if present
    if (manifest.contents?.vectorLayers) {
        if (!Array.isArray(manifest.contents.vectorLayers)) {
            errors.push('Contents.vectorLayers must be an array');
        } else {
            manifest.contents.vectorLayers.forEach((layer: any, i: any) => {
                if (!layer.id) errors.push(`vectorLayers[${i}]: missing id`);
                if (!layer.name) errors.push(`vectorLayers[${i}]: missing name`);
                if (!layer.geojsonUrl && !layer.apiUrl && !layer.supabaseStoragePath) {
                    errors.push(`vectorLayers[${i}]: missing geojsonUrl, apiUrl, or supabaseStoragePath`);
                }
                if (!Array.isArray(layer.bbox) || layer.bbox.length !== 4) {
                    errors.push(
                        `vectorLayers[${i}]: bbox must be an array of 4 numbers [minLon, minLat, maxLon, maxLat]`,
                    );
                } else if (layer.bbox.some((v: any) => typeof v !== 'number')) {
                    errors.push(`vectorLayers[${i}]: bbox values must be numbers`);
                }
                if (layer.style && typeof layer.style !== 'object') {
                    errors.push(`vectorLayers[${i}]: style must be an object`);
                }
            });
        }
    }

    // Validate taxonomies if present
    if (manifest.contents?.taxonomies) {
        if (!Array.isArray(manifest.contents.taxonomies)) {
            errors.push('Contents.taxonomies must be an array');
        } else {
            manifest.contents.taxonomies.forEach((tax: any, i: any) => {
                if (!tax.id) errors.push(`taxonomies[${i}]: missing id`);
                if (!tax.name) errors.push(`taxonomies[${i}]: missing name`);
                if (!Array.isArray(tax.families) || tax.families.length === 0) {
                    errors.push(`taxonomies[${i}]: "families" must be a non-empty array`);
                }
                if (!Array.isArray(tax.fieldSections)) {
                    errors.push(`taxonomies[${i}]: "fieldSections" must be an array`);
                } else {
                    tax.fieldSections.forEach((section: any, si: any) => {
                        if (!section.id) errors.push(`taxonomies[${i}].fieldSections[${si}]: missing id`);
                        if (!Array.isArray(section.fields)) {
                            errors.push(`taxonomies[${i}].fieldSections[${si}]: "fields" must be an array`);
                        } else {
                            const validTypes = ['string', 'number', 'enum', 'boolean', 'date'];
                            section.fields.forEach((f: any, fi: any) => {
                                if (!f.id)
                                    errors.push(`taxonomies[${i}].fieldSections[${si}].fields[${fi}]: missing id`);
                                if (!f.type || !validTypes.includes(f.type)) {
                                    errors.push(
                                        `taxonomies[${i}].fieldSections[${si}].fields[${fi}]: type must be one of ${validTypes.join(', ')}`,
                                    );
                                }
                                if (f.type === 'enum' && (!Array.isArray(f.options) || f.options.length === 0)) {
                                    errors.push(
                                        `taxonomies[${i}].fieldSections[${si}].fields[${fi}]: enum must have non-empty options`,
                                    );
                                }
                            });
                        }
                    });
                }
            });
        }
    }

    // Validate naturalAssetCatalog if present (Calvin D1 2026-06-08 — benchmarks via Libraries)
    if (manifest.contents?.naturalAssetCatalog) {
        const cat = manifest.contents.naturalAssetCatalog;
        if (!cat || typeof cat !== 'object' || Array.isArray(cat)) {
            errors.push('Contents.naturalAssetCatalog must be a plain object');
        } else {
            // Delegação ao validator pure-logic (não duplicar regras)
            try {
                // Lazy require para evitar custo de import em validate path raro
                const loader = require('../../core/ecbtScore/_naturalAssetCatalogLoaderPure.js');
                const result = loader.validateCatalogPayload(cat);
                if (!result.valid) {
                    for (const issue of result.issues) {
                        if (
                            issue.code !== 'unknown_family_key' &&
                            issue.code !== 'ok'
                        ) {
                            errors.push(`naturalAssetCatalog.${issue.field}: ${issue.message}`);
                        }
                    }
                }
            } catch (e) {
                // Loader não disponível em contextos legacy — degrada gracefully.
                // Tag actionable substitui silent (silent-catch-ratchet baseline=0).
                console.debug('[libraries:validator:naturalAssetCatalog]', (e as any)?.message || e);
            }
        }
    }

    // Validate dependencies if present
    if (manifest.dependencies) {
        if (!Array.isArray(manifest.dependencies)) {
            errors.push('Dependencies must be an array');
        } else {
            manifest.dependencies.forEach((dep: any, i: any) => {
                if (!dep.id) errors.push(`dependencies[${i}]: missing id`);
                if (!dep.version) errors.push(`dependencies[${i}]: missing version`);
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------
// DEPENDENCY CHECKING
// Verifica se dependencias estao instaladas e atendem versao
// ----------------------------------------------------------------

/**
 * Check if all dependencies are satisfied.
 * Verifica se todas as dependencias estao instaladas na versao correta.
 *
 * @param {LibraryManifest} manifest - Library manifest
 * @param {InstalledLibrary[]} installed - Array of installed library entries
 * @returns {string[]} Array of error messages (empty = all satisfied)
 */
export function checkDependencies(manifest: LibraryManifest, installed: InstalledLibrary[]): string[] {
    const errors = [];
    const deps = manifest.dependencies || [];

    for (const dep of deps) {
        const found = installed.find((lib: any) => lib.manifest.id === dep.id && lib.active);
        if (!found) {
            errors.push(`Missing dependency: "${dep.id}" ${dep.version}`);
        } else if (!semverSatisfies(found.manifest.version, dep.version)) {
            errors.push(`"${dep.id}" version ${found.manifest.version} does not satisfy ${dep.version}`);
        }
    }

    return errors;
}

// ----------------------------------------------------------------
// ID CONFLICT DETECTION
// Verifica se IDs da biblioteca conflitam com instaladas
// ----------------------------------------------------------------

/**
 * Check for ID conflicts between manifest and installed libraries.
 * Evita que duas bibliotecas injetem familias, parametros ou unidades com mesmo ID.
 *
 * @param {LibraryManifest} manifest - Library manifest
 * @param {InstalledLibrary[]} installed - Array of installed library entries
 * @returns {string[]} Array of conflict error messages
 */
export function checkIdConflicts(manifest: LibraryManifest, installed: InstalledLibrary[]): string[] {
    const errors = [];
    const contents = manifest.contents || {};

    // Check if same library ID already installed
    const existing = installed.find((lib: any) => lib.manifest.id === manifest.id);
    if (existing) {
        errors.push(`Library "${manifest.id}" is already installed (v${existing.manifest.version})`);
        return errors;
    }

    // Collect all IDs from other installed active libraries
    const otherIds = {
        families: new Set<any>(),
        parameters: new Set<any>(),
        units: new Set<any>(),
    };
    for (const lib of installed) {
        if (!lib.active || !lib.injectedIds) continue;
        (lib.injectedIds.families || []).forEach((id: any) => otherIds.families.add(id));
        (lib.injectedIds.parameters || []).forEach((id: any) => otherIds.parameters.add(id));
        (lib.injectedIds.units || []).forEach((id: any) => otherIds.units.add(id));
    }

    // Check families
    if (contents.families) {
        for (const famId of Object.keys(contents.families)) {
            if (otherIds.families.has(famId)) {
                errors.push(`Family ID "${famId}" conflicts with another installed library`);
            }
        }
    }

    // Check parameters
    if (contents.parameters) {
        for (const param of contents.parameters) {
            if (param.id && otherIds.parameters.has(param.id)) {
                errors.push(`Parameter ID "${param.id}" conflicts with another installed library`);
            }
        }
    }

    // Check units
    if (contents.units) {
        for (const unit of contents.units) {
            if (unit.id && otherIds.units.has(unit.id)) {
                errors.push(`Unit ID "${unit.id}" conflicts with another installed library`);
            }
        }
    }

    return errors;
}
