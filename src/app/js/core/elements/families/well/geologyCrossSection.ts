// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Geological Cross-Section (SVG)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GEOLOGICAL CROSS-SECTION RENDERER

   Gera SVG de seção geológica transversal correlacionando camadas
   litológicas de 2+ poços de monitoramento.

   Layout SVG:
   - Coluna por poço, separadas por espaçamento proporcional à
     distância real (calculada de position.x / position.z)
   - Escala vertical compartilhada (profundidade máxima de todos)
   - Linhas de correlação tracejadas entre camadas do mesmo soilType
     em poços adjacentes
   - Nível d'água como linha azul pontilhada (quando disponível)
   - Padrões litológicos ABGE (cores compartilhadas com WellProfileModule)

   Referência: práticas de correlação estratigráfica (AGS4, ISO 14688)
   ================================================================ */

const SVG_NS = 'http://www.w3.org/2000/svg';
import { buildInterpretation } from './stratigraphyEngine.js';

// ----------------------------------------------------------------
// CONSTANTES - Cores e layout (espelhadas do WellProfileModule)
// ----------------------------------------------------------------

/** Cores ABGE por tipo de solo */
const SOIL_COLORS: Record<string, string> = {
    clay: '#C8946E',
    sand: '#F5E6B8',
    silt: '#D4C5A0',
    gravel: '#B0B0B0',
    rock: '#8C8C8C',
    sandy_clay: '#D4A87A',
    clayey_sand: '#E6D29E',
    silty_sand: '#E0D4B4',
    fill: '#A0907A',
    topsoil: '#6B4E37',
    peat: '#3D2B1F',
};

/** Labels por tipo de solo */
const SOIL_LABELS: Record<string, string> = {
    clay: 'Argila',
    sand: 'Areia',
    silt: 'Silte',
    gravel: 'Cascalho',
    rock: 'Rocha',
    sandy_clay: 'Argila arenosa',
    clayey_sand: 'Areia argilosa',
    silty_sand: 'Areia siltosa',
    fill: 'Aterro',
    topsoil: 'Solo orgânico',
    peat: 'Turfa',
};

// Pixels por metro de profundidade
const PX_PER_M = 8;

// Margens do SVG
const MARGIN = { top: 40, bottom: 20, left: 50, right: 20 };

// Largura mínima de coluna por poço (px)
const COL_MIN_W = 70;
const _COL_MAX_W = 120;

// Escala horizontal: px por metro de distância real
const PX_PER_M_HORIZ = 4;

// ----------------------------------------------------------------
// API PÚBLICA
// ----------------------------------------------------------------

/**
 * Gera SVG de seção geológica transversal entre 2+ poços.
 *
 * Os poços são ordenados pelo eixo X (position.x). A distância
 * horizontal no SVG é proporcional à distância euclidiana real
 * no plano XZ.
 *
 * @param wells
 * @param opts
 * @param opts.pxPerM           Pixels por metro (escala vertical)
 * @param opts.colWidth         Largura da coluna de cada poço (px)
 * @param opts.showCorrelation Exibir linhas de correlação
 * @param opts.showWaterLevel  Exibir nível d'água
 * @param opts.showInterpolationAreas Exibir áreas interpoladas entre poços
 * @param opts.showUncertainty Exibir bandas de incerteza
 * @param opts.preserveOrder Preservar a ordem original dos poços (não ordenar por X)
 * @param opts.customDistances Distâncias customizadas entre poços consecutivos (m)
 * @param opts.confidenceThreshold Limiar mínimo de confiança para correlação
 * @param opts.manualEdits Ajustes manuais por segmento
 * @param opts.showEditHandles Exibir handles de edição manual no SVG
 * @param opts.showCota Exibir e alinhar colunas pela cota topográfica
 * @param opts.showDistanceLabels Exibir rótulos de distância entre poços
 * @returns null se < 2 poços com perfil
 */
