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
   KEY MANAGER - GERENCIADOR DE CHAVES ECDSA
   ================================================================

   Este modulo gerencia pares de chaves criptograficas para
   assinatura digital das chaves ECO1 blockchain.

   CONCEITO:
   - Cada usuario tem um par de chaves (publica + privada)
   - Chave privada: assina dados (prova autoria)
   - Chave publica: verifica assinaturas (confirma autoria)

   ARMAZENAMENTO:
   - Chaves ficam no IndexedDB do navegador
   - Persistem entre sessoes
   - Cada navegador tem suas proprias chaves

   ALGORITMO:
   - ECDSA com curva P-256 (padrao NIST)
   - Seguro e amplamente suportado

   NOTA: Este modulo e OPCIONAL.
   O usuario pode exportar sem blockchain (ECO1 simples).

   ================================================================ */

// ----------------------------------------------------------------
// CONFIGURACAO DO BANCO DE DADOS
// ----------------------------------------------------------------

const DB_NAME = 'ECOKeyStore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

/**
 * Algoritmo de geracao de chaves.
 * ECDSA P-256 e padrao e seguro.
 */
/** @type {EcKeyGenParams} */
const KEY_ALGORITHM = {
    name: 'ECDSA',
    namedCurve: 'P-256',
};

// F04 - Import lazy do vault para wrapping de chaves privadas
/**
 * @typedef {typeof import('./aesVault.js')} VaultModule
 * @typedef {import('./keyManager.d.ts').StoredKeyRecord} StoredKeyRecord
 * @typedef {import('./keyManager.d.ts').PublicKeyExport} PublicKeyExport
 * @typedef {import('./keyManager.d.ts').KeySummary} KeySummary
 * @typedef {import('./keyManager.d.ts').KeyImportSummary} KeyImportSummary
 */

/** @type {VaultModule | null} */
let _vaultModule: any = null;

/**
 * @returns {Promise<VaultModule>}
 */
async function _getVault() {
    if (!_vaultModule) _vaultModule = await import('./aesVault.js');
    return _vaultModule;
}

// ----------------------------------------------------------------
// FUNCOES DE BANCO DE DADOS
// ----------------------------------------------------------------

/**
 * Abre conexao com IndexedDB.
 * Cria o banco se nao existir.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDB(): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Erro ao abrir IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = () => {
            const db = request.result;

            // Cria store de chaves se nao existir
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

/**
 * Executa uma transacao no IndexedDB.
 *
 * @template T
 * @param {IDBTransactionMode} mode - 'readonly' ou 'readwrite'
 * @param {(store: IDBObjectStore) => IDBRequest<T> | T} callback - Funcao que recebe o store
 * @returns {Promise<T>}
 */
async function withStore(mode: any, callback: any): Promise<any> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        /** @type {T | undefined} */
        let requestResult: any;
        let settled = false;

        /**
         * @param {T} name
         */
        const resolveOnce = (val: any) => {
            if (settled) return;
            settled = true;
            db.close();
            resolve(val);
        };

        /**
         * @param {unknown} err
         */
        const rejectOnce = (err: any) => {
            if (settled) return;
            settled = true;
            db.close();
            reject(err);
        };

        // Para readwrite: resolve em tx.oncomplete (write commit disco) -
        // evita race SG-P0-05 onde generateKeyPair retorna antes do commit
        // e decodeKeyV3/verifySig sequenciais lêem antes da persistência.
        // Ver: docs/LESSONS.md 2026-04-20 indexeddb-withstore-request-vs-tx-race.
        tx.oncomplete = () => {
            if (mode === 'readwrite') resolveOnce(/** @type {T} */ (requestResult));
            else if (!settled) db.close();
        };
        tx.onerror = () => rejectOnce(tx.error);
        tx.onabort = () => rejectOnce(tx.error || new Error('Transaction aborted'));

        try {
            const result = callback(store);
            if (result instanceof IDBRequest) {
                result.onsuccess = () => {
                    requestResult = result.result;
                    // Readonly pode resolver imediato - write espera tx.oncomplete
                    if (mode !== 'readwrite') resolveOnce(result.result);
                };
                result.onerror = () => rejectOnce(result.error);
            } else if (mode !== 'readwrite') {
                resolveOnce(result);
            } else {
                // Callback síncrono em readwrite - aguarda tx.oncomplete
                requestResult = result;
            }
        } catch (err) {
            rejectOnce(err);
        }
    });
}

// ----------------------------------------------------------------
// GERACAO DE CHAVES
// ----------------------------------------------------------------

/**
 * Gera novo par de chaves ECDSA.
 * Armazena no IndexedDB e retorna informacoes da chave.
 *
 * @param {string} [name=''] - Nome amigavel para a chave (opcional)
 * @returns {Promise<KeyImportSummary & { publicKey: JsonWebKey }>} - { keyId, publicKey, name, createdAt }
 *
 * EXEMPLO:
 * const key = await generateKeyPair("Minha Chave Principal");
 * // { keyId: "a1b2c3d4", publicKey: {...}, name: "...", createdAt: "..." }
 */
