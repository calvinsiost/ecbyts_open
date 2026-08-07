// @ts-check
// Generated from src/app/js/utils/stamps/manager.ts by TS-MIGRATION-001. Do not edit manually.
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
   GERENCIADOR DE ESTAMPAS (STAMP MANAGER)
   ================================================================

   CRUD e operacoes sobre estampas de ativos.

   OPERACOES:
   - addStamp: Adiciona estampa a um elemento
   - removeStamp: Remove estampa de um elemento
   - updateStamp: Atualiza valor de estampa
   - getStamps: Lista estampas de um elemento
   - findByStamp: Busca elementos por estampa

   ================================================================ */
import { getStampType, validateStampValue } from './types.js';
import { generateId } from '../helpers/id.js';
import { checkResponsibleTechnicalStamp } from '../../core/attestation/_credentialGatePure.js';
// ----------------------------------------------------------------
// FUNCOES DE GERACAO DE ID
// ----------------------------------------------------------------
/**
 * Gera ID unico para estampa.
 * @returns {string}
 */
function generateStampId() {
    return generateId('stamp');
}
// ----------------------------------------------------------------
// CRUD DE ESTAMPAS
// ----------------------------------------------------------------
/**
 * Adiciona estampa a um elemento.
 * @param {any} element - Elemento alvo
 * @param {string} typeId - ID do tipo de estampa
 * @param {any} value - Valor da estampa
 * @param {any} [options] - Opcoes adicionais (appliedBy, signature, expiresAt, classification)
 * @returns {{ success: boolean, stamp?: any, errors?: string[] }}
 */
export function addStamp( element: any, typeId: any, value: any, options: any = {}) {
    // Validar tipo
    const stampType = getStampType(typeId);
    if (!stampType) {
        return { success: false, errors: [`Tipo de estampa desconhecido: ${typeId}`] };
    }
    // Validar valor
    const validation = validateStampValue(typeId, value);
    if (!validation.valid) {
        return { success: false, errors: validation.errors };
    }
    // ATTEST-001 (eixo E2) — GATE DE CREDENCIAL.
    // validateStampValue so checa TIPO e OBRIGATORIEDADE do campo; sem este gate
    // qualquer usuario se carimbava como responsavel tecnico de um ativo com um
    // numero de CREA arbitrario, e a afirmacao viajava dentro do modelo exportado.
    // Assinar como RT e ato regulado (Lei 6.496/1977).
    // O gate confere FORMA (conselho habilitado para o ato, formato plausivel,
    // credencial nao vencida) — NAO consulta a base do conselho; por isso a
    // estampa e marcada como nao verificada contra registro, e a UI nunca pode
    // exibi-la como "verificada".
    if (typeId === 'responsible_technical') {
        const credentialCheck = checkResponsibleTechnicalStamp(value);
        if (!credentialCheck.allowed) {
            return { success: false, errors: [credentialCheck.detail] };
        }
    }
    // Inicializar array de estampas se necessario
    if (!element.stamps) {
        element.stamps = [];
    }
    // Criar estampa
    const stamp: any = {
        id: generateStampId(),
        category: /** @type {any} */ (stampType).category,
        type: typeId,
        classification: options.classification || 'passive',
        value: { ...value },
        appliedAt: new Date().toISOString(),
        appliedBy: options.appliedBy || 'system',
    };
    // ATTEST-001 (E7) — lastro honesto: a credencial passou apenas na conferencia
    // de FORMA, nunca contra a base do conselho. Marcar aqui impede que a UI ou o
    // export afirmem verificacao que nao houve (a verificacao server-side e RF-7).
    if (typeId === 'responsible_technical') {
        stamp.verifiedAgainstRegistry = false;
    }
    // Adicionar campos opcionais
    if (options.signature) {
        stamp.signature = options.signature;
    }
    if (options.expiresAt) {
        stamp.expiresAt = options.expiresAt;
    }
    element.stamps.push(stamp);
    return { success: true, stamp };
}
/**
 * Remove estampa de um elemento.
 * @param {any} element - Elemento alvo
 * @param {string} stampId - ID da estampa a remover
 * @returns {{ success: boolean, error?: string }}
 */