export function buildCrossSectionSVG(
    wells: Array<any>,
    opts: {
        pxPerM?: number;
        colWidth?: number;
        showCorrelation?: boolean;
        showWaterLevel?: boolean;
        showInterpolationAreas?: boolean;
        showUncertainty?: boolean;
        preserveOrder?: boolean;
        customDistances?: Array<number> | null;
        confidenceThreshold?: number;
        manualEdits?: Record<string, { topOffset?: number; bottomOffset?: number }>;
        showEditHandles?: boolean;
        showCota?: boolean;
        showDistanceLabels?: boolean;
    } = {},
): SVGElement | null {
    if (!wells || wells.length < 2) return null;

    const {
        pxPerM = PX_PER_M,
        colWidth = COL_MIN_W,
        showCorrelation = true,
        showWaterLevel = true,
        showInterpolationAreas = true,
        showUncertainty = true,
        preserveOrder = false,
        customDistances = null,
        confidenceThreshold = 0.45,
        manualEdits = {},
        showEditHandles = false,
        showCota = false,
        showDistanceLabels = true,
    } = opts;

    // Filtra poços com perfil litológico
    const valid = wells.filter((w) => w.data?.profile?.lithologic?.length > 0);
    if (valid.length < 2) return null;

    // Ordena por posição X no mundo (ou preserva ordem informada pelo usuário)
    const sorted = preserveOrder ? [...valid] : [...valid].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

    // Profundidade máxima entre todos os poços
    const maxDepth = Math.max(
        ...sorted.map((w) => w.data.profile.constructive?.totalDepth || _maxLayerDepth(w.data.profile.lithologic)),
    );

    // Modo cota topográfica: deslocar cada coluna verticalmente por relevo real
    let datumElevation = 0;
    let cotaRange = 0; // amplitude topográfica entre poços (m)
    const yOffsets = sorted.map(() => 0); // deslocamento vertical por poço (px)

    if (showCota) {
        const elevations = sorted.map((w) => {
            const e = w.data?.coordinates?.elevation;
            return typeof e === 'number' && isFinite(e) ? e : null;
        });
        const validElevs = elevations.filter((e) => e !== null);
        if (validElevs.length >= 2) {
            datumElevation = Math.max(...validElevs);
            const minElev = Math.min(...validElevs);
            cotaRange = datumElevation - minElev;
            elevations.forEach((e, i) => {
                yOffsets[i] = e !== null ? (datumElevation - e) * pxPerM : 0;
            });
        }
    }

    // Calcula espaçamentos horizontais entre poços consecutivos
    const gaps = []; // gaps[i] = distância em px entre coluna i e coluna i+1
    for (let i = 0; i < sorted.length - 1; i++) {
        const ax = sorted[i]!.position?.x ?? 0;
        const az = sorted[i]!.position?.z ?? 0;
        const bx = sorted[i + 1]!.position?.x ?? 0;
        const bz = sorted[i + 1]!.position?.z ?? 0;
        const autoDist = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
        const userDist: number | null | undefined = Array.isArray(customDistances) ? customDistances[i] : null;
        const dist =
            Number.isFinite(userDist) && (userDist as number) > 0 ? (userDist as number) : autoDist;
        gaps.push(Math.max(30, Math.min(200, dist * PX_PER_M_HORIZ)));
    }

    // Dimensões totais do SVG (em modo cota, altura inclui relevo topográfico)
    const totalW = MARGIN.left + colWidth * sorted.length + gaps.reduce((s, g) => s + g, 0) + MARGIN.right;
    const totalH = MARGIN.top + (cotaRange + maxDepth) * pxPerM + MARGIN.bottom;

    const svg = _svgEl('svg', {
        xmlns: SVG_NS,
        viewBox: `0 0 ${totalW} ${totalH}`,
        width: totalW,
        height: totalH,
    });

    // Fundo branco
    svg.appendChild(_svgEl('rect', { x: 0, y: 0, width: totalW, height: totalH, fill: '#fff' }));

    // Defs (padrões de hachura)
    svg.appendChild(_buildDefs());

    // Calcular posição X de cada coluna
    const colX = [];
    let curX = MARGIN.left;
    for (let i = 0; i < sorted.length; i++) {
        colX.push(curX);
        if (i < gaps.length) curX += colWidth + gaps[i]!;
    }

    const interpretation = buildInterpretation(sorted, { confidenceThreshold });

    // Interpolação de áreas entre poços (desenhada atrás de tudo)
    if (showInterpolationAreas && sorted.length >= 2) {
        _addInterpolationAreas(svg, interpretation, colX, colWidth, pxPerM, manualEdits, yOffsets);
    }

    if (showUncertainty && sorted.length >= 2) {
        _addUncertaintyBands(svg, interpretation, colX, colWidth, pxPerM, manualEdits, yOffsets);
    }

    // Linhas de correlação (desenhadas antes das colunas para ficarem atrás)
    if (showCorrelation && sorted.length >= 2) {
        _addCorrelationLines(svg, interpretation, colX, colWidth, pxPerM, manualEdits, showEditHandles, yOffsets);
    }

    // Perfil topográfico de superfície (modo cota com relevo real entre poços)
    if (showCota && cotaRange > 0) {
        _addTopoSurface(svg, sorted, colX, colWidth, pxPerM, yOffsets);
    }

    // Colunas litológicas + cabeçalhos
    for (let i = 0; i < sorted.length; i++) {
        _addWellColumn(svg, sorted[i], colX[i]!, colWidth, pxPerM, maxDepth, yOffsets[i]!);
        if (showWaterLevel) {
            _addWaterLevelLine(svg, sorted[i], colX[i], colWidth, pxPerM, totalW, sorted.length, yOffsets[i]);
        }
    }

    // Escala de profundidade ou cota topográfica (eixo esquerdo)
    const cotaOpts = showCota && cotaRange > 0 ? { datum: datumElevation, range: cotaRange } : null;
    _addDepthScale(svg, MARGIN.left, maxDepth, pxPerM, cotaOpts);

    // Título da seção
    _addSectionTitle(svg, totalW);

    // Rótulos de distância entre colunas (toggle)
    if (showDistanceLabels) {
        _addDistanceLabels(svg, sorted, colX, colWidth, customDistances);
    }

    svg.dataset.confidenceMean = String(interpretation.confidenceMean || 0);
    svg.dataset.confidenceThreshold = String(interpretation.confidenceThreshold || confidenceThreshold);
    svg.dataset.pxPerM = String(pxPerM);
    svg.dataset.marginTop = String(MARGIN.top);

    return svg;
}

