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
   GDL FORMAT — Exportação como objeto paramétrico ArchiCAD (projeto)
   ================================================================

   Serializa a cena como um B-rep sólido em GDL (Geometric Description
   Language, da Graphisoft/ArchiCAD), usando as primitivas canônicas
   VERT → EDGE → PGON → BODY (toda primitiva é definida ANTES de ser
   referenciada). O texto gerado é colado no "3D Script" de um objeto
   GDL no ArchiCAD — o modelo ambiental vira um objeto de projeto.

   A serialização é pure-logic (buildGdlFromMeshes); a extração da
   geometria reusa extractPrintableMeshes do obj.ts.

   Ref.: GDL Reference Guide — Solid Geometry / Primitive Elements
   (gdl.graphisoft.com). Índices de VERT/EDGE são cumulativos no script.

   ================================================================ */
import { registerFormat } from './registry.js';
import { type ExportMesh, trianglesOf, extractPrintableMeshes } from './obj.js';

export interface GdlBuildOptions {
    /** fator de escala (1 = unidades da cena, em metros no GDL). */
    scale?: number;
    /** casas decimais (default 5). */
    precision?: number;
    comment?: string;
}

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------
registerFormat({
    id: 'gdl',
    name: 'GDL (ArchiCAD · projeto)',
    extensions: ['.gdl'],
    mimeType: 'text/plain',
    canExport: true,
    canImport: false,
    needsOrigin: false,
    exportScopes: ['scene'],
});

function sanitizeName(name: string): string {
    return (name || 'corpo').replace(/\s+/g, '_').replace(/[^\w.-]/g, '') || 'corpo';
}

// ----------------------------------------------------------------
// SERIALIZAÇÃO (pure-logic — testável sem cena)
// ----------------------------------------------------------------
/**
 * Serializa malhas como B-rep sólido GDL. Uma `BODY -1` por malha; índices de
 * VERT/EDGE são CUMULATIVOS no script (contrato GDL). Arestas são deduplicadas
 * por malha e referenciadas com sinal conforme a direção (canônico para PGON).
 */
export function buildGdlFromMeshes(meshes: ReadonlyArray<ExportMesh>, options: GdlBuildOptions = {}): string {
    const scale = options.scale ?? 1;
    const prec = options.precision ?? 5;
    const fmt = (n: number): string => {
        const r = Number((n * scale).toFixed(prec));
        return Object.is(r, -0) ? '0' : String(r);
    };
    const out: string[] = [
        `! ${options.comment ?? 'ECBT environmental model — GDL B-rep'}`,
        '! Gerado por ECBT (ecbyts). Cole no "3D Script" de um objeto GDL no ArchiCAD.',
        '! Primitivas na ordem canonica: VERT (vertices) -> EDGE (arestas) -> PGON (faces) -> BODY.',
    ];
    let vBase = 0; // vértices já emitidos (para índice global 1-based)
    let edgeCount = 0; // contador global de arestas
    for (const mesh of meshes) {
        const pos = mesh.positions;
        const vCount = Math.floor(pos.length / 3);
        const tris = trianglesOf(mesh);
        if (vCount === 0 || tris.length === 0) continue;
        out.push('', `! --- ${sanitizeName(mesh.name)} ---`);
        for (let i = 0; i < vCount; i++) {
            out.push(`VERT ${fmt(pos[i * 3] as number)}, ${fmt(pos[i * 3 + 1] as number)}, ${fmt(pos[i * 3 + 2] as number)}`);
        }
        const edgeMap = new Map<string, { id: number; from: number; to: number }>();
        const edgeLines: string[] = [];
        const pgonLines: string[] = [];
        const globalV = (local: number): number => local + vBase + 1; // 1-based global
        const getEdge = (ga: number, gb: number): number => {
            const key = ga < gb ? `${ga}_${gb}` : `${gb}_${ga}`;
            let e = edgeMap.get(key);
            if (!e) {
                edgeCount++;
                e = { id: edgeCount, from: ga, to: gb };
                edgeMap.set(key, e);
                edgeLines.push(`EDGE ${ga}, ${gb}, -1, -1, 0`); // pgon1/pgon2 desconhecidos = -1
            }
            return e.from === ga && e.to === gb ? e.id : -e.id; // sinal pela direção
        };
        for (const [a, b, c] of tris) {
            const ga = globalV(a), gb = globalV(b), gc = globalV(c);
            const e1 = getEdge(ga, gb), e2 = getEdge(gb, gc), e3 = getEdge(gc, ga);
            pgonLines.push(`PGON 3, 0, 0, ${e1}, ${e2}, ${e3}`);
        }
        out.push(...edgeLines, ...pgonLines, 'BODY -1');
        vBase += vCount;
    }
    return out.join('\n') + '\n';
}

// ----------------------------------------------------------------
// EXPORTAÇÃO (runtime)
// ----------------------------------------------------------------
/**
 * Exporta a cena como objeto GDL (ArchiCAD). A geometria vem da cena Three.js.
 * @param options - { scale }: 1 = unidades da cena em metros (default).
 */
export async function exportGDL(_model: unknown, options: { scale?: number } = {}): Promise<Blob> {
    const meshes = await extractPrintableMeshes();
    if (meshes.length === 0) throw new Error('Nenhuma malha na cena — gere ou carregue um modelo primeiro.');
    const text = buildGdlFromMeshes(meshes, { scale: Number(options.scale ?? 1), comment: 'ECBT environmental model — GDL (ArchiCAD)' });
    return new Blob([text], { type: 'text/plain' });
}
