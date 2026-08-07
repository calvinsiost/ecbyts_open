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
   CONSTANTS MANAGER — User-defined constants registry
   Registro de constantes definidas pelo usuario (fatores de emissao,
   incertezas, precisao de equipamentos, fatores de conversao, etc.)

   Segue o mesmo padrao de calculator/manager.js:
   - Estado em closure do modulo
   - Persistencia em localStorage (Category B)
   - export/import integrado ao ECO1
   ================================================================ */
import { generateId } from '../../utils/helpers/id.js';
import { isEphemeral, safeSetItem } from '../../utils/storage/storageMonitor.js';
// Adopt own pure helpers (Module C extraction commit 9083eac9) — DRY interno.
import {
    validateConstantFields,
    sanitizeConstant as _sanitizeConstantPure,
} from './_constantsPure.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts_user_constants';
const SCHEMA_VERSION = 2;
/** @type {{ constants: any[] }} */
let state: any = {
    constants: [],
};
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize constants from localStorage.
 * Carrega estado salvo ou cria estado vazio.
 */
export function initConstants() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            let constants = Array.isArray(parsed.constants) ? parsed.constants : [];
            // Migration v1 → v2: adiciona campos de incerteza
            if (!parsed.version || parsed.version < 2) {
                constants = constants.map((c: any) => ({
                    ...c,
                    mutable: c.mutable !== false,
                    uncertainty: c.uncertainty ?? null,
                    uncertaintyType: c.uncertaintyType ?? null,
                    coverageFactor: c.coverageFactor ?? null
                }));
            }
            state = { constants };
        }
    }
    catch ( /** @type {any} */e) {
        console.warn('[Constants] Erro ao carregar localStorage:', (e as any)?.message);
        state = { constants: [] };
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
function _persist() {
    if (isEphemeral())
        return;
    safeSetItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, constants: state.constants }));
}
// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------
/**
 * Validate a constant object before saving.
 * Valida campos obrigatorios, formato de symbol e unicidade.
 *
 * @param {Object} partial - Campos a validar
 * @param {string|null} existingId - ID atual (para validacao de unicidade em update)
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConstant(partial: any, existingId: any = null) {
    // Delega validação pura para _constantsPure (passa state.constants p/ unicidade).
    const result = validateConstantFields(partial, state.constants as any, existingId);
    // Warning não-bloqueante: coverage factor k > 3 é incomum (preservado do original).
    const cf = partial?.coverageFactor;
    if (cf != null && cf !== '' && Number.isFinite(Number(cf)) && Number(cf) > 3) {
        console.warn('[Constants] Coverage factor k=%s is unusual (typical: 1-3). Saving anyway.', cf);
    }
    return result;
}
// ----------------------------------------------------------------
// SANITIZATION — delega para _constantsPure.sanitizeConstant.
// ----------------------------------------------------------------
function _sanitize(c: any) {
    return _sanitizeConstantPure(c);
}
// ----------------------------------------------------------------
// READ
// ----------------------------------------------------------------
/**
 * Get all user constants.
 * @returns {Object[]}
 */
export function getUserConstants() {
    return [...state.constants];
}
/**
 * Get a constant by its ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getUserConstantById(id: any) {
    return state.constants.find((c: any) => c.id === id) || null;
}
/**
 * Get a constant by its symbol (case-sensitive).
 * @param {string} symbol
 * @returns {Object|null}
 */
export function getUserConstantBySymbol(symbol: any) {
    return state.constants.find((c: any) => c.symbol === symbol) || null;
}
// ----------------------------------------------------------------
// CREATE
// ----------------------------------------------------------------
/**
 * Add a new user constant.
 * Adiciona uma nova constante apos validacao.
 *
 * @param {Object} partial - Campos da constante
 * @returns {{ constant: Object|null, errors: string[] }}
 */
export function addUserConstant(partial: any) {
    const { valid, errors } = validateConstant(partial);
    if (!valid)
        return { constant: null, errors };
    const now = new Date().toISOString();
    const constant = _sanitize({
        ...partial,
        id: generateId("constant"),
        isDemo: Boolean(partial.isDemo),
        createdAt: now,
        updatedAt: now,
    });
    state.constants.push(constant);
    _persist();
    return { constant, errors: [] };
}
// ----------------------------------------------------------------
// UPDATE
// ----------------------------------------------------------------
/**
 * Update an existing user constant.
 * Atualiza campos de uma constante existente apos validacao.
 *
 * @param {string} id
 * @param {Object} changes
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function updateUserConstant(id: any, changes: any) {
    const idx = state.constants.findIndex((c: any) => c.id === id);
    if (idx === -1)
        return { ok: false, errors: ['notFound'] };
    const merged = { ...state.constants[idx], ...changes };
    const { valid, errors } = validateConstant(merged, id);
    if (!valid)
        return { ok: false, errors };
    state.constants[idx] = _sanitize({ ...merged, updatedAt: new Date().toISOString() });
    _persist();
    return { ok: true, errors: [] };
}
// ----------------------------------------------------------------
// DELETE
// ----------------------------------------------------------------
/**
 * Check which calculator metrics reference this constant.
 * Verifica dependencias da constante antes de remover.
 *
 * @param {string} id
 * @returns {Array<{ id: string, name: string }>}
 */
