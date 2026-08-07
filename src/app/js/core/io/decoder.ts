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
   DECODIFICADOR DE CHAVES
   ================================================================

   Este modulo decodifica chaves de volta para modelos.

   VERSOES SUPORTADAS:
   - ECO1 simples: Formato simples (sem blockchain)
   - ECO1 blockchain: Com blockchain (hash-chain, assinatura, Merkle)

   PROCESSO DE DECODIFICACAO:
   1. Detecta versao (ECO1 simples ou blockchain)
   2. Valida formato da chave
   3. Extrai componentes
   4. Verifica checksum
   5. [ECO1 blockchain] Verifica assinatura e Merkle
   6. Descriptografa dados
   7. Converte JSON para objeto

   FORMATO ECO1 simples:
   ECO{versao}-{familias}-{salt}-{checksum}-{dados}

   FORMATO ECO1 blockchain:
   ECO1-{familias}-{keyId}-{prevHash}-{merkle}-{sig}-{salt}-{check}-{dados}

   ================================================================ */
import { xorCrypt, checksum, fromBase64URL } from './codecShared.js';
import { crc32 } from './crc32.js';
import { decompress } from './compression.js';
import { loadSymbologyFromImport } from '../symbology/manager.js';
import { importIssues } from '../issues/manager.js';
import { importPhotos } from '../photolog/manager.js';
// ----------------------------------------------------------------
// EXPRESSOES REGULARES PARA VALIDACAO
// ----------------------------------------------------------------
/**
 * Regex para ECO1/ECO2 simples (5 segmentos, checksum 4 hex).
 * ECO{ver}-{familias}-{salt}-{checksum4}-{payload}
 */
// --- FORMATO ECBT (novo) ---
// Prefixo: ECBT.{tipo}{7hex}  |  Sufixo: reversao exata do prefixo
// Tipo A = simples, B = blockchain, C = comprimido
/** Detecta prefixo ECBT e captura tipo + versao hex. */
const KEY_REGEX = /^ECBT\.([A-D])([0-9A-Fa-f]{7})-/;
/** Simples (6 segmentos): ECBT.A{7hex}-{fam}-{salt}-{check4}-{payload}-{suffix} */
const KEY_REGEX_V2 =
    /^ECBT\.A([0-9A-Fa-f]{7})-([A-Z]+)-([A-Za-z0-9_-]+)-([A-F0-9]{4})-([A-Za-z0-9_-]+)-([0-9A-Fa-f]{7}A\.TBCE)$/;
/** Blockchain (10 segmentos): ECBT.B{7hex}-{fam}-{keyId}-{prev}-{merkle}-{sig}-{salt}-{check}-{payload}-{suffix} */
const KEY_REGEX_V3 =
    /^ECBT\.B([0-9A-Fa-f]{7})-([A-Z]+)-([a-f0-9]{8})-([A-Za-z0-9_-]+|GENESIS)-([A-Za-z0-9_-]{16})-([A-Za-z0-9_-]{64,128})-([A-Za-z0-9_-]+)-([A-F0-9]{4})-([A-Za-z0-9_-]+)-([0-9A-Fa-f]{7}B\.TBCE)$/;
/** Comprimido (6 segmentos): ECBT.C{7hex}-{fam}-{salt}-{crc32_8hex}-{payload}-{suffix} */
const KEY_REGEX_V4 =
    /^ECBT\.C([0-9A-Fa-f]{7})-([A-Z]*)-([A-Za-z0-9_-]+)-([A-F0-9]{8})-([A-Za-z0-9_-]+)-([0-9A-Fa-f]{7}C\.TBCE)$/;
/** Criptografado (8 segmentos): ECBT.D{7hex}-{fam}-{kid}-{salt}-{check8}-{envelope}-{suffix} */
const KEY_REGEX_TYPE_D =
    /^ECBT\.D0000001-([A-Z0-9]+)-([a-fA-F0-9]+)-([A-Za-z0-9_-]+)-([A-Za-z0-9]+)-([A-Za-z0-9_-]+)-10000000D\.TBCE$/;
