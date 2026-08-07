// @ts-check
// Generated from src/app/js/core/validation/engine/ecbtAdapter.ts by TS-MIGRATION-001. Do not edit manually.
/**
 * ecbyts - ECBT Adapter for Validator Engine
 * Bridges the generic validator engine with ecbyts data structures.
 *
 * Responsibilities:
 * 1. Map ingestion pipeline data to entity records for domain validation
 * 2. Map engine validation results back to ecbyts violation format
 * 3. Domain persistence (CRUD) in IndexedDB
 *
 * @license AGPL-3.0-only
 */
import { idbGet, idbSet } from '../../../utils/storage/idbStore.js';
import { deepClone } from '../../../utils/helpers/deepClone.js';
import { loadDomainFromJSON, unloadDomain, validateDomainDefinition } from './domainLoader.js';
import { validateBatch, validateDataset } from './validatorEngine.js';
const STORAGE_KEY = 'ecbyts-validation-domains';
const ACTIVE_IDS_KEY = 'ecbyts-validation-domain-active-ids';
/** @type {any[]|null} */
let _domainCache: any = null;
// ── Domain CRUD ───────────────────────────────────────────────────────────────
async function _ensureLoaded() {
    if (_domainCache === null) {
        _domainCache = (await idbGet(STORAGE_KEY)) || [];
    }
}
/**
 * List all saved domain definitions.
 * @returns {Promise<object[]>}
 */
export async function listSavedDomains() {
    await _ensureLoaded();
    const cache = (_domainCache) as any[];
    return cache.map((d: any) => ({
        id: d.id,
        name: d.name,
        version: d.version || '1.0',
        description: d.description || '',
        entityCount: (d.entities || []).length,
        ruleCount: (d.entities || []).reduce(
            (sum: any, e: any) => sum + (e.rules || []).length,
            0,
        ),
    }));
}
/**
 * Get a domain definition by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getDomain( id: any) {
    await _ensureLoaded();
    const cache = (_domainCache) as any[];
    return cache.find((d: any) => d.id === id) || null;
}
/**
 * Save a domain definition (create or update).
 * @param {*} domain
 * @returns {Promise<object>}
 */
export async function saveDomain( domain: any) {
    const check = validateDomainDefinition(domain);
    if (!check.valid) {
        throw new Error(`Invalid domain: ${check.errors.join('; ')}`);
    }
    await _ensureLoaded();
    const cache = (_domainCache) as any[];
    const idx = cache.findIndex((d: any) => d.id === domain.id);
    if (idx >= 0) {
        cache[idx] = { ...cache[idx], ...domain, updatedAt: new Date().toISOString() };
    } else {
        cache.push({ ...domain, createdAt: new Date().toISOString() });
    }
    await idbSet(STORAGE_KEY, cache);
    return domain;
}
/**
 * Delete a domain definition.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteDomain( id: any) {
    await _ensureLoaded();
    const cache = (_domainCache) as any[];
    const before = cache.length;
    _domainCache = cache.filter((d: any) => d.id !== id);
    if (_domainCache.length < before) {
        await idbSet(STORAGE_KEY, _domainCache);
        return true;
    }
    return false;
}
/**
 * Duplicate a domain with a new ID.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function duplicateDomain( id: any) {
    const original = (await getDomain(id)) as any;
    if (!original) throw new Error(`Domain "${id}" not found`);
    const copy = deepClone(original);
    copy.id = `${id}-copy-${Date.now()}`;
    copy.name = `${original.name} (copy)`;
    delete copy.createdAt;
    delete copy.updatedAt;
    return saveDomain(copy);
}
/**
 * Set active domain IDs.
 * @param {string[]} ids
 */
export async function setActiveDomainIds( ids: any) {
    const clean = [...new Set((ids || []).map((v: any) => String(v || '').trim()).filter(Boolean))];
    await idbSet(ACTIVE_IDS_KEY, clean);
}
/**
 * Get active domain IDs.
 * @returns {Promise<string[]>}
 */
export async function getActiveDomainIds() {
    return (await idbGet(ACTIVE_IDS_KEY)) || [];
}
// ── Ingestion Integration ─────────────────────────────────────────────────────
/**
 * Map ingestion pipeline data to entity records based on a domain definition.
 * The domain defines entity names and their expected fields.
 * The transformed data from the ingestion pipeline is split into matching entities.
 *
 * @param {object[]} records - Flat array of records from ingestion pipeline
 * @param {object} domainDef - Domain definition with entities
 * @returns {Record<string, object[]>} - Records keyed by entity name
 */