/**
 * @param pairIndex
 * @param seg
 */
function _segmentKey(pairIndex: any, seg: any) {
    return `${pairIndex}|${seg.leftIndex ?? 'x'}|${seg.rightIndex ?? 'x'}`;
}

/**
 * @param pairIndex
 * @param seg
 * @param manualEdits
 */
function _adjustedSegmentDepths(pairIndex: any, seg: any, manualEdits: any) {
    const key = _segmentKey(pairIndex, seg);
    const edit = manualEdits?.[key] || {};
    const topOffset = Number.isFinite(edit.topOffset) ? edit.topOffset : 0;
    const bottomOffset = Number.isFinite(edit.bottomOffset) ? edit.bottomOffset : 0;
    return {
        leftTop: seg.left?.from ?? null,
        leftBot: seg.left?.to ?? null,
        rightTop: seg.right ? Math.max(0, seg.right.from + topOffset) : null,
        rightBot: seg.right ? Math.max(0, seg.right.to + bottomOffset) : null,
    };
}

// ----------------------------------------------------------------
// PRIVATE - Elementos SVG
// ----------------------------------------------------------------

/**
 * Cria elemento SVG com atributos.
 * @param tag
 * @param attrs
 */
function _svgEl(tag: string, attrs: object = {}): SVGElement {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    return el;
}