export function getConstantDependents(id: any) {
    try {
        // Import lazy para evitar dependencia circular
        const { getCalculatorItems } = window.__ecbyts_calculator || {};
        if (typeof getCalculatorItems !== 'function')
            return [];
        return getCalculatorItems()
            .filter((item: any) => Array.isArray(item.postProcessing) && item.postProcessing.some((p: any) => p.constantId === id))
            .map((item: any) => ({
            id: item.id,
            name: item.label || item.type || item.id
        }));
    }
    catch {
        return [];
    }
}
/**
 * Remove a constant (only if no calculator dependents).
 * Remove uma constante se ela nao tiver dependencias ativas.
 *
 * @param {string} id
 * @returns {{ removed: boolean, dependents: any[] }}
 */
export function removeUserConstant(id: any) {
    const dependents = getConstantDependents(id);
    if (dependents.length > 0) {
        return { removed: false, dependents };
    }
    state.constants = state.constants.filter((c: any) => c.id !== id);
    _persist();
    return { removed: true, dependents: [] };
}
/**
 * Remove a constant regardless of dependents (after user confirmation).
 * Remove uma constante mesmo com dependencias (apos confirmacao do usuario).
 *
 * @param {string} id
 */
export function forceRemoveUserConstant(id: any) {
    state.constants = state.constants.filter((c: any) => c.id !== id);
    _persist();
}
// ----------------------------------------------------------------
// DEMO HELPERS
// ----------------------------------------------------------------
/**
 * Generate 3 example constants with isDemo: true for demo mode.
 * Gera exemplos de constantes para demonstracao.
 */