// --- FORMATO ECO LEGADO (backward compat) ---
/** ECO1/ECO2 simples legado (5 segmentos). */
const KEY_REGEX_V2_LEGACY = /^ECO(\d+)-([A-Z]+)-([A-Za-z0-9_-]+)-([A-F0-9]{4})-([A-Za-z0-9_-]+)$/;
/** ECO1 blockchain legado (9 segmentos). */
const KEY_REGEX_V3_LEGACY =
    /^ECO(\d+)-([A-Z]+)-([a-f0-9]{8})-([A-Za-z0-9_-]+|GENESIS)-([A-Za-z0-9_-]{16})-([A-Za-z0-9_-]{64,128})-([A-Za-z0-9_-]+)-([A-F0-9]{4})-([A-Za-z0-9_-]+)$/;
/** ECO4 comprimida legada (5 segmentos, CRC-32). */
const KEY_REGEX_V4_LEGACY = /^ECO4-([A-Z]*)-([A-Za-z0-9_-]+)-([A-F0-9]{8})-([A-Za-z0-9_-]+)$/;
/** Detecta prefixo numerico ECO legado. */
const KEY_REGEX_LEGACY = /^ECO(\d+)-/;
// ----------------------------------------------------------------
// FUNCAO PRINCIPAL
// ----------------------------------------------------------------
/**
 * Decodifica uma chave para objeto modelo.
 * Detecta automaticamente o formato: ECBT (novo) ou ECO (legado).
 * Dentro de cada formato, diferencia simples/blockchain/comprimido.
 *
 * @param {string} key - Chave a decodificar (ECBT ou ECO)
 * @returns {Object} - Modelo decodificado
 * @throws {Error} - Se chave invalida ou corrompida
 *
 * EXEMPLO:
 *   try {
 *     const model = decodeKey('ECBT.A0000001-PWM-AbCd...-10000000A.TBCE');
 *     console.log(model.project.name);
 *   } catch (error: any) {
 *     console.error('Chave invalida:', error.message);
 *   }
 */
export function decodeKey(key: string) {
    const cleanKey = key.trim();
    // --- Passo 1: tenta formato ECBT (novo) ---
    const ecbtMatch = cleanKey.match(KEY_REGEX);
    if (ecbtMatch) {
        const type = ecbtMatch[1]; // A, B, C ou D
        if (type === 'C') {
            throw new Error(
                'Chave ECBT comprimida (tipo C) requer decodificacao assincrona. ' +
                    'Use decodeKeyUniversal() ou importFromString() em vez de decodeKey().',
            );
        }
        if (type === 'D') {
            throw new Error(
                'Chave ECBT criptografada (tipo D) requer decodificacao assincrona + chave privada ECDH do recipient. ' +
                    'Use decodeKeyTypeD(key, {myProfileId, myPrivateKey}) de core/io/typeD.js — SPEC ECBT-CRYPT-001.',
            );
        }
        if (type === 'B' && KEY_REGEX_V3.test(cleanKey)) {
            const model = decodeKeyV3Sync(cleanKey);
            _restorePostDecode(model, true);
            return model;
        }
        const model = decodeKeyV2(cleanKey);
        _restorePostDecode(model, false);
        return model;
    }
    // --- Passo 2: fallback para formato ECO legado ---
    const legacyMatch = cleanKey.match(KEY_REGEX_LEGACY);
    if (legacyMatch) {
        const ver = parseInt(legacyMatch[1] || '', 10);
        if (ver === 4) {
            throw new Error(
                'Chave ECO4 (comprimida) requer decodificacao assincrona. ' +
                    'Use decodeKeyUniversal() ou importFromString() em vez de decodeKey().',
            );
        }
        if (KEY_REGEX_V3_LEGACY.test(cleanKey)) {
            const model = decodeKeyV3Sync(cleanKey, true);
            _restorePostDecode(model, true);
            return model;
        }
        const model = decodeKeyV2(cleanKey, true);
        _restorePostDecode(model, false);
        return model;
    }
    throw new Error('Formato de chave invalido. Esperado prefixo ECBT.{tipo}{hex}- ou ECO{versao}-');
}
/**
 * Aplica restauracoes pos-decodificacao comuns a todos os formatos.
 * @param {any} model
 * @param {boolean} hasBlockchain - Se true, restaura issues (blockchain only)
 */
