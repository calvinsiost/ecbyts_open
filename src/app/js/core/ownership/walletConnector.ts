// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WALLET CONNECTOR — Detecção e conexão de carteiras Ethereum
   Usa EIP-1193 nativo ((window as any).ethereum) sem SDKs externos.

   WALLETS SUPORTADAS:
   - MetaMask ((window as any).ethereum.isMetaMask)
   - Coinbase Wallet Extension ((window as any).ethereum.isCoinbaseWallet)

   FLUXO:
   1. detectWallets() → lista provedores disponíveis
   2. connectWallet(provider) → solicita accounts → retorna {address, chainId}
   3. switchToBase() → troca rede para Base (testnet ou mainnet via CONFIG)
   ================================================================ */

import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// ESTADO INTERNO
// ----------------------------------------------------------------

/** @type {string|null} Endereço conectado em memória (não persiste) */
let _connectedAddress: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Detecta provedores EIP-1193 injetados disponíveis no browser.
 * Não conecta - apenas inspeciona (window as any).ethereum.
 *
 * @returns {Array<{id: string, name: string}>}
 */
export function detectWallets() {
    /** @type {Array<{id: string, name: string}>} */
    const wallets: any = [];

    if (!(window as any).ethereum) return wallets;

    // MetaMask injeta isMetaMask = true
    if ((window as any).ethereum.isMetaMask && !(window as any).ethereum.isCoinbaseWallet) {
        wallets.push({ id: 'metamask', name: 'MetaMask' });
    }

    // Coinbase Wallet Extension
    if ((window as any).ethereum.isCoinbaseWallet) {
        wallets.push({ id: 'coinbase', name: 'Coinbase Wallet' });
    }

    // Ambiente com ambas - providers array (EIP-6963 parcial)
    if ((window as any).ethereum.providers && Array.isArray((window as any).ethereum.providers)) {
        (window as any).ethereum.providers.forEach((/** @type {any} */ p: any) => {
            if (p.isMetaMask && !p.isCoinbaseWallet && !wallets.find((w: any) => w.id === 'metamask')) {
                wallets.push({ id: 'metamask', name: 'MetaMask' });
            }
            if (p.isCoinbaseWallet && !wallets.find((w: any) => w.id === 'coinbase')) {
                wallets.push({ id: 'coinbase', name: 'Coinbase Wallet' });
            }
        });
    }

    return wallets;
}

/**
 * Conecta carteira via EIP-1193 e retorna endereço + chainId.
 * Solicita accounts ao usuário (abre popup da carteira).
 *
 * @param {'metamask'|'coinbase'} [provider='metamask']
 * @returns {Promise<{address: string, chainId: number}>}
 */
export async function connectWallet(provider = 'metamask') {
    const ethereum = /** @type {any} */ (_getProvider(provider));

    if (!ethereum) {
        const name = provider === 'coinbase' ? 'Coinbase Wallet' : 'MetaMask';
        throw new Error(`${name} não encontrado. Instale a extensão em metamask.io ou coinbase.com/wallet`);
    }

    // Solicita acesso às contas
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
        throw new Error('Nenhuma conta autorizada pelo usuário');
    }

    const address = accounts[0];
    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    _connectedAddress = address;

    return { address, chainId };
}

/**
 * Retorna o endereço conectado em memória, ou null se não conectado.
 * @returns {string|null}
 */
export function getConnectedAddress() {
    return _connectedAddress;
}

/**
 * Desconecta - limpa estado interno.
 * Nota: EIP-1193 não tem método de disconnect; apenas limpa memória local.
 */
export function disconnectWallet() {
    _connectedAddress = null;
}

/**
 * Solicita troca de rede para Base (chainId em CONFIG.OWNERSHIP).
 * Usa wallet_switchEthereumChain. Em caso de falha, orienta o usuário.
 *
 * @returns {Promise<void>}
 */
export async function switchToBase() {
    const ethereum = /** @type {any} */ ((window as any).ethereum);
    if (!ethereum) throw new Error('Nenhuma carteira conectada');

    const targetChainId = CONFIG.OWNERSHIP.BASE_CHAIN_ID;
    const chainIdHex = `0x${targetChainId.toString(16)}`;

    try {
        await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
        });
    } catch (switchErr) {
        // Código 4902 = rede não adicionada na carteira
        if (/** @type {any} */ (switchErr as any)?.code === 4902) {
            const isTestnet = targetChainId === 84532;
            const chainName = isTestnet ? 'Base Sepolia Testnet' : 'Base Mainnet';
            const rpcUrl = CONFIG.OWNERSHIP.BASE_RPC_URL;
            const explorerUrl = isTestnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';

            try {
                await ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: chainIdHex,
                            chainName,
                            nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                            rpcUrls: [rpcUrl],
                            blockExplorerUrls: [explorerUrl],
                        },
                    ],
                });
            } catch {
                throw new Error(
                    `Adicione a rede Base manualmente no MetaMask. ` +
                        `chainId: ${targetChainId}, RPC: ${rpcUrl}. ` +
                        `Ou use https://chainlist.org para adicionar automaticamente.`,
                );
            }
        } else {
            throw switchErr;
        }
    }
}

// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------

/**
 * Retorna o provider EIP-1193 correspondente à carteira solicitada.
 * @param {'metamask'|'coinbase'} providerId
 * @returns {Object|null}
 */
function _getProvider(providerId: any) {
    if (!(window as any).ethereum) return null;

    // Ambiente com múltiplos providers (EIP-6963)
    if ((window as any).ethereum.providers && Array.isArray((window as any).ethereum.providers)) {
        if (providerId === 'coinbase') {
            return (window as any).ethereum.providers.find((/** @type {any} */ p: any) => p.isCoinbaseWallet) || null;
        }
        return (window as any).ethereum.providers.find((/** @type {any} */ p: any) => p.isMetaMask && !p.isCoinbaseWallet) || null;
    }

    // Provider único
    if (providerId === 'coinbase' && (window as any).ethereum.isCoinbaseWallet) return (window as any).ethereum;
    if (providerId === 'metamask' && (window as any).ethereum.isMetaMask) return (window as any).ethereum;

    // Fallback: qualquer provider disponível
    return (window as any).ethereum || null;
}
