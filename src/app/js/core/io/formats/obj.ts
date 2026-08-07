// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   OBJ FORMAT — Exportação de malha 3D pronta para impressão 3D
   ================================================================

   Serializa a cena Three.js como Wavefront OBJ (malha triangulada),
   formato universal aceito por fatiadores de impressão 3D (Cura,
   PrusaSlicer, Bambu) e softwares 3D (Blender, MeshLab).

   A SERIALIZAÇÃO é pure-logic (buildObjFromMeshes) — sem Three.js,
   sem DOM, testável. A EXTRAÇÃO da geometria da cena (runtime) fica
   em extractPrintableMeshes, que injeta o Three.js dinamicamente
   (mesmo padrão do gltf.ts: nada é carregado se o export não roda).

   ================================================================ */
import { registerFormat } from './registry.js';

// ----------------------------------------------------------------
// TIPOS (pure) — compartilhados com o exportador GDL
// ----------------------------------------------------------------
/** Uma malha triangulada em espaço de mundo (metros / unidades da cena). */
export interface ExportMesh {
    name: string;
    /** triplas XYZ achatadas (x0,y0,z0, x1,y1,z1, ...). */
    positions: ArrayLike<number>;
    /** índices de triângulos (3 por face) sobre positions/3; ausente ⇒ não-indexado. */
    indices?: ArrayLike<number> | null;
}

export interface ObjBuildOptions {
    /** fator de escala aplicado às coordenadas (1 = unidades da cena; 1000 = m→mm). */
    scale?: number;
    /** casas decimais (default 5). */
    precision?: number;
    /** comentário de cabeçalho. */
    comment?: string;
}

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------
registerFormat({
    id: 'obj',
    name: 'OBJ (impressão 3D)',
    extensions: ['.obj'],
    mimeType: 'text/plain',
    canExport: true,
    canImport: false,
    needsOrigin: false,
    exportScopes: ['scene'],
});

// ----------------------------------------------------------------
// SERIALIZAÇÃO (pure-logic — testável sem cena)
// ----------------------------------------------------------------
function sanitizeName(name: string): string {
    return (name || 'object').replace(/\s+/g, '_').replace(/[^\w.-]/g, '') || 'object';
}

/** Extrai os triângulos (índices 0-based [a,b,c]) de uma malha (indexada ou não). */
export function trianglesOf(mesh: ExportMesh): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = [];
    const vCount = Math.floor(mesh.positions.length / 3);
    const idx = mesh.indices;
    if (idx && idx.length >= 3) {
        for (let i = 0; i + 2 < idx.length; i += 3) {
            const a = idx[i] as number, b = idx[i + 1] as number, c = idx[i + 2] as number;
            if (a < vCount && b < vCount && c < vCount) out.push([a, b, c]);
        }
    } else {
        for (let i = 0; i + 2 < vCount; i += 3) out.push([i, i + 1, i + 2]);
    }
    return out;
}

/**
 * Serializa um conjunto de malhas como Wavefront OBJ (pure-logic).
 * Vértices são globais e 1-indexados (contrato OBJ); cada malha vira um `o <nome>`.
 */
export function buildObjFromMeshes(meshes: ReadonlyArray<ExportMesh>, options: ObjBuildOptions = {}): string {
    const scale = options.scale ?? 1;
    const prec = options.precision ?? 5;
    const fmt = (n: number): string => {
        const r = Number((n * scale).toFixed(prec));
        return Object.is(r, -0) ? '0' : String(r);
    };
    const units = scale === 1000 ? 'milimetros' : scale === 1 ? 'unidades da cena (defina a escala no fatiador)' : `escala ${scale}x`;
    const lines: string[] = [
        `# ${options.comment ?? 'ECBT environmental model — OBJ'}`,
        '# Wavefront OBJ — malha triangulada pronta para impressao 3D',
        `# unidades: ${units}`,
    ];
    let vertexOffset = 0; // OBJ: vértices globais, 1-indexados
    for (const mesh of meshes) {
        const pos = mesh.positions;
        const vCount = Math.floor(pos.length / 3);
        if (vCount === 0) continue;
        const tris = trianglesOf(mesh);
        if (tris.length === 0) continue;
        lines.push(`o ${sanitizeName(mesh.name)}`);
        for (let i = 0; i < vCount; i++) {
            lines.push(`v ${fmt(pos[i * 3] as number)} ${fmt(pos[i * 3 + 1] as number)} ${fmt(pos[i * 3 + 2] as number)}`);
        }
        for (const [a, b, c] of tris) {
            lines.push(`f ${a + 1 + vertexOffset} ${b + 1 + vertexOffset} ${c + 1 + vertexOffset}`);
        }
        vertexOffset += vCount;
    }
    return lines.join('\n') + '\n';
}

// ----------------------------------------------------------------
// EXTRAÇÃO DA CENA (runtime — Three.js injetado dinamicamente)
// ----------------------------------------------------------------
/** Dependências injetáveis (para teste com cena/Three.js reais sem navegador). */
export interface ExtractDeps {
    /** cena Three.js; default = a cena do app (getScene). */
    scene?: unknown;
    /** namespace do Three.js; default = import dinâmico de 'three'. */
    three?: unknown;
}

/**
 * Varre a cena Three.js e devolve as malhas imprimíveis em espaço de mundo.
 * Pula helpers, labels e objetos marcados `userData.noExport`. Compartilhado
 * por exportOBJ e exportGDL. A cena e o Three.js são injetáveis (default =
 * cena do app + 'three') para permitir teste agêntico com geometria real.
 */
export async function extractPrintableMeshes(deps: ExtractDeps = {}): Promise<ExportMesh[]> {
    const THREE: any = deps.three ?? (await import('three'));
    let scene: any = deps.scene;
    if (!scene) {
        const { getScene } = (await import('../../../utils/scene/setup.js' as string)) as any;
        scene = getScene();
    }
    if (!scene) throw new Error('Cena 3D não inicializada');
    scene.updateMatrixWorld(true);
    const meshes: ExportMesh[] = [];
    const v = new THREE.Vector3();
    scene.traverse((obj: any) => {
        if (!obj.isMesh || !obj.geometry || obj.visible === false) return;
        const ud = obj.userData || {};
        if (ud.noExport || ud.isHelper || ud.isLabel) return;
        const posAttr = obj.geometry.attributes?.position;
        if (!posAttr || !posAttr.count) return;
        const positions: number[] = [];
        for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(obj.matrixWorld);
            positions.push(v.x, v.y, v.z);
        }
        const index = obj.geometry.index ? (Array.from(obj.geometry.index.array as ArrayLike<number>) as number[]) : null;
        meshes.push({ name: String(obj.name || ud.familyId || 'mesh'), positions, ...(index ? { indices: index } : {}) });
    });
    return meshes;
}

// ----------------------------------------------------------------
// EXPORTAÇÃO (runtime)
// ----------------------------------------------------------------
/**
 * Exporta a cena como OBJ pronto para impressão 3D.
 * @param _model - não usado (a geometria vem da cena Three.js)
 * @param options - { scale }: 1 = unidades da cena (default); 1000 = m→mm
 */
export async function exportOBJ(_model: unknown, options: { scale?: number } = {}): Promise<Blob> {
    const meshes = await extractPrintableMeshes();
    if (meshes.length === 0) throw new Error('Nenhuma malha imprimível na cena — gere ou carregue um modelo primeiro.');
    const text = buildObjFromMeshes(meshes, { scale: Number(options.scale ?? 1), comment: 'ECBT environmental model — 3D print (OBJ)' });
    return new Blob([text], { type: 'text/plain' });
}