export async function generateKeyPair(name = '') {
    // F04 - Vault DEVE estar pronto antes de gerar chaves (protecao obrigatoria)
    const vault = await _getVault();
    if (!vault.isVaultReady()) {
        throw new Error('Vault nao inicializado — nao e possivel proteger chave privada');
    }

    // Gera par de chaves
    const keyPair = /** @type {CryptoKeyPair} */ (
        await crypto.subtle.generateKey(
            KEY_ALGORITHM,
            true, // extractable temporariamente para export
            ['sign', 'verify'],
        )
    );

    // Exporta chaves para formato JWK (JSON Web Key)
    const publicKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // F04 - Wrap private key com AES-GCM (strict: throws se falhar)
    const privateKeyWrapped = await vault.encryptFieldStrict(JSON.stringify(privateKeyJWK));

    // Gera ID unico baseado no hash da chave publica
    const pubKeyString = JSON.stringify(publicKeyJWK);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pubKeyString));
    const keyId = Array.from(new Uint8Array(hashBuffer))
        .slice(0, 4)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    const createdAt = new Date().toISOString();
    const keyName = name || `Chave ${keyId.toUpperCase()}`;

    // Armazena no IndexedDB - private key wrapped, NUNCA plaintext
    /** @type {StoredKeyRecord} */
    const keyRecord = {
        id: keyId,
        name: keyName,
        publicKey: publicKeyJWK,
        privateKeyWrapped,
        createdAt,
        imported: false,
        vaultVersion: 1,
    };

    await withStore('readwrite', (store: any) => store.put(keyRecord));

    return {
        keyId,
        publicKey: publicKeyJWK,
        name: keyName,
        createdAt,
    };
}

// ----------------------------------------------------------------
// CONSULTA DE CHAVES
// ----------------------------------------------------------------

/**
 * Obtem um par de chaves pelo ID (metadados + chave publica).
 * Chave privada NAO e retornada - usar getPrivateKey() para operacoes de assinatura.
 *
 * @param {string} keyId - ID da chave (8 caracteres hex)
 * @returns {Promise<StoredKeyRecord|null>} - Registro da chave ou null
 */
export async function getKeyPair(keyId: any): Promise<any> {
    const record = await withStore(
        'readonly',
        (store: any /** @type {IDBRequest<StoredKeyRecord | undefined>} */) => store.get(keyId),
    );
    return record || null;
}

/**
 * F04 - Obtem a CryptoKey privada (nao-extractable) para operacoes de assinatura.
 * Faz unwrap da chave protegida via AES-GCM vault. Migra chaves legadas (plaintext) automaticamente.
 *
 * @param {string} keyId - ID da chave (8 caracteres hex)
 * @returns {Promise<CryptoKey>} - CryptoKey ECDSA P-256 para sign (nao-extractable)
 * @throws {Error} Se vault indisponivel, chave nao encontrada, ou descriptografia falhar
 */
export async function getPrivateKey(keyId: any) {
    const vault = await _getVault();
    if (!vault.isVaultReady()) {
        throw new Error('Vault nao inicializado — chave privada inacessivel');
    }

    const record = await withStore(
        'readonly',
        (store: any /** @type {IDBRequest<StoredKeyRecord | undefined>} */) => store.get(keyId),
    );
    if (!record) throw new Error(`Chave ${keyId} nao encontrada`);

    /** @type {JsonWebKey} */
    let privateKeyJWK;

    if (record.privateKeyWrapped) {
        // Formato v2: unwrap via vault
        const json = await vault.decryptFieldStrict(record.privateKeyWrapped);
        privateKeyJWK = /** @type {JsonWebKey} */ (JSON.parse(json));
    } else if (record.privateKey) {
        // Formato legado: plaintext em IDB - migrar para wrapped
        privateKeyJWK = record.privateKey;
        try {
            const wrapped = await vault.encryptFieldStrict(JSON.stringify(privateKeyJWK));
            const migratedRecord = { ...record, privateKeyWrapped: wrapped, vaultVersion: 1 };
            delete migratedRecord.privateKey;
            await withStore('readwrite', (store: any) => store.put(migratedRecord));
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn('[keyManager] migration para wrapped falhou:', message);
        }
    } else {
        throw new Error(`Chave ${keyId} nao possui chave privada (importada de terceiros?)`);
    }

    // Importar como nao-extractable para sign
    return crypto.subtle.importKey('jwk', privateKeyJWK, KEY_ALGORITHM, false, ['sign']);
}

/**
 * Lista todas as chaves armazenadas.
 *
 * @returns {Promise<KeySummary[]>} - Array de { id, name, createdAt, imported }
 */
export async function listKeys(): Promise<any> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = /** @type {IDBRequest<StoredKeyRecord[]>} */ (store.getAll());

        request.onsuccess = () => {
            db.close();
            // Retorna apenas metadados (sem chave privada)
            const keys = request.result.map((k: any) => ({
                id: k.id,
                name: k.name,
                createdAt: k.createdAt,
                imported: k.imported || false,
                hasPrivateKey: !!(k.privateKeyWrapped || k.privateKey),
                vaultVersion: k.vaultVersion || 0
            }));
            resolve(keys);
        };

        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

