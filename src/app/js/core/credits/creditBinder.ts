// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { computeScopeHash } from '../eis/eisScopeResolver.js';

/**
 * Compute djb2 hash hex of any input coerced to string.
 * @param {unknown} input
 * @returns {string} 8-char hex
 */
function hashText(input: unknown): string {
    const txt = String(input || '');
    let hash = 5381;
    for (let i = 0; i < txt.length; i++) hash = ((hash << 5) + hash + txt.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(16).padStart(8, '0');
}

interface CreditBindingParams {
    cnpj?: string;
    modelId?: string;
    scope?: {
        type: string;
        nodeId?: string;
        elementId?: string;
    };
}

interface CreditBindingTriple {
    cnpjHash: string;
    modelId: string;
    scopeHash: string;
}

/**
 * Build the canonical credit-binding triple for a model/scope.
 * @param {CreditBindingParams} [params]
 * @returns {CreditBindingTriple}
 */
export function buildCreditBindingTriple({ cnpj, modelId, scope }: CreditBindingParams = {}): CreditBindingTriple {
    return {
        cnpjHash: hashText(cnpj || ''),
        modelId: String(modelId || ''),
        scopeHash: computeScopeHash(scope || { type: 'model' }),
    };
}
