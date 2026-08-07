// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ETH SIGNER — Assinatura EIP-712 com carteira Ethereum

   EIP-712 (Typed Structured Data Signing):
   - MetaMask exibe campos legíveis ao usuário antes de assinar
   - Não é um hash opaco — é um formulário com campos nomeados
   - Evita ataques de phishing (usuário vê o que está assinando)

   DEPENDÊNCIA:
   - ethers.js v6 via CDN (lazy — carregado só quando feature ativado)
   - URL: https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm
   ================================================================ */

import { CONFIG } from '../../config.js';
import { importCDN } from '../../utils/helpers/cdnLoader.js';

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

const ETHERS_CDN = 'https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm';

/** Cache do módulo ethers para não reimportar a cada chamada
 * @type {any}
 */
let _ethers: any = null;

/** Tipos EIP-712 do ownership record */
const OWNERSHIP_TYPES = {
    OwnershipRecord: [
        { name: 'eco1Hash', type: 'string' },
        { name: 'ownerAddress', type: 'string' },
        { name: 'ownerType', type: 'string' },
        { name: 'ownerName', type: 'string' },
        { name: 'mode', type: 'string' },
        { name: 'registeredAt', type: 'string' },
    ],
};

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Constrói o typed data EIP-712 para um ownership record.
 * O domain inclui chainId injetado dinamicamente do CONFIG.
 *
 * @param {any} ownershipRecord - Registro sem ownerSignature
 * @returns {any} { domain, types, value }
 */
export function buildSignableOwnership(ownershipRecord: any) {
    const domain = {
        ...CONFIG.OWNERSHIP.EIP712_DOMAIN,
        chainId: CONFIG.OWNERSHIP.BASE_CHAIN_ID,
    };

    const value = {
        eco1Hash: ownershipRecord.eco1Hash || '',
        ownerAddress: ownershipRecord.owner?.address || '',
        ownerType: ownershipRecord.owner?.type || 'PF',
        ownerName: ownershipRecord.owner?.name || '',
        mode: ownershipRecord.mode || 'private',
        registeredAt: ownershipRecord.registeredAt || '',
    };

    return { domain, types: OWNERSHIP_TYPES, value };
}

/**
 * Assina um ownership record com a carteira Ethereum conectada.
 * Usa eth_signTypedData_v4 (EIP-712) - MetaMask exibe campos legíveis.
 *
 * @param {any} ownershipRecord - Registro sem ownerSignature
 * @param {string} address - Endereço da carteira conectada
 * @returns {Promise<string>} Assinatura hex (0x...)
 */
export async function signOwnershipRecord(ownershipRecord: any, address: any) {
    if (!(window as any).ethereum) throw new Error('Carteira Ethereum não detectada');

    const { domain, types, value } = buildSignableOwnership(ownershipRecord);

    // eth_signTypedData_v4 espera JSON string do typed data
    const typedData = JSON.stringify({
        domain,
        types: { EIP712Domain: _eip712DomainTypes(), ...types },
        primaryType: 'OwnershipRecord',
        message: value,
    });

    const signature = await (window as any).ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address, typedData],
    });

    return signature; // '0x...'
}

/**
 * Verifica a assinatura de um ownership record.
 * Usa ethers.js para reconstruir o signer e comparar com owner.address.
 *
 * @param {any} ownershipRecord - Registro completo com ownerSignature
 * @returns {Promise<boolean>}
 */
export async function verifyOwnershipSignature(ownershipRecord: any) {
    try {
        const ethers = await _loadEthers();
        const { domain, types, value } = buildSignableOwnership(ownershipRecord);

        // ethers.verifyTypedData reconstrói o signer da assinatura
        const recovered = ethers.verifyTypedData(domain, types, value, ownershipRecord.ownerSignature);

        return recovered.toLowerCase() === ownershipRecord.owner?.address?.toLowerCase();
    } catch (err) {
        console.warn('[ethSigner] Falha na verificação:', /** @type {Error} */ (err as any)?.message);
        return false;
    }
}

// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------

/**
 * Carrega ethers.js v6 via CDN (lazy, com cache).
 * @returns {Promise<any>} módulo ethers
 */
async function _loadEthers() {
    if (_ethers) return _ethers;
    const mod = await importCDN(ETHERS_CDN);
    _ethers = mod;
    return _ethers;
}

/**
 * Tipos do EIP712Domain para inclusão no typedData.
 * Necessário para eth_signTypedData_v4 funcionar corretamente.
 * @returns {Array<any>}
 */
function _eip712DomainTypes() {
    return [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
    ];
}