export function removeStamp( element: any, stampId: any) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return { success: false, error: 'Elemento nao possui estampas' };
    }
    const index = element.stamps.findIndex((s: any) => s.id === stampId);
    if (index === -1) {
        return { success: false, error: `Estampa nao encontrada: ${stampId}` };
    }
    element.stamps.splice(index, 1);
    return { success: true };
}
/**
 * Atualiza valor de uma estampa.
 * @param {any} element - Elemento alvo
 * @param {string} stampId - ID da estampa
 * @param {any} newValue - Novo valor
 * @returns {{ success: boolean, stamp?: any, errors?: string[] }}
 */
export function updateStamp( element: any, stampId: any, newValue: any) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return { success: false, errors: ['Elemento nao possui estampas'] };
    }
    const stamp = element.stamps.find((s: any) => s.id === stampId);
    if (!stamp) {
        return { success: false, errors: [`Estampa nao encontrada: ${stampId}`] };
    }
    // Validar novo valor
    const validation = validateStampValue(stamp.type, newValue);
    if (!validation.valid) {
        return { success: false, errors: validation.errors };
    }
    // Atualizar
    stamp.value = { ...newValue };
    stamp.modifiedAt = new Date().toISOString();
    return { success: true, stamp };
}
/**
 * Obtem estampas de um elemento.
 * @param {any} element - Elemento alvo
 * @param {any} [filter] - Filtro opcional (category, type)
 * @returns {any[]}
 */
export function getStamps( element: any, filter: any = {}) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return [];
    }
    let stamps = [...element.stamps];
    if (filter.category) {
        stamps = stamps.filter((s: any) => s.category === filter.category);
    }
    if (filter.type) {
        stamps = stamps.filter((s: any) => s.type === filter.type);
    }
    return stamps;
}
/**
 * Obtem estampa por ID.
 * @param {any} element - Elemento alvo
 * @param {string} stampId - ID da estampa
 * @returns {any|null}
 */
export function getStampById( element: any, stampId: any) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return null;
    }
    return element.stamps.find((s: any) => s.id === stampId) || null;
}
// ----------------------------------------------------------------
// BUSCA POR ESTAMPAS
// ----------------------------------------------------------------
/**
 * Busca elementos por estampa.
 * @param {any[]} elements - Lista de elementos
 * @param {any} query - Criterios de busca (type, category, valueMatch)
 * @returns {any[]}
 */
export function findByStamp( elements: any, query: any) {
    return elements.filter((element: any) => {
        if (!element.stamps || !Array.isArray(element.stamps)) {
            return false;
        }
        return element.stamps.some((stamp: any) => {
            // Match por tipo
            if (query.type && stamp.type !== query.type) {
                return false;
            }
            // Match por categoria
            if (query.category && stamp.category !== query.category) {
                return false;
            }
            // Match por valores
            if (query.valueMatch) {
                for (const [key, value] of Object.entries(query.valueMatch)) {
                    if (stamp.value[key] !== value) {
                        return false;
                    }
                }
            }
            return true;
        });
    });
}
/**
 * Busca elementos por tipo de estampa GRI.
 * @param {any[]} elements - Lista de elementos
 * @param {string} disclosure - Codigo GRI (ex: '303-1')
 * @returns {any[]}
 */
export function findByGRI( elements: any, disclosure: any) {
    return findByStamp(elements, {
        type: 'gri',
        valueMatch: { disclosure },
    });
}
/**
 * Busca elementos por pilar ESG.
 * @param {any[]} elements - Lista de elementos
 * @param {string} pillar - E|S|G
 * @returns {any[]}
 */
export function findByESGPillar( elements: any, pillar: any) {
    return findByStamp(elements, {
        type: 'esg_category',
        valueMatch: { pillar },
    });
}
/**
 * Busca elementos por ODS.
 * @param {any[]} elements - Lista de elementos
 * @param {number} goal - Numero do ODS (1-17)
 * @returns {any[]}
 */
export function findBySDG( elements: any, goal: any) {
    return findByStamp(elements, {
        type: 'sdg',
        valueMatch: { goal },
    });
}
// ----------------------------------------------------------------
// ESTATISTICAS DE ESTAMPAS
// ----------------------------------------------------------------
/**
 * Conta estampas por categoria.
 * @param {any[]} elements - Lista de elementos
 * @returns {any} Contagem por categoria
 */
