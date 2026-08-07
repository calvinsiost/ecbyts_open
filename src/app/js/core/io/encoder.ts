// @ts-check
// Generated from src/app/js/core/io/encoder.ts by TS-MIGRATION-001. Do not edit manually.
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
   CODIFICADOR DE CHAVES ECBT
   ================================================================

   Este modulo codifica o modelo em uma "chave" compacta.

   O QUE E UMA CHAVE?
   Uma string unica que contem todo o modelo compactado.
   Exemplo: ECBT.A0000001-PWM-AbCdEf12-A1B2-xYz...-10000000A.TBCE

   FORMATOS (diferenciados pelo tipo hex no prefixo):
   - Tipo A (simples): 6 segmentos (sem blockchain)
   - Tipo B (blockchain): 10 segmentos (hash-chain, assinatura, Merkle)
   - Tipo C (comprimido): 6 segmentos (deflate-raw + CRC-32)

   ESTRUTURA SIMPLES (tipo A):
   ECBT.A0000001 - PWM - AbCdEf12 - A1B2 - xYzBase64... - 10000000A.TBCE
   |               |     |          |      |               |
   |               |     |          |      |               +-- Sufixo bookend (reverse do prefixo)
   |               |     |          |      +------------------ Dados criptografados
   |               |     |          +------------------------- Checksum (verificacao)
   |               |     +------------------------------------ Salt (aleatorio)
   |               +------------------------------------------ Familias usadas
   +---------------------------------------------------------- Prefixo ECBT.{tipo}{versao_hex}

   ESTRUTURA BLOCKCHAIN (tipo B):
   ECBT.B0000001 - PWM - keyId - prevHash - merkle - sig - salt - check - dados - 10000000B.TBCE
   |               |     |       |          |        |     |       |       |       |
   |               |     |       |          |        |     |       |       |       +-- Sufixo bookend
   |               |     |       |          |        |     |       |       +---------- Payload
   |               |     |       |          |        |     |       +------------------ Checksum
   |               |     |       |          |        |     +-------------------------- Salt
   |               |     |       |          |        +-------------------------------- Assinatura
   |               |     |       |          +----------------------------------------- Merkle root
   |               |     |       +---------------------------------------------------- Hash anterior
   |               |     +------------------------------------------------------------ ID da chave
   |               +------------------------------------------------------------------ Familias
   +---------------------------------------------------------------------------------- Prefixo

   SEGURANCA:
   - XOR com salt aleatorio (ofuscacao)
   - Checksum para detectar corrupcao
   - Base64URL para URLs validas
   - Sufixo bookend para validacao estrutural
   - [blockchain] Hash-chain para rastreabilidade
   - [blockchain] Assinatura ECDSA para autoria
   - [blockchain] Merkle Tree para integridade

   ================================================================ */
import { CONFIG } from '../../config.js';
import { generateFamilyCodes } from '../elements/families.js';
import { crc32 } from './crc32.js';
import { compress, isCompressionSupported } from './compression.js';
// Primitivas de codificacao extraidas para modulo-folha (quebra ciclo
// decoder.js -> encoder.js). Re-exportadas abaixo para preservar a API
// publica de encoder.js (modulos externos podem importar destas).
import { xorCrypt, checksum, toBase64URL, fromBase64URL } from './codecShared.js';
export { xorCrypt, checksum, toBase64URL, fromBase64URL };
import { getSymbologyForExport } from '../symbology/manager.js';
import { exportIssues } from '../issues/manager.js';
import { exportPlumeAnimations } from '../sequencer/plumeAnimation.js';
import { exportPhotos } from '../photolog/manager.js';
// ----------------------------------------------------------------
// HELPERS DE PREFIXO/SUFIXO ECBT
// ----------------------------------------------------------------
/**
 * Constroi o prefixo ECBT com tipo e versao hex.
 * Ex: buildPrefix('A') → 'ECBT.A0000001'
 *
 * @param {string} type - Tipo de chave: 'A' (simples), 'B' (blockchain), 'C' (comprimido)
 * @returns {string} - Prefixo completo
 */
