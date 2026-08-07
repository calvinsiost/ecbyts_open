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
   GLTF FORMAT — Exportação de cena 3D
   ================================================================

   Exporta a cena Three.js como glTF/GLB para abertura no Blender,
   Unity, visualizadores web e outros softwares 3D.

   Usa o GLTFExporter do Three.js (disponível via CDN importmap).
   Metadados dos elementos são preservados no campo 'extras' do glTF.

   ================================================================ */
import { registerFormat } from './registry.js';
// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------
registerFormat({
    id: 'gltf',
    name: 'glTF (3D Model)',
    extensions: ['.glb', '.gltf'],
    mimeType: 'model/gltf-binary',
    canExport: true,
    canImport: false,
    needsOrigin: false,
    exportScopes: ['scene'],
});
// ----------------------------------------------------------------
// EXPORTAÇÃO
// ----------------------------------------------------------------
/**
 * Exporta a cena Three.js como glTF ou GLB.
 *
 * @param model - Modelo completo (não usado diretamente, cena vem do Three.js)
 * @param options
 * @returns
 */
export async function exportGLTF(model: any, options: any = {}) {
    const { binary = true } = options;
    // Import dinâmico do GLTFExporter (evita carregar se não usado)
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js' as string);
    const { getScene } = await import('../../../utils/scene/setup.js' as string);
    const scene = getScene();
    if (!scene) {
        throw new Error('Cena 3D não inicializada');
    }
    const exporter = new GLTFExporter();
    return new Promise((resolve: any, reject: any) => {
        exporter.parse(
            scene,
            (result: any) => {
                if (binary) {
                    resolve(new Blob([result], { type: 'model/gltf-binary' }));
                } else {
                    const json = JSON.stringify(result, null, 2);
                    resolve(new Blob([json], { type: 'model/gltf+json' }));
                }
            },
            (error: any) => reject(error),
            { binary },
        );
    });
}