export function countStampsByCategory( elements: any) {
    const counts: any = {
        governance: 0,
        context: 0,
        reporting: 0,
    };
    elements.forEach((element: any) => {
        if (element.stamps && Array.isArray(element.stamps)) {
            element.stamps.forEach((stamp: any) => {
                if (counts[stamp.category] !== undefined) {
                    counts[stamp.category]++;
                }
            });
        }
    });
    return counts;
}
/**
 * Conta estampas por tipo.
 * @param {any[]} elements - Lista de elementos
 * @returns {any} Contagem por tipo
 */
export function countStampsByType( elements: any) {
    const counts: any = {};
    elements.forEach((element: any) => {
        if (element.stamps && Array.isArray(element.stamps)) {
            element.stamps.forEach((stamp: any) => {
                counts[stamp.type] = (counts[stamp.type] || 0) + 1;
            });
        }
    });
    return counts;
}
// ----------------------------------------------------------------
// VERIFICACAO DE GOVERNANCA
// ----------------------------------------------------------------
/**
 * Verifica se elemento tem RT definido.
 * @param {any} element - Elemento
 * @returns {boolean}
 */
export function hasResponsibleTechnical( element: any) {
    return getStamps(element, { type: 'responsible_technical' }).length > 0;
}
/**
 * Verifica se elemento tem assinatura digital.
 * @param {any} element - Elemento
 * @returns {boolean}
 */
export function hasDigitalSignature( element: any) {
    return getStamps(element, { type: 'digital_signature' }).length > 0;
}
/**
 * Verifica se elemento esta aprovado.
 * @param {any} element - Elemento
 * @returns {{ approved: boolean, status?: string, approver?: string, date?: string }}
 */
export function getApprovalStatus( element: any) {
    const approvals = getStamps(element, { type: 'approval' });
    if (approvals.length === 0) {
        return { approved: false };
    }
    // Pegar a aprovacao mais recente
    const latest = approvals.sort(
        (a: any, b: any) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    )[0];
    return {
        approved: latest.value.status === 'approved',
        status: latest.value.status,
        approver: latest.value.approver,
        date: latest.value.date,
    };
}
// ----------------------------------------------------------------
// EXPORTACAO DE ESTAMPAS
// ----------------------------------------------------------------
/**
 * Exporta estampas de um elemento para formato simplificado.
 * @param {any} element - Elemento
 * @returns {any[]}
 */
export function exportStamps( element: any) {
    if (!element.stamps) return [];
    return element.stamps.map((stamp: any) => ({
        id: stamp.id,
        category: stamp.category,
        type: stamp.type,
        classification: stamp.classification || 'passive',
        value: stamp.value,
        appliedAt: stamp.appliedAt,
        appliedBy: stamp.appliedBy,
        ...(stamp.signature && { signature: stamp.signature }),
        ...(stamp.expiresAt && { expiresAt: stamp.expiresAt }),
    }));
}
/**
 * Importa estampas para um elemento.
 * @param {any} element - Elemento
 * @param {any[]} stamps - Estampas a importar
 * @param {boolean} validate - Se deve validar estampas
 * @returns {{ success: boolean, imported: number, errors: string[] }}
 */
export function importStamps( element: any, stamps: any, validate: any = true) {
    if (!Array.isArray(stamps)) {
        return { success: false, imported: 0, errors: ['Estampas deve ser um array'] };
    }
    element.stamps = element.stamps || [];
    const errors: any = [];
    let imported = 0;
    stamps.forEach((/** @type {any} */ stamp, index) => {
        if (validate) {
            const validation = validateStampValue(stamp.type, stamp.value);
            if (!validation.valid) {
                errors.push(`Estampa ${index}: ${validation.errors.join(', ')}`);
                return;
            }
        }
        element.stamps.push({
            id: stamp.id || generateStampId(),
            category: stamp.category,
            type: stamp.type,
            classification: stamp.classification || 'passive',
            value: stamp.value,
            appliedAt: stamp.appliedAt || new Date().toISOString(),
            appliedBy: stamp.appliedBy || 'import',
            ...(stamp.signature && { signature: stamp.signature }),
            ...(stamp.expiresAt && { expiresAt: stamp.expiresAt }),
        });
        imported++;
    });
    return {
        success: errors.length === 0,
        imported,
        errors,
    };
}
// ----------------------------------------------------------------
// CLASSIFICACAO PASSIVO/ATIVO
// ----------------------------------------------------------------
/**
 * Resumo de classificacao das estampas de um elemento.
 * @param {any} element - Elemento
 * @returns {{ passive: number, active: number }}
 */
