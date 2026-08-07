// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
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
   ECO1 MIGRATION RUNNER
   ================================================================

   Executa migrações de schema ECO1 em cadeia até CURRENT_SCHEMA.
   Compatibilidade: usa JSON.parse/stringify para deep clone.

   ================================================================ */

import { migrateV1ToV2 } from './migrations/v1-to-v2.js';

/**
 * Versao atual do schema ECO1.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Executa migrações necessárias em um modelo importado.
 * / Run required schema migrations for imported model.
 *
 * @param {Object} model - Modelo importado (qualquer schema)
 * @returns {{ model: Object, migrated: boolean, fromVersion: number, toVersion: number }}
 */
export function runModelMigrations(model: object): {
    model: object;
    migrated: boolean;
    fromVersion: number;
    toVersion: number;
} {
    const source = _safeClone(model);
    const fromVersion = _detectSchemaVersion(source as Record<string, any>);

    if (fromVersion >= CURRENT_SCHEMA_VERSION) {
        return {
            model: source,
            migrated: false,
            fromVersion,
            toVersion: fromVersion,
        };
    }

    let current = source;
    for (let ver = fromVersion; ver < CURRENT_SCHEMA_VERSION; ver++) {
        const migrate = _MIGRATIONS.get(ver);
        if (!migrate) {
            throw new Error(`Missing ECO1 migration step: v${ver} -> v${ver + 1}`);
        }
        current = migrate(current);
    }

    return {
        model: current,
        migrated: true,
        fromVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
    };
}

/**
 * Detecta versão do schema no modelo.
 * / Detect schema version from model payload.
 *
 * @param {Record<string, any>} model - Modelo ECO1
 * @returns {number} Versao detectada
 */
function _detectSchemaVersion(model: Record<string, any>): number {
    if (!model || typeof model !== 'object') {
        return 1;
    }
    if (Number.isFinite(model.schemaVersion)) {
        return model.schemaVersion;
    }
    return 1;
}

/**
 * Clona payload sem structuredClone para compatibilidade legada.
 * / Deep clone via JSON parse/stringify for browser compatibility.
 *
 * @param {Object} value - Valor a clonar
 * @returns {Object} Clone seguro
 */
function _safeClone(value: object): any {
    if (!value || typeof value !== 'object') {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}

/**
 * Registro de migrações sequenciais.
 * key = versao atual; value = migrador para proxima versao.
 */
const _MIGRATIONS = new Map<number, (m: any) => any>([[1, migrateV1ToV2]]);
