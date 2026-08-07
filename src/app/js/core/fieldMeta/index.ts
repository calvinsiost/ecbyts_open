// @ts-check
// Generated from src/app/js/core/fieldMeta/index.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
export {
    FIELD_META_SCHEMA_VERSION,
    PROV_ACTIVITIES,
    PROV_AGENT_TYPES,
    VALIDATION_STATES,
    FIELD_FLAGS,
    SOURCE_TYPES,
    CONFIDENCE_LEVELS,
    PRIVACY_SENSITIVITY,
    FILLED_BY_VALUES,
    FILLED_BY_BADGE,
    createFieldMeta,
    createProvenance,
    appendRevision,
    setFilledBy,
    isDefaultMeta,
    validateFieldMeta,
    buildFieldKey,
} from './schema.js';
export { getFieldMeta, getFieldMetaBatch, setFieldMeta, listFieldMetaByScope, deleteFieldMeta, clearAllFieldMeta } from './store.js';
export { migrateAllLegacyFieldMeta, migrateLegacyFieldMetaFromBoot } from './migration.js';