function _restorePostDecode(model: any, hasBlockchain: boolean) {
    _restoreSymbology(model);
    if (hasBlockchain) _restoreIssues(model);
    _restorePlumeAnimations(model);
    _restorePhotoLog(model);
    if (model.ownershipRef) model.ownership = model.ownershipRef;
}
/**
 * Decodifica chave simples (ECBT tipo A ou ECO legado).
 * @param {string} key - Chave a decodificar
 * @param {boolean} [legacy=false] - Se true, usa regex ECO legado
 */
function decodeKeyV2(key: string, legacy = false) {
    const regex = legacy ? KEY_REGEX_V2_LEGACY : KEY_REGEX_V2;
    const match = key.match(regex);
    if (!match) {
        throw new Error(
            legacy
                ? 'Formato de chave ECO invalido. Esperado: ECO{versao}-{familias}-{salt}-{checksum}-{dados}'
                : 'Formato de chave ECBT invalido. Esperado: ECBT.A{hex}-{familias}-{salt}-{checksum}-{dados}-{sufixo}',
        );
    }
    // ECBT: [, version, families, salt, check, payload, suffix]
    // ECO:  [, version, families, salt, check, payload]
    const [, _version, _families, saltB64, check, payload] = match;
    // Decodifica salt e dados
    const salt = fromBase64URL(saltB64 || '');
    const encrypted = fromBase64URL(payload || '');
    // Verifica checksum
    const calculatedCheck = checksum(encrypted);
    if (check !== calculatedCheck) {
        throw new Error(
            `Checksum invalido. Esperado: ${check}, Calculado: ${calculatedCheck}. A chave pode estar corrompida.`,
        );
    }
    // Descriptografa dados
    const decrypted = xorCrypt(encrypted, salt);
    const json = new TextDecoder().decode(decrypted);
    try {
        return JSON.parse(json);
    } catch (_parseError) {
        throw new Error('Erro ao interpretar dados. O conteudo da chave esta corrompido.', { cause: _parseError });
    }
}
/**
 * Decodifica chave blockchain de forma sincrona (sem verificar assinatura).
 * Suporta ECBT tipo B e ECO legado.
 * @param {string} key
 * @param {boolean} [legacy=false]
 */
