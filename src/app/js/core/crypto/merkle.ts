// @ts-check
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
   MERKLE TREE - ARVORE DE HASHES
   ================================================================

   Este modulo implementa uma Merkle Tree para verificacao
   eficiente de integridade dos elementos do modelo.

   O QUE E UMA MERKLE TREE:
   - Estrutura em arvore onde cada no e um hash
   - Folhas: hash de cada elemento individual
   - Nos internos: hash da concatenacao dos filhos
   - Raiz: hash unico que representa todos os dados

   BENEFICIOS:
   - Verificar 1 elemento sem processar todos os outros
   - Detectar exatamente qual elemento foi alterado
   - Prova de inclusao compacta (O(log n))

   ESTRUTURA:
                    [Root Hash]
                   /            \
           [Hash 0-1]        [Hash 2-3]
           /        \        /        \
       [H-Elem0] [H-Elem1] [H-Elem2] [H-Elem3]

   ================================================================ */

import { sha256, hashToBase64URL } from './hashChain.js';

/**
 * @typedef {Record<string, unknown>} MerkleElement
 *
 * @typedef {Object} MerkleModel
 * @property {MerkleElement[]} [elements]
 * @property {unknown} [project]
 * @property {unknown} [campaigns]
 * @property {unknown} [coordinate]
 * @property {unknown} [families]
 *
 * @typedef {Object} MerkleElementTree
 * @property {string} root
 * @property {string[][]} levels
 *
 * @typedef {Object} MerkleTreeResult
 * @property {string} root
 * @property {string} rootFull
 * @property {string[]} elementHashes
 * @property {string} metadataHash
 * @property {string} elementRoot
 * @property {{ elementTree: MerkleElementTree | null, metadataHash: string, root: string }} tree
 *
 * @typedef {'left' | 'right'} ProofPosition
 *
 * @typedef {Object} ProofStep
 * @property {string} hash
 * @property {ProofPosition} position
 *
 * @typedef {Object} ProofResult
 * @property {number} elementIndex
 * @property {string} elementHash
 * @property {ProofStep[]} proof
 * @property {string} root
 *
 * @typedef {Object} ModelIntegrityResult
 * @property {boolean} valid
 * @property {number} [elementsCount]
 * @property {string} [root]
 * @property {string} [reason]
 * @property {string} [calculated]
 * @property {string} [expected]
 *
 * @typedef {Object} ModelComparisonResult
 * @property {number[]} modified
 * @property {number[]} added
 * @property {number[]} removed
 * @property {boolean} rootChanged
 * @property {boolean} metadataChanged
 */

// ----------------------------------------------------------------
// CONSTRUCAO DA ARVORE
// ----------------------------------------------------------------

/**
 * Constroi uma Merkle Tree a partir do modelo.
 *
 * @param {MerkleModel} model - Modelo completo do ecbyts
 * @returns {Promise<MerkleTreeResult>} - Arvore construida
 *
 * RETORNO:
 * {
 *   root: "abc123...",           // Hash raiz (16 chars Base64URL)
 *   rootFull: "abc123def456...", // Hash raiz completo (64 chars hex)
 *   elementHashes: ["...", ...], // Hash de cada elemento
 *   metadataHash: "...",         // Hash dos metadados
 *   tree: { ... }                // Estrutura completa da arvore
 * }
 */
export async function buildMerkleTree(model: any) {
    // Extrai elementos e metadados
    const elements = model.elements || [];
    const metadata = {
        project: model.project,
        campaigns: model.campaigns,
        coordinate: model.coordinate,
        families: model.families,
    };

    // Calcula hash de cada elemento
    const elementHashes = await Promise.all(
        elements.map(async (element: any, index: any) => {
            const hash = await sha256(element);
            return { index, hash };
        }),
    );

    // Calcula hash dos metadados
    const metadataHash = await sha256(metadata);

    // Constroi arvore dos elementos
    /** @type {MerkleElementTree | null} */
    let elementTree = null;
    let elementRoot = await sha256('empty'); // Default se nao houver elementos

    if (elementHashes.length > 0) {
        elementTree = await buildTreeLevel(elementHashes.map((e) => e.hash));
        elementRoot = elementTree.root;
    }

    // Combina com metadados para raiz final
    const rootFull = await combineHashes(elementRoot, metadataHash);
    const root = hashToBase64URL(rootFull, 16);

    return {
        root,
        rootFull,
        elementHashes: elementHashes.map((e) => e.hash),
        metadataHash,
        elementRoot,
        tree: {
            elementTree,
            metadataHash,
            root: rootFull,
        },
    };
}

