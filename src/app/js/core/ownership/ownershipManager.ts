// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   OWNERSHIP MANAGER — Orquestrador principal do Data Owner

   FLUXO registerOwnership():
   1. SHA-256(eco1Key) → eco1Hash
   2. Montar ownershipRecord (sem assinatura)
   3. ethSigner.signOwnershipRecord() → ownerSignature
   4. offchainRegistry.registerPrivateOwnership() — sempre
   5. Se mode='public': onchainRegistry.mintOwnershipNFT()
      → atualizar registro com token_id + tx_hash
   6. Retornar { registryId, tokenId?, mode, ownerAddress, registeredAt }

   Qualquer falha lança erro para o caller (UI trata com showToast).
   ================================================================ */
import { signOwnershipRecord, verifyOwnershipSignature } from './ethSigner.js';
import { registerPrivateOwnership, updateWithNFT, getPrivateOwnership } from './offchainRegistry.js';
import { mintOwnershipNFT, findTokenByEco1Hash, getOnchainOwner } from './onchainRegistry.js';
import { getCurrentUser } from '../../utils/auth/session.js';
import { CONFIG } from '../../config.js';
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Registra ownership de um ECO1 model.
 *
 * @param {Object} params
 * @param {string} params.eco1Key        - Chave ECO1 completa exportada
 * @param {'PF'|'PJ'} params.ownerType  - Tipo do owner
 * @param {string} params.ownerAddress  - Endereço Ethereum conectado
 * @param {string} params.ownerName     - Nome/razão social
 * @param {string} [params.documentHash] - SHA-256(CPF ou CNPJ), nunca em claro
 * @param {'public'|'private'} params.mode
 * @param {string|null} [params.expiresAt] - ISO-8601 ou null
 * @returns {Promise<{registryId: string, tokenId?: string, mode: string,
 *                    ownerAddress: string, registeredAt: string}>}
 */
export async function registerOwnership({ eco1Key, ownerType, ownerAddress, ownerName, documentHash, mode, expiresAt = null }: any) {
    const user = getCurrentUser();
    if (!user)
        throw new Error('Usuário não autenticado');
    if (!user.id)
        throw new Error('Usuário não autenticado');
    const registeredAt = new Date().toISOString();
    // 1. Hash do eco1Key completo
    const eco1Hash = await _sha256Hex(eco1Key);
    // 2. Montar record sem assinatura
    const ownershipRecord = {
        version: '1.0.0',
        eco1Hash,
        owner: {
            type: ownerType,
            address: ownerAddress,
            name: ownerName || '',
            documentHash: documentHash || null,
        },
        mode,
        registeredAt,
        expiresAt,
        transferHistory: [],
    };
    // 3. Assinar com EIP-712
    const ownerSignature = await signOwnershipRecord(ownershipRecord, ownerAddress);
    (ownershipRecord as any).ownerSignature = ownerSignature;
    // 4. Registrar no Supabase (sempre, independente de modo)
    const { id: registryId } = await registerPrivateOwnership(ownershipRecord, user.id);
    // 5. Se público: mintar NFT e atualizar registro
    let tokenId;
    if (mode === 'public' && CONFIG.OWNERSHIP.CONTRACT_ADDRESS) {
        const { tokenId: mintedId, txHash } = await mintOwnershipNFT(ownershipRecord, ownerAddress);
        tokenId = mintedId;
        await updateWithNFT(registryId, mintedId, txHash);
    }
    return /** @type {any} */ ({ registryId, tokenId, mode, ownerAddress, registeredAt, eco1Hash });
}
/**
 * Busca o registro de ownership de um eco1Key.
 * Tenta off-chain primeiro; modo público também verifica on-chain.
 *
 * @param {string} eco1Key
 * @returns {Promise<Object|null>}
 */
export async function getOwnership(eco1Key: any) {
    const eco1Hash = await _sha256Hex(eco1Key);
    const record = await getPrivateOwnership(eco1Hash);
    if (record)
        return record;
    // Fallback: verificar on-chain (se CONTRACT_ADDRESS configurado)
    if (CONFIG.OWNERSHIP.CONTRACT_ADDRESS) {
        const onchainOwner = await getOnchainOwner(eco1Hash);
        if (onchainOwner) {
            return { eco1_hash: eco1Hash, owner_address: onchainOwner, mode: 'public', source: 'onchain' };
        }
    }
    return null;
}
/**
 * Verifica se um eco1Key tem ownership registrado e válido.
 *
 * @param {string} eco1Key
 * @returns {Promise<{hasOwnership: boolean, mode?: string, ownerAddress?: string,
 *                    registeredAt?: string, tokenId?: string, signatureValid?: boolean}>}
 */
export async function verifyOwnership(eco1Key: any) {
    const record = await getOwnership(eco1Key);
    if (!record)
        return { hasOwnership: false };
    let signatureValid = false;
    const rec = (record) as any;
    if (rec.record_data?.ownerSignature) {
        signatureValid = await verifyOwnershipSignature(rec.record_data);
    }
    return {
        hasOwnership: true,
        mode: rec.mode,
        ownerAddress: rec.owner_address,
        registeredAt: rec.created_at,
        tokenId: rec.token_id || null,
        signatureValid,
    };
}
/**
 * Verifica se um eco1Hash já tem NFT registrado (sem acesso ao eco1Key completo).
 *
 * @param {string} eco1Hash
 * @returns {Promise<{exists: boolean, tokenId: string|null}>}
 */
export async function checkNFTByHash(eco1Hash: any) {
    return findTokenByEco1Hash(eco1Hash);
}
// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------
/**
 * SHA-256 de uma string, retorna hex.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function _sha256Hex(text: any) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join('');
}