function decodeKeyV3Sync(key: string, legacy = false) {
    const regex = legacy ? KEY_REGEX_V3_LEGACY : KEY_REGEX_V3;
    const match = key.match(regex);
    if (!match) {
        throw new Error('Formato de chave blockchain invalido.');
    }
    // ECBT: [, version, fam, keyId, prev, merkle, sig, salt, check, payload, suffix]
    // ECO:  [, version, fam, keyId, prev, merkle, sig, salt, check, payload]
    const [, version, _families, keyId, prevHash, merkleRoot, signature, saltB64, check, payload] = match;
    // Decodifica salt e dados
    const salt = fromBase64URL(saltB64 || '');
    const encrypted = fromBase64URL(payload || '');
    // Verifica checksum
    const calculatedCheck = checksum(encrypted);
    if (check !== calculatedCheck) {
        throw new Error(`Checksum invalido. Esperado: ${check}, Calculado: ${calculatedCheck}.`);
    }
    // Descriptografa dados
    const decrypted = xorCrypt(encrypted, salt);
    const json = new TextDecoder().decode(decrypted);
    try {
        const model = JSON.parse(json);
        // Adiciona metadados de verificacao (pendente)
        model._verification = {
            version: parseInt(version || '', 10),
            keyId,
            prevHash,
            merkleRoot,
            signature,
            verified: false, // Precisa chamar decodeKeyV3 para verificar
            status: 'pending',
        };
        return model;
    } catch (_parseError) {
        throw new Error('Erro ao interpretar dados. O conteudo da chave esta corrompido.', { cause: _parseError });
    }
}
/**
 * Decodifica chave blockchain com verificacao completa.
 * Verifica assinatura digital e integridade Merkle.
 * Suporta ECBT tipo B e ECO legado.
 *
 * @param {string} key - Chave blockchain (ECBT ou ECO)
 * @param {Object} options - Opcoes
 * @param {boolean} [options.verifySignature=true] - Verificar assinatura
 * @param {boolean} [options.verifyMerkle=true] - Verificar Merkle root
 * @returns {Promise<Object>} - Modelo com status de verificacao
 */
export async function decodeKeyV3(key: string, options: any = {}) {
    const { verifySignature = true, verifyMerkle = true } = options;
    const cleanKey = key.trim();
    // Tenta ECBT primeiro, fallback para legado
    const isLegacy = !cleanKey.match(KEY_REGEX);
    const regex = isLegacy ? KEY_REGEX_V3_LEGACY : KEY_REGEX_V3;
    const match = cleanKey.match(regex);
    if (!match) {
        throw new Error('Formato de chave blockchain invalido.');
    }
    const [, version, families, keyId, prevHash, merkleRoot, signature, saltB64, check, payload] = match;
    // Decodifica e descriptografa
    const salt = fromBase64URL(saltB64 || '');
    const encrypted = fromBase64URL(payload || '');
    const calculatedCheck = checksum(encrypted);
    if (check !== calculatedCheck) {
        throw new Error(`Checksum invalido.`);
    }
    const decrypted = xorCrypt(encrypted, salt);
    const json = new TextDecoder().decode(decrypted);
    const model = JSON.parse(json);
    // Prepara resultado de verificacao
    /** @type {Record<string, any>} */
    const verification: any = {
        version: parseInt(version || '', 10),
        keyId,
        prevHash,
        merkleRoot,
        signatureValid: null,
        merkleValid: null,
        verified: false,
        status: 'pending',
    };
    // Verifica assinatura
    if (verifySignature) {
        try {
            const { verifySignature: verifySig } = await import('../crypto/signer.js');
            // Reconstroi dados que foram assinados (prefixo depende se legado ou ECBT)
            // decodeKeyV3 trata apenas tipo B - prefixo não-legado inclui 'B' explícito.
            const prefix = isLegacy ? `ECO${version}` : `ECBT.B${version}`;
            const dataToVerify = `${prefix}-${families}-${keyId}-${prevHash}-${merkleRoot}-${saltB64}-${check}-${payload}`;
            verification.signatureValid = await verifySig(keyId, dataToVerify, signature);
        } catch (err: any) {
            console.warn('Erro ao verificar assinatura:', /** @type {any} */ err?.message);
            verification.signatureValid = false;
            verification.signatureError = /** @type {any} */ err?.message;
        }
    }
    // Verifica Merkle root
    if (verifyMerkle) {
        try {
            const { verifyModelIntegrity } = await import('../crypto/merkle.js');
            const result = await verifyModelIntegrity(model, merkleRoot);
            verification.merkleValid = result.valid;
        } catch (err: any) {
            console.warn('Erro ao verificar Merkle:', /** @type {any} */ err?.message);
            verification.merkleValid = false;
            verification.merkleError = /** @type {any} */ err?.message;
        }
    }
    // Status final
    if (verification.signatureValid === true && verification.merkleValid === true) {
        verification.verified = true;
        verification.status = 'verified';
    } else if (verification.signatureValid === false || verification.merkleValid === false) {
        verification.status = 'invalid';
    } else {
        verification.status = 'partial';
    }
    model._verification = verification;
    return model;
}
// ----------------------------------------------------------------
// DECODIFICACAO COMPRIMIDA (ECBT TIPO C / ECO4 LEGADO)
// ----------------------------------------------------------------
/**
 * Decodifica chave comprimida (ECBT tipo C ou ECO4 legado).
 *
 * PIPELINE INVERSO:
 *   Base64URL → XOR(salt) → decompress(deflate-raw) → TextDecoder → JSON.parse
 *
 * @param {string} key - Chave comprimida (ECBT ou ECO4)
 * @returns {Promise<Object>} - Modelo decodificado
 * @throws {Error} - Se formato invalido, CRC falha, ou descompressao falha
 */
