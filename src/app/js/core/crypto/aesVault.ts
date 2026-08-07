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
   AES VAULT — CRIPTOGRAFIA SIMETRICA PARA DADOS PESSOAIS (LGPD)
   ================================================================

   Modulo de criptografia AES-GCM para proteger campos com dados
   pessoais (CPF) no export ECO1. Chave armazenada no IndexedDB.

   CONCEITO:
   - Chave AES-GCM 256-bit gerada automaticamente no primeiro uso
   - Armazenada no mesmo IndexedDB do KeyManager (ECOKeyStore)
   - Device-bound: dados criptografados aqui so sao legiveis
     no mesmo navegador/dispositivo
   - Campos criptografados tem prefixo "aes:" para identificacao

   FORMATO:
   encryptField("123.456.789-00")
   → "aes:BASE64(12-byte-IV + ciphertext)"

   USO:
   import { initVaultKey, encryptField, decryptField } from './aesVault.js';
   await initVaultKey();
   const encrypted = await encryptField("123.456.789-00");
   const plain = await decryptField(encrypted); // "123.456.789-00"

   ================================================================ */

// ----------------------------------------------------------------
// CONFIGURACAO - Reutiliza o mesmo banco IndexedDB do KeyManager
// ----------------------------------------------------------------

const DB_NAME = 'ECOKeyStore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const VAULT_KEY_ID = 'vault-aes';
const AES_PREFIX = 'aes:';

/**
 * Referencia interna da chave AES carregada.
 * Mantida em memoria apos initVaultKey() para evitar leituras repetidas do IDB.
 */
/** @type {any} */
let _vaultKey: any = null;

// ----------------------------------------------------------------
// INDEXEDDB - Helpers (mesma logica do keyManager.js)
// ----------------------------------------------------------------

/**
 * Abre conexao com IndexedDB.
 * Reutiliza o banco ECOKeyStore criado pelo keyManager.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDB(): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[aesVault] Erro ao abrir IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

/**
 * Executa transacao no IndexedDB.
 *
 * @param {string} mode - 'readonly' ou 'readwrite'
 * @param {Function} callback - Recebe o objectStore
 * @returns {Promise<any>}
 */
async function withStore(/** @type {any} */ mode: any, /** @type {Function} */ callback: any) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => db.close();
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };

        try {
            const result = callback(store);
            if (result instanceof IDBRequest) {
                result.onsuccess = () => resolve(result.result);
                result.onerror = () => reject(result.error);
            } else {
                resolve(result);
            }
        } catch (err) {
            reject(err);
        }
    });
}

// ----------------------------------------------------------------
// GERACAO E CARGA DA CHAVE AES
// ----------------------------------------------------------------

/**
 * Inicializa a chave AES do vault.
 * Gera uma chave nova se nao existir, ou carrega a existente do IndexedDB.
 * Deve ser chamada uma vez durante o init() da aplicacao.
 *
 * @returns {Promise<boolean>} true se a chave esta disponivel
 */
export async function initVaultKey() {
    try {
        if (!window.crypto?.subtle) {
            console.warn('[aesVault] Web Crypto API nao disponivel');
            return false;
        }

        // Tenta carregar chave existente
        const record = (await withStore('readonly', (store: any) => store.get(VAULT_KEY_ID))) as any;

        if (record?.keyJWK) {
            _vaultKey = await crypto.subtle.importKey('jwk', record.keyJWK, { name: 'AES-GCM', length: 256 }, false, [
                'encrypt',
                'decrypt',
            ]);
            return true;
        }

        // Gera nova chave
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true, // extractable para salvar no IDB
            ['encrypt', 'decrypt'],
        );

        const keyJWK = await crypto.subtle.exportKey('jwk', key);

        await withStore('readwrite', (/** @type {any} */ store: any) => store.put({
            id: VAULT_KEY_ID,
            keyJWK,
            type: 'aes-gcm-256',
            createdAt: new Date().toISOString(),
        }),
        );

        // Re-importa como nao-extractable para uso em memoria
        _vaultKey = await crypto.subtle.importKey('jwk', keyJWK, { name: 'AES-GCM', length: 256 }, false, [
            'encrypt',
            'decrypt',
        ]);

        return true;
    } catch (err) {
        console.error('[aesVault] Erro ao inicializar chave:', err);
        _vaultKey = null;
        return false;
    }
}

