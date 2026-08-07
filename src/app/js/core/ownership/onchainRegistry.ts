// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ON-CHAIN REGISTRY — Mint de NFT ERC-721 na Base L2

   Contrato: ECBTOwnership (ERC-721)
   Endereço: CONFIG.OWNERSHIP.CONTRACT_ADDRESS (Base Testnet/Mainnet)

   ABI MÍNIMA INLINE — 4 funções apenas (sem arquivo separado):
   - mint(bytes32, address, string) → uint256
   - isRegistered(bytes32) → bool
   - ownerOfEco1(bytes32) → address
   - eco1HashToToken(bytes32) → uint256

   DEPENDÊNCIA:
   - ethers.js v6 via CDN (lazy — compartilhado com ethSigner via cache)
   ================================================================ */

import { CONFIG } from '../../config.js';
import { importCDN } from '../../utils/helpers/cdnLoader.js';

// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------

const ETHERS_CDN = 'https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm';

/** ABI mínima do contrato ECBTOwnership */
const CONTRACT_ABI = [
    'function mint(bytes32 eco1Hash, address to, string calldata tokenURI_) returns (uint256)',
    'function isRegistered(bytes32 eco1Hash) view returns (bool)',
    'function ownerOfEco1(bytes32 eco1Hash) view returns (address)',
    'function eco1HashToToken(bytes32 eco1Hash) view returns (uint256)',
];

/** Cache do módulo ethers @type {any} */
let _ethers: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Minta NFT de ownership na Base L2.
 * O usuário assina a tx via MetaMask (tx on-chain ~5-15s na Testnet).
 *
 * @param {any} ownershipRecord - Registro assinado (com ownerSignature)
 * @param {string} ownerAddress - Endereço da carteira conectada
 * @returns {Promise<{tokenId: string, txHash: string, contractAddress: string}>}
 */
export async function mintOwnershipNFT(ownershipRecord: any, ownerAddress: any) {
    const contractAddress = CONFIG.OWNERSHIP.CONTRACT_ADDRESS;
    if (!contractAddress) {
        throw new Error('CONTRACT_ADDRESS não configurado. Deploy o contrato ECBTOwnership primeiro.');
    }

    const ethers = await _loadEthers();
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();

    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

    // eco1Hash como bytes32 (keccak256 do eco1Hash string)
    const eco1HashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(ownershipRecord.eco1Hash));

    // tokenURI como data URI JSON inline (não depende de servidor externo)
    const tokenURI = _buildTokenURI(ownershipRecord);

    // Chama mint - MetaMask abre popup de confirmação
    const tx = await contract.mint(eco1HashBytes32, ownerAddress, tokenURI);

    // Aguarda confirmação (1 bloco)
    const receipt = await tx.wait(1);

    // Extrai tokenId do evento OwnershipRegistered
    const tokenId = _extractTokenId(receipt, ethers);

    return {
        tokenId: tokenId?.toString() || '0',
        txHash: receipt.hash,
        contractAddress,
    };
}

/**
 * Verifica se um eco1Hash já tem NFT registrado no contrato.
 *
 * @param {string} eco1Hash
 * @returns {Promise<{exists: boolean, tokenId: string|null}>}
 */
export async function findTokenByEco1Hash(eco1Hash: any) {
    const contractAddress = CONFIG.OWNERSHIP.CONTRACT_ADDRESS;
    if (!contractAddress) return { exists: false, tokenId: null };

    try {
        const ethers = await _loadEthers();
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

        const eco1HashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(eco1Hash));
        const exists = await contract.isRegistered(eco1HashBytes32);

        if (!exists) return { exists: false, tokenId: null };

        const tokenId = await contract.eco1HashToToken(eco1HashBytes32);
        return { exists: true, tokenId: tokenId.toString() };
    } catch {
        return { exists: false, tokenId: null };
    }
}

/**
 * Consulta owner atual de um token no contrato.
 *
 * @param {string} eco1Hash
 * @returns {Promise<string|null>} Endereço do owner ou null
 */
export async function getOnchainOwner(eco1Hash: any) {
    const contractAddress = CONFIG.OWNERSHIP.CONTRACT_ADDRESS;
    if (!contractAddress) return null;

    try {
        const ethers = await _loadEthers();
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);

        const eco1HashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(eco1Hash));
        return await contract.ownerOfEco1(eco1HashBytes32);
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------

/**
 * Carrega ethers.js v6 via CDN (lazy, com cache).
 * @returns {Promise<any>}
 */
async function _loadEthers() {
    if (_ethers) return _ethers;
    const mod = await importCDN(ETHERS_CDN);
    _ethers = mod;
    return _ethers;
}

/**
 * Constrói tokenURI como data URI JSON inline.
 * Metadados mínimos - não expõe o conteúdo do modelo.
 *
 * @param {any} ownershipRecord
 * @returns {string} data:application/json;base64,...
 */
function _buildTokenURI(ownershipRecord: any) {
    const metadata = {
        name: `ECBT Data Ownership — ${ownershipRecord.owner?.name || ownershipRecord.owner?.address?.slice(0, 8)}`,
        description: 'Registro de propriedade de modelo ambiental digital (ecbyts/ECBT).',
        attributes: [
            { trait_type: 'eco1Hash', value: ownershipRecord.eco1Hash },
            { trait_type: 'ownerAddress', value: ownershipRecord.owner?.address || '' },
            { trait_type: 'ownerType', value: ownershipRecord.owner?.type || 'PF' },
            { trait_type: 'registeredAt', value: ownershipRecord.registeredAt || '' },
            { trait_type: 'mode', value: 'public' },
        ],
    };

    const json = JSON.stringify(metadata);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return `data:application/json;base64,${b64}`;
}

/**
 * Extrai tokenId do receipt via evento OwnershipRegistered.
 * Fallback: tenta evento Transfer padrão ERC-721.
 *
 * @param {any} receipt - TransactionReceipt do ethers
 * @param {any} ethers - módulo ethers
 * @returns {BigInt|null}
 */
function _extractTokenId(receipt: any, ethers: any) {
    // Interface mínima para decodificar evento
    const iface = new ethers.Interface([
        'event OwnershipRegistered(uint256 indexed tokenId, bytes32 indexed eco1Hash, address indexed owner)',
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    ]);

    for (const log of receipt.logs || []) {
        try {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.args.tokenId !== undefined) {
                return parsed.args.tokenId;
            }
        } catch (e) {
            console.debug('[onchainRegistry] parseLog:', /** @type {any} */ (e as any)?.message || e);
            // log de outro contrato, ignorar
        }
    }
    return null;
}