export async function decodeKeyV4(key: string) {
    const cleanKey = key.trim();
    // Tenta ECBT primeiro, fallback para legado
    let match = cleanKey.match(KEY_REGEX_V4);
    const isLegacy = !match;
    if (isLegacy) {
        match = cleanKey.match(KEY_REGEX_V4_LEGACY);
    }
    if (!match) {
        throw new Error(
            'Formato de chave comprimida invalido. Esperado: ECBT.C{hex}-{fam}-{salt}-{crc32}-{dados}-{sufixo} ou ECO4-{fam}-{salt}-{crc32}-{dados}',
        );
    }
    // ECBT: [, version, families, salt, check, payload, suffix]
    // ECO4: [, families, salt, check, payload]
    const _families = isLegacy ? match[1] : match[2];
    const saltB64 = isLegacy ? match[2] : match[3];
    const check = isLegacy ? match[3] : match[4];
    const payload = isLegacy ? match[4] : match[5];
    // 1. Decodifica Base64URL
    const salt = fromBase64URL(saltB64 || '');
    const encrypted = fromBase64URL(payload || '');
    // 2. Verifica CRC-32
    const calculatedCheck = crc32(encrypted);
    if (check !== calculatedCheck) {
        throw new Error(
            `CRC-32 invalido. Esperado: ${check}, Calculado: ${calculatedCheck}. ` +
                'A chave pode estar corrompida ou truncada.',
        );
    }
    // 3. XOR para reverter ofuscacao (mesma operacao - XOR e reversivel)
    const compressed = xorCrypt(encrypted, salt);
    // 4. Descomprime (deflate-raw) - async
    let decompressed;
    try {
        decompressed = await decompress(compressed);
    } catch (err: any) {
        const errMsg = /** @type {any} */ err?.message || '';
        throw new Error(
            'Erro ao descomprimir chave. ' +
                (errMsg.includes('Compression Streams') ? errMsg : 'Os dados podem estar corrompidos.'),
            { cause: err },
        );
    }
    // 5. Converte bytes para string e parse JSON
    const json = new TextDecoder().decode(decompressed);
    try {
        return JSON.parse(json);
    } catch (_parseError) {
        throw new Error('Erro ao interpretar dados da chave comprimida. O conteudo esta corrompido.', {
            cause: _parseError,
        });
    }
}
/**
 * Decodifica qualquer versao de chave (ECBT novo ou ECO legado).
 * Detecta o formato automaticamente pelo prefixo.
 *
 * Esta e a funcao recomendada para decodificacao universal.
 * E async porque tipo C/ECO4 requer descompressao via Streams API.
 *
 * @param {string} key - Chave ECBT ou ECO de qualquer versao
 * @param {import('./typeD.js').DecodeTypeDOptions} [options] - Credenciais exigidas apenas para Tipo D
 * @returns {Promise<Object>} - Modelo decodificado
 * @throws {Error} - Se formato invalido ou dados corrompidos
 *
 * ORDEM DE DETECCAO:
 * 1. ECBT.C / ECO4 → decodeKeyV4 (async, comprimida)
 * 2. ECBT.B / ECO blockchain → decodeKeyV3Sync
 * 3. ECBT.A / ECO simples → decodeKeyV2
 */
