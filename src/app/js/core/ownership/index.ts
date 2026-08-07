// Generated from src/app/js/core/ownership/index.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   OWNERSHIP — Re-export público do módulo Data Owner

   ADR: core/ownership/ADR.md
   Depende de: ADR 8 (core/crypto — Accepted)
   ================================================================ */

import { getOwner, getUserRole } from '../../utils/auth/permissions.js';
import * as _sessionMod from '../../utils/auth/session.js';
const getUserEmail = (_sessionMod).getUserEmail;

// ----------------------------------------------------------------
// PERMISSÕES DE SESSÃO (mantido do stub original)
// ----------------------------------------------------------------

/**
 * Evaluate ownership-based authorization for sensitive mutating operations.
 * Rule: actor must be owner OR have admin role.
 */
export function evaluateOwnershipPermission() {
    const actor = getUserEmail() || null;
    const owner = getOwner() || null;
    const role = getUserRole() as any;
    const isOwner = !!actor && !!owner && actor === owner;
    const isAdmin = role === 'admin' || role === 'owner';

    return { ok: isOwner || isAdmin, actor, owner, role };
}

/**
 * Check and return a structured result for enforcement points.
 * @param {string} actionLabel
 */
export function requireOwnershipPermission(actionLabel = 'operation') {
    const result = evaluateOwnershipPermission();
    if (result.ok) return result;
    return {
        ...result,
        ok: false,
        error: `Ownership enforcement blocked ${actionLabel}. Only owner or admin can proceed.`,
    };
}

// ----------------------------------------------------------------
// DATA OWNER - Orquestrador + Wallet + EIP-712 + Registries
// ----------------------------------------------------------------

export { registerOwnership, getOwnership, verifyOwnership, checkNFTByHash } from './ownershipManager.js';

export {
    detectWallets,
    connectWallet,
    getConnectedAddress,
    disconnectWallet,
    switchToBase,
} from './walletConnector.js';

export { buildSignableOwnership, signOwnershipRecord, verifyOwnershipSignature } from './ethSigner.js';

export { registerPrivateOwnership, updateWithNFT, getPrivateOwnership, listOwnedModels } from './offchainRegistry.js';

export { mintOwnershipNFT, findTokenByEco1Hash, getOnchainOwner } from './onchainRegistry.js';
