// Generated from src/app/js/utils/handlers/ownership.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   OWNERSHIP HANDLERS — Handlers window.* para UI Data Owner

   Registro no export modal:
   - toggleOwnershipOptions()   → mostra/oculta seção de ownership
   - handleConnectWallet()      → conecta MetaMask, atualiza UI
   - handleRegisterOwnership()  → registra ownership, injeta ownershipRef

   Padrão de integração com encoder.js:
   - ownershipRef é injetado em model._ownershipRef antes de encodeKey()
   - O encoder move _ownershipRef → ownershipRef antes de serializar
   ================================================================ */
import {
    detectWallets,
    connectWallet,
    getConnectedAddress,
    switchToBase,
} from '../../core/ownership/walletConnector.js';
import { registerOwnership } from '../../core/ownership/ownershipManager.js';
import { getCurrentUser } from '../auth/session.js';
import { CONFIG } from '../../config.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Ownership');
// ----------------------------------------------------------------
// ESTADO INTERNO
// ----------------------------------------------------------------
/**
 * ownershipRef pendente a ser injetado no próximo encodeKey().
 * Limpo após cada exportação.
 */
let _pendingOwnershipRef: any = null;
// ----------------------------------------------------------------
// PUBLIC API - window.* handlers
// ----------------------------------------------------------------
/**
 * Retorna e consome o ownershipRef pendente (chamado pelo encoder via export.js).
 * @returns {object | null}
 */
export function consumePendingOwnershipRef() {
    const ref = _pendingOwnershipRef;
    _pendingOwnershipRef = null;
    return ref;
}
/**
 * Toggle da seção de opções de ownership no export modal.
 * Chamado pelo checkbox #export-ownership-enabled.
 */
export function toggleOwnershipOptions() {
    const checkbox: any = document.getElementById('export-ownership-enabled');
    const options = document.getElementById('ownership-options');
    const enabled = checkbox?.checked || false;
    if (options) options.style.display = enabled ? 'block' : 'none';
    // Habilitar opção "Público" somente se CONTRACT_ADDRESS configurado
    const publicOption = document.getElementById('ownership-mode-public');
    if (publicOption) {
        publicOption.style.display = CONFIG.OWNERSHIP.CONTRACT_ADDRESS ? '' : 'none';
    }
}
/**
 * Conecta carteira Ethereum e atualiza UI do export modal.
 * Exibe endereço conectado e mostra formulário de ownership.
 */
export async function handleConnectWallet() {
    const wallets = detectWallets();
    if (wallets.length === 0) {
        showToast('MetaMask não encontrado. Instale em metamask.io e recarregue a página.', 'error');
        return;
    }
    try {
        const { address, chainId } = await connectWallet(wallets[0].id);
        // Trocar para Base se necessário
        if (chainId !== CONFIG.OWNERSHIP.BASE_CHAIN_ID) {
            await switchToBase();
        }
        // Atualizar UI
        const statusEl = document.getElementById('wallet-status-text');
        if (statusEl) {
            statusEl.textContent = `Carteira: ${address.slice(0, 6)}...${address.slice(-4)}`;
            statusEl.style.color = 'var(--success-500, #22c55e)';
        }
        const formEl = document.getElementById('ownership-form');
        if (formEl) formEl.style.display = 'block';
        showToast(`Carteira conectada: ${address.slice(0, 6)}...${address.slice(-4)}`, 'success');
    } catch (err: any) {
        log.error('Wallet connection failed', err?.message);
        showToast(`Erro ao conectar carteira: ${err?.message}`, 'error');
    }
}
/**
 * Registra ownership do modelo atual e injeta ownershipRef para exportação.
 * Chamado pelo botão "Assinar e Registrar" - executa ANTES de downloadKey().
 *
 * @param {string} eco1Key - Chave ECO1 atual (do textarea #export-key-preview)
 */
export async function handleRegisterOwnership(eco1Key: any) {
    const user = getCurrentUser();
    if (!user) {
        showToast('Faça login para registrar ownership.', 'error');
        return;
    }
    const ownerAddress = getConnectedAddress();
    if (!ownerAddress) {
        showToast('Conecte uma carteira primeiro.', 'error');
        return;
    }
    const ownerType = (document.getElementById('owner-type') as any)?.value || 'PF';
    const ownerName = (document.getElementById('owner-name') as any)?.value?.trim() || '';
    const mode = (document.getElementById('ownership-mode') as any)?.value || 'private';
    if (!ownerName) {
        showToast('Informe o nome/razão social do owner.', 'error');
        return;
    }
    try {
        showToast('Aguardando assinatura na carteira...', 'info');
        const result = await registerOwnership({
            eco1Key,
            ownerType,
            ownerAddress,
            ownerName,
            mode,
        });
        // Injeta ownershipRef para o encoder incluir no payload
        _pendingOwnershipRef = {
            mode: result.mode,
            registryId: result.registryId,
            ownerAddress: result.ownerAddress,
            registeredAt: result.registeredAt,
            ...(result.tokenId ? { tokenId: result.tokenId } : {}),
        };
        const modeLabel = mode === 'public' ? `NFT #${result.tokenId}` : 'registro privado';
        showToast(`Ownership registrado: ${modeLabel}`, 'success');
        return result;
    } catch (err: any) {
        log.error('Ownership registration failed', err?.message);
        showToast(`Erro ao registrar ownership: ${err?.message}`, 'error');
        throw err;
    }
}
export const ownershipHandlers = {
    toggleOwnershipOptions,
    handleConnectWallet,
    handleRegisterOwnership,
    consumePendingOwnershipRef,
};