/**
 * Constroi um nivel da arvore a partir de hashes.
 *
 * @param {string[]} hashes - Array de hashes
 * @returns {Promise<MerkleElementTree>} - { root, levels }
 */
async function buildTreeLevel(hashes: any) {
    if (hashes.length === 0) {
        return { root: await sha256('empty'), levels: [] };
    }

    if (hashes.length === 1) {
        return { root: hashes[0], levels: [hashes] };
    }

    const levels = [hashes];
    let currentLevel = hashes;

    while (currentLevel.length > 1) {
        const nextLevel = [];

        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1] || left; // Duplica se impar
            const combined = await combineHashes(left, right);
            nextLevel.push(combined);
        }

        levels.push(nextLevel);
        currentLevel = nextLevel;
    }

    return {
        root: currentLevel[0],
        levels,
    };
}

/**
 * Combina dois hashes em um hash pai.
 *
 * @param {string} left - Hash esquerdo
 * @param {string} right - Hash direito
 * @returns {Promise<string>} - Hash combinado
 */
async function combineHashes(left: any, right: any) {
    return sha256(left + right);
}

// ----------------------------------------------------------------
// PROVA DE INCLUSAO
// ----------------------------------------------------------------

/**
 * Gera prova de inclusao para um elemento especifico.
 * Permite verificar que um elemento faz parte do modelo sem
 * ter acesso a todos os outros elementos.
 *
 * @param {MerkleModel} model - Modelo completo
 * @param {number} elementIndex - Indice do elemento (0-based)
 * @returns {Promise<ProofResult>} - Prova de inclusao
 *
 * RETORNO:
 * {
 *   elementIndex: 2,
 *   elementHash: "...",
 *   proof: [
 *     { hash: "...", position: "right" },
 *     { hash: "...", position: "left" },
 *     ...
 *   ],
 *   metadataHash: "...",
 *   root: "..."
 * }
 */
export async function generateProof(model: any, elementIndex: any) {
    const tree = await buildMerkleTree(model);
    const elements = model.elements || [];

    if (elementIndex < 0 || elementIndex >= elements.length) {
        throw new Error(`Indice ${elementIndex} fora do range (0-${elements.length - 1})`);
    }

    /** @type {ProofStep[]} */
    const proof = [];
    let index = elementIndex;
    let hashes = tree.elementHashes;

    // Sobe a arvore coletando hashes irmaos
    while (hashes.length > 1) {
        const isLeft = index % 2 === 0;
        const siblingIndex = isLeft ? index + 1 : index - 1;

        // Pega irmao (ou duplica se nao existir)
        const sibling = hashes[siblingIndex] !== undefined ? hashes[siblingIndex] : hashes[index];

        proof.push({
            hash: sibling,
            position: isLeft ? 'right' : 'left',
        });

        // Calcula proximo nivel
        const nextLevel = [];
        for (let i = 0; i < hashes.length; i += 2) {
            const left = hashes[i];
            const right = hashes[i + 1] || left;
            nextLevel.push(await combineHashes(left, right));
        }

        hashes = nextLevel;
        index = Math.floor(index / 2);
    }

    // Adiciona hash de metadados (para chegar ao root final)
    proof.push({
        hash: tree.metadataHash,
        position: 'right',
    });

    return {
        elementIndex,
        elementHash: tree.elementHashes[elementIndex],
        proof,
        root: tree.root,
    };
}

/**
 * Verifica uma prova de inclusao.
 *
 * @param {MerkleElement|string} elementData - Dados do elemento (objeto ou string)
 * @param {ProofStep[]} proof - Array de passos da prova
 * @param {string} expectedRoot - Hash raiz esperado (16 chars Base64URL)
 * @returns {Promise<boolean>} - true se a prova e valida
 *
 * EXEMPLO:
 * const valid = await verifyProof(element, proof, "abc123...");
 * // true se elemento faz parte do modelo com aquele root
 */
