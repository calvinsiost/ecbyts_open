// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   INTERPOLATION PURE HELPERS (Module C extraction — refactor-opportunities pick)
   ================================================================

   Helpers pure-logic extraídos de core/interpolation/manager.ts (fan-in 27)
   para reduzir o ciclo SCC e habilitar testes determinísticos sem mock de
   IDB/Three.js. Pattern segue Module C campaign já estabelecida (commits
   c4750e3c..a01ed427).

   Sem side-effects: nenhuma destas funções toca `_layers`, IDB, scene, ou
   any module state. Recebem inputs, retornam outputs. Adotadas pelo manager
   reduzindo LOC + abrindo trilha para testes em isolamento.
   ================================================================ */

/**
 * Filtra configs deduplicando entradas type='terrain' para no máximo 1.
 * Proteção contra corrupção de IDB que duplica terrain (commit a4f3...).
 *
 * Determinístico: ordem de input preservada; primeiro terrain ganha.
 */
export function dedupTerrainConfigs(layerConfigs: any): any[] {
    if (!Array.isArray(layerConfigs)) return [];
    const seen = new Set<string>();
    return layerConfigs.filter((c: any) => {
        if (!c || typeof c !== 'object') return false;
        if (c.type === 'terrain') {
            if (seen.has('terrain')) return false;
            seen.add('terrain');
        }
        return true;
    });
}

/**
 * Sanitiza dataSource + coordinateMode para createTerrainLayer.
 * dataSource 'manual' é literal; tudo mais vira 'auto'. coordinateMode
 * 'utm' é literal; tudo mais vira 'scene'.
 */
export function resolveImportTerrainCoords(config: any): { dataSource: 'manual' | 'auto'; coordinateMode: 'utm' | 'scene' } {
    return {
        dataSource: config?.dataSource === 'manual' ? 'manual' : 'auto',
        coordinateMode: config?.coordinateMode === 'utm' ? 'utm' : 'scene',
    };
}

/**
 * Extrai apenas mudanças visuais (opacity/visible/wireframe/colorRamp/textureMode)
 * de um config. Retorna objeto vazio se nenhuma propriedade visual definida.
 * Padrão usado por importLayers + updateLayer (visualChanges aplicado pós-create).
 */
export function extractVisualChanges(config: any): Record<string, any> {
    const out: Record<string, any> = {};
    if (!config || typeof config !== 'object') return out;
    if (config.opacity != null) out.opacity = config.opacity;
    if (config.visible != null) out.visible = config.visible;
    if (config.wireframe != null) out.wireframe = config.wireframe;
    if (config.colorRamp) out.colorRamp = config.colorRamp;
    if (config.textureMode) out.textureMode = config.textureMode;
    return out;
}

/**
 * Constrói o payload serializado de uma layer para exportLayers.
 * Recebe `layer` (do _layers Map) + 3 valores pré-computados (deps externas):
 *   - manualTerrain: { points, coordinateMode } | null  (serializeManualTerrainPayload)
 *   - normalizedManualPoints: any[] | null              (_normalizeManualPoints)
 *
 * Determinístico: outputs idênticos para inputs idênticos; sem state interno.
 * Use para round-trip export/import + snapshots para audit.
 */
export function buildLayerExportPayload(
    layer: any,
    deps: { manualTerrain: { points: any; coordinateMode: any } | null; normalizedManualPoints: any[] | null },
): any {
    const isManual = layer?.dataSource === 'manual';
    const isTerrain = layer?.type === 'terrain';
    const manualPoints = isManual ? (isTerrain ? deps.manualTerrain?.points ?? null : deps.normalizedManualPoints) : null;
    const coordinateMode = isManual ? (isTerrain ? deps.manualTerrain?.coordinateMode ?? null : layer?.coordinateMode || null) : null;
    return {
        id: layer?.id,
        type: layer?.type,
        name: layer?.name,
        method: layer?.method,
        methodParams: layer?.methodParams,
        dataSource: layer?.dataSource,
        coordinateMode,
        points: manualPoints,
        parameterId: layer?.parameterId,
        matrix: layer?.matrix || null,
        campaignId: layer?.campaignId || null,
        geologyContact: layer?.geologyContact || null,
        gridSize: layer?.gridSize,
        colorRamp: layer?.colorRamp,
        opacity: layer?.opacity,
        visible: layer?.visible,
        wireframe: layer?.wireframe,
        showContours: layer?.showContours ?? false,
        showContourLabels: layer?.showContourLabels ?? false,
        contourDensity: layer?.contourDensity || 'medium',
        fixedColor: layer?.fixedColor || null,
        textureMode: layer?.textureMode || null,
        satelliteUrls: layer?.satelliteUrls || null,
        thresholdValue: layer?.thresholdValue ?? null,
        sourcePoints: layer?.sourcePoints || null,
    };
}