export function getStampSummary( element: any) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return { passive: 0, active: 0 };
    }
    let passive = 0;
    let active = 0;
    element.stamps.forEach((s: any) => {
        if (s.classification === 'active') active++;
        else passive++;
    });
    return { passive, active };
}
/**
 * Filtra estampas por classificacao.
 * @param {any} element - Elemento
 * @param {'passive'|'active'} classification
 * @returns {any[]}
 */
export function filterStampsByClassification( element: any, classification: any) {
    if (!element.stamps || !Array.isArray(element.stamps)) {
        return [];
    }
    return element.stamps.filter((s: any) => s.classification === classification);
}
// ----------------------------------------------------------------
// CONDICIONANTE AMBIENTAL (ENV-CONDITIONS-001 A5)
// ----------------------------------------------------------------
/**
 * Parametros de `stampCondition` — categoria X (obrigatoria) + vinculos
 * opcionais (ODS, periodicidade, norma). Ver SPEC_ENVIRONMENTAL_CONDITIONS
 * secao 6 (A5) e A4 (schema da estampa monitoring_condition).
 * @typedef {Object} StampConditionParams
 * @property {string} theme - Tema (agua/ar/ruido/fauna/flora/residuos_efluentes/solo/social/compensacao)
 * @property {string} function - Funcao (preventiva/mitigadora/compensatoria) — exposta como `function`
 * @property {string} regime - Regime (prazo_fixo/continua)
 * @property {number} [odsGoal] - ODS 1-17 — presenca liga a estampa `sdg`
 * @property {string} [odsTarget] - Meta do ODS (ex "6.3")
 * @property {string} [odsIndicator] - Indicador oficial do ODS
 * @property {string} [frequency] - Periodicidade — presenca liga a estampa `temporal`
 * @property {string} [norm] - Norma/regulamento — presenca liga a estampa `regulatory`
 * @property {string} [article] - Artigo/secao da norma
 * @property {string} [jurisdiction] - Jurisdicao da norma
 */
/**
 * Aplica, numa unica chamada, as estampas de uma condicionante ambiental:
 * `monitoring_condition` (sempre) + `sdg`/`temporal`/`regulatory` (se os
 * respectivos campos opcionais forem fornecidos). Reusa `addStamp` — nao
 * duplica validacao nem CRUD.
 * @param {any} target - Elemento/Action alvo (permitCondition)
 * @param {StampConditionParams} params - Categoria X + vinculos opcionais
 * @returns {{ monitoringCondition: any, sdg?: any, temporal?: any, regulatory?: any }}
 */
export function stampCondition( target: any, params: any) {
    const { theme, function: fn, regime, odsGoal, odsTarget, odsIndicator, frequency, norm, article, jurisdiction } =
        params;
    const result: any = {
        monitoringCondition: addStamp(target, 'monitoring_condition', {
            theme,
            function: fn,
            regime,
            classification: 'passive',
        }),
    };
    if (odsGoal !== undefined) {
        result.sdg = addStamp(target, 'sdg', { goal: odsGoal, target: odsTarget, indicator: odsIndicator });
    }
    if (frequency !== undefined) {
        // Estampa `temporal` exige `start` (schema types.ts) — usa a data corrente
        // como inicio do periodo de referencia; stampCondition nao expoe `start`
        // como parametro proprio (fora do escopo da A5: so `frequency`).
        result.temporal = addStamp(target, 'temporal', {
            start: new Date().toISOString().slice(0, 10),
            frequency,
        });
    }
    if (norm !== undefined) {
        result.regulatory = addStamp(target, 'regulatory', { norm, article, jurisdiction });
    }
    return result;
}