export function generateRandomConstants() {
    const demos = [
        {
            name: 'Fator de Emissão CO2 - Energia Elétrica (Grid BR)',
            symbol: 'EF_CO2_grid_br',
            value: 0.0817,
            unitId: 'kg_kWh',
            category: 'emission',
            description: 'Fator de emissão médio para eletricidade da rede elétrica brasileira.',
            source: 'MCTI/SEPED 2023 — Fator de Emissão de CO2 da Rede Elétrica',
            uncertainty: 0.005,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Incerteza de Medição — Condutividade Elétrica (WTW Cond 3110)',
            symbol: 'U_cond_wtw3110',
            value: 0.5,
            unitId: 'pct',
            category: 'uncertainty',
            description: 'Incerteza expandida (k=2, 95%) do equipamento de condutividade WTW 3110.',
            source: 'Certificado de Calibração LABOCE 2024-0872',
            uncertainty: 10,
            uncertaintyType: 'relative',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Fator de Conversão Benzeno — mg/L para μg/L',
            symbol: 'FC_mgL_ugL',
            value: 1000,
            unitId: '',
            category: 'conversion',
            description: 'Fator de conversão de miligramas por litro para microgramas por litro (adimensional).',
            source: 'SI — Sistema Internacional de Unidades',
            isDemo: true,
        },
        {
            name: 'Fator de Conversão Vazão — L/s para m³/dia',
            symbol: 'FC_Ls_m3d',
            value: 86.4,
            unitId: '',
            category: 'conversion',
            description: 'Converte vazão medida em L/s para m³/dia. Usado para calcular carga mássica diária.',
            source: 'SI — Sistema Internacional de Unidades',
            isDemo: true,
        },
        {
            name: 'Fator de Passagem — Módulo de Tratamento A (eficiência 85%)',
            symbol: 'FC_pass_mod_a',
            value: 0.15,
            unitId: '',
            category: 'correction',
            description: 'Fração do contaminante que passa pelo módulo A (eficiência de remoção 85%). ' +
                'Multiplica a concentração de entrada para estimar a concentração após o módulo.',
            source: 'Relatório de Desempenho ETEI — Ensaio ABNT NBR 13969:1997',
            uncertainty: 0.02,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Fator de Passagem — Módulo de Tratamento B (eficiência 78%)',
            symbol: 'FC_pass_mod_b',
            value: 0.22,
            unitId: '',
            category: 'correction',
            description: 'Fração do contaminante que passa pelo módulo B (eficiência de remoção 78%). ' +
                'Usado em blend para estimar eficiência combinada de sistema com dois módulos em paralelo.',
            source: 'Relatório de Desempenho ETEI — Ensaio ABNT NBR 13969:1997',
            uncertainty: 0.03,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        // ── GEE / Inventário de Gases de Efeito Estufa ──────────────────────────
        // Fatores de emissão de referência para as fontes mais comuns no inventário
        // corporativo e de remediação. Fonte: GHG Protocol BR - MCTI/SEPED 2023.
        {
            name: 'Fator de Emissão CO2 — Diesel Fóssil (Escopo 1)',
            symbol: 'EF_CO2_diesel_fossil',
            value: 2.603,
            unitId: '', // kg CO2/L
            category: 'emission',
            description: 'Fator de emissão de CO2 para a fração fóssil do diesel. ' +
                'Usar em blend com EF_CO2_biodiesel para combustíveis com mistura obrigatória (B14, B20).',
            source: 'GHG Protocol BR — MCTI/SEPED 2023, Tabela 1A',
            uncertainty: 0.05,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Fator de Emissão CO2 — Biodiesel (biogênico, zero fossil)',
            symbol: 'EF_CO2_biodiesel',
            value: 0.0,
            unitId: '', // kg CO2/L (biogênico = 0)
            category: 'emission',
            description: 'Fator de emissão CO2 fóssil do biodiesel = 0. ' +
                'Emissões biogênicas não são contabilizadas no Escopo 1 pelo GHG Protocol BR.',
            source: 'GHG Protocol BR — MCTI/SEPED 2023, Nota Metodológica 3',
            isDemo: true,
        },
        {
            name: 'Fator de Emissão CO2 — Gasolina Fóssil C (Escopo 1)',
            symbol: 'EF_CO2_gasolina_fossil',
            value: 2.212,
            unitId: '', // kg CO2/L
            category: 'emission',
            description: 'Fator de emissão CO2 para a fração fóssil da gasolina. ' +
                'Usar em blend com EF_CO2_etanol para gasolina C (27% etanol anidro por norma ANP).',
            source: 'GHG Protocol BR — MCTI/SEPED 2023, Tabela 1A',
            uncertainty: 0.04,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Fator de Emissão CO2 — Etanol Anidro (biogênico, zero fossil)',
            symbol: 'EF_CO2_etanol',
            value: 0.0,
            unitId: '', // kg CO2/L (biogênico = 0)
            category: 'emission',
            description: 'Fator de emissão CO2 fóssil do etanol anidro = 0 (biogênico). ' +
                'Usar como segunda constante no blend da Gasolina C27.',
            source: 'GHG Protocol BR — MCTI/SEPED 2023, Nota Metodológica 3',
            isDemo: true,
        },
        {
            name: 'Fator de Emissão CO2 — Gás Natural (Escopo 1)',
            symbol: 'EF_CO2_gas_natural',
            value: 0.00202,
            unitId: '', // tCO2e/m³
            category: 'emission',
            description: 'Fator de emissão de CO2 para gás natural em tCO2e/m³. ' +
                'Aplicar diretamente sobre consumo em m³ para obter tCO2e.',
            source: 'GHG Protocol BR — MCTI/SEPED 2023, Tabela 1C',
            uncertainty: 0.00008,
            uncertaintyType: 'absolute',
            coverageFactor: 2,
            isDemo: true,
        },
        {
            name: 'Fator de Conversão kg CO2 para tCO2e',
            symbol: 'FC_kg_tCO2e',
            value: 1000,
            unitId: '', // adimensional (divisor)
            category: 'conversion',
            description: 'Divisor para converter kg CO2 em tCO2e (1 tCO2e = 1000 kg CO2e). ' +
                'Usar como step de divisão ao final de cadeias cujo EF está em kg/unidade.',
            source: 'SI — Sistema Internacional de Unidades',
            isDemo: true,
        },
    ];
    for (const demo of demos) {
        // Apenas adiciona se symbol ainda nao existe
        if (!getUserConstantBySymbol(demo.symbol)) {
            addUserConstant(demo);
        }
    }
}
/**
 * Remove all demo constants (isDemo: true).
 * Remove todas as constantes marcadas como demo.
 */
export function clearDemoConstants() {
    state.constants = state.constants.filter((c: any) => !c.isDemo);
    _persist();
}
// ----------------------------------------------------------------
// EXPORT / IMPORT (ECO1 integration)
// ----------------------------------------------------------------
/**
 * Export constants for ECO1 serialization.
 * @returns {{ version: number, constants: Object[] }}
 */
export function exportConstants() {
    return { version: SCHEMA_VERSION, constants: [...state.constants] };
}
/**
 * Import constants from ECO1 model (defensive - validates each entry).
 * Importa constantes do modelo ECO1 com validacao defensiva.
 *
 * @param {Object} data - { version, constants }
 */
export function importConstants(data: any) {
    if (!data || !Array.isArray(data.constants)) {
        state = { constants: [] };
        return;
    }
    /** @type {any[]} */
    const valid = [];
    /** @type {any[]} */
    const rejected = [];
    for (const c of data.constants) {
        // Exige id e passa por validacao estrutural
        if (!c || typeof c.id !== 'string' || !c.id.trim()) {
            rejected.push({ symbol: c?.symbol, errors: ['missingId'] });
            continue;
        }
        const r = validateConstant(c, c.id);
        if (r.valid) {
            valid.push(_sanitize(c));
        }
        else {
            rejected.push({ symbol: c.symbol, errors: r.errors });
        }
    }
    if (rejected.length > 0) {
        console.warn('[ecbyts] constants import: itens rejeitados', rejected);
    }
    state = { constants: valid };
    _persist();
}