export async function decodeKeyUniversal(key: string, options?: import('./typeD.js').DecodeTypeDOptions) {
    const cleanKey = key.trim();
    // --- Tenta ECBT (novo) ---
    const ecbtMatch = cleanKey.match(KEY_REGEX);
    if (ecbtMatch) {
        const type = ecbtMatch[1];
        if (type === 'C') return decodeKeyV4(cleanKey);
        if (type === 'D') {
            const { decodeKeyTypeD } = await import('./typeD.js');
            return decodeKeyTypeD(cleanKey, options as import('./typeD.js').DecodeTypeDOptions);
        }
        if (type === 'B' && KEY_REGEX_V3.test(cleanKey)) return decodeKeyV3Sync(cleanKey);
        return decodeKeyV2(cleanKey);
    }
    // --- Fallback ECO legado ---
    const legacyMatch = cleanKey.match(KEY_REGEX_LEGACY);
    if (legacyMatch) {
        const ver = parseInt(legacyMatch[1] || '', 10);
        if (ver === 4) return decodeKeyV4(cleanKey);
        if (KEY_REGEX_V3_LEGACY.test(cleanKey)) return decodeKeyV3Sync(cleanKey, true);
        return decodeKeyV2(cleanKey, true);
    }
    throw new Error('Formato de chave invalido. Esperado prefixo ECBT.{tipo}{hex}- ou ECO{versao}-');
}
/**
 * Versao async de parseInput.
 * Suporta chaves ECBT e ECO (todas as versoes) alem de JSON.
 *
 * @param {string} input - Chave ECBT/ECO ou JSON
 * @param {import('./typeD.js').DecodeTypeDOptions} [options] - Credenciais exigidas apenas para Tipo D
 * @returns {Promise<Object>} - Modelo decodificado
 * @throws {Error} - Se nenhum formato funcionar
 */
export async function parseInputAsync(input: string, options?: import('./typeD.js').DecodeTypeDOptions) {
    if (!input || typeof input !== 'string') {
        throw new Error('Input vazio ou invalido');
    }
    const trimmed = input.trim();
    // JSON direto
    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed);
        } catch (e: any) {
            throw new Error('JSON invalido: ' + /** @type {any} */ e.message, { cause: e });
        }
    }
    // Chave ECBT (novo) ou ECO (legado)
    if (trimmed.startsWith('ECBT') || trimmed.startsWith('ECO')) {
        return decodeKeyUniversal(trimmed, options);
    }
    throw new Error('Formato nao reconhecido. Use uma chave ECBT, ECO ou JSON.');
}
// ----------------------------------------------------------------
// FUNCOES DE VALIDACAO
// ----------------------------------------------------------------
/**
 * Verifica se uma string parece ser uma chave valida.
 * Suporta ECBT (novo) e ECO (legado).
 *
 * @param {string} str - String a verificar
 * @returns {boolean} - true se parece ser chave valida
 */
export function isValidKeyFormat(str: string) {
    if (!str || typeof str !== 'string') {
        return false;
    }
    const trimmed = str.trim();
    return (
        KEY_REGEX_TYPE_D.test(trimmed) ||
        KEY_REGEX_V4.test(trimmed) ||
        KEY_REGEX_V3.test(trimmed) ||
        KEY_REGEX_V2.test(trimmed) ||
        KEY_REGEX_V4_LEGACY.test(trimmed) ||
        KEY_REGEX_V3_LEGACY.test(trimmed) ||
        KEY_REGEX_V2_LEGACY.test(trimmed)
    );
}
/**
 * Detecta a versao/tipo de uma chave.
 * Para ECBT retorna tipo (A/B/C/D), para ECO legado retorna numero (1-4).
 *
 * @param {string} key - Chave ECBT ou ECO
 * @returns {string|number|null} - 'A'/'B'/'C'/'D' (ECBT), 1-4 (ECO), ou null se invalida
 */