// ----------------------------------------------------------------
// CRIPTOGRAFIA / DESCRIPTOGRAFIA
// ----------------------------------------------------------------

/**
 * Criptografa um campo de texto com AES-GCM.
 * Retorna string com prefixo "aes:" seguido de Base64(IV + ciphertext).
 *
 * Se o vault nao estiver inicializado, retorna o plaintext original
 * (graceful degradation - nao bloqueia a aplicacao).
 *
 * @param {string} plaintext - Texto a criptografar
 * @returns {Promise<string>} - "aes:BASE64..." ou plaintext se vault indisponivel
 */
export async function encryptField(plaintext: any) {
    if (!_vaultKey || !plaintext) return plaintext;

    try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);

        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _vaultKey, encoded);

        // Concatena IV + ciphertext em um unico buffer
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // Converte para Base64
        const base64 = btoa(String.fromCharCode(...combined));

        return AES_PREFIX + base64;
    } catch (err) {
        console.error('[aesVault] Erro ao criptografar:', err);
        return plaintext;
    }
}

/**
 * Descriptografa um campo criptografado com AES-GCM.
 * Se o campo nao tiver o prefixo "aes:", retorna como esta (plaintext).
 * Se a chave nao estiver disponivel (dispositivo diferente), retorna o fallback.
 *
 * @param {string} ciphertext - Texto criptografado com prefixo "aes:"
 * @param {string} [fallback=''] - Valor retornado se descriptografia falhar
 * @returns {Promise<string>} - Texto descriptografado ou fallback
 */
export async function decryptField(ciphertext: any, fallback = '') {
    if (!ciphertext || !ciphertext.startsWith(AES_PREFIX)) return ciphertext || '';

    if (!_vaultKey) {
        console.warn('[aesVault] Chave indisponivel para descriptografia');
        return fallback || ciphertext;
    }

    try {
        const base64 = ciphertext.slice(AES_PREFIX.length);
        const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

        // Separa IV (12 bytes) do ciphertext
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _vaultKey, data);

        return new TextDecoder().decode(decrypted);
    } catch (err) {
        console.error('[aesVault] Erro ao descriptografar:', err);
        return fallback || ciphertext;
    }
}

/**
 * F04 - Versao strict de encryptField que THROWS em caso de falha.
 * Usar para protecao de chaves privadas ECDSA - nunca aceita degradacao para plaintext.
 *
 * @param {string} plaintext - Texto a criptografar
 * @returns {Promise<string>} - "aes:BASE64..." (nunca plaintext)
 * @throws {Error} Se vault nao inicializado ou criptografia falhar
 */
export async function encryptFieldStrict(plaintext: any) {
    if (!_vaultKey) throw new Error('Vault nao inicializado — chave privada nao pode ser armazenada sem protecao');
    if (!plaintext) throw new Error('Plaintext vazio — nada a criptografar');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _vaultKey, encoded);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    let binary = '';
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]!);
    return AES_PREFIX + btoa(binary);
}

/**
 * F04 - Versao strict de decryptField que THROWS em caso de falha.
 * Usar para desprotecao de chaves privadas ECDSA.
 *
 * @param {string} ciphertext - Texto criptografado com prefixo "aes:"
 * @returns {Promise<string>} - Texto descriptografado
 * @throws {Error} Se vault nao inicializado ou descriptografia falhar
 */
export async function decryptFieldStrict(ciphertext: any) {
    if (!_vaultKey) throw new Error('Vault nao inicializado — chave privada inacessivel');
    if (!ciphertext || !ciphertext.startsWith(AES_PREFIX)) throw new Error('Formato invalido — esperado prefixo aes:');

    const base64 = ciphertext.slice(AES_PREFIX.length);
    const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _vaultKey, data);
    return new TextDecoder().decode(decrypted);
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

/**
 * Verifica se o vault esta inicializado e pronto.
 *
 * @returns {boolean}
 */
export function isVaultReady() {
    return _vaultKey !== null;
}

/**
 * Verifica se uma string e um campo criptografado pelo vault.
 *
 * @param {string} value - Valor a verificar
 * @returns {boolean}
 */
export function isEncryptedField(value: any) {
    return typeof value === 'string' && value.startsWith(AES_PREFIX);
}