export async function verifyProof(elementData: any, proof: any, expectedRoot: any) {
    try {
        // Calcula hash do elemento
        let hash = await sha256(elementData);

        // Sobe a arvore usando a prova
        for (const step of proof) {
            if (step.position === 'left') {
                hash = await combineHashes(step.hash, hash);
            } else {
                hash = await combineHashes(hash, step.hash);
            }
        }

        // Compara com root esperado
        const calculatedRoot = hashToBase64URL(hash, 16);
        return calculatedRoot === expectedRoot;
    } catch (err) {
        console.error('Erro ao verificar prova Merkle:', err);
        return false;
    }
}

// ----------------------------------------------------------------
// VERIFICACAO COMPLETA
// ----------------------------------------------------------------

/**
 * Verifica integridade de todo o modelo contra um Merkle root.
 *
 * @param {MerkleModel} model - Modelo a verificar
 * @param {string} expectedRoot - Root esperado (16 chars Base64URL)
 * @returns {Promise<ModelIntegrityResult>} - Resultado da verificacao
 *
 * RETORNO (sucesso):
 * { valid: true, elementsCount: 5 }
 *
 * RETORNO (falha):
 * { valid: false, reason: "Root nao confere" }
 */
export async function verifyModelIntegrity(model: any, expectedRoot: any) {
    try {
        const tree = await buildMerkleTree(model);

        if (tree.root !== expectedRoot) {
            return {
                valid: false,
                reason: 'Root calculado nao confere com esperado',
                calculated: tree.root,
                expected: expectedRoot,
            };
        }

        return {
            valid: true,
            elementsCount: (model.elements || []).length,
            root: tree.root,
        };
    } catch (err) {
        return {
            valid: false,
            reason: 'Erro ao verificar: ' + (err instanceof Error ? err.message : String(err)),
        };
    }
}

/**
 * Encontra qual elemento foi modificado comparando dois modelos.
 *
 * @param {MerkleModel} originalModel - Modelo original
 * @param {MerkleModel} modifiedModel - Modelo modificado
 * @returns {Promise<ModelComparisonResult>} - Resultado da comparacao
 *
 * RETORNO:
 * {
 *   modified: [0, 3],    // Indices dos elementos modificados
 *   added: [5, 6],       // Indices dos elementos adicionados
 *   removed: [2]         // Indices dos elementos removidos
 * }
 */
export async function compareModels(originalModel: any, modifiedModel: any) {
    const originalTree = await buildMerkleTree(originalModel);
    const modifiedTree = await buildMerkleTree(modifiedModel);

    const originalHashes = originalTree.elementHashes;
    const modifiedHashes = modifiedTree.elementHashes;

    /** @type {number[]} */
    const modified = [];
    /** @type {number[]} */
    const added = [];
    /** @type {number[]} */
    const removed = [];

    // Compara elementos existentes
    const minLength = Math.min(originalHashes.length, modifiedHashes.length);
    for (let i = 0; i < minLength; i++) {
        if (originalHashes[i] !== modifiedHashes[i]) {
            modified.push(i);
        }
    }

    // Elementos adicionados
    if (modifiedHashes.length > originalHashes.length) {
        for (let i = originalHashes.length; i < modifiedHashes.length; i++) {
            added.push(i);
        }
    }

    // Elementos removidos
    if (originalHashes.length > modifiedHashes.length) {
        for (let i = modifiedHashes.length; i < originalHashes.length; i++) {
            removed.push(i);
        }
    }

    return {
        modified,
        added,
        removed,
        rootChanged: originalTree.root !== modifiedTree.root,
        metadataChanged: originalTree.metadataHash !== modifiedTree.metadataHash,
    };
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

/**
 * Calcula apenas o Merkle root de um modelo (rapido).
 *
 * @param {MerkleModel} model - Modelo
 * @returns {Promise<string>} - Root em Base64URL (16 chars)
 */
export async function computeMerkleRoot(model: any) {
    const tree = await buildMerkleTree(model);
    return tree.root;
}

/**
 * Verifica se dois modelos sao identicos (mesmo Merkle root).
 *
 * @param {MerkleModel} model1 - Primeiro modelo
 * @param {MerkleModel} model2 - Segundo modelo
 * @returns {Promise<boolean>}
 */
export async function areModelsEqual(model1: any, model2: any) {
    const root1 = await computeMerkleRoot(model1);
    const root2 = await computeMerkleRoot(model2);
    return root1 === root2;
}