/**
 * Verifica se existe pelo menos uma chave.
 *
 * @returns {Promise<boolean>}
 */
export async function hasKeys() {
    const keys = await listKeys();
    return keys.length > 0;
}

/**
 * Obtem a primeira chave disponivel (para uso padrao).
 *
 * @returns {Promise<KeySummary|null>}
 */
export async function getDefaultKey() {
    const keys = await listKeys();
    if (keys.length === 0) return null;

    // Prefere chave com chave privada (propria)
    const ownKey = keys.find((k: any) => k.hasPrivateKey);
    return ownKey || keys[0];
}

// ----------------------------------------------------------------
// EXPORTACAO E IMPORTACAO
// ----------------------------------------------------------------

/**
 * Exporta chave publica para compartilhamento.
 * Outras pessoas podem importar para verificar suas assinaturas.
 *
 * @param {string} keyId - ID da chave
 * @returns {Promise<PublicKeyExport>} - { keyId, name, publicKey }
 */
export async function exportPublicKey(keyId: any) {
    const keyRecord = await getKeyPair(keyId);
    if (!keyRecord) {
        throw new Error(`Chave ${keyId} nao encontrada`);
    }

    return {
        keyId: keyRecord.id,
        name: keyRecord.name,
        publicKey: keyRecord.publicKey,
        exportedAt: new Date().toISOString(),
    };
}

/**
 * Exporta chave publica como string (para copiar/colar).
 *
 * @param {string} keyId - ID da chave
 * @returns {Promise<string>} - JSON string da chave publica
 */
export async function exportPublicKeyAsString(keyId: any) {
    const exported = await exportPublicKey(keyId);
    return JSON.stringify(exported, null, 2);
}

/**
 * Importa chave publica de terceiros.
 * Permite verificar assinaturas de outras pessoas.
 *
 * @param {PublicKeyExport|string} publicKeyData - Dados da chave (objeto ou JSON string)
 * @returns {Promise<KeyImportSummary>} - { keyId, name, createdAt }
 */
export async function importPublicKey(publicKeyData: any) {
    // Parse se for string
    const data = /** @type {PublicKeyExport} */ (
        typeof publicKeyData === 'string' ? JSON.parse(publicKeyData) : publicKeyData
    );

    if (!data.keyId || !data.publicKey) {
        throw new Error('Dados de chave invalidos');
    }

    // Verifica se ja existe
    const existing = await getKeyPair(data.keyId);
    if (existing) {
        throw new Error(`Chave ${data.keyId} ja existe`);
    }

    // Valida a chave publica tentando importar
    try {
        await crypto.subtle.importKey('jwk', data.publicKey, KEY_ALGORITHM, false, ['verify']);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error('Chave publica invalida: ' + message, { cause: err });
    }

    /** @type {StoredKeyRecord} */
    const keyRecord = {
        id: data.keyId,
        name: data.name || `Importada ${data.keyId.toUpperCase()}`,
        publicKey: data.publicKey,
        privateKey: null, // Nao temos a privada
        createdAt: new Date().toISOString(),
        imported: true,
        importedFrom: data.name,
    };

    await withStore('readwrite', (store: any) => store.put(keyRecord));

    return {
        keyId: keyRecord.id,
        name: keyRecord.name,
        createdAt: keyRecord.createdAt,
    };
}

// ----------------------------------------------------------------
// GERENCIAMENTO
// ----------------------------------------------------------------

/**
 * Atualiza o nome de uma chave.
 *
 * @param {string} keyId - ID da chave
 * @param {string} newName - Novo nome
 * @returns {Promise<void>}
 */
export async function renameKey(keyId: any, newName: any) {
    const keyRecord = await getKeyPair(keyId);
    if (!keyRecord) {
        throw new Error(`Chave ${keyId} nao encontrada`);
    }

    keyRecord.name = newName;
    await withStore('readwrite', (store: any) => store.put(keyRecord));
}

/**
 * Remove uma chave.
 * CUIDADO: Se for sua chave privada, voce perdera a capacidade de assinar!
 *
 * @param {string} keyId - ID da chave
 * @returns {Promise<void>}
 */
export async function deleteKey(keyId: any) {
    await withStore('readwrite', (store: any) => store.delete(keyId));
}

/**
 * Remove todas as chaves.
 * CUIDADO: Acao irreversivel!
 *
 * @returns {Promise<void>}
 */
export async function clearAllKeys() {
    await withStore('readwrite', (store: any) => store.clear());
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

/**
 * Verifica se o navegador suporta as APIs necessarias.
 *
 * @returns {boolean}
 */
export function isSupported() {
    return !!(window.crypto && window.crypto.subtle && window.indexedDB);
}

/**
 * Formata ID da chave para exibicao.
 *
 * @param {string|null|undefined} keyId - ID da chave
 * @returns {string|null|undefined} - Ex: "A1B2-C3D4"
 */
export function formatKeyId(keyId: any) {
    if (!keyId || keyId.length !== 8) return keyId;
    return `${keyId.slice(0, 4).toUpperCase()}-${keyId.slice(4).toUpperCase()}`;
}
