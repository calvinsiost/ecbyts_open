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
   GERENCIAMENTO DE FAMILIAS
   ================================================================

   Este modulo gerencia as familias (tipos) de elementos.

   FAMILIA = CATEGORIA DE ELEMENTO
   Exemplos:
   - Familia "plume" = Plumas de contaminacao
   - Familia "well" = Pocos de monitoramento
   - Familia "marker" = Marcadores genericos

   FUNCIONALIDADES:
   - Lista de familias padrao e personalizadas
   - Adicionar/remover familias customizadas
   - Ativar/desativar familias
   - Traducao de nomes para o idioma atual

   ================================================================ */
import { DEFAULT_FAMILIES } from '../../config.js';
import { t } from '../../utils/i18n/translations.js';
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
/**
 * Registro de todas as familias.
 * Comeca com as familias padrao e pode receber customizadas.
 */
/** @type {Record<string, any>} */
let families: Record<string, any> = { ...DEFAULT_FAMILIES };
// ----------------------------------------------------------------
// FUNCOES DE ACESSO
// ----------------------------------------------------------------
/**
 * Retorna todas as familias registradas.
 *
 * @returns {Object} - Objeto com todas as familias
 */
export function getAllFamilies() {
    return families;
}
/**
 * Retorna uma familia pelo ID.
 *
 * @param {string} familyId - ID da familia (ex: 'plume', 'well')
 * @returns {Object|undefined} - Dados da familia ou undefined
 */
export function getFamily(familyId: any) {
    return families[familyId];
}
/**
 * Retorna apenas familias ativas (enabled = true).
 *
 * @returns {Object[]} - Array de familias ativas
 */
export function getEnabledFamilies() {
    return Object.values(families).filter((f: any) => f.enabled);
}
/**
 * Retorna o nome traduzido de uma familia.
 *
 * @param {Object} family - Dados da familia
 * @returns {string} - Nome no idioma atual
 *
 * LOGICA:
 * - Se familia tem nameKey, usa traducao
 * - Se nao tem (familia customizada), usa name direto
 * - Se nenhum, usa o ID como fallback
 */
export function getFamilyName(family: any) {
    if (!family)
        return '';
    // Familia com chave de traducao
    if (family.nameKey) {
        return t(family.nameKey);
    }
    // Familia customizada com nome direto
    if (family.name) {
        return family.name;
    }
    // Fallback para ID
    return family.id || '';
}
// ----------------------------------------------------------------
// FUNCOES DE MODIFICACAO
// ----------------------------------------------------------------
/**
 * Ativa ou desativa uma familia.
 * Familias desativadas nao aparecem no menu de adicao.
 *
 * @param {string} familyId - ID da familia
 * @returns {boolean} - Novo estado (true=ativa, false=inativa)
 */
export function toggleFamily(familyId: any) {
    if (!families[familyId]) {
        console.warn(`Familia nao encontrada: ${familyId}`);
        return false;
    }
    families[familyId].enabled = !families[familyId].enabled;
    return families[familyId].enabled;
}
/**
 * Define estado de uma familia (ativa ou inativa).
 *
 * @param {string} familyId - ID da familia
 * @param {boolean} enabled - Novo estado
 */
export function setFamilyEnabled(familyId: any, enabled: any) {
    if (families[familyId]) {
        families[familyId].enabled = enabled;
    }
}
/**
 * Adiciona uma familia personalizada.
 *
 * @param {string} id - ID unico (letras minusculas, sem espacos)
 * @param {string} name - Nome de exibicao
 * @param {string} icon - Emoji representativo (opcional)
 * @returns {Object|null} - Familia criada ou null se erro
 *
 * VALIDACOES:
 * - ID nao pode estar vazio
 * - ID nao pode ja existir
 * - Nome nao pode estar vazio
 */
