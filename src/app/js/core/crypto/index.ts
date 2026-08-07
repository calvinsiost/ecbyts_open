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
   CRYPTO MODULE - PONTO DE ENTRADA
   ================================================================

   Este modulo exporta todas as funcionalidades criptograficas
   do sistema de blockchain do ecbyts.

   MODULOS:
   - hashChain: Funcoes SHA-256 e cadeia de hashes
   - keyManager: Gerenciamento de chaves ECDSA
   - signer: Assinatura e verificacao digital
   - merkle: Merkle Tree para verificacao de integridade

   USO:
   import { sha256, generateKeyPair, signData } from './crypto/index.js';

   ================================================================ */
// Hash Chain
export { sha256, hashToBase64URL, base64URLToHex, GENESIS, createChainMeta, verifyChain, extractPrevHash, isGenesisKey, } from './hashChain.js';
// Key Manager
export { generateKeyPair, getKeyPair, listKeys, hasKeys, getDefaultKey, exportPublicKey, exportPublicKeyAsString, importPublicKey, renameKey, deleteKey, clearAllKeys, isSupported as isCryptoSupported, formatKeyId, } from './keyManager.js';
// Signer
export { signData, signDataTruncated, verifySignature, verifySignatureWithKey, buildSignableData, extractVerificationData, } from './signer.js';
// Merkle Tree
export { buildMerkleTree, generateProof, verifyProof, verifyModelIntegrity, compareModels, computeMerkleRoot, areModelsEqual, } from './merkle.js';
// AES Vault (LGPD - criptografia de dados pessoais)
export { initVaultKey, encryptField, decryptField, isVaultReady, isEncryptedField } from './aesVault.js';
//# sourceMappingURL=index.js.map