function buildPrefix(type: string) {
    return `${CONFIG.KEY_PREFIX}.${type}${CONFIG.KEY_VERSION_HEX}`;
}
/**
 * Constroi o sufixo bookend (reversao exata do prefixo).
 * Ex: buildSuffix('A') → '10000000A.TBCE'
 *
 * @param {string} type - Tipo de chave
 * @returns {string} - Sufixo bookend
 */
function buildSuffix(type: string) {
    return buildPrefix(type).split('').reverse().join('');
}
// ----------------------------------------------------------------
// FUNCOES PRINCIPAIS
// ----------------------------------------------------------------
/**
 * Codifica um modelo completo em uma chave.
 *
 * @param {any} model - Modelo a codificar
 * @returns {string} - Chave codificada
 *
 * PROCESSO:
 * 1. Converte modelo para JSON
 * 2. Converte JSON para bytes
 * 3. Gera salt aleatorio
 * 4. Criptografa bytes com XOR
 * 5. Calcula checksum
 * 6. Monta a chave final
 */
export function encodeKey(model: any, opts?: { authorId?: string }) {
    // F10 - recordUsage removido: enforcement atomico agora em export.js via checkAndConsume
    // TRUST-007: authorId opt-in (UUID Supabase). Caller que quer auditoria de autor
    // (generateAuthoredKey) passa o UUID; caller anonimo/autosave omite e o payload fica
    // idêntico ao histórico. Lookup separado de nome/email na UI evita PII embarcado (LGPD).
    if (opts?.authorId) model.authorId = opts.authorId;
    // Inclui perfis de simbologia antes de serializar
    model.symbologyProfiles = getSymbologyForExport();
    // Inclui issues 3D no modelo para exportacao
    try {
        model.issues = exportIssues();
    } catch (e: any) {
        console.debug('[encoder] export-issues:', e?.message || e); /* original: issues module not loaded */
    }
    // Inclui animacoes de pluma (apenas metadados, sem grids brutos)
    try {
        model.plumeAnimations = exportPlumeAnimations();
    } catch (e: any) {
        console.debug(
            '[encoder] export-plume-animations:',
            e?.message || e,
        ); /* original: plumeAnimation module not loaded */
    }
    // Inclui metadados do PhotoLog (sem blobs - apenas metadata)
    try {
        model.photoLog = exportPhotos();
    } catch (e: any) {
        console.debug('[encoder] export-photolog:', e?.message || e); /* original: photolog module not loaded */
    }
    // Inclui referência de ownership se registrado (opt-in, não quebra retrocompatibilidade)
    if (model._ownershipRef) {
        model.ownershipRef = model._ownershipRef;
        delete model._ownershipRef; // limpa campo interno antes de serializar
    }
    // Inclui Modo Apresentação se model.presentation já estiver populado pelo caller
    // (ver utils/handlers/export.js - injeta active presentation antes de encodeKey)
    // Backward compat: chaves sem campo `presentation` carregam normalmente
    // 1. Converte modelo para string JSON
    const json = JSON.stringify(model);
    // 2. Converte string para bytes (Uint8Array)
    const bytes = new TextEncoder().encode(json);
    // 3. Gera salt aleatorio (8 bytes)
    const salt = new Uint8Array(8);
    crypto.getRandomValues(salt);
    // 4. Criptografa com XOR
    const encrypted = xorCrypt(bytes, salt);
    // 5. Calcula checksum dos dados criptografados
    const check = checksum(encrypted);
    // 6. Extrai codigos de familia
    const codes = generateFamilyCodes(model.elements || []);
    // 7. Monta a chave ECBT simples (tipo A)
    // Formato: ECBT.A{hex}-{familias}-{salt}-{checksum}-{dados}-{sufixo}
    const prefix = buildPrefix(CONFIG.KEY_TYPES.SIMPLE);
    const suffix = buildSuffix(CONFIG.KEY_TYPES.SIMPLE);
    return `${prefix}-${codes}-${toBase64URL(salt)}-${check}-${toBase64URL(encrypted)}-${suffix}`;
}
// ----------------------------------------------------------------
// CRIPTOGRAFIA / CONVERSAO BASE64
// ----------------------------------------------------------------
// xorCrypt, checksum, toBase64URL e fromBase64URL movidos para
// ./codecShared.js (modulo-folha) e re-exportados no topo deste
// arquivo. A API publica de encoder.js permanece inalterada.
// ----------------------------------------------------------------
// CODIFICACAO ECO1 BLOCKCHAIN
// ----------------------------------------------------------------
/**
 * Codifica um modelo com recursos de blockchain (ECBT tipo B).
 * Inclui hash-chain, assinatura digital e Merkle Tree.
 *
 * @param {any} model - Modelo a codificar
 * @param {any} [options] - Opcoes de codificacao (keyId obrigatorio)
 * @returns {Promise<string>} - Chave ECBT blockchain codificada
 *
 * PROCESSO:
 * 1. Importa modulos de crypto dinamicamente
 * 2. Cria metadados da cadeia (prevHash, version)
 * 3. Constroi Merkle Tree
 * 4. Adiciona metadados ao modelo
 * 5. Codifica modelo (JSON -> bytes -> XOR -> Base64URL)
 * 6. Assina a chave
 * 7. Monta chave final
 */