export function detectKeyVersion(key: string) {
    if (!key || typeof key !== 'string') {
        return null;
    }
    const trimmed = key.trim();
    // ECBT novo
    if (KEY_REGEX_TYPE_D.test(trimmed)) return 'D';
    if (KEY_REGEX_V4.test(trimmed)) return 'C';
    if (KEY_REGEX_V3.test(trimmed)) return 'B';
    if (KEY_REGEX_V2.test(trimmed)) return 'A';
    // ECO legado
    if (KEY_REGEX_V4_LEGACY.test(trimmed)) return 4;
    if (KEY_REGEX_V3_LEGACY.test(trimmed)) return 3;
    if (KEY_REGEX_V2_LEGACY.test(trimmed)) {
        const match = trimmed.match(/^ECO(\d+)-/);
        return match ? parseInt(match[1] || '', 10) : 2;
    }
    return null;
}
/**
 * Verifica se uma string e JSON valido.
 *
 * @param {string} str - String a verificar
 * @returns {boolean} - true se e JSON valido
 */
export function isValidJSON(str: string) {
    if (!str || typeof str !== 'string') {
        return false;
    }
    try {
        JSON.parse(str.trim());
        return true;
    } catch {
        return false;
    }
}
/**
 * Tenta decodificar string como chave ou JSON.
 * Util quando nao sabemos o formato do input.
 *
 * @param {string} input - Chave ECBT/ECO ou JSON
 * @returns {Object} - Modelo decodificado
 * @throws {Error} - Se nenhum formato funcionar
 *
 * LOGICA:
 * 1. Se comeca com '{', tenta como JSON
 * 2. Se comeca com 'ECBT' ou 'ECO', tenta como chave
 * 3. Se nenhum funcionar, lanca erro
 */
export function parseInput(input: string) {
    if (!input || typeof input !== 'string') {
        throw new Error('Input vazio ou invalido');
    }
    const trimmed = input.trim();
    // Tenta como JSON direto
    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed);
        } catch (e: any) {
            throw new Error('JSON invalido: ' + /** @type {any} */ e.message, { cause: e });
        }
    }
    // Tenta como chave ECBT (novo) ou ECO (legado)
    if (trimmed.startsWith('ECBT') || trimmed.startsWith('ECO')) {
        return decodeKey(trimmed);
    }
    throw new Error('Formato nao reconhecido. Use uma chave ECBT, ECO ou JSON.');
}
// ----------------------------------------------------------------
// FUNCOES DE EXTRACAO DE METADADOS
// ----------------------------------------------------------------
/**
 * Extrai metadados de uma chave sem decodificar completamente.
 * Util para preview rapido. Suporta ECBT (novo) e ECO (legado).
 *
 * @param {string} key - Chave ECBT ou ECO
 * @returns {Object|null} - Metadados ou null se invalida
 */
