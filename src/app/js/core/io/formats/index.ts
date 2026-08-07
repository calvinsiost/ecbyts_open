// @ts-check
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
   FORMAT STANDARDIZATION LAYER — Single interoperability entry point
   ================================================================

   ARCH-STANDARDIZATION-001 gap closure (REFACTOR, not net-new).

   PROBLEMA: cada formato (csv, geojson, ngsild, ifc, ...) se
   auto-registra via efeito colateral `registerFormat()` no carregamento
   do módulo. Sem um barrel que importe TODOS os módulos, o registro
   ficava não-determinístico: `getExportFormats()` retornava resultados
   diferentes conforme quais módulos haviam sido importados antes.
   Nenhum consumidor importava o conjunto completo.

   SOLUÇÃO: este barrel importa eagerly cada módulo de formato
   hand-authored (disparando todos os side-effects de registro de uma
   vez) e re-exporta a API de consulta do registry como a única
   superfície de padronização. Não reconstrói formatos — apenas os
   unifica. NÃO edita registry.js (TS-MIGRATION-generated).

   ================================================================ */
// Side-effect imports: carregar cada módulo dispara seu registerFormat().
// Eager import of every hand-authored format triggers registration once.
import './csv.js';
import './geojson.js';
import './gltf.js';
import './obj.js';
import './gdl.js';
import './ifc.js';
import './kml.js';
import './ngsild.js';
import './shapefile.js';
import './xlsx.js';
import { getAllFormats, getExportFormats, getImportFormats, getFormat, detectFormat } from './registry.js';
import { createLogger } from '../../../utils/helpers/logger.js';
const log = createLogger('io:formats');
// IDs esperados após o registro completo (invariante do contrato).
// Canonical set asserted after all side-effect imports run.
const EXPECTED_FORMAT_IDS = Object.freeze(['csv', 'geojson', 'gltf', 'obj', 'gdl', 'ifc', 'kml', 'ngsild', 'shapefile', 'xlsx']);
// ----------------------------------------------------------------
// API — superfície única de padronização
// ----------------------------------------------------------------
// Re-export da API de consulta do registry (contrato unificado).
// Re-export the registry query contract as the single public surface.
export { getAllFormats, getExportFormats, getImportFormats, getFormat, detectFormat };
/**
 * Lista os ids canônicos esperados após o registro determinístico.
 * Returns the canonical, frozen list of expected format ids.
 *
 * @returns {readonly string[]}
 */
export function getExpectedFormatIds() {
    return EXPECTED_FORMAT_IDS;
}
/**
 * Verifica a integridade do registro: confirma que todo formato
 * esperado foi de fato registrado pelos side-effect imports.
 * Verifies that every expected format self-registered correctly.
 *
 * @returns {{ ok: boolean, missing: string[], registered: string[] }}
 */
export function verifyFormatRegistration() {
    const registered = getAllFormats().map((f: any) => f.id);
    const missing = EXPECTED_FORMAT_IDS.filter((id: any) => !registered.includes(id));
    const ok = missing.length === 0;
    if (!ok) {
        log.warn('format registration incomplete; missing:', missing.join(', '));
    }
    return { ok, missing, registered };
}
