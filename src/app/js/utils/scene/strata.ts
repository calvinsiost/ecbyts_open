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
   CAMADAS ESTRATIGRAFICAS (GEOLOGICAS)
   ================================================================

   Este modulo cria a representacao visual das camadas do subsolo.

   ESTRATIGRAFIA:
   E o estudo das camadas de rochas e sedimentos.
   Cada camada conta uma parte da historia geologica.

   REPRESENTACAO:
   - Caixas 3D empilhadas verticalmente
   - Cada camada tem cor representando tipo de material
   - Posicionadas ao lado da area principal como referencia

   CAMADAS TIPICAS (de cima para baixo):
   1. Topsoil (solo) - marrom
   2. Areia/Cascalho - bege (aquifero)
   3. Argila - cinza (aquitarde - barreira)
   4. Arenito - bege claro (aquifero)
   5. Folhelho - cinza escuro (aquitarde)
   6. Calcario - cinza claro (aquifero carstico)

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { CONFIG } from '../../config.js';
// ----------------------------------------------------------------
// CONFIGURACAO
// ----------------------------------------------------------------
/**
 * Posicao X do perfil estratigrafico.
 * Valor negativo coloca a esquerda da area principal.
 */
const STRATA_X_OFFSET = -45;
/**
 * Dimensoes das caixas de estrato.
 */
const STRATA_SIZE = {
    width: 10, // Largura (eixo X)
    depth: 10, // Profundidade (eixo Z)
};
// ----------------------------------------------------------------
// FUNCAO PRINCIPAL
// ----------------------------------------------------------------
/**
 * Cria a visualizacao das camadas geologicas.
 *
 * @param {*} strataGroup - Grupo onde adicionar os estratos (THREE.Group)
 *
 * COMO FUNCIONA:
 * 1. Le configuracao de camadas do CONFIG
 * 2. Para cada camada, cria uma caixa 3D
 * 3. Posiciona e colore conforme tipo de material
 */
export function createStrata(strataGroup: any) {
    // Limpa estratos anteriores
    clearGroup(strataGroup);
    // Para cada camada definida na configuracao...
    CONFIG.STRATA.forEach((layer: any) => {
        createStratumMesh(strataGroup, layer);
    });
}
// ----------------------------------------------------------------
// FUNCOES AUXILIARES
// ----------------------------------------------------------------
/**
 * Cria o mesh (objeto 3D) de uma camada geologica.
 *
 * @param {*} group - Grupo pai (THREE.Group)
 * @param {*} layer - Dados da camada (id, name, top, bottom, color)
 *
 * GEOMETRIA:
 * - BoxGeometry cria uma caixa com dimensoes especificas
 * - A altura e calculada pela diferenca entre topo e base
 *
 * MATERIAL:
 * - MeshStandardMaterial reage a luz (sombras, reflexos)
 * - Roughness alto (0.8) = superficie fosca/rugosa
 */
function createStratumMesh(group: any, layer: any) {
    /**
     * Calcula espessura da camada.
     * Usamos Math.abs porque bottom e negativo (mais profundo).
     * Exemplo: top=-3, bottom=-15 -> espessura = 12 metros
     */
    const thickness = Math.abs(layer.bottom - layer.top);
    /**
     * Cria geometria da caixa.
     * Parametros: largura, altura, profundidade
     */
    const geometry = new THREE.BoxGeometry(STRATA_SIZE.width, thickness, STRATA_SIZE.depth);
    /**
     * Cria material com a cor da camada.
     * MeshStandardMaterial e mais realista que MeshBasicMaterial.
     */
    const material = new THREE.MeshStandardMaterial({
        color: layer.color,
        roughness: 0.8, // Superficie rugosa (nao brilhante)
    });
    /**
     * Cria o mesh combinando geometria + material.
     * Mesh e o objeto 3D que aparece na cena.
     */
    const mesh = new THREE.Mesh(geometry, material);
    /**
     * Posiciona o mesh.
     * - X: offset lateral (fora da area principal)
     * - Y: centro vertical da camada (media entre topo e base)
     * - Z: centro (0)
     */
    mesh.position.set(STRATA_X_OFFSET, (layer.top + layer.bottom) / 2, // Centro vertical
    0);
    /**
     * Habilita sombras.
     * - castShadow: projeta sombra em outros objetos
     * - receiveShadow: recebe sombra de outros objetos
     */
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    /**
     * Guarda informacoes da camada no mesh.
     * Util para identificar ao clicar ou inspecionar.
     */
    mesh.userData = {
        type: 'stratum',
        layerId: layer.id,
        layerName: layer.name,
    };
    group.add(mesh);
}
/**
 * Remove todos os objetos de um grupo, liberando memoria.
 *
 * @param {*} group - Grupo a ser limpo (THREE.Group)
 *
 * IMPORTANTE:
 * Sempre libere geometrias e materiais com dispose()
 * para evitar vazamento de memoria (memory leak).
 */
function clearGroup(group: any) {
    while (group.children.length > 0) {
        const child = group.children[0];
        // Libera memoria
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((/** @type {*} */ m: any) => m.dispose());
            }
            else {
                child.material.dispose();
            }
        }
        group.remove(child);
    }
}
// ----------------------------------------------------------------
// FUNCOES DE CONSULTA
// ----------------------------------------------------------------
/**
 * Retorna informacoes de uma camada pelo ID.
 *
 * @param {string} layerId - ID da camada (ex: 'sand', 'clay')
 * @returns {Object|undefined} - Dados da camada ou undefined
 *
 * EXEMPLO:
 *   const sand = getStratumInfo('sand');
 *   console.log(sand.name); // "Sand/Gravel"
 */
export function getStratumInfo(layerId: any) {
    return CONFIG.STRATA.find((layer: any) => layer.id === layerId);
}
/**
 * Retorna a camada em uma determinada profundidade.
 *
 * @param {number} depth - Profundidade (valor negativo)
 * @returns {Object|undefined} - Camada nessa profundidade
 *
 * EXEMPLO:
 *   const layer = getStratumAtDepth(-10);
 *   console.log(layer.name); // "Sand/Gravel"
 */
export function getStratumAtDepth(depth: any) {
    return CONFIG.STRATA.find((layer: any) => depth <= layer.top && depth >= layer.bottom);
}
//# sourceMappingURL=strata.js.map