export function extractKeyMetadata(key: string) {
    if (!key || typeof key !== 'string') {
        return null;
    }
    const trimmed = key.trim();
    // --- ECBT novo ---
    const matchV4 = trimmed.match(KEY_REGEX_V4);
    if (matchV4) {
        return {
            version: 'C' + matchV4[1],
            families: matchV4[2],
            isValid: true,
            hasBlockchain: false,
            isCompressed: true,
        };
    }
    const matchV3 = trimmed.match(KEY_REGEX_V3);
    if (matchV3) {
        return {
            version: 'B' + matchV3[1],
            families: matchV3[2],
            keyId: matchV3[3],
            prevHash: matchV3[4],
            merkleRoot: matchV3[5],
            isValid: true,
            hasBlockchain: true,
            isCompressed: false,
        };
    }
    const matchV2 = trimmed.match(KEY_REGEX_V2);
    if (matchV2) {
        return {
            version: 'A' + matchV2[1],
            families: matchV2[2],
            isValid: true,
            hasBlockchain: false,
            isCompressed: false,
        };
    }
    // --- ECO legado ---
    const matchV4L = trimmed.match(KEY_REGEX_V4_LEGACY);
    if (matchV4L) {
        return { version: '4', families: matchV4L[1], isValid: true, hasBlockchain: false, isCompressed: true };
    }
    const matchV3L = trimmed.match(KEY_REGEX_V3_LEGACY);
    if (matchV3L) {
        return {
            version: matchV3L[1],
            families: matchV3L[2],
            keyId: matchV3L[3],
            prevHash: matchV3L[4],
            merkleRoot: matchV3L[5],
            isValid: true,
            hasBlockchain: true,
            isCompressed: false,
        };
    }
    const matchV2L = trimmed.match(KEY_REGEX_V2_LEGACY);
    if (matchV2L) {
        return {
            version: matchV2L[1],
            families: matchV2L[2],
            isValid: true,
            hasBlockchain: false,
            isCompressed: false,
        };
    }
    return null;
}
/**
 * Restaura perfis de simbologia após decodificação de chave ECBT/ECO.
 * @param {any} model
 */
function _restoreSymbology(model: any) {
    if (model?.symbologyProfiles && typeof loadSymbologyFromImport === 'function') {
        try {
            loadSymbologyFromImport(model.symbologyProfiles);
        } catch (e: any) {
            console.warn('[decoder] Erro ao restaurar simbologia:', e);
        }
    }
}
/**
 * Restaura issues 3D do modelo importado via three-way merge.
 * Gap #1: nunca sobrescreve issues locais mais recentes.
 * @param {any} model
 */
function _restoreIssues(model: any) {
    if (Array.isArray(model?.issues) && model.issues.length > 0) {
        try {
            const result = importIssues(model.issues, { mode: 'merge' });
            if (result.inserted || result.updated) {
                console.debug(
                    `[decoder] Issues restored: ${result.inserted} inserted, ${result.updated} updated, ${result.kept} kept local`,
                );
            }
        } catch (e: any) {
            console.warn('[decoder] Erro ao restaurar issues:', e);
        }
    }
}
/**
 * Restaura animacoes de pluma do modelo importado (apenas metadados).
 * @param {any} model
 */
function _restorePlumeAnimations(model: any) {
    if (Array.isArray(model?.plumeAnimations) && model.plumeAnimations.length > 0) {
        // Import dinamico para quebrar o ciclo io/decoder.js -> sequencer/plumeAnimation.js.
        // Fire-and-forget: a restauracao de metadados de pluma nao bloqueia o decode.
        import('../sequencer/plumeAnimation.js')
            .then(({ importPlumeAnimations }) => {
                try {
                    importPlumeAnimations(model.plumeAnimations);
                } catch (e: any) {
                    console.warn('[decoder] Erro ao restaurar animacoes de pluma:', e);
                }
            })
            .catch((e) => console.warn('[decoder] Erro ao restaurar animacoes de pluma:', e));
    }
}
/**
 * Restaura metadados do PhotoLog (sem blobs - apenas metadata em element.data.photos).
 * @param {any} model
 */
function _restorePhotoLog(model: any) {
    if (Array.isArray(model?.photoLog) && model.photoLog.length > 0) {
        try {
            importPhotos(model.photoLog);
            console.debug(`[decoder] PhotoLog restored: ${model.photoLog.length} photos`);
        } catch (e: any) {
            console.warn('[decoder] Erro ao restaurar photolog:', e);
        }
    }
}
//# sourceMappingURL=decoder.js.map