export function addCustomFamily(id: any, name: any, icon: any = "cube") {
    // Valida ID
    if (!id || typeof id !== 'string') {
        console.error('ID da familia invalido');
        return null;
    }
    // Normaliza ID (minusculas, underscore para espacos)
    const normalizedId = id.trim().toLowerCase().replace(/\s+/g, '_');
    // Verifica duplicata — re-add idempotente (ex: synthetic_well via fixtures/
    // bridge/LLM) NÃO é erro: a função no-opa corretamente. Telemetry drain
    // (claude - bug 2026-06-14): era console.error → ingerido como erro
    // (~7 hits/7d); debug não polui telemetry_errors. Contrato (return null) intacto.
    if (families[normalizedId]) {
        console.debug(`[families] addCustomFamily: '${normalizedId}' já existe — no-op`);
        return null;
    }
    // Valida nome
    if (!name || typeof name !== 'string') {
        console.error('Nome da familia invalido');
        return null;
    }
    /**
     * Cria a nova familia.
     * - code: primeira letra maiuscula do ID
     * - custom: marca como personalizada (pode ser deletada)
     */
    const newFamily = {
        id: normalizedId,
        name: name.trim(),
        icon: icon,
        code: normalizedId.charAt(0).toUpperCase(),
        enabled: true,
        custom: true, // Marca como customizada
    };
    families[normalizedId] = newFamily;
    return newFamily;
}
/**
 * Remove uma familia personalizada.
 * Familias padrao nao podem ser removidas, apenas desativadas.
 *
 * @param {string} familyId - ID da familia
 * @returns {boolean} - true se removida, false se erro
 *
 * ATENCAO:
 * Esta funcao so remove a familia do registro.
 * Os elementos dessa familia devem ser removidos separadamente.
 */
export function deleteFamily(familyId: any) {
    const family = families[familyId];
    if (!family) {
        console.warn(`Familia nao encontrada: ${familyId}`);
        return false;
    }
    // So permite deletar familias customizadas
    if (!family.custom) {
        console.warn(`Familia padrao nao pode ser deletada: ${familyId}`);
        return false;
    }
    delete families[familyId];
    return true;
}
// ----------------------------------------------------------------
// FUNCOES DE SERIALIZACAO
// ----------------------------------------------------------------
/**
 * Exporta familias para formato salvavel.
 * Usado na exportacao do modelo.
 *
 * @returns {Object} - Copia das familias
 */
export function exportFamilies() {
    return { ...families };
}
/**
 * Importa familias de dados salvos.
 * Mescla com familias existentes.
 *
 * @param {Object} importedFamilies - Familias a importar
 *
 * LOGICA:
 * - Familias importadas sobrescrevem existentes
 * - Familias padrao sao mantidas (com config importada)
 */
export function importFamilies(importedFamilies: any) {
    if (!importedFamilies || typeof importedFamilies !== 'object') {
        return;
    }
    families = {
        ...DEFAULT_FAMILIES, // Garante familias padrao
        ...importedFamilies, // Sobrescreve com importadas
    };
}
/**
 * Reseta familias para o padrao.
 * Remove todas as customizadas.
 */
export function resetFamilies() {
    families = { ...DEFAULT_FAMILIES };
}
// ----------------------------------------------------------------
// FUNCOES AUXILIARES
// ----------------------------------------------------------------
/**
 * Gera codigo de familia para chave de exportacao.
 * Junta codigos de todas as familias usadas em ordem alfabetica.
 *
 * @param {Object[]} elements - Array de elementos do modelo
 * @returns {string} - Codigos concatenados (ex: "PMW" = Plume, Marker, Well)
 */
export function generateFamilyCodes(elements: any[]) {
    const codes = new Set();
    elements.forEach((element: any) => {
        const family = families[element.family];
        if (family?.code) {
            codes.add(family.code);
        }
    });
    // Ordena alfabeticamente e junta
    const sorted = Array.from(codes).sort().join('');
    // Retorna 'X' se vazio (nenhum elemento)
    return sorted || 'X';
}