/** Cria <defs> com padrões hachura ABGE. */
function _buildDefs() {
    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const [type, color] of Object.entries(SOIL_COLORS)) {
        const pat = _svgEl('pattern', {
            id: `xsec-soil-${type}`,
            patternUnits: 'userSpaceOnUse',
            width: 8,
            height: 8,
        });
        pat.appendChild(_svgEl('rect', { width: 8, height: 8, fill: color }));
        if (type === 'clay' || type === 'sandy_clay') {
            pat.appendChild(
                _svgEl('line', {
                    x1: 0,
                    y1: 2,
                    x2: 8,
                    y2: 2,
                    stroke: '#000',
                    'stroke-width': 0.7,
                    'stroke-opacity': 0.55,
                }),
            );
            pat.appendChild(
                _svgEl('line', {
                    x1: 0,
                    y1: 6,
                    x2: 8,
                    y2: 6,
                    stroke: '#000',
                    'stroke-width': 0.7,
                    'stroke-opacity': 0.55,
                }),
            );
        } else if (['sand', 'clayey_sand', 'silty_sand'].includes(type)) {
            pat.appendChild(_svgEl('circle', { cx: 2, cy: 2, r: 0.9, fill: '#000', 'fill-opacity': 0.55 }));
            pat.appendChild(_svgEl('circle', { cx: 6, cy: 6, r: 0.9, fill: '#000', 'fill-opacity': 0.55 }));
        } else if (type === 'silt') {
            pat.appendChild(
                _svgEl('line', {
                    x1: 1,
                    y1: 4,
                    x2: 4,
                    y2: 4,
                    stroke: '#000',
                    'stroke-width': 0.7,
                    'stroke-opacity': 0.55,
                }),
            );
        } else if (type === 'gravel') {
            pat.appendChild(
                _svgEl('circle', {
                    cx: 4,
                    cy: 4,
                    r: 2,
                    fill: 'none',
                    stroke: '#000',
                    'stroke-width': 0.8,
                    'stroke-opacity': 0.6,
                }),
            );
        } else if (type === 'rock') {
            pat.appendChild(
                _svgEl('line', {
                    x1: 0,
                    y1: 0,
                    x2: 8,
                    y2: 8,
                    stroke: '#000',
                    'stroke-width': 0.8,
                    'stroke-opacity': 0.6,
                }),
            );
            pat.appendChild(
                _svgEl('line', {
                    x1: 8,
                    y1: 0,
                    x2: 0,
                    y2: 8,
                    stroke: '#000',
                    'stroke-width': 0.8,
                    'stroke-opacity': 0.6,
                }),
            );
        }
        defs.appendChild(pat);
    }
    return defs;
}

/**
 * Renderiza coluna litológica de um poço.
 * @param svg
 * @param well
 * @param xCol  posição X da coluna no SVG
 * @param colW
 * @param pxM
 * @param maxDepth
 * @param yOffset
 */
function _addWellColumn(
    svg: any,
    well: any,
    xCol: number,
    colW: number,
    pxM: number,
    maxDepth: number,
    yOffset: number = 0,
) {
    const yStart = MARGIN.top + yOffset;
    const layers = well.data.profile.lithologic || [];
    const totalDepth = well.data.profile.constructive?.totalDepth || _maxLayerDepth(layers) || maxDepth;

    // Cabeçalho: nome do poço (fixo no topo da coluna para evitar sobreposição)
    const nameEl = _svgEl('text', {
        x: xCol + colW / 2,
        y: yStart - 22 > MARGIN.top - 22 ? yStart - 22 : MARGIN.top - 22,
        'text-anchor': 'middle',
        'font-size': 10,
        'font-weight': 'bold',
        fill: '#333',
    });
    nameEl.textContent = well.name || '?';
    svg.appendChild(nameEl);

    // Profundidade + elevação (quando coluna deslocada em modo cota)
    const depthEl = _svgEl('text', {
        x: xCol + colW / 2,
        y: yStart > MARGIN.top ? yStart - 10 : MARGIN.top - 10,
        'text-anchor': 'middle',
        'font-size': 9,
        fill: '#666',
    });
    const wellElev = well.data?.coordinates?.elevation;
    depthEl.textContent =
        yOffset > 0 && wellElev != null
            ? `${totalDepth.toFixed(1)} m | Z:${wellElev.toFixed(1)}`
            : `${totalDepth.toFixed(1)} m`;
    svg.appendChild(depthEl);

    // Outline do poço
    svg.appendChild(
        _svgEl('rect', {
            x: xCol,
            y: yStart,
            width: colW,
            height: totalDepth * pxM,
            fill: '#f9f9f9',
            stroke: '#aaa',
            'stroke-width': 0.5,
        }),
    );

    // Camadas litológicas
    for (const layer of layers) {
        const soilType = layer.soilType || layer.type || 'clay';
        const y1 = yStart + layer.from * pxM;
        const y2 = yStart + layer.to * pxM;
        const layerH = y2 - y1;
        if (layerH <= 0) continue;

        const fill = SOIL_COLORS[soilType] ? `url(#xsec-soil-${soilType})` : SOIL_COLORS[soilType] || '#eee';

        svg.appendChild(
            _svgEl('rect', {
                x: xCol,
                y: y1,
                width: colW,
                height: layerH,
                fill,
                stroke: '#ccc',
                'stroke-width': 0.3,
            }),
        );

        // Label da camada (apenas se houver espaço)
        if (layerH >= 14) {
            const label = SOIL_LABELS[soilType] || soilType;
            const textEl = _svgEl('text', {
                x: xCol + colW / 2,
                y: y1 + layerH / 2 + 4,
                'text-anchor': 'middle',
                'font-size': 8,
                fill: '#333',
                'pointer-events': 'none',
            });
            textEl.textContent = label;
            svg.appendChild(textEl);
        }
    }

    // Contorno final
    svg.appendChild(
        _svgEl('rect', {
            x: xCol,
            y: yStart,
            width: colW,
            height: totalDepth * pxM,
            fill: 'none',
            stroke: '#555',
            'stroke-width': 1,
        }),
    );
}

