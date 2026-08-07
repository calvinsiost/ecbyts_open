// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO — Collection Defaults
   Gera coleções padrão quando o modelo está carregado mas sem coleções.
   SPEC_DATA_STUDIO_ETLC_REFRAME §F5 + §13
   ================================================================ */

// Listas canônicas de compostos para fallback quando category não está populado
// Canonical compound lists for classification when no category field is present.
const _SVOC_NAMES = [
    'benzeno',
    'benzene',
    'tolueno',
    'toluene',
    'etilbenzeno',
    'ethylbenzene',
    'xileno',
    'xylene',
    'naftaleno',
    'naphthalene',
    'antraceno',
    'anthracene',
    'pireno',
    'pyrene',
    'fluoreno',
    'fluorene',
    'criseno',
    'chrysene',
    'benzo(a)pireno',
    'benzo(a)pyrene',
    'fenantreno',
    'phenanthrene',
    'dibenzofurano',
    'dibenzofuran',
    'dioxina',
    'dioxin',
    'pcb',
    'hch',
    'aldrin',
    'dieldrin',
    'endrin',
    'ddt',
    'benzo[a]pyrene',
];

const _METAL_NAMES = [
    'chumbo',
    'lead',
    'pb',
    'arsenio',
    'arsenic',
    'as',
    'mercurio',
    'mercury',
    'hg',
    'cadmio',
    'cadmium',
    'cd',
    'cromo',
    'chromium',
    'cr',
    'niquel',
    'nickel',
    'ni',
    'zinco',
    'zinc',
    'zn',
    'cobre',
    'copper',
    'cu',
    'manganes',
    'manganese',
    'mn',
    'bario',
    'barium',
    'ba',
    'selenio',
    'selenium',
    'se',
    'vanadio',
    'vanadium',
    'v',
    'cobalto',
    'cobalt',
    'co',
    'estanho',
    'tin',
    'sn',
];

/**
 * Classifica um nome de parâmetro como 'svoc', 'metal' ou null.
 * Classify a parameter name as 'svoc', 'metal', or null.
 */
export function classifyParameter(paramName: string): 'svoc' | 'metal' | null {
    if (!paramName) return null;
    const lower = String(paramName).toLowerCase().trim();
    if (_SVOC_NAMES.some((n) => lower.includes(n))) return 'svoc';
    if (_METAL_NAMES.some((n) => lower === n || lower.includes(n))) return 'metal';
    return null;
}

/**
 * Gera até 4 coleções padrão baseadas no estado atual do modelo.
 * Generate up to 4 default collections from current model state.
 * Idempotente: usa IDs fixos (default_*) para evitar duplicação.
 *
 * @param elements   - lista de elementos do modelo (de getAllElements())
 * @param campaigns  - lista de campanhas (de getAllCampaigns())
 */
export function generateDefaultCollections(
    elements: Array<any> = [],
    campaigns: Array<any> = [],
): Array<{ id: string; name: string; type: string; filter: Object; icon: string }> {
    if (!elements.length && !campaigns.length) return [];

    const result = [];

    // Default 1 - Últimas Campanhas (até 2, ordenadas por data desc)
    if (campaigns.length > 0) {
        const sorted = [...campaigns].sort((a, b) => {
            const ta = new Date(a.openedAt || a.createdAt || 0).getTime();
            const tb = new Date(b.openedAt || b.createdAt || 0).getTime();
            return tb - ta;
        });
        const lastTwo = sorted.slice(0, 2).map((c) => c.id);
        result.push({
            id: 'default_last_campaigns',
            name: 'Últimas Campanhas',
            type: 'campaign',
            filter: { ids: lastTwo, sort: 'recent', limit: 2 },
            icon: '&#x1F4C5;',
        });
    }

    // Default 2 - SVOCs
    const svocElements = elements.filter((el) => {
        const obs = el.observations || [];
        return obs.some((o: any) => {
            const cat = o.category || o.parameterCategory;
            if (cat === 'svoc') return true;
            return classifyParameter(o.parameter || o.parameterName) === 'svoc';
        });
    });
    if (svocElements.length > 0) {
        result.push({
            id: 'default_svocs',
            name: 'SVOCs',
            type: 'observation',
            filter: { category: 'svoc', elementIds: svocElements.map((e) => e.id) },
            icon: '&#x1F9EA;',
        });
    }

    // Default 3 - Metais
    const metalElements = elements.filter((el) => {
        const obs = el.observations || [];
        return obs.some((o: any) => {
            const cat = o.category || o.parameterCategory;
            if (cat === 'metal' || cat === 'metals') return true;
            return classifyParameter(o.parameter || o.parameterName) === 'metal';
        });
    });
    if (metalElements.length > 0) {
        result.push({
            id: 'default_metals',
            name: 'Metais',
            type: 'observation',
            filter: { category: 'metals', elementIds: metalElements.map((e) => e.id) },
            icon: '&#x2697;',
        });
    }

    // Default 4 - Dados p/ Órgão Ambiental (status 'finalized' ou 'audited')
    const finalizedObs = elements.filter((el) => {
        const obs = el.observations || [];
        return obs.some((o: any) => o.status === 'finalized' || o.status === 'audited');
    });
    if (finalizedObs.length > 0 || elements.length > 0) {
        result.push({
            id: 'default_finalized',
            name: 'Dados p/ Órgão Ambiental',
            type: 'observation',
            filter: { status: 'finalized' },
            icon: '&#x1F4CB;',
        });
    }

    return result;
}