export async function encodeKeyV3(model: any, options: any = {}) {
    // F10 - recordUsage removido: enforcement atomico agora em export.js via checkAndConsume
    const { keyId, previousKey = null, previousVersion = 0 } = options;
    if (!keyId) {
        throw new Error('keyId e obrigatorio para blockchain');
    }
    // Importa modulos de crypto dinamicamente
    const { createChainMeta, GENESIS } = await import('../crypto/hashChain.js');
    const { buildMerkleTree } = await import('../crypto/merkle.js');
    const { signData } = await import('../crypto/signer.js');
    // 1. Cria metadados da cadeia
    const chainMeta = await createChainMeta(previousKey, previousVersion);
    // 2. Constroi Merkle Tree
    const merkle = await buildMerkleTree(model);
    // 3. Adiciona metadados ao modelo
    const modelWithMeta = {
        ...model,
        ecbyts: CONFIG.VERSION_BLOCKCHAIN,
        chain: chainMeta,
        merkle: { root: merkle.root, algorithm: 'sha256' },
        author: { keyId },
    };
    // 4. Codifica modelo (mesmo processo do formato simples)
    const json = JSON.stringify(modelWithMeta);
    const bytes = new TextEncoder().encode(json);
    const salt = new Uint8Array(8);
    crypto.getRandomValues(salt);
    const encrypted = xorCrypt(bytes, salt);
    const check = checksum(encrypted);
    // 5. Extrai codigos de familia
    const codes = generateFamilyCodes(model.elements || []);
    // 6. Monta dados para assinar (tudo exceto assinatura)
    const { FIELD_LENGTHS } = CONFIG.BLOCKCHAIN;
    const prevHashTrunc =
        chainMeta.prevHash === GENESIS ? GENESIS : chainMeta.prevHash.slice(0, FIELD_LENGTHS.PREV_HASH);
    const merkleRootTrunc = merkle.root.slice(0, FIELD_LENGTHS.MERKLE_ROOT);
    const saltB64 = toBase64URL(salt);
    const payloadB64 = toBase64URL(encrypted);
    const prefix = buildPrefix(CONFIG.KEY_TYPES.BLOCKCHAIN);
    const suffix = buildSuffix(CONFIG.KEY_TYPES.BLOCKCHAIN);
    const dataToSign = `${prefix}-${codes}-${keyId}-${prevHashTrunc}-${merkleRootTrunc}-${saltB64}-${check}-${payloadB64}`;
    // 7. Assina
    // Use full ECDSA signature to keep strict verification cryptographically sound.
    // Legacy truncated signatures remain parseable on decode for backward compatibility.
    const signature = await signData(keyId, dataToSign);
    // 8. Monta chave final ECBT blockchain (tipo B) com sufixo bookend
    return `${prefix}-${codes}-${keyId}-${prevHashTrunc}-${merkleRootTrunc}-${signature}-${saltB64}-${check}-${payloadB64}-${suffix}`;
}
// ----------------------------------------------------------------
// CODIFICACAO ECBT COMPRIMIDA (TIPO C)
// ----------------------------------------------------------------
/**
 * Codifica um modelo em chave ECBT comprimida (tipo C).
 *
 * PIPELINE:
 *   JSON.stringify → TextEncoder → compress(deflate-raw) → XOR(salt) → CRC-32 → Base64URL
 *
 * FORMATO:
 *   ECBT.C{hex}-{familias}-{salt}-{crc32_8hex}-{payload}-{sufixo}
 *
 * REDUCAO TIPICA: ~95% menor que tipo A (validado com modelos reais).
 *
 * DECISOES DE DESIGN:
 * - compress→XOR (nao XOR→compress): XOR destroi padroes, DEFLATE precisa deles.
 *   Testado: XOR→compress e 2.7x maior.
 * - CRC-32 (8 hex) em vez de mod-65536 (4 hex): deteccao de corrupcao superior.
 * - Sem compactor/dictionary: DEFLATE sozinho da 95.7% de reducao. Null-strip
 *   adicionaria apenas 1.74% extra - complexidade nao justificada.
 *
 * COMPATIBILIDADE:
 * - Se CompressionStream nao disponivel, faz fallback para encodeKey() (tipo A).
 * - Chaves comprimidas sao detectadas pelo tipo 'C' no prefixo ECBT.C{hex}.
 *
 * @param {any} model - Modelo a codificar
 * @returns {Promise<string>} - Chave ECBT comprimida
 */