/**
 * Adiciona linhas de correlação tracejadas entre poços adjacentes.
 * Correlaciona por soilType: liga o topo e a base de camadas com o mesmo
 * tipo entre dois poços consecutivos.
 * @param svg
 * @param interpretation interpretação geológica com pares e segmentos
 * @param colX posições X das colunas
 * @param colW
 * @param pxM
 * @param manualEdits ajustes manuais por segmento
 * @param showEditHandles habilitar handles de edição
 * @param yOffsets deslocamentos verticais por poço
 */
function _addCorrelationLines(
    svg: any,
    interpretation: any,
    colX: any,
    colW: any,
    pxM: any,
    manualEdits: any,
    showEditHandles: any,
    yOffsets: any = null,
) {
    for (const pair of interpretation.pairs) {
        const i = pair.pairIndex;
        const leftX = colX[i] + colW;
        const rightX = colX[i + 1];
        const yOffL = yOffsets ? yOffsets[i] || 0 : 0;
        const yOffR = yOffsets ? yOffsets[i + 1] || 0 : 0;
        for (const seg of pair.segments) {
            if (seg.discontinuity || !seg.left || !seg.right) continue;
            const soilType = seg.soilType;
            const opacity = Math.max(0.25, Math.min(0.85, seg.score));
            const d = _adjustedSegmentDepths(i, seg, manualEdits) as {
                leftTop: number;
                leftBot: number;
                rightTop: number;
                rightBot: number;
            };
            const yLTop = MARGIN.top + yOffL + d.leftTop * pxM;
            const yRTop = MARGIN.top + yOffR + d.rightTop * pxM;
            const yLBot = MARGIN.top + yOffL + d.leftBot * pxM;
            const yRBot = MARGIN.top + yOffR + d.rightBot * pxM;

            svg.appendChild(
                _svgEl('line', {
                    x1: leftX,
                    y1: yLTop,
                    x2: rightX,
                    y2: yRTop,
                    stroke: SOIL_COLORS[soilType] || '#9ca3af',
                    'stroke-width': 0.8,
                    'stroke-dasharray': seg.score < 0.65 ? '3 3' : '5 2',
                    'stroke-opacity': opacity,
                }),
            );
            svg.appendChild(
                _svgEl('line', {
                    x1: leftX,
                    y1: yLBot,
                    x2: rightX,
                    y2: yRBot,
                    stroke: SOIL_COLORS[soilType] || '#9ca3af',
                    'stroke-width': 0.8,
                    'stroke-dasharray': seg.score < 0.65 ? '3 3' : '5 2',
                    'stroke-opacity': opacity,
                }),
            );

            if (showEditHandles) {
                const key = _segmentKey(i, seg);
                const topH = _svgEl('circle', {
                    cx: rightX,
                    cy: yRTop,
                    r: 4,
                    fill: '#0ea5e9',
                    stroke: '#ffffff',
                    'stroke-width': 1,
                    'data-handle': '1',
                    'data-key': key,
                    'data-kind': 'top',
                    'data-base-depth': seg.right.from,
                });
                const botH = _svgEl('circle', {
                    cx: rightX,
                    cy: yRBot,
                    r: 4,
                    fill: '#2563eb',
                    stroke: '#ffffff',
                    'stroke-width': 1,
                    'data-handle': '1',
                    'data-key': key,
                    'data-kind': 'bottom',
                    'data-base-depth': seg.right.to,
                });
                svg.appendChild(topH);
                svg.appendChild(botH);
            }
        }
    }
}