export function mapIngestionToEntities( records: any, domainDef: any) {
    const result: any = {};
    const def = (domainDef) as any;
    for (const entity of def.entities || []) {
        const entityFields = new Set([
            ...(entity.rules || []).map((r: any) => r.field),
            ...(entity.batchRules || []).flatMap((r: any) => r.fields || []),
        ]);
        // Filtra registros que possuem ao menos um campo da entidade
        const matching = records.filter((record: any) =>
            [...entityFields].some((f: any) => (f as any) in record),
        );
        // Projeta apenas os campos relevantes para a entidade
        result[entity.name] = matching.map((record: any) => {
            const projected: any = {};
            for (const f of entityFields) {
                const key = (f) as string;
                if (key in record) projected[key] = record[key];
            }
            return projected;
        });
    }
    return result;
}
/**
 * Map engine validation results to ecbyts violation format.
 * Compatible with the profileEngine violation format for unified display.
 *
 * @param {*} _engineResult - Result from validate() or validateBatch()
 * @param {string} entityType - Entity name for context
 * @returns {object[]} - Violations in ecbyts format
 */
export function mapEngineResultsToViolations( _engineResult: any, entityType: any) {
    const engineResult = (_engineResult) as any;
    const violations: any[] = [];
    // Erros de registros individuais
    if (engineResult.results) {
        for (const rec of engineResult.results) {
            for (const err of [...rec.errors, ...rec.warnings, ...(rec.info || [])]) {
                violations.push({
                    entityType,
                    rowIndex: rec.index,
                    field: err.field,
                    severity: err.severity,
                    message: err.message,
                    code: err.code,
                    rule: err.rule,
                    machine_hint: err.machine_hint || null,
                });
            }
        }
    }
    // Erros de batch
    for (const err of [...(engineResult.batchErrors || []), ...(engineResult.batchWarnings || [])]) {
        violations.push({
            entityType,
            rowIndex: err.index ?? null,
            field: err.field,
            severity: err.severity,
            message: err.message,
            code: err.code,
            rule: err.rule,
            machine_hint: err.machine_hint || null,
        });
    }
    // Para validacao de single record (sem .results)
    if (!engineResult.results && engineResult.all) {
        for (const err of engineResult.all) {
            violations.push({
                entityType,
                rowIndex: err.index ?? null,
                field: err.field,
                severity: err.severity,
                message: err.message,
                code: err.code,
                rule: err.rule,
                machine_hint: err.machine_hint || null,
            });
        }
    }
    return violations;
}
/**
 * Run domain validation on ingestion data using all active domains.
 * Called from the ingestion pipeline after mapper + structural validation.
 *
 * @param {object[]} records - Mapped records from ingestion
 * @returns {Promise<{domainResults: object[], totalViolations: number}>}
 */
export async function runActiveDomainValidation( records: any) {
    const activeIds = await getActiveDomainIds();
    if (activeIds.length === 0) return { domainResults: [], totalViolations: 0 };
    const domainResults = [];
    let totalViolations = 0;
    for (const domainId of activeIds) {
        const domain = (await getDomain(domainId)) as any;
        if (!domain) continue;
        try {
            loadDomainFromJSON(domain);
            const entities = mapIngestionToEntities(records, domain);
            for (const [entityName, entityRecords] of Object.entries(entities) as [string, any[]][]) {
                if (entityRecords.length === 0) continue;
                const result = validateBatch(entityName, entityRecords, { mode: 'ingest' });
                const violations = mapEngineResultsToViolations(result, entityName);
                totalViolations += violations.length;
                domainResults.push({
                    domainId,
                    domainName: domain.name,
                    entityName,
                    totalRecords: result.totalRecords,
                    validCount: result.validCount,
                    invalidCount: result.invalidCount,
                    allValid: result.allValid,
                    violations,
                });
            }
        } finally {
            unloadDomain(domain);
        }
    }
    return { domainResults, totalViolations };
}
/**
 * Test a domain definition against sample data.
 * Used by the "Test Against Data" button in the Domain Editor.
 *
 * @param {*} domainDef - Domain definition to test
 * @param {object[]} sampleData - Sample records
 * @returns {object} - Validation results per entity
 */
export function testDomainAgainstData( domainDef: any, sampleData: any) {
    const check = validateDomainDefinition(domainDef);
    if (!check.valid) return { valid: false, definitionErrors: check.errors, entityResults: [] };
    try {
        loadDomainFromJSON(domainDef);
        const entities = mapIngestionToEntities(sampleData, domainDef);
        const entityResults = [];
        for (const [entityName, records] of Object.entries(entities) as [string, any[]][]) {
            if (records.length === 0) continue;
            const result = validateBatch(entityName, records, { mode: 'ingest' });
            entityResults.push({
                entityName,
                ...result,
                violations: mapEngineResultsToViolations(result, entityName),
            });
        }
        // Dataset-level referential integrity
        let riResult: any = null;
        if (domainDef.relations?.length) {
            riResult = validateDataset(entities, domainDef.relations, { mode: 'ingest' });
        }
        return { valid: true, entityResults, referentialIntegrity: riResult };
    } finally {
        unloadDomain(domainDef);
    }
}
