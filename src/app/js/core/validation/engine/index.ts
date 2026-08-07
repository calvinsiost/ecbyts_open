// @ts-check
// Generated from src/app/js/core/validation/engine/index.ts by TS-MIGRATION-001. Do not edit manually.
/**
 * ecbyts - Validator Engine Public API
 * Generic, domain-agnostic validation engine.
 * Domains are 100% user-defined via JSON.
 *
 * @license AGPL-3.0-only
 */
// Core engine
export {
    registerDomain,
    unregisterDomain,
    clearRegistry,
    listDomains,
    getDomainConfig,
    validate,
    validateBatch,
    validateDataset,
    rule,
    batchRule,
    required,
    ifAvailable,
    oneOf,
    numeric,
    matchPattern,
    uniqueKey,
} from './validatorEngine.js';
// Error codes
export { CODES, hint } from './errorCodes.js';
// Domain loader (JSON → executable rules)
export { loadDomainFromJSON, unloadDomain, validateDomainDefinition } from './domainLoader.js';
// ECBT adapter (engine ↔ ecbyts data model)
export {
    listSavedDomains,
    getDomain,
    saveDomain,
    deleteDomain,
    duplicateDomain,
    setActiveDomainIds,
    getActiveDomainIds,
    mapIngestionToEntities,
    mapEngineResultsToViolations,
    runActiveDomainValidation,
    testDomainAgainstData,
} from './ecbtAdapter.js';