/**
 * Preenche áreas interpoladas entre poços adjacentes.
 * Para cada tipo de solo comum entre o par de poços, desenha um polígono
 * conectando topo/base da camada esquerda com topo/base da camada direita.
 * @param svg
 * @param interpretation interpretação geológica com pares e segmentos
 * @param colX
 * @param colW
 * @param pxM
 * @param manualEdits ajustes manuais por segmento
 * @param yOffsets deslocamentos verticais por poço
 */
function _addInterpolationAreas(
    svg: any,
    interpretation: any,
    colX: any,
    colW: any,
    pxM: any,
    manualEdits: any,
    yOffsets: any = null,
) {
    for (const pair of interpretation.pairs) {
        const i = pair.pairIndex;
        const leftX = colX[i] + colW;
        const rightX = colX[i + 1];
        const yOffL = yOffsets ? yOffsets[i] || 0 : 0;
        const yOffR = yOffsets ? yOffsets[i + 1] || 0 : 0;
        for (const seg of pair.segments) {
            if (seg.discontinuity || !seg.left || !seg.right) continue;
            const soilType = seg.soilType;
            const d = _adjustedSegmentDepths(i, seg, manualEdits) as {
                leftTop: number;
                leftBot: number;
                rightTop: number;
                rightBot: number;
            };
            const yLTop = MARGIN.top + yOffL + d.leftTop * pxM;
            const yLBot = MARGIN.top + yOffL + d.leftBot * pxM;
            const yRTop = MARGIN.top + yOffR + d.rightTop * pxM;
            const yRBot = MARGIN.top + yOffR + d.rightBot * pxM;

            // Usa padrão de hachura ABGE para distinguir tipos de solo visualmente
            const patId = `xsec-soil-${soilType}`;
            const hasPat = !!SOIL_COLORS[soilType];
            const poly = _svgEl('polygon', {
                points: `${leftX},${yLTop} ${rightX},${yRTop} ${rightX},${yRBot} ${leftX},${yLBot}`,
                fill: hasPat ? `url(#${patId})` : '#cbd5e1',
                'fill-opacity': 0.72 * Math.max(0.6, seg.score),
                stroke: '#1e293b',
                'stroke-opacity': 0.55,
                'stroke-width': 0.7,
            });
            svg.appendChild(poly);
            // Linha de contato superior em destaque
            const topLine = _svgEl('line', {
                x1: leftX,
                y1: yLTop,
                x2: rightX,
                y2: yRTop,
                stroke: '#0f172a',
                'stroke-width': 1.2,
                'stroke-opacity': 0.5,
                'stroke-dasharray': seg.score < 0.55 ? '4 3' : 'none',
            });
            svg.appendChild(topLine);
        }
    }
}

/**
 * Desenha banda de incerteza por contato correlacionado.
 * @param svg
 * @param interpretation
 * @param colX
 * @param colW
 * @param pxM
 * @param manualEdits
 * @param yOffsets
 */
function _addUncertaintyBands(
    svg: any,
    interpretation: any,
    colX: any,
    colW: any,
    pxM: any,
    manualEdits: any,
    yOffsets: any = null,
) {
    for (const pair of interpretation.pairs) {
        const i = pair.pairIndex;
        const leftX = colX[i] + colW;
        const rightX = colX[i + 1];
        const yOffL = yOffsets ? yOffsets[i] || 0 : 0;
        const yOffR = yOffsets ? yOffsets[i + 1] || 0 : 0;
        for (const seg of pair.segments) {
            if (seg.discontinuity || !seg.left || !seg.right) continue;
            const d = _adjustedSegmentDepths(i, seg, manualEdits) as {
                leftTop: number;
                leftBot: number;
                rightTop: number;
                rightBot: number;
            };
            const yLTop = MARGIN.top + yOffL + d.leftTop * pxM;
            const yRTop = MARGIN.top + yOffR + d.rightTop * pxM;
            const yLBot = MARGIN.top + yOffL + d.leftBot * pxM;
            const yRBot = MARGIN.top + yOffR + d.rightBot * pxM;
            const ut = (seg.uncertaintyTop || 0) * pxM;
            const ub = (seg.uncertaintyBottom || 0) * pxM;
            const alpha = Math.max(0.08, Math.min(0.26, 0.26 - seg.score * 0.15));

            const topBand = _svgEl('polygon', {
                points: `${leftX},${yLTop - ut} ${rightX},${yRTop - ut} ${rightX},${yRTop + ut} ${leftX},${yLTop + ut}`,
                fill: '#64748b',
                'fill-opacity': alpha,
                stroke: 'none',
            });
            const botBand = _svgEl('polygon', {
                points: `${leftX},${yLBot - ub} ${rightX},${yRBot - ub} ${rightX},${yRBot + ub} ${leftX},${yLBot + ub}`,
                fill: '#64748b',
                'fill-opacity': alpha,
                stroke: 'none',
            });
            svg.appendChild(topBand);
            svg.appendChild(botBand);
        }
    }
}