export async function encodeKeyV4(model: any) {
    // Fallback: se browser nao suporta compressao, gera chave tipo A
    if (!isCompressionSupported()) {
        console.warn('[ECBT] CompressionStream indisponivel. Gerando chave tipo A (sem compressao).');
        return encodeKey(model);
    }
    // 1. Serializa modelo para JSON e converte para bytes
    const json = JSON.stringify(model);
    const bytes = new TextEncoder().encode(json);
    // 2. Comprime com deflate-raw
    const compressed = await compress(bytes);
    // 3. Gera salt aleatorio (8 bytes)
    const salt = new Uint8Array(8);
    crypto.getRandomValues(salt);
    // 4. XOR apos compressao (preserva padroes para DEFLATE)
    const encrypted = xorCrypt(compressed, salt);
    // 5. CRC-32 dos dados criptografados (8 hex chars)
    const check = crc32(encrypted);
    // 6. Extrai codigos de familia
    const codes = generateFamilyCodes(model.elements || []);
    // 7. Monta chave ECBT comprimida (tipo C) com sufixo bookend
    const prefix = buildPrefix(CONFIG.KEY_TYPES.COMPRESSED);
    const suffix = buildSuffix(CONFIG.KEY_TYPES.COMPRESSED);
    return `${prefix}-${codes}-${toBase64URL(salt)}-${check}-${toBase64URL(encrypted)}-${suffix}`;
}
/**
 * Codifica modelo com opcao de blockchain ou compressao.
 * Decide automaticamente entre formatos.
 *
 * @param {any} model - Modelo a codificar
 * @param {{useBlockchain?: boolean, useCompression?: boolean, keyId?: string, previousKey?: string, previousVersion?: number}} [options] - Opcoes
 * @returns {Promise<string>} - Chave codificada
 *
 * PRIORIDADE: blockchain > compressao > simples
 */
export async function encodeKeyAuto(model: any, options: any = {}) {
    const { useBlockchain = false, useCompression = false, keyId, previousKey, previousVersion } = options;
    if (useBlockchain) {
        return encodeKeyV3(model, /** @type {any} */ ({ keyId, previousKey, previousVersion }));
    }
    if (useCompression) {
        return encodeKeyV4(model);
    }
    // Formato simples (sincrono)
    return encodeKey(model);
}
//# sourceMappingURL=encoder.js.map
//# sourceMappingURL=encoder.js.map