/**
 * Adiciona linha de nível d'água para um poço.
 * @param svg
 * @param well
 * @param xCol
 * @param colW
 * @param pxM
 * @param totalW
 * @param wellCount
 * @param yOffset
 */
function _addWaterLevelLine(
    svg: any,
    well: any,
    xCol: any,
    colW: any,
    pxM: any,
    totalW: any,
    wellCount: any,
    yOffset: number = 0,
) {
    const wl = well.data?.profile?.waterLevel;
    if (wl?.depth == null) return;

    const y = MARGIN.top + yOffset + wl.depth * pxM;

    // Linha azul tracejada pelo interior da coluna
    svg.appendChild(
        _svgEl('line', {
            x1: xCol,
            y1: y,
            x2: xCol + colW,
            y2: y,
            stroke: '#2563eb',
            'stroke-width': 1,
            'stroke-dasharray': '5 2',
            'stroke-opacity': 0.8,
        }),
    );

    // Triângulo indicativo (símbolo padrão NA)
    const pts = `${xCol + 4},${y} ${xCol + 12},${y - 5} ${xCol + 12},${y + 5}`;
    svg.appendChild(
        _svgEl('polygon', {
            points: pts,
            fill: '#2563eb',
            'fill-opacity': 0.7,
        }),
    );
}

/**
 * Escala de profundidade no eixo esquerdo.
 * @param svg
 * @param xScale  posição X
 * @param maxDepth
 * @param pxM
 * @param cotaOpts - modo cota: datum=elevação máxima, range=amplitude (m)
 */
function _addDepthScale(
    svg: SVGElement,
    xScale: number,
    maxDepth: number,
    pxM: number,
    cotaOpts: null | { datum: number; range: number } = null,
) {
    const totalRange = cotaOpts ? cotaOpts.range + maxDepth : maxDepth;
    const step = totalRange <= 20 ? 2 : totalRange <= 50 ? 5 : 10;
    for (let d = 0; d <= totalRange; d += step) {
        const y = MARGIN.top + d * pxM;
        svg.appendChild(
            _svgEl('line', {
                x1: xScale - 10,
                y1: y,
                x2: xScale - 2,
                y2: y,
                stroke: '#555',
                'stroke-width': 0.5,
            }),
        );
        const t = _svgEl('text', {
            x: xScale - 14,
            y: y + 3,
            'text-anchor': 'end',
            'font-size': 8,
            fill: '#555',
        });
        // No modo cota: labels mostram elevação absoluta decrescente
        t.textContent = cotaOpts ? String(+(cotaOpts.datum - d).toFixed(0)) : `${d}m`;
        svg.appendChild(t);
    }
    // Linha vertical da escala
    svg.appendChild(
        _svgEl('line', {
            x1: xScale - 2,
            y1: MARGIN.top,
            x2: xScale - 2,
            y2: MARGIN.top + totalRange * pxM,
            stroke: '#888',
            'stroke-width': 0.5,
        }),
    );
}

/**
 * Desenha linha de superfície topográfica entre poços (modo cota).
 * Conecta o topo de cada coluna refletindo o relevo real do terreno.
 * @param svg
 * @param wells
 * @param colX
 * @param colW
 * @param pxM
 * @param yOffsets
 */
function _addTopoSurface(
    svg: SVGElement,
    wells: Array<any>,
    colX: number[],
    colW: number,
    pxM: number,
    yOffsets: number[],
) {
    const pts = wells.map((_, i) => `${colX[i]! + colW / 2},${MARGIN.top + yOffsets[i]!}`).join(' ');
    svg.appendChild(
        _svgEl('polyline', {
            points: pts,
            fill: 'none',
            stroke: '#78350f',
            'stroke-width': 1.5,
            'stroke-dasharray': '5 3',
            'stroke-opacity': 0.75,
        }),
    );
    // Marcadores de superfície em cada poço
    for (let i = 0; i < wells.length; i++) {
        svg.appendChild(
            _svgEl('circle', {
                cx: colX[i]! + colW / 2,
                cy: MARGIN.top + yOffsets[i]!,
                r: 3,
                fill: '#78350f',
                'fill-opacity': 0.6,
            }),
        );
    }
}

/**
 * Título da seção no topo do SVG.
 * @param svg
 * @param totalW
 */
function _addSectionTitle(svg: SVGElement, totalW: number) {
    const title = _svgEl('text', {
        x: totalW / 2,
        y: 12,
        'text-anchor': 'middle',
        'font-size': 10,
        'font-weight': 'bold',
        fill: '#444',
    });
    title.textContent = 'Seção Geológica Transversal';
    svg.appendChild(title);
}

/**
 * Rótulos de distância entre poços adjacentes.
 * @param svg
 * @param wells
 * @param colX
 * @param colW
 * @param customDistances
 */
function _addDistanceLabels(
    svg: SVGElement,
    wells: Array<any>,
    colX: number[],
    colW: number,
    customDistances: number[] | null,
) {
    for (let i = 0; i < wells.length - 1; i++) {
        const ax = wells[i]!.position?.x ?? 0;
        const az = wells[i]!.position?.z ?? 0;
        const bx = wells[i + 1]!.position?.x ?? 0;
        const bz = wells[i + 1]!.position?.z ?? 0;
        const autoDist = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
        const userDist = Array.isArray(customDistances) ? customDistances[i] : null;
        const isCustom = Number.isFinite(userDist) && (userDist as number) > 0;
        const dist = isCustom ? (userDist as number) : autoDist;

        const x1 = colX[i]! + colW; // borda direita da coluna esquerda
        const x2 = colX[i + 1]!; // borda esquerda da coluna direita
        const midX = (x1 + x2) / 2;
        const yArrow = MARGIN.top - 8;
        const yLabel = MARGIN.top - 16;

        // Linha horizontal com setas nas extremidades
        svg.appendChild(
            _svgEl('line', {
                x1: x1 + 2,
                y1: yArrow,
                x2: x2 - 2,
                y2: yArrow,
                stroke: '#888',
                'stroke-width': 0.8,
            }),
        );
        // Seta esquerda (▶ virada para esquerda)
        svg.appendChild(
            _svgEl('polygon', {
                points: `${x1 + 2},${yArrow} ${x1 + 7},${yArrow - 3} ${x1 + 7},${yArrow + 3}`,
                fill: '#888',
            }),
        );
        // Seta direita
        svg.appendChild(
            _svgEl('polygon', {
                points: `${x2 - 2},${yArrow} ${x2 - 7},${yArrow - 3} ${x2 - 7},${yArrow + 3}`,
                fill: '#888',
            }),
        );

        // Label: distância real com 1 casa decimal
        const label =
            dist < 1 ? `${(dist * 100).toFixed(0)} cm` : dist < 10 ? `${dist.toFixed(1)} m` : `${Math.round(dist)} m`;
        const t = _svgEl('text', {
            x: midX,
            y: yLabel,
            'text-anchor': 'middle',
            'font-size': 7,
            fill: isCustom ? '#d97706' : '#555',
            'font-style': isCustom ? 'italic' : 'normal',
        });
        t.textContent = label;
        svg.appendChild(t);
    }
}

/**
 * Profundidade máxima das camadas litológicas.
 * @param layers
 */
function _maxLayerDepth(layers: Array<any>): number {
    if (!layers?.length) return 10;
    return Math.max(...layers.map((l) => l.to || 0));
}
