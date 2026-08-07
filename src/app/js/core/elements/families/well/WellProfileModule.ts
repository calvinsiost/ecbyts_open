// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Profile Module (SVG Renderer + Editor)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WELL PROFILE MODULE — Modulo plugavel para familia 'well'.

   Renderiza perfil construtivo e litologico do poco em SVG.
   Layout 5-colunas: Descricao | Litologia | Escala | Construtivo | VOC

   Padroes litologicos baseados na norma ABGE.
   Elementos construtivos: revestimento, filtro, selo, pre-filtro.
   ================================================================ */
import { FamilyModule, SVG_NS } from '../_base/FamilyModule.js';
import { toFiniteNumber } from '../../../../utils/helpers/toFiniteNumber.js';
import { showToast } from '../../../../utils/ui/toast.js';
import { asyncPrompt } from '../../../../utils/ui/asyncDialogs.js';
import { t } from '../../../../utils/i18n/translations.js';
import { parseSurveyData } from './surveyData.js';
import {
    COL,
    MARGIN,
    computeProfileDimensions,
    computeColumnXPositions,
    depthToY,
    computeDepthScaleStep,
    formatScaleLabel,
    computeVocScale,
    computeVocBarWidth,
    projectWellAlongPolyline,
    computeHorizontalDistance,
} from './_wellProfileGeometryPure.js';
import {
    SOIL_COLORS,
    SOIL_LABELS,
    resolveSoilPatternId,
    getConsistencyChoices,
    computeLayerGapOverlapErrors,
} from './_wellProfileLithologyPure.js';
type AnyRecord = Record<string, any>;
declare global {
    interface Element {
        checked?: any;
        disabled?: any;
        placeholder?: any;
        value?: any;
    }
    interface EventTarget {
        closest?: any;
        dataset?: any;
        checked?: any;
        style?: any;
    }
}
// ----------------------------------------------------------------
// CONSTANTS - Cores, padroes
// (Layout dims PX_PER_M/COL/MARGIN + geometria pura: ./_wellProfileGeometryPure.js)
// ----------------------------------------------------------------
// SOIL_COLORS / SOIL_LABELS (catálogo ABGE simplificado) extraídos para
// ./_wellProfileLithologyPure.js (ARCH-MONOLITH-ATOMIZATION-001, REFACTOR).
/** Cores dos elementos construtivos */
/** @type {Record<string, string>} */
const CONSTR_COLORS: AnyRecord = {
    surface_completion: '#666',
    cement_seal: '#B0B0B0',
    bentonite_seal: '#7A6B5A',
    blank_casing: '#4A90D9',
    screen: '#4A90D9',
    gravel_pack: '#C8C0A8',
    sump: '#4A90D9',
};
/** Labels dos elementos construtivos */
const CONSTR_LABELS = {
    surface_completion: 'Base',
    cement_seal: 'Selo cimento',
    bentonite_seal: 'Bentonita',
    blank_casing: 'Rev. liso',
    screen: 'Filtro',
    gravel_pack: 'Pre-filtro',
    sump: 'Fundo',
};
// ----------------------------------------------------------------
// CONSISTENCY OPTIONS - varia por tipo de solo (argila vs areia)
// ----------------------------------------------------------------
/**
 * Retorna options HTML para consistência/compacidade conforme tipo de solo.
 * Argilas: Mole → M. duro | Areias/granulares: Fofo → M. compacto
 * @param {string} soilType
 * @param {string} currentValue
 * @returns {string} HTML de <option> elementos
 */
function _getConsistencyOptions(soilType: any, currentValue: any) {
    return getConsistencyChoices(soilType)
        .map(([v, label]) => `<option value="${v}" ${currentValue === v ? 'selected' : ''}>${label}</option>`)
        .join('');
}
// ----------------------------------------------------------------
// MODULE CLASS
// ----------------------------------------------------------------
/**
 * Modulo de perfil construtivo e litologico para pocos de monitoramento.
 * Renderiza SVG com 5 colunas: Desc | Litologia | Escala | Construtivo | VOC.
 */
export default class WellProfileModule extends /** @type {any} */ (FamilyModule) {
    override _listen: any;
    /** @type {HTMLElement|null} */
    override _container: any = null;
    /** @type {any} */
    override _element: any = null;
    /** @type {boolean} */
    override _mounted = false;
    /** @type {boolean} */
    _showElevation = false;
    override _getFamilyId() {
        return 'well';
    }
    /**
     * Monta o visualizador de perfil no container DOM.
     */
    override async mount(container: any, element: any, options: any = {}) {
        await super.mount(container, element, options);
        // Migra dados legados se necessario
        if (element.data?.lithology && !element.data?.profile) {
            const migrated = this.migrateData(element.data);
            if (migrated)
                element.data.profile = migrated;
        }
        this._showElevation = false; // Escala: false=profundidade, true=cota topográfica
        this._container?.classList.add('ecbt-fm-well');
        this._render();
    }
    /**
     * Atualiza visualizacao com novos dados.
     */
    override update(element: any) {
        super.update(element);
        if (this._mounted)
            this._render();
    }
    /**
     * Desmonta modulo.
     */
    override unmount() {
        super.unmount();
    }
    /**
     * Dados padrao para um novo poco.
     */
    override getDefaultData() {
        return {
            constructive: {
                totalDepth: 50,
                drillingDepth: 50,
                boreholeDiameter: 10,
                casingDiameter: 4,
                drillingMethod: 'hollow_stem_auger',
                elements: [],
            },
            lithologic: [],
            waterLevel: null,
            vocReadings: [],
        };
    }
    /**
     * Valida dados do perfil.
     */
    override validate(profileData: any) {
        const errors = [];
        const c = profileData?.constructive;
        if (c && c.totalDepth > c.drillingDepth) {
            errors.push('Well depth cannot exceed drilling depth');
        }
        const layers = profileData?.lithologic || [];
        errors.push(...computeLayerGapOverlapErrors(layers));
        return { valid: errors.length === 0, errors };
    }
    /**
     * Exporta SVG do perfil como string.
     */
    override exportSVG() {
        const svg = this._container?.querySelector('.ecbt-fm-well__viewer svg');
        return svg ? svg.outerHTML : null;
    }
    /**
     * Migra dados legados para formato profile.
     */
    override migrateData(oldData: any) {
        if (!oldData?.lithology && !oldData?.waterLevels)
            return null;
        return {
            constructive: {
                totalDepth: oldData.construction?.totalDepth || 50,
                drillingDepth: oldData.construction?.totalDepth || 50,
                boreholeDiameter: 10,
                casingDiameter: oldData.construction?.diameter || 4,
                drillingMethod: 'hollow_stem_auger',
                elements: [],
            },
            lithologic: (oldData.lithology || []).map((layer: any) => ({
                from: layer.from,
                to: layer.to,
                soilType: null,
                description: layer.description || '',
                classification: layer.classification || '',
                color: '',
                moisture: '',
                observations: ''
            })),
            waterLevel: oldData.waterLevels?.[0]
                ? { depth: oldData.waterLevels[0].depth, date: oldData.waterLevels[0].date }
                : null,
            vocReadings: [],
        };
    }
    /**
     * CSS do modulo.
     */
    override getStyles() {
        return `
.ecbt-fm-well { padding: 8px 0; }
.ecbt-fm-well__header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 0 8px; border-bottom: 1px solid var(--neutral-700, #444); margin-bottom: 8px;
}
.ecbt-fm-well__title { font-size: 12px; font-weight: 600; color: var(--neutral-200, #ccc); }
.ecbt-fm-well__actions { display: flex; gap: 4px; }
.ecbt-fm-well__viewer {
    overflow: auto; border: 1px solid var(--neutral-700, #444);
    border-radius: var(--radius-sm, 4px); background: #fff; padding: 4px;
    min-height: 120px;
}
.ecbt-fm-well__svg { display: block; }
.ecbt-fm-well__placeholder {
    color: var(--neutral-500, #888); font-size: 11px; text-align: center; padding: 24px 8px;
}
.ecbt-fm-well__legend {
    display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 6px 0;
    border-top: 1px solid var(--neutral-700, #444); margin-top: 6px;
}
.ecbt-fm-well__legend-item {
    display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--neutral-300, #aaa);
}
.ecbt-fm-well__legend-swatch {
    width: 14px; height: 10px; border: 1px solid #666; border-radius: 1px;
}
.ecbt-fm-well__soil-swatch {
    pointer-events: none;
    transition: background 0.15s;
}
.ecbt-fm-well__compliance {
    border-top: 1px solid var(--neutral-700, #444); margin-top: 4px;
}
.ecbt-fm-well__issue-row:hover { background: var(--neutral-800, #2a2a2a); }
.ecbt-fm-well__btn-compliance {
    transition: color 0.2s, border-color 0.2s;
}
.ecbt-fm-well__btn-topo--active {
    background: var(--accent-500, #4A90D9);
    color: #fff;
    border-color: var(--accent-500, #4A90D9);
}`;
    }
    // ----------------------------------------------------------------
    // PRIVATE - SVG Rendering
    // ----------------------------------------------------------------
    /**
     * Renderiza header + SVG ou placeholder.
     */
    _render() {
        if (!this._container)
            return;
        const profile = this._element?.data?.profile;
        const depth = this._element?.data?.construction?.totalDepth || profile?.constructive?.totalDepth || 50;
        this._container.innerHTML = `
            <div class="ecbt-fm-well__header">
                <span class="ecbt-fm-well__title">${t('wellProfile.wellProfileTitle', { name: this._element?.name || '' })}</span>
                <div class="ecbt-fm-well__actions">
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-edit" title="${t('wellProfile.editProfileTooltip')}">
                        ${t('wellProfile.edit')}
                    </button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-compliance" title="${t('wellProfile.complianceNbrTooltip')}">
                        ${t('wellProfile.compliance')}
                    </button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-section" title="${t('wellProfile.geologicalSectionTooltip')}">
                        ${t('wellProfile.section')}
                    </button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-topo${this._showElevation ? ' ecbt-fm-well__btn-topo--active' : ''}" title="${t('wellProfile.toggleScaleTooltip')}">
                        ${this._showElevation ? t('wellProfile.viewDepth') : t('wellProfile.viewElevation')}
                    </button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-export" title="${t('wellProfile.exportSvgTooltip')}">
                        ${t('wellProfile.svg')}
                    </button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__btn-survey${this._element?.data?.directionalSurvey ? ' ecbt-fm-well__btn-survey--active' : ''}" title="${t('wellProfile.directionalSurveyTooltip') || 'Poço Direcional — inserir survey (depth, inclination, azimuth)'}">
                        ${t('wellProfile.survey') || 'Survey'}
                    </button>
                </div>
            </div>
            <div class="ecbt-fm-well__viewer"></div>
            <div class="ecbt-fm-well__editor" style="display:none;"></div>
            <div class="ecbt-fm-well__compliance" style="display:none;"></div>
            <div class="ecbt-fm-well__survey-panel" style="display:none;"></div>
        `;
        const viewer = (this._container.querySelector('.ecbt-fm-well__viewer'));
        if (!viewer)
            return;
        if (profile && (profile.lithologic?.length > 0 || profile.constructive?.elements?.length > 0)) {
            const svg = this._buildSVG(profile, depth);
            viewer.appendChild(svg);
            this._addLegend(profile);
        }
        else {
            viewer.innerHTML = `<p class="ecbt-fm-well__placeholder">
                ${t('wellProfile.noProfileData', { depth })}
            </p>`;
        }
        // Wire export button
        const exportBtn = this._container.querySelector('.ecbt-fm-well__btn-export');
        if (exportBtn) {
            this._listen(exportBtn, 'click', () => this._handleExport());
        }
        // Wire edit button
        const editBtn = this._container.querySelector('.ecbt-fm-well__btn-edit');
        if (editBtn) {
            this._listen(editBtn, 'click', () => this._toggleEditor());
        }
        // Wire compliance button - atualiza badge após carga
        const complianceBtn = this._container.querySelector('.ecbt-fm-well__btn-compliance');
        if (complianceBtn) {
            this._updateComplianceBadge(/** @type {HTMLElement} */ (complianceBtn));
            this._listen(complianceBtn, 'click', () => this._toggleCompliance());
        }
        // Wire section button
        const sectionBtn = this._container.querySelector('.ecbt-fm-well__btn-section');
        if (sectionBtn) {
            this._listen(sectionBtn, 'click', () => this._openCrossSection());
        }
        // Wire topo toggle button - alterna escala entre profundidade e cota topográfica
        const topoBtn = this._container.querySelector('.ecbt-fm-well__btn-topo');
        if (topoBtn) {
            this._listen(topoBtn, 'click', () => {
                const nextMode = (!this._showElevation);
                if (nextMode) {
                    const elev = this._element?.data?.coordinates?.elevation;
                    if (elev == null || !isFinite(elev)) {
                        if (typeof window.showToast === 'function') {
                            window.showToast('Cota topográfica indisponível — cadastre a elevação do ponto de sondagem', 'warning');
                        }
                        return; // Não alterna modo sem dado de elevação
                    }
                }
                this._showElevation = nextMode;
                this._render();
            });
        }
        // Wire survey button - abre/fecha painel de survey direcional
        const surveyBtn = this._container.querySelector('.ecbt-fm-well__btn-survey');
        if (surveyBtn) {
            this._listen(surveyBtn, 'click', () => this._toggleSurveyPanel());
        }
    }
    /** Alterna visibilidade do painel de survey direcional. */
    _toggleSurveyPanel() {
        const panel = (this._container?.querySelector('.ecbt-fm-well__survey-panel') || null);
        if (!panel)
            return;
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible)
            this._renderSurveyPanel(panel);
    }
    /**
     * Renderiza o painel de entrada de survey direcional.
     * Formato CSV esperado: depth,inclination,azimuth (uma estação por linha)
     * @param {HTMLElement} panel
     */
    _renderSurveyPanel(panel: any) {
        const existing = this._element?.data?.directionalSurvey;
        const csvValue = existing
            ? existing.map((s: any) => `${s.depth},${s.inclination},${s.azimuth}`).join('\n')
            : '';
        panel.innerHTML = `
            <div style="padding:8px;border-top:1px solid var(--neutral-200,#e2e8f0);">
                <p style="font-size:11px;font-weight:600;margin:0 0 4px;">${t('wellProfile.directionalSurveyTitle') || 'Survey Direcional (Minimum Curvature)'}</p>
                <p style="font-size:10px;color:var(--neutral-500,#6b7280);margin:0 0 6px;">${t('wellProfile.directionalSurveyHelp') || 'depth (m), inclination (°), azimuth (°) — uma estação por linha'}</p>
                <textarea data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:textarea:L437" class="ecbt-fm-well__survey-input" style="width:100%;height:120px;font-size:11px;font-family:monospace;padding:4px;box-sizing:border-box;border:1px solid var(--neutral-300,#d1d5db);border-radius:4px;" placeholder="0,0,0&#10;100,15,45&#10;200,30,90">${csvValue}</textarea>
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button class="btn btn-sm btn-primary ecbt-fm-well__survey-apply" style="flex:1;">${t('wellProfile.applySurvey') || 'Aplicar Survey'}</button>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__survey-clear">${t('wellProfile.clearSurvey') || 'Limpar'}</button>
                </div>
            </div>
        `;
        const applyBtn = panel.querySelector('.ecbt-fm-well__survey-apply');
        const clearBtn = panel.querySelector('.ecbt-fm-well__survey-clear');
        const textarea = (panel.querySelector('.ecbt-fm-well__survey-input'));
        if (applyBtn && textarea)
            this._listen(applyBtn, 'click', async () => {
                const csv = textarea.value.trim();
                if (!csv)
                    return;
                try {
                    const stations = parseSurveyData(csv);
                    if (stations.length < 2) {
                        showToast(t('wellProfile.surveyMinStations') || 'Survey precisa de no mínimo 2 estações.', 'warning');
                        return;
                    }
                    if (!this._element.data)
                        this._element.data = {};
                    this._element.data.directionalSurvey = stations;
                    await this._persistAndRebuild();
                    showToast(t('wellProfile.surveyApplied') || `Survey aplicado — ${stations.length} estações.`, 'success');
                }
                catch (err: any) {
                    showToast(t('wellProfile.surveyParseError') ||
                        `Erro ao parsear survey: ${ /** @type {any} */(err).message}`, 'error');
                }
            });
        if (clearBtn)
            this._listen(clearBtn, 'click', async () => {
                if (!this._element.data)
                    return;
                delete this._element.data.directionalSurvey;
                await this._persistAndRebuild();
                this._render();
                showToast(t('wellProfile.surveyCleared') || 'Survey direcional removido.', 'info');
            });
    }
    /** Persiste alterações no elemento e reconstrói a mesh 3D. */
    async _persistAndRebuild() {
        try {
            if (typeof window.updateElement === 'function') {
                window.updateElement(this._element.id, { data: this._element.data });
            }
        }
        catch (e: any) {
            console.debug('[wellProfile] update-element-from-edit:', 
            /** @type {any} */ (e)?.message || e); /* original silent */
        }
        await this._update3DMesh();
    }
    /**
     * Constroi o SVG completo do perfil.
     * Layout: [Desc | Litho | Scale | Constr | VOC]
     *
     * @param {any} profile - element.data.profile
     * @param {number} totalDepth - Profundidade total em metros
     * @returns {SVGElement}
     */
    _buildSVG(profile: any, totalDepth: any) {
        // Elevação topográfica da superfície (z do collar), usada quando _showElevation=true
        const surfaceElevation = this._showElevation ? (this._element?.data?.coordinates?.elevation ?? null) : null;
        const { h, totalW, totalH } = computeProfileDimensions(totalDepth);
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('xmlns', SVG_NS);
        svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
        svg.setAttribute('width', String(totalW));
        svg.setAttribute('height', String(totalH));
        svg.classList.add('ecbt-fm-well__svg');
        // Background
        const bg = this._svgEl('rect', { x: 0, y: 0, width: totalW, height: totalH, fill: '#fff' });
        svg.appendChild(bg);
        // Defs (patterns)
        svg.appendChild(this._buildDefs());
        // Posicoes X de cada coluna (geometria pura)
        const x = computeColumnXPositions();
        // Column headers
        this._addColumnHeaders(svg, x, this._showElevation);
        // Depth scale (center column)
        this._addDepthScale(svg, x.scale, totalDepth, h, surfaceElevation);
        // Lithologic layers
        if (profile.lithologic?.length > 0) {
            this._addLithology(svg, x.desc, x.litho, profile.lithologic, totalDepth, h, surfaceElevation);
        }
        // Constructive elements
        if (profile.constructive?.elements?.length > 0) {
            this._addConstructive(svg, x.constr, profile.constructive, totalDepth, h);
        }
        // Water level
        if (profile.waterLevel?.depth != null) {
            this._addWaterLevel(svg, x.litho, profile.waterLevel.depth, totalDepth, h, surfaceElevation);
        }
        // VOC readings
        if (profile.vocReadings?.length > 0) {
            this._addVOCReadings(svg, x.voc, profile.vocReadings, totalDepth, h);
        }
        // Borehole outline
        this._addBoreholeOutline(svg, x.litho, x.constr + COL.constr, totalDepth, h);
        return svg;
    }
    /**
     * Cria <defs> com padroes hatch para tipos de solo.
     */
    _buildDefs() {
        const defs = document.createElementNS(SVG_NS, 'defs');
        // Padrao para cada tipo de solo
        for (const [type, color] of Object.entries(SOIL_COLORS)) {
            const pat = this._svgEl('pattern', {
                id: `soil-${type}`,
                patternUnits: 'userSpaceOnUse',
                width: 8,
                height: 8,
            });
            // Fundo com cor solida
            pat.appendChild(this._svgEl('rect', { width: 8, height: 8, fill: color }));
            // Hatch por tipo
            if (type === 'clay' || type === 'sandy_clay') {
                // Linhas horizontais (argila)
                pat.appendChild(this._svgEl('line', {
                    x1: 0,
                    y1: 2,
                    x2: 8,
                    y2: 2,
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.3,
                }));
                pat.appendChild(this._svgEl('line', {
                    x1: 0,
                    y1: 6,
                    x2: 8,
                    y2: 6,
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.3,
                }));
            }
            else if (type === 'sand' || type === 'clayey_sand' || type === 'silty_sand') {
                // Pontos (areia)
                pat.appendChild(this._svgEl('circle', { cx: 2, cy: 2, r: 0.7, fill: '#000', 'fill-opacity': 0.3 }));
                pat.appendChild(this._svgEl('circle', { cx: 6, cy: 6, r: 0.7, fill: '#000', 'fill-opacity': 0.3 }));
            }
            else if (type === 'silt') {
                // Tracos curtos (silte)
                pat.appendChild(this._svgEl('line', {
                    x1: 1,
                    y1: 4,
                    x2: 4,
                    y2: 4,
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.3,
                }));
            }
            else if (type === 'gravel') {
                // Circulos (cascalho)
                pat.appendChild(this._svgEl('circle', {
                    cx: 4,
                    cy: 4,
                    r: 2,
                    fill: 'none',
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.4,
                }));
            }
            else if (type === 'rock') {
                // Cruz diagonal (rocha)
                pat.appendChild(this._svgEl('line', {
                    x1: 0,
                    y1: 0,
                    x2: 8,
                    y2: 8,
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.4,
                }));
                pat.appendChild(this._svgEl('line', {
                    x1: 8,
                    y1: 0,
                    x2: 0,
                    y2: 8,
                    stroke: '#000',
                    'stroke-width': 0.5,
                    'stroke-opacity': 0.4,
                }));
            }
            defs.appendChild(pat);
        }
        // Padrao gravel pack (pontilhado especifico)
        const gpPat = this._svgEl('pattern', {
            id: 'constr-gravel_pack',
            patternUnits: 'userSpaceOnUse',
            width: 6,
            height: 6,
        });
        gpPat.appendChild(this._svgEl('rect', { width: 6, height: 6, fill: CONSTR_COLORS.gravel_pack }));
        gpPat.appendChild(this._svgEl('circle', { cx: 2, cy: 2, r: 1, fill: '#8A8070' }));
        gpPat.appendChild(this._svgEl('circle', { cx: 5, cy: 5, r: 0.8, fill: '#8A8070' }));
        defs.appendChild(gpPat);
        // Padrao screen (linhas horizontais = ranhuras)
        const scPat = this._svgEl('pattern', {
            id: 'constr-screen',
            patternUnits: 'userSpaceOnUse',
            width: 10,
            height: 4,
        });
        scPat.appendChild(this._svgEl('rect', { width: 10, height: 4, fill: CONSTR_COLORS.screen }));
        scPat.appendChild(this._svgEl('line', { x1: 0, y1: 2, x2: 10, y2: 2, stroke: '#fff', 'stroke-width': 1.5 }));
        defs.appendChild(scPat);
        return defs;
    }
    /**
     * Adiciona headers de cada coluna.
     */
    _addColumnHeaders(/** @type {SVGElement} */ svg: any, x: any, showElevation = false) {
        const y = MARGIN.top - 8;
        const style = 'font-size:7px;font-weight:600;fill:#666;text-anchor:middle;font-family:sans-serif;';
        svg.appendChild(this._svgText(x.desc + COL.desc / 2, y, 'DESCR.', style));
        svg.appendChild(this._svgText(x.litho + COL.litho / 2, y, 'LITOL.', style));
        svg.appendChild(this._svgText(x.scale + COL.scale / 2, y, showElevation ? 'COTA' : 'PROF.', style));
        svg.appendChild(this._svgText(x.constr + COL.constr / 2, y, 'CONSTR.', style));
        svg.appendChild(this._svgText(x.voc + COL.voc / 2, y, 'VOC (ppm)', style));
    }
    /**
     * Adiciona escala de profundidade (eixo central com marcas a cada metro).
     */
    _addDepthScale(
    /** @type {SVGElement} */ svg: any, xStart: any, totalDepth: any, h: any, surfaceElevation = null) {
        const xCenter = xStart + COL.scale / 2;
        const yStart = MARGIN.top;
        // Eixo vertical
        svg.appendChild(this._svgEl('line', {
            x1: xCenter,
            y1: yStart,
            x2: xCenter,
            y2: yStart + h,
            stroke: '#333',
            'stroke-width': 1,
        }));
        // Marcas a cada N metros (auto-escala, geometria pura)
        const step = computeDepthScaleStep(totalDepth);
        for (let d = 0; d <= totalDepth; d += step) {
            const y = depthToY(d);
            // Tick mark
            svg.appendChild(this._svgEl('line', {
                x1: xCenter - 4,
                y1: y,
                x2: xCenter + 4,
                y2: y,
                stroke: '#333',
                'stroke-width': 0.5,
            }));
            // Label: cota topográfica (elevação - profundidade) ou profundidade simples
            const label = formatScaleLabel(d, surfaceElevation);
            svg.appendChild(this._svgText(xCenter + 12, y + 3, label, 'font-size:7px;fill:#333;text-anchor:end;font-family:sans-serif;'));
        }
    }
    /**
     * Adiciona camadas litologicas (coluna descricao + coluna pattern).
     */
    _addLithology(
    /** @type {SVGElement} */ svg: any, xDesc: any, xLitho: any, layers: any, totalDepth: any, h: any, surfaceElevation = null) {
        for (const layer of layers) {
            const y1 = depthToY(layer.from);
            const y2 = depthToY(layer.to);
            const layerH = y2 - y1;
            if (layerH <= 0)
                continue;
            const soilType = layer.soilType || 'clay';
            const patternId = resolveSoilPatternId(soilType);
            // Retangulo com padrao litologico
            svg.appendChild(this._svgEl('rect', {
                x: xLitho,
                y: y1,
                width: COL.litho,
                height: layerH,
                fill: `url(#${patternId})`,
                stroke: '#999',
                'stroke-width': 0.5,
            }));
            // Descricao do solo (coluna esquerda)
            const label = SOIL_LABELS[String(soilType)] || soilType;
            const midY = y1 + layerH / 2;
            if (layerH > 10) {
                svg.appendChild(this._svgText(xDesc + COL.desc - 4, midY + 3, label, 'font-size:7px;fill:#333;text-anchor:end;font-family:sans-serif;'));
            }
            // Profundidade no limite inferior (ou cota topográfica quando ativo)
            const depthLabel = surfaceElevation != null ? `${+(surfaceElevation - layer.to).toFixed(1)}` : `${layer.to}m`;
            svg.appendChild(this._svgText(xDesc + COL.desc - 4, y2 + 3, depthLabel, 'font-size:6px;fill:#999;text-anchor:end;font-family:sans-serif;'));
            // Linha de separacao horizontal
            svg.appendChild(this._svgEl('line', {
                x1: xDesc,
                y1: y2,
                x2: xLitho + COL.litho,
                y2: y2,
                stroke: '#aaa',
                'stroke-width': 0.3,
                'stroke-dasharray': '2,1',
            }));
        }
    }
    /**
     * Adiciona elementos construtivos (coluna direita do eixo de profundidade).
     */
    _addConstructive(
    /** @type {SVGElement} */ svg: any, xConstr: any, constructive: any, _totalDepth: any, _h: any) {
        const elements = constructive.elements || [];
        for (const el of elements) {
            const y1 = depthToY(el.topDepth);
            const y2 = depthToY(el.bottomDepth);
            const elH = y2 - y1;
            if (elH <= 0)
                continue;
            let fill = CONSTR_COLORS[String(el.type)] || '#999';
            /** @type {Record<string, string|number>} */
            const extraAttrs: AnyRecord = {};
            // Usa padroes especiais para screen e gravel_pack
            if (el.type === 'screen') {
                fill = 'url(#constr-screen)';
            }
            else if (el.type === 'gravel_pack') {
                fill = 'url(#constr-gravel_pack)';
            }
            // Largura variavel por tipo
            let w = COL.constr;
            let xOff = 0;
            if (el.type === 'gravel_pack') {
                // Pre-filtro: coluna inteira
                w = COL.constr;
            }
            else if (el.type === 'blank_casing' || el.type === 'screen' || el.type === 'sump') {
                // Revestimento: mais estreito, centralizado
                w = COL.constr * 0.5;
                xOff = (COL.constr - w) / 2;
            }
            else if (el.type === 'cement_seal' || el.type === 'bentonite_seal') {
                // Selos: largura media
                w = COL.constr * 0.75;
                xOff = (COL.constr - w) / 2;
            }
            else if (el.type === 'surface_completion') {
                w = COL.constr;
            }
            svg.appendChild(this._svgEl('rect', {
                x: xConstr + xOff,
                y: y1,
                width: w,
                height: elH,
                fill,
                stroke: '#666',
                'stroke-width': 0.5,
                ...extraAttrs,
            }));
        }
    }
    /**
     * Adiciona indicador de nivel d'agua (linha azul tracejada).
     */
    _addWaterLevel(
    /** @type {SVGElement} */ svg: any, xStart: any, wlDepth: any, totalDepth: any, h: any, surfaceElevation = null) {
        const y = depthToY(wlDepth);
        const xEnd = xStart + COL.litho + COL.gap + COL.scale + COL.gap + COL.constr;
        // Linha tracejada azul
        svg.appendChild(this._svgEl('line', {
            x1: xStart,
            y1: y,
            x2: xEnd,
            y2: y,
            stroke: '#1E90FF',
            'stroke-width': 1.5,
            'stroke-dasharray': '6,3',
        }));
        // Triangulo (simbolo NA)
        const triSize = 5;
        svg.appendChild(this._svgEl('polygon', {
            points: `${xStart - 2},${y} ${xStart - 2 - triSize},${y - triSize} ${xStart - 2 - triSize},${y + triSize}`,
            fill: '#1E90FF',
        }));
        // Label
        svg.appendChild(this._svgText(xStart - triSize - 6, y + 3, surfaceElevation != null
            ? `NA ${+(surfaceElevation - wlDepth).toFixed(1)}`
            : `NA ${wlDepth.toFixed(1)}m`, 'font-size:6px;fill:#1E90FF;text-anchor:end;font-family:sans-serif;font-weight:600;'));
    }
    /**
     * Adiciona leituras VOC (barras horizontais).
     */
    _addVOCReadings(
    /** @type {SVGElement} */ svg: any, xVoc: any, readings: any, totalDepth: any, h: any) {
        if (readings.length === 0)
            return;
        const { maxVOC, barMaxW } = computeVocScale(readings);
        const yStart = MARGIN.top;
        // Eixo VOC
        svg.appendChild(this._svgEl('line', {
            x1: xVoc,
            y1: yStart,
            x2: xVoc,
            y2: yStart + h,
            stroke: '#ddd',
            'stroke-width': 0.5,
        }));
        for (const reading of readings) {
            const y = depthToY(reading.depth);
            const barW = computeVocBarWidth(reading.value, maxVOC, barMaxW);
            // Barra
            svg.appendChild(this._svgEl('rect', {
                x: xVoc + 2,
                y: y - 2,
                width: barW,
                height: 4,
                fill: reading.value > 100 ? '#e74c3c' : '#f39c12',
                rx: 1,
            }));
            // Valor
            svg.appendChild(this._svgText(xVoc + barW + 6, y + 2, `${reading.value}`, 'font-size:6px;fill:#666;font-family:sans-serif;'));
        }
        // Max label
        svg.appendChild(this._svgText(xVoc + COL.voc, yStart - 2, `max: ${maxVOC.toFixed(0)}`, 'font-size:5px;fill:#999;text-anchor:end;font-family:sans-serif;'));
    }
    /**
     * Adiciona outline externo do furo (borda do perfil).
     */
    _addBoreholeOutline(
    /** @type {SVGElement} */ svg: any, x1: any, x2: any, totalDepth: any, h: any) {
        const yStart = MARGIN.top;
        // eslint-disable-next-line
        const yEnd = yStart + h;
        // Retangulo pontilhado ao redor da area litho+scale+constr
        svg.appendChild(this._svgEl('rect', {
            x: x1,
            y: yStart,
            width: x2 - x1,
            height: h,
            fill: 'none',
            stroke: '#333',
            'stroke-width': 0.75,
        }));
        // Superficie (linha dupla no topo)
        svg.appendChild(this._svgEl('line', {
            x1: x1 - 10,
            y1: yStart,
            x2: x2 + 10,
            y2: yStart,
            stroke: '#333',
            'stroke-width': 2,
        }));
        // Hachurado de superficie (terra)
        for (let i = 0; i < 6; i++) {
            const xh = x1 - 10 + i * 8;
            svg.appendChild(this._svgEl('line', {
                x1: xh,
                y1: yStart,
                x2: xh - 4,
                y2: yStart - 5,
                stroke: '#666',
                'stroke-width': 0.5,
            }));
        }
    }
    /**
     * Adiciona legenda abaixo do SVG.
     */
    _addLegend(profile: any) {
        const legend = document.createElement('div');
        legend.className = 'ecbt-fm-well__legend';
        // Tipos de solo usados
        const usedSoils = new Set((profile.lithologic || []).map((l: any) => l.soilType).filter(Boolean));
        for (const type of usedSoils as Set<any>) {
            const item = document.createElement('div');
            item.className = 'ecbt-fm-well__legend-item';
            item.innerHTML = `
                <span class="ecbt-fm-well__legend-swatch" style="background:${SOIL_COLORS[String(type)] || '#ccc'}"></span>
                ${SOIL_LABELS[String(type)] || type}
            `;
            legend.appendChild(item);
        }
        // Water level
        if (profile.waterLevel?.depth != null) {
            const wlItem = document.createElement('div');
            wlItem.className = 'ecbt-fm-well__legend-item';
            wlItem.innerHTML = `
                <span class="ecbt-fm-well__legend-swatch" style="background:#1E90FF"></span>
                ${t('wellProfile.waterLevel', { depth: profile.waterLevel.depth.toFixed(1) })}
            `;
            legend.appendChild(wlItem);
        }
        this._container?.appendChild(legend);
    }
    // ----------------------------------------------------------------
    // PRIVATE - SVG Helpers
    // ----------------------------------------------------------------
    /**
     * Cria elemento SVG com atributos.
     */
    _svgEl(/** @type {string} */ tag: any, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) {
            el.setAttribute(k, String(v));
        }
        return el;
    }
    /**
     * Cria elemento <text> SVG.
     */
    _svgText(
    /** @type {number} */ x: any, y: any, text: any, style = '') {
        const el = document.createElementNS(SVG_NS, 'text');
        el.setAttribute('x', String(x));
        el.setAttribute('y', String(y));
        if (style)
            el.setAttribute('style', style);
        el.textContent = text;
        return el;
    }
    // ----------------------------------------------------------------
    // COMPLIANCE - Verificação NBR 15495-1
    // ----------------------------------------------------------------
    /**
     * Atualiza o badge numérico no botão de conformidade.
     * Carrega wellCompliance de forma lazy para não bloquear a renderização.
     * @param {HTMLElement} btn
     */
    async _updateComplianceBadge(btn: any) {
        if (!btn || !this._element?.data?.profile)
            return;
        try {
            const { checkWellCompliance } = await import('./wellCompliance.js');
            const { issues, verdict } = checkWellCompliance(this._element.data.profile);
            const failing = issues.filter((i) => !i.passed).length;
            const color = verdict === 'ok'
                ? 'var(--success,#16a34a)'
                : verdict === 'warning'
                    ? 'var(--warning,#d97706)'
                    : 'var(--error,#dc2626)';
            btn.style.borderColor = color;
            btn.style.color = color;
            if (failing > 0) {
                btn.textContent = t('wellProfile.complianceWithFailing', { failing });
            }
            else {
                btn.textContent = t('wellProfile.complianceOk');
                btn.innerHTML = t('wellProfile.complianceOk');
            }
        }
        catch (e: any) {
            console.debug('[wellProfile] compliance-module-load:', 
            /** @type {any} */ (e)?.message || e); /* original silent module load */
        }
    }
    /** Toggle da aba de conformidade. */
    _toggleCompliance() {
        const panel = (this._container?.querySelector('.ecbt-fm-well__compliance') || null);
        if (!panel)
            return;
        if (panel.style.display !== 'none') {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';
        this._renderCompliancePanel(panel);
    }
    /**
     * Renderiza o painel de conformidade.
     * @param {HTMLElement} panel
     */
    async _renderCompliancePanel(panel: any) {
        panel.innerHTML = `<p style="font-size:10px;padding:8px;color:var(--neutral-400,#999);">${t('wellProfile.checking')}</p>`;
        try {
            const { checkWellCompliance } = await import('./wellCompliance.js');
            const profile = this._element?.data?.profile;
            if (!profile) {
                panel.innerHTML = `<p style="font-size:10px;padding:8px;">${t('wellProfile.noProfileDataCompliance')}</p>`;
                return;
            }
            const { score, verdict, issues } = checkWellCompliance(profile);
            const verdictColor = verdict === 'ok' ? '#16a34a' : verdict === 'warning' ? '#d97706' : '#dc2626';
            const verdictLabel = verdict === 'ok' ? 'Conforme' : verdict === 'warning' ? 'Atenção' : 'Não conforme';
            const rows = issues
                .map((issue) => {
                const icon = issue.passed
                    ? '&#10003;'
                    : issue.severity === 'error'
                        ? '&#10005;'
                        : issue.severity === 'warning'
                            ? '&#9888;'
                            : '&#9432;';
                const color = issue.passed
                    ? '#16a34a'
                    : issue.severity === 'error'
                        ? '#dc2626'
                        : issue.severity === 'warning'
                            ? '#d97706'
                            : '#6b7280';
                return `
                    <tr class="ecbt-fm-well__issue-row ${issue.passed ? '' : 'ecbt-fm-well__issue-' + issue.severity}">
                        <td style="padding:3px 6px;font-size:11px;color:${color};text-align:center;">${icon}</td>
                        <td style="padding:3px 4px;font-size:10px;font-weight:600;color:${color};">${issue.code}</td>
                        <td style="padding:3px 4px;font-size:10px;">${issue.message}</td>
                        <td style="padding:3px 4px;font-size:9px;color:var(--neutral-400,#999);">${issue.reference}</td>
                    </tr>`;
            })
                .join('');
            // Barra de progresso
            const barW = Math.max(0, Math.min(100, score));
            const barColor = verdict === 'ok' ? '#16a34a' : verdict === 'warning' ? '#d97706' : '#dc2626';
            panel.innerHTML = `
                <div style="padding:8px;border-top:1px solid var(--neutral-200,#e5e7eb);font-size:11px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <div style="flex:1;height:6px;border-radius:3px;background:var(--neutral-200,#e5e7eb);overflow:hidden;">
                            <div style="height:100%;width:${barW}%;background:${barColor};border-radius:3px;transition:width 0.4s;"></div>
                        </div>
                        <span style="font-size:12px;font-weight:700;color:${verdictColor};">${score}/100</span>
                        <span style="font-size:11px;font-weight:600;color:${verdictColor};">${verdictLabel}</span>
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="background:var(--neutral-100,#f5f5f5);">
                            <th style="padding:2px 6px;width:22px;"></th>
                            <th style="padding:2px 4px;text-align:left;font-size:10px;">${t('wellProfile.code')}</th>
                            <th style="padding:2px 4px;text-align:left;font-size:10px;">${t('wellProfile.verification')}</th>
                            <th style="padding:2px 4px;text-align:left;font-size:10px;">${t('wellProfile.norm')}</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
        }
        catch (err: any) {
            panel.innerHTML = `<p style="font-size:10px;padding:8px;color:var(--error,red);">${t('wellProfile.errorLoadingChecks', { message: /** @type {any} */ (err).message })}</p>`;
        }
    }
    // ----------------------------------------------------------------
    // CROSS-SECTION - Seção geológica transversal entre poços
    // ----------------------------------------------------------------
    /**
     * Abre modal de seção geológica transversal.
     * Carrega todos os poços do modelo com perfil litológico.
     */
    async _openCrossSection() {
        // Importações lazy
        /** @type {any} */
        let getElementsByFamily;
        /** @type {any} */
        let buildModalShell;
        /** @type {any} */
        let buildCrossSectionSVG;
        /** @type {any} */
        let relativeToWGS84;
        /** @type {any} */
        let utmToRelative;
        /** @type {any} */
        let wgs84ToRelative;
        /** @type {any} */
        let getOrigin;
        /** @type {any} */
        let loadScriptCDN;
        const geologyCrossSectionModulePath = './geologyCrossSection.js';
        try {
            [
                { getElementsByFamily },
                { buildModalShell },
                { buildCrossSectionSVG },
                { relativeToWGS84, utmToRelative, wgs84ToRelative, getOrigin },
                { loadScriptCDN },
            ] = await Promise.all([
                import('../../manager.js'),
                import('../../../../utils/ui/modals.js'),
                import(geologyCrossSectionModulePath),
                import('../../../io/geo/coordinates.js'),
                import('../../../../utils/helpers/cdnLoader.js'),
            ]);
        }
        catch (err: any) {
            console.error('[WellProfile] Erro ao carregar módulo de seção:', err);
            return;
        }
        // Poços com perfil litológico (exceto o poço atual - mas inclui ele)
        const allWells = (getElementsByFamily('well').filter((w: any) => w.data?.profile?.lithologic?.length > 0));
        if (allWells.length < 2) {
            /** @type {any} */ (window).showToast?.(t('wellProfile.needTwoWells'), 'warning');
            return;
        }
        const { overlay, body, footer } = buildModalShell({
            title: t('wellProfile.geologicalSectionTooltip'),
            width: '1100px',
            twoPane: true,
            onClose: () => overlay.remove(),
        });
        if (footer)
            footer.style.display = 'none';
        body.style.padding = '0';
        body.style.minHeight = '560px';
        const leftPanel = document.createElement('div');
        let leftPanelWidth = 300;
        leftPanel.style.cssText = `
            width: ${leftPanelWidth}px;
            border-right: 1px solid var(--border-color,#2d3144);
            background: var(--panel-bg, #151a21);
            color: var(--text-color, #d1d5db);
            padding: 10px;
            overflow: auto;
        `;
        const leftTitle = document.createElement('div');
        leftTitle.textContent = t('wellProfile.wellsDragToSort');
        leftTitle.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:8px;';
        leftPanel.appendChild(leftTitle);
        const leftToolbar = document.createElement('div');
        leftToolbar.style.cssText =
            'display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:center;margin-bottom:8px;';
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = t('wellProfile.searchWellPlaceholder');
        searchInput.style.cssText = `
            height:28px;padding:0 8px;border-radius:6px;
            border:1px solid var(--border-color,#2d3144);background:var(--input-bg,#0b1117);
            color:var(--text-color,#d1d5db);font-size:11px;min-width:0;
        `;
        const allBtn = document.createElement('button');
        allBtn.className = 'btn btn-sm btn-secondary';
        allBtn.textContent = t('wellProfile.all');
        const noneBtn = document.createElement('button');
        noneBtn.className = 'btn btn-sm btn-secondary';
        noneBtn.textContent = t('wellProfile.none');
        leftToolbar.appendChild(searchInput);
        leftToolbar.appendChild(allBtn);
        leftToolbar.appendChild(noneBtn);
        leftPanel.appendChild(leftToolbar);
        const distBar = document.createElement('div');
        distBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px;';
        const autoDistBtn = document.createElement('button');
        autoDistBtn.className = 'btn btn-sm btn-secondary';
        autoDistBtn.textContent = t('wellProfile.autoDist');
        autoDistBtn.title = t('wellProfile.recalcDistancesTooltip');
        autoDistBtn.addEventListener('click', () => {
            manualDistanceInputs.clear();
            refreshDistances();
        });
        distBar.appendChild(autoDistBtn);
        leftPanel.appendChild(distBar);
        const selectedSummary = document.createElement('div');
        selectedSummary.style.cssText = 'font-size:11px;color:var(--neutral-300,#9ca3af);margin-bottom:8px;';
        leftPanel.appendChild(selectedSummary);
        const listEl = document.createElement('ul');
        listEl.style.cssText =
            'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:470px;overflow:auto;';
        leftPanel.appendChild(listEl);
        const rightPanel = document.createElement('div');
        rightPanel.style.cssText = `
            display:flex;
            flex-direction:column;
            min-width:0;
            background: var(--panel-bg-alt, #0f141b);
            color: var(--text-color, #d1d5db);
        `;
        const splitter = document.createElement('div');
        splitter.style.cssText = `
            width: 8px;
            cursor: col-resize;
            background: linear-gradient(to right, transparent 0, var(--border-color,#2d3144) 50%, transparent 100%);
            flex-shrink: 0;
            position: relative;
        `;
        splitter.title = t('wellProfile.dragToResizeTooltip');
        const ctrlBar = document.createElement('div');
        ctrlBar.style.cssText = `
            display:flex;gap:10px;align-items:center;flex-wrap:wrap;
            padding:10px 12px;border-bottom:1px solid var(--border-color,#2d3144);
            background: var(--panel-bg, #151a21);
        `;
        const corrLabel = document.createElement('label');
        corrLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const corrCb = document.createElement('input');
        corrCb.type = 'checkbox';
        corrCb.checked = true;
        corrLabel.appendChild(corrCb);
        corrLabel.appendChild(document.createTextNode('Correlação'));
        ctrlBar.appendChild(corrLabel);
        const wlLabel = document.createElement('label');
        wlLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const wlCb = document.createElement('input');
        wlCb.type = 'checkbox';
        wlCb.checked = true;
        wlLabel.appendChild(wlCb);
        wlLabel.appendChild(document.createTextNode("Nível d'água"));
        ctrlBar.appendChild(wlLabel);
        const interpLabel = document.createElement('label');
        interpLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const interpCb = document.createElement('input');
        interpCb.type = 'checkbox';
        interpCb.checked = true;
        interpLabel.appendChild(interpCb);
        interpLabel.appendChild(document.createTextNode('Interpolar áreas'));
        ctrlBar.appendChild(interpLabel);
        const editSvgLabel = document.createElement('label');
        editSvgLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const editSvgCb = document.createElement('input');
        editSvgCb.type = 'checkbox';
        editSvgCb.checked = false;
        editSvgLabel.appendChild(editSvgCb);
        editSvgLabel.appendChild(document.createTextNode('Editar no gráfico'));
        ctrlBar.appendChild(editSvgLabel);
        const uncLabel = document.createElement('label');
        uncLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const uncCb = document.createElement('input');
        uncCb.type = 'checkbox';
        uncCb.checked = true;
        uncLabel.appendChild(uncCb);
        uncLabel.appendChild(document.createTextNode('Incerteza'));
        ctrlBar.appendChild(uncLabel);
        const cotaLabel = document.createElement('label');
        cotaLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const cotaCb = document.createElement('input');
        cotaCb.type = 'checkbox';
        cotaCb.checked = false;
        cotaLabel.appendChild(cotaCb);
        cotaLabel.appendChild(document.createTextNode('Cota topo.'));
        cotaLabel.title = t('wellProfile.absoluteElevationTooltip');
        ctrlBar.appendChild(cotaLabel);
        const distLabel = document.createElement('label');
        distLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;';
        const distCb = document.createElement('input');
        distCb.type = 'checkbox';
        distCb.checked = true;
        distLabel.appendChild(distCb);
        distLabel.appendChild(document.createTextNode('Dist. real'));
        distLabel.title = t('wellProfile.realDistanceTooltip');
        ctrlBar.appendChild(distLabel);
        const modeSelect = document.createElement('select');
        modeSelect.style.cssText = `
            height:28px;min-width:130px;padding:0 6px;border-radius:4px;
            border:1px solid var(--border-color,#2d3144);background:var(--input-bg,#0b1117);
            color:var(--text-color,#d1d5db);font-size:11px;
        `;
        modeSelect.innerHTML = `
            <option value="auto" selected>${t('wellProfile.autoMode')}</option>
            <option value="adjusted">${t('wellProfile.adjustedMode')}</option>
        `;
        ctrlBar.appendChild(modeSelect);
        const confBadge = document.createElement('span');
        confBadge.style.cssText = `
            font-size:11px;padding:2px 8px;border-radius:999px;
            border:1px solid var(--border-color,#2d3144);background:var(--surface-2,#121821);
            color:var(--text-color,#d1d5db);
        `;
        confBadge.textContent = t('wellProfile.confidenceNone');
        ctrlBar.appendChild(confBadge);
        const genBtn = document.createElement('button');
        genBtn.className = 'btn btn-sm btn-primary';
        genBtn.textContent = t('wellProfile.generateSection');
        ctrlBar.appendChild(genBtn);
        const adjustBtn = document.createElement('button');
        adjustBtn.className = 'btn btn-sm btn-secondary';
        adjustBtn.textContent = t('wellProfile.adjustContacts');
        ctrlBar.appendChild(adjustBtn);
        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn btn-sm btn-secondary';
        exportBtn.textContent = t('wellProfile.exportSvg');
        exportBtn.disabled = true;
        ctrlBar.appendChild(exportBtn);
        const mapLineBtn = document.createElement('button');
        mapLineBtn.className = 'btn btn-sm btn-secondary';
        mapLineBtn.textContent = t('wellProfile.traceLineOnMap');
        ctrlBar.appendChild(mapLineBtn);
        const addToReportBtn = document.createElement('button');
        addToReportBtn.className = 'btn btn-sm btn-secondary';
        addToReportBtn.textContent = t('wellProfile.addToReport');
        addToReportBtn.disabled = true;
        ctrlBar.appendChild(addToReportBtn);
        const presetSelect = document.createElement('select');
        presetSelect.style.cssText = `
            height:28px;min-width:150px;padding:0 6px;border-radius:4px;
            border:1px solid var(--border-color,#2d3144);background:var(--input-bg,#0b1117);
            color:var(--text-color,#d1d5db);font-size:11px;
        `;
        ctrlBar.appendChild(presetSelect);
        const savePresetBtn = document.createElement('button');
        savePresetBtn.className = 'btn btn-sm btn-secondary';
        savePresetBtn.textContent = t('wellProfile.savePreset');
        ctrlBar.appendChild(savePresetBtn);
        const delPresetBtn = document.createElement('button');
        delPresetBtn.className = 'btn btn-sm btn-secondary';
        delPresetBtn.textContent = t('wellProfile.removePreset');
        ctrlBar.appendChild(delPresetBtn);
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className = 'btn btn-sm btn-secondary';
        zoomOutBtn.textContent = '-';
        ctrlBar.appendChild(zoomOutBtn);
        const zoomDisplay = document.createElement('span');
        zoomDisplay.style.cssText = 'font-size:11px;min-width:44px;text-align:center;';
        zoomDisplay.textContent = t('wellProfile.percent100');
        ctrlBar.appendChild(zoomDisplay);
        const zoomInBtn = document.createElement('button');
        zoomInBtn.className = 'btn btn-sm btn-secondary';
        zoomInBtn.textContent = '+';
        ctrlBar.appendChild(zoomInBtn);
        const zoomResetBtn = document.createElement('button');
        zoomResetBtn.className = 'btn btn-sm btn-secondary';
        zoomResetBtn.textContent = t('wellProfile.percent100');
        ctrlBar.appendChild(zoomResetBtn);
        const svgContainer = document.createElement('div');
        svgContainer.style.cssText = `
            overflow:auto;flex:1;padding:12px;background: var(--surface-1,#0b1016);
            min-height:300px;
        `;
        const svgWrapper = document.createElement('div');
        svgWrapper.style.cssText = 'display:inline-block;transform-origin:top left;';
        svgContainer.appendChild(svgWrapper);
        svgWrapper.innerHTML =
            '<p style="font-size:11px;color:var(--neutral-400,#9ca3af);text-align:center;padding:40px 0;">Selecione os poços e clique em Gerar Seção.</p>';
        rightPanel.appendChild(ctrlBar);
        rightPanel.appendChild(svgContainer);
        body.appendChild(leftPanel);
        body.appendChild(splitter);
        body.appendChild(rightPanel);
        document.body.appendChild(overlay);
        // Splitter resize logic
        let resizing = false;
        let startX = 0;
        let startW = leftPanelWidth;
        const MIN_W = 220;
        const MAX_W = 520;
        const onMouseMove = (/** @type {MouseEvent} */ ev: any) => {
            if (!resizing)
                return;
            const dx = ev.clientX - startX;
            leftPanelWidth = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
            leftPanel.style.width = `${leftPanelWidth}px`;
        };
        const onMouseUp = () => {
            resizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        splitter.addEventListener('mousedown', (ev) => {
            resizing = true;
            startX = ev.clientX;
            startW = leftPanelWidth;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
        // Lista reordenável com distância entre poços
        for (const well of allWells) {
            const li = document.createElement('li');
            li.className = 'xs-well-item';
            li.draggable = true;
            li.dataset.wellId = well.id;
            li.style.cssText = `
                border:1px solid var(--border-color,#2d3144);border-radius:6px;
                background: var(--surface-2,#121821);padding:6px 8px;
                display:grid;grid-template-columns:14px 1fr auto;gap:6px;align-items:center;
            `;
            const handle = document.createElement('span');
            handle.textContent = t('wellProfile.dragHandle');
            handle.style.cssText = 'cursor:grab;color:var(--neutral-400,#9ca3af);user-select:none;';
            li.appendChild(handle);
            const cbLabel = document.createElement('label');
            cbLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.className = 'xs-well-cb';
            cbLabel.appendChild(cb);
            cbLabel.appendChild(document.createTextNode(well.name || well.id));
            li.appendChild(cbLabel);
            const distWrap = document.createElement('label');
            distWrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:10px;';
            const distInput = document.createElement('input');
            distInput.type = 'number';
            distInput.min = '1';
            distInput.step = '1';
            distInput.className = 'xs-dist-input';
            distInput.style.cssText = `
                width:64px;height:24px;padding:0 4px;border-radius:4px;
                border:1px solid var(--border-color,#2d3144);background:var(--input-bg,#0b1117);
                color:var(--text-color,#d1d5db);
            `;
            distInput.addEventListener('input', () => {
                manualDistanceInputs.add(distInput);
            });
            distWrap.appendChild(distInput);
            distWrap.appendChild(document.createTextNode('m'));
            li.appendChild(distWrap);
            listEl.appendChild(li);
            cb.addEventListener('change', () => {
                distInput.disabled = !cb.checked || li === listEl.firstElementChild;
                refreshDistances();
            });
        }
        const computeAutoDistance = (/** @type {any} */ prevWell: any, currWell: any) => {
            // Geometria pura: distância horizontal X-Z entre poços (m, ≥1).
            return computeHorizontalDistance(getWellRelPosition(prevWell), getWellRelPosition(currWell));
        };
        const getWellRelPosition = (w: any) => {
            const c = w?.data?.coordinates || {};
            if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
                const rel = wgs84ToRelative({
                    latitude: c.latitude,
                    longitude: c.longitude,
                    elevation: toFiniteNumber(c.elevation, 0),
                });
                return { x: rel.x || 0, y: rel.y || 0, z: rel.z || 0 };
            }
            if (Number.isFinite(c.easting) && Number.isFinite(c.northing)) {
                const absLikelyUtm = Math.abs(c.easting) > 100000 || Math.abs(c.northing) > 100000;
                if (absLikelyUtm) {
                    const origin = getOrigin();
                    const rel = utmToRelative({
                        easting: c.easting,
                        northing: c.northing,
                        elevation: toFiniteNumber(c.elevation, 0),
                        zone: c.zone || origin.zone,
                        hemisphere: c.hemisphere || origin.hemisphere,
                    });
                    return { x: rel.x || 0, y: rel.y || 0, z: rel.z || 0 };
                }
                // Coordenada relativa já no sistema local (x/z)
                return {
                    x: c.easting,
                    y: toFiniteNumber(c.elevation, 0),
                    z: c.northing,
                };
            }
            const p = w?.position;
            if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
                return { x: p.x, y: toFiniteNumber(p.y, 0), z: p.z };
            }
            return { x: 0, y: 0, z: 0 };
        };
        // toMetersXYFactory + projectWellAlongPolyline foram extraídos para
        // ./_wellProfileGeometryPure.js (ARCH-MONOLITH-ATOMIZATION-001, REFACTOR).
        // projectWellAlongPolyline é importado no topo do arquivo.
        const PRESET_KEY = 'ecbt.well.crossSection.presets.v1';
        const getPresets = () => {
            try {
                const raw = localStorage.getItem(PRESET_KEY) || '';
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return [];
            }
        };
        const setPresets = (presets: any[]) => {
            try {
                localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
            }
            catch (e: any) {
                console.debug('[wellProfile] preset-localstorage-write:', 
                /** @type {any} */ (e)?.message || e); /* original ignore */
            }
        };
        const renderPresetOptions = () => {
            const presets = getPresets();
            presetSelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = t('wellProfile.presetPlaceholder');
            presetSelect.appendChild(placeholder);
            for (const p of presets) {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                presetSelect.appendChild(opt);
            }
        };
        /** @type {Set<any>} */
        const manualDistanceInputs = new Set(); // inputs editados manualmente pelo usuário
        const refreshDistances = () => {
            const items = ([...listEl.querySelectorAll('.xs-well-item')]);
            let prevSelectedWell = null;
            let selectedCount = 0;
            for (const item of items) {
                const cb = item.querySelector('.xs-well-cb');
                const input = item.querySelector('.xs-dist-input');
                const well = allWells.find((w) => w.id === item.dataset.wellId);
                if (!cb || !input || !well)
                    continue;
                if (!cb.checked) {
                    input.disabled = true;
                    continue;
                }
                selectedCount++;
                if (!prevSelectedWell) {
                    input.value = '';
                    input.placeholder = t('wellProfile.dashPlaceholder');
                    input.disabled = true;
                }
                else {
                    if (!manualDistanceInputs.has(input)) {
                        input.value = String(computeAutoDistance(prevSelectedWell, well));
                    }
                    input.disabled = false;
                    input.placeholder = t('wellProfile.autoPlaceholder');
                }
                prevSelectedWell = well;
            }
            selectedSummary.textContent = t('wellProfile.selectedOfTotal', {
                selected: selectedCount,
                total: items.length,
            });
        };
        refreshDistances();
        renderPresetOptions();
        const applySearchFilter = () => {
            const q = (searchInput.value || '').trim().toLowerCase();
            /** @type {any[]} */ ([...listEl.querySelectorAll('.xs-well-item')]).forEach((item) => {
                const text = (item.textContent || '').toLowerCase();
                item.style.display = !q || text.includes(q) ? '' : 'none';
            });
        };
        searchInput.addEventListener('input', applySearchFilter);
        allBtn.addEventListener('click', () => {
            /** @type {any[]} */ ([...listEl.querySelectorAll('.xs-well-cb')]).forEach((cb) => {
                cb.checked = true;
            });
            refreshDistances();
        });
        noneBtn.addEventListener('click', () => {
            /** @type {any[]} */ ([...listEl.querySelectorAll('.xs-well-cb')]).forEach((cb) => {
                cb.checked = false;
            });
            refreshDistances();
        });
        /** @type {any} */
        let dragSrc: any = null;
        listEl.addEventListener('dragstart', (e) => {
            const item = (e.target)?.closest('.xs-well-item');
            if (!item)
                return;
            dragSrc = item;
            item.style.opacity = '0.5';
        });
        listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        listEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = (e.target)?.closest('.xs-well-item');
            if (!target || !dragSrc || target === dragSrc)
                return;
            listEl.insertBefore(dragSrc, target);
            dragSrc.style.opacity = '';
            dragSrc = null;
            refreshDistances();
        });
        listEl.addEventListener('dragend', () => {
            if (dragSrc)
                dragSrc.style.opacity = '';
            dragSrc = null;
        });
        savePresetBtn.addEventListener('click', async () => {
            const name = await asyncPrompt(t('wellProfile.sectionNamePrompt'), '', {
                placeholder: t('wellProfile.transectPlaceholder'),
                confirmLabel: 'Salvar',
                cancelLabel: 'Cancelar',
            });
            if (!name)
                return;
            const orderedItems = ([...listEl.querySelectorAll('.xs-well-item')]);
            const rows = orderedItems.map((item) => {
                const cb = (item.querySelector('.xs-well-cb'));
                const input = (item.querySelector('.xs-dist-input'));
                return {
                    wellId: item.dataset.wellId,
                    enabled: !!cb?.checked,
                    distance: Number.parseFloat(input?.value || ''),
                };
            });
            const presets = getPresets();
            const next = presets.filter((p) => p.name !== name);
            next.push({
                name,
                rows,
                options: {
                    mode: modeSelect.value,
                    showCorrelation: corrCb.checked,
                    showWaterLevel: wlCb.checked,
                    showInterpolationAreas: interpCb.checked,
                    showUncertainty: uncCb.checked,
                    showCota: cotaCb.checked,
                    showDistanceLabels: distCb.checked,
                },
                createdAt: Date.now(),
            });
            setPresets(next);
            renderPresetOptions();
            presetSelect.value = name;
        });
        presetSelect.addEventListener('change', () => {
            const name = presetSelect.value;
            if (!name)
                return;
            const preset = getPresets().find((p: any) => p.name === name);
            if (!preset?.rows?.length)
                return;
            const byId = new Map(preset.rows.map((r: any) => [r.wellId, r]));
            const orderedLis: any[] = [];
            for (const row of preset.rows) {
                const li = listEl.querySelector(`.xs-well-item[data-well-id="${row.wellId}"]`);
                if (li)
                    orderedLis.push(li);
            }
            const rest = ([...listEl.querySelectorAll('.xs-well-item')]).filter((li) => !byId.has(li.dataset.wellId));
            for (const li of [...orderedLis, ...rest]) {
                listEl.appendChild(li);
                const row: any = byId.get(li.dataset.wellId);
                const cb = li.querySelector('.xs-well-cb');
                const input = li.querySelector('.xs-dist-input');
                if (row && cb)
                    cb.checked = !!row.enabled;
                if (row && input && Number.isFinite(row.distance) && row.distance > 0) {
                    input.value = String(Math.round(row.distance));
                    manualDistanceInputs.add(input); // preservar distâncias salvas no preset
                }
            }
            if (preset.options) {
                modeSelect.value = preset.options.mode || 'auto';
                corrCb.checked = preset.options.showCorrelation !== false;
                wlCb.checked = preset.options.showWaterLevel !== false;
                interpCb.checked = preset.options.showInterpolationAreas !== false;
                uncCb.checked = preset.options.showUncertainty !== false;
                cotaCb.checked = !!preset.options.showCota;
                distCb.checked = preset.options.showDistanceLabels !== false;
            }
            refreshDistances();
        });
        delPresetBtn.addEventListener('click', () => {
            const name = presetSelect.value;
            if (!name)
                return;
            const next = getPresets().filter((p) => p.name !== name);
            setPresets(next);
            renderPresetOptions();
            presetSelect.value = '';
        });
        /** @type {any} */
        let lastSVG: any = null;
        /** @type {any[]} */
        let lastSelected: any[] = [];
        /** @type {any} */
        let lastRenderState: any = null;
        /** @type {Record<string, any>} */
        let manualEdits: AnyRecord = {};
        /** @type {any[]} */
        const editHistory: any[] = [];
        const getActor = async () => {
            try {
                const session = (await import('../../../../utils/auth/session.js'));
                return session.getCurrentUser?.()?.displayName || session.getUserEmail?.() || 'anonymous';
            }
            catch {
                return 'anonymous';
            }
        };
        const collectSelectedWellsAndDistances = () => {
            const orderedItems = ([...listEl.querySelectorAll('.xs-well-item')]);
            /** @type {any[]} */
            const selected: any[] = [];
            /** @type {Array<number|null>} */
            const customDistances: any[] = [];
            let firstSelected = true;
            for (const item of orderedItems) {
                const cb = item.querySelector('.xs-well-cb');
                if (!cb?.checked)
                    continue;
                const well = allWells.find((w) => w.id === item.dataset.wellId);
                if (!well)
                    continue;
                selected.push(well);
                if (firstSelected) {
                    firstSelected = false;
                    continue;
                }
                const input = item.querySelector('.xs-dist-input');
                const v = parseFloat(input?.value);
                customDistances.push(Number.isFinite(v) && v > 0 ? v : null);
            }
            return { selected, customDistances };
        };
        const wireSvgHandles = (svgEl: any) => {
            const pxPerM = parseFloat(svgEl?.dataset?.pxPerM || '8') || 8;
            const MIN_THICKNESS = 0.2; // m
            /** @type {any} */
            let dragTarget: any = null;
            let startClientY = 0;
            let startOffset = 0;
            const getCurrentOffset = (/** @type {string} */ key: any, kind: any) => {
                const rec = manualEdits[key] || {};
                return Number.isFinite(rec[kind === 'top' ? 'topOffset' : 'bottomOffset'])
                    ? rec[kind === 'top' ? 'topOffset' : 'bottomOffset']
                    : 0;
            };
            const clampWithStratigraphy = (/** @type {any} */ target: any, proposed: any) => {
                const key = target.dataset.key || '';
                const kind = target.dataset.kind || '';
                const baseDepth = parseFloat(target.dataset.baseDepth || '0') || 0;
                const otherKind = kind === 'top' ? 'bottom' : 'top';
                const otherHandle = svgEl.querySelector(`circle[data-handle="1"][data-key="${key}"][data-kind="${otherKind}"]`);
                const otherBase = parseFloat(otherHandle?.dataset?.baseDepth || '0') || 0;
                const otherOffset = getCurrentOffset(key, otherKind);
                const thisDepth = baseDepth + proposed;
                const otherDepth = otherBase + otherOffset;
                const [pairIdx] = String(key).split('|');
                const sameBandHandles = [...svgEl.querySelectorAll(`circle[data-handle="1"][data-kind="${kind}"]`)]
                    .filter((h: any) => String(h.dataset.key || '').startsWith(`${pairIdx}|`))
                    .map((h: any) => {
                    const hKey = h.dataset.key || '';
                    const hBase = parseFloat(h.dataset.baseDepth || '0') || 0;
                    const hOff = getCurrentOffset(hKey, kind);
                    return {
                        key: hKey,
                        baseDepth: hBase,
                        depth: hBase + hOff,
                    };
                })
                    .sort((/** @type {any} */ a, b) => a.baseDepth - b.baseDepth);
                const thisIdx = sameBandHandles.findIndex((h) => h.key === key);
                let boundedDepth = thisDepth;
                if (thisIdx > 0) {
                    const prev: any = sameBandHandles[thisIdx - 1];
                    boundedDepth = Math.max(boundedDepth, prev.depth + MIN_THICKNESS);
                }
                if (thisIdx >= 0 && thisIdx < sameBandHandles.length - 1) {
                    const nextH: any = sameBandHandles[thisIdx + 1];
                    boundedDepth = Math.min(boundedDepth, nextH.depth - MIN_THICKNESS);
                }
                if (kind === 'top') {
                    const maxDepth = otherDepth - MIN_THICKNESS;
                    return Math.min(boundedDepth, maxDepth) - baseDepth;
                }
                const minDepth = otherDepth + MIN_THICKNESS;
                return Math.max(boundedDepth, minDepth) - baseDepth;
            };
            const onMove = (/** @type {MouseEvent} */ ev: any) => {
                if (!dragTarget)
                    return;
                const dyPx = ev.clientY - startClientY;
                const deltaM = dyPx / pxPerM;
                let next = Math.round((startOffset + deltaM) * 10) / 10;
                next = clampWithStratigraphy(dragTarget, next);
                dragTarget.dataset.previewOffset = String(next);
                const baseDepth = parseFloat(dragTarget.dataset.baseDepth || '0') || 0;
                const nextY = parseFloat(svgEl.getAttribute('data-margin-top') || '40') + (baseDepth + next) * pxPerM;
                dragTarget.setAttribute('cy', String(nextY));
                startClientY = ev.clientY;
                startOffset = next;
            };
            const onUp = async () => {
                if (!dragTarget)
                    return;
                const key = dragTarget.dataset.key || '';
                const kind = dragTarget.dataset.kind || '';
                let next = parseFloat(dragTarget.dataset.previewOffset || '0');
                next = clampWithStratigraphy(dragTarget, next);
                if (!manualEdits[key])
                    manualEdits[key] = { topOffset: 0, bottomOffset: 0 };
                if (kind === 'top')
                    manualEdits[key].topOffset = next;
                if (kind === 'bottom')
                    manualEdits[key].bottomOffset = next;
                editHistory.push({
                    timestamp: new Date().toISOString(),
                    actor: await getActor(),
                    editsCount: Object.keys(manualEdits).length,
                });
                dragTarget = null;
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                renderSectionFromCurrentSelection(true);
            };
            svgEl.querySelectorAll('circle[data-handle="1"]').forEach((h: any) => {
                h.style.cursor = 'ns-resize';
                h.addEventListener('mousedown', (/** @type {MouseEvent} */ ev: any) => {
                    ev.preventDefault();
                    dragTarget = h;
                    startClientY = ev.clientY;
                    const key = h.dataset.key || '';
                    const kind = h.dataset.kind || '';
                    const current = manualEdits[key]?.[kind === 'top' ? 'topOffset' : 'bottomOffset'] || 0;
                    startOffset = current;
                    h.dataset.previewOffset = String(current);
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                });
            });
        };
        let zoomLevel = 1;
        const clampZoom = (/** @type {number} */ z: any) => Math.max(0.3, Math.min(3, z));
        const applyZoom = () => {
            zoomLevel = clampZoom(zoomLevel);
            zoomDisplay.textContent = t('wellProfile.percent100');
            if (!lastSVG)
                return;
            const baseW = parseFloat(lastSVG.dataset.baseWidth || lastSVG.getAttribute('width') || 0);
            const baseH = parseFloat(lastSVG.dataset.baseHeight || lastSVG.getAttribute('height') || 0);
            if (baseW > 0)
                lastSVG.setAttribute('width', String(Math.round(baseW * zoomLevel)));
            if (baseH > 0)
                lastSVG.setAttribute('height', String(Math.round(baseH * zoomLevel)));
            lastSVG.dataset.zoom = String(zoomLevel);
        };
        zoomOutBtn.addEventListener('click', () => {
            zoomLevel -= 0.1;
            applyZoom();
        });
        zoomInBtn.addEventListener('click', () => {
            zoomLevel += 0.1;
            applyZoom();
        });
        zoomResetBtn.addEventListener('click', () => {
            zoomLevel = 1;
            applyZoom();
        });
        svgContainer.addEventListener('wheel', (e) => {
            if (!lastSVG)
                return;
            e.preventDefault();
            zoomLevel += e.deltaY < 0 ? 0.1 : -0.1;
            applyZoom();
        }, { passive: false });
        mapLineBtn.addEventListener('click', async () => {
            try {
                if (!document.querySelector('link[href*="leaflet"]')) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
                    document.head.appendChild(link);
                }
                if (!window.L) {
                    await loadScriptCDN('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js', {
                        name: 'Leaflet',
                        globalVar: 'L',
                        timeout: 12000,
                    });
                }
            }
            catch (err: any) {
                console.error('[WellProfile] Falha ao carregar mapa:', err);
                return;
            }
            const { overlay: mapOverlay, body: mapBody, footer: mapFooter, } = buildModalShell({
                title: t('wellProfile.drawSectionLineTooltip'),
                width: '920px',
                onClose: () => mapOverlay.remove(),
            });
            if (mapFooter)
                mapFooter.style.display = 'none';
            mapBody.style.padding = '8px';
            const top = document.createElement('div');
            top.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;';
            top.innerHTML = `
                <span style="font-size:11px;">Clique no mapa para criar vértices da linha.</span>
                <label style="font-size:11px;display:flex;align-items:center;gap:4px;">Raio poço-linha (m)
                    <input data-field-meta="true" data-field-meta-key="auto:xs-map-threshold" id="xs-map-threshold" type="number" min="10" step="10" value="150"
                        style="width:80px;height:24px;padding:0 4px;border-radius:4px;border:1px solid var(--border-color,#2d3144);background:var(--input-bg,#0b1117);color:var(--text-color,#d1d5db);" />
                </label>
                <button class="btn btn-sm btn-secondary" id="xs-map-clear">${t('wellProfile.clear')}</button>
                <button class="btn btn-sm btn-primary" id="xs-map-apply">${t('wellProfile.applyLine')}</button>
            `;
            const mapDiv = document.createElement('div');
            mapDiv.style.cssText =
                'width:100%;height:460px;border:1px solid var(--border-color,#2d3144);border-radius:6px;';
            mapBody.appendChild(top);
            mapBody.appendChild(mapDiv);
            document.body.appendChild(mapOverlay);
            const L = (window.L);
            if (!L)
                throw new Error('Leaflet library unavailable');
            const centerWell = allWells[0];
            const cRel = getWellRelPosition(centerWell);
            const cGeo = relativeToWGS84(cRel);
            const map = L.map(mapDiv).setView([cGeo.latitude, cGeo.longitude], 16);
            const tileProviders = [
                {
                    url: 'https://tile.openfreemap.org/styles/liberty/{z}/{x}/{y}.png',
                    options: { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors' },
                },
                {
                    // CSP permite apenas *.tile.openstreetmap.org (com subdomínio)
                    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    options: { maxZoom: 20, subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors' },
                },
                {
                    // Fallback adicional permitido pela CSP atual
                    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
                    options: { maxZoom: 19, attribution: 'Sentinel-2 cloudless by EOX' },
                },
            ];
            /** @type {any} */
            let baseLayer: any = null;
            const loadProvider = (/** @type {number} */ idx: any) => {
                if (idx >= tileProviders.length)
                    return false;
                const p: any = tileProviders[idx];
                if (!p) return false;
                if (baseLayer)
                    map.removeLayer(baseLayer);
                baseLayer = L.tileLayer(p.url, p.options).addTo(map);
                let loaded = false;
                const failTimer = setTimeout(() => {
                    if (!loaded && idx + 1 < tileProviders.length) {
                        loadProvider(idx + 1);
                    }
                }, 2500);
                baseLayer.on('load', () => {
                    loaded = true;
                    clearTimeout(failTimer);
                });
                baseLayer.on('tileerror', () => {
                    if (!loaded && idx + 1 < tileProviders.length) {
                        clearTimeout(failTimer);
                        loadProvider(idx + 1);
                    }
                });
                return true;
            };
            loadProvider(0);
            const invalidateMapAfterLayout = () => {
                const invalidate = () => map.invalidateSize();
                requestAnimationFrame(() => {
                    invalidate();
                    requestAnimationFrame(invalidate);
                });
            };
            map.whenReady(invalidateMapAfterLayout);
            const wellLayer = L.layerGroup().addTo(map);
            const markerStack = new Map();
            for (const w of allWells) {
                const geo = relativeToWGS84(getWellRelPosition(w));
                const key = `${geo.latitude.toFixed(6)}:${geo.longitude.toFixed(6)}`;
                const n = markerStack.get(key) || 0;
                markerStack.set(key, n + 1);
                // Evita sobreposição total quando vários poços caem no mesmo pixel
                const ang = (n * 45 * Math.PI) / 180;
                const dLat = n === 0 ? 0 : Math.sin(ang) * 0.00003;
                const dLng = n === 0 ? 0 : Math.cos(ang) * 0.00003;
                L.circleMarker([geo.latitude, geo.longitude], {
                    radius: 4,
                    color: '#1d4ed8',
                    fillColor: '#60a5fa',
                    fillOpacity: 0.8,
                    weight: 1,
                })
                    .setLatLng([geo.latitude + dLat, geo.longitude + dLng])
                    .bindTooltip(w.name || w.id)
                    .addTo(wellLayer);
            }
            /** @type {any[]} */
            const linePts: any[] = [];
            const lineLayer = L.layerGroup().addTo(map);
            // eslint-disable-next-line
            let polyline: any = null;
            const redrawLine = () => {
                lineLayer.clearLayers();
                if (linePts.length > 0) {
                    linePts.forEach((p, i) => L.circleMarker(p, { radius: 4, color: '#ef4444' })
                        .bindTooltip(String(i + 1))
                        .addTo(lineLayer));
                }
                if (linePts.length >= 2) {
                    polyline = L.polyline(linePts, { color: '#f97316', weight: 3 }).addTo(lineLayer);
                }
                else {
                    polyline = null;
                }
            };
            map.on('click', (ev: any) => {
                linePts.push([ev.latlng.lat, ev.latlng.lng]);
                redrawLine();
            });
            top.querySelector('#xs-map-clear')?.addEventListener('click', () => {
                linePts.splice(0, linePts.length);
                redrawLine();
            });
            top.querySelector('#xs-map-apply')?.addEventListener('click', () => {
                if (linePts.length < 2)
                    return;
                const lineLL = linePts.map((p) => ({ lat: p[0], lng: p[1] }));
                const threshold = parseFloat(
                /** @type {HTMLInputElement|null} */ (top.querySelector('#xs-map-threshold'))?.value || '') || 150;
                const projected = allWells
                    .map((w: any) => {
                    const geo = relativeToWGS84(getWellRelPosition(w));
                    const prj = projectWellAlongPolyline({ lat: geo.latitude, lng: geo.longitude }, lineLL);
                    return prj ? { well: w, ...prj } : null;
                })
                    .filter(Boolean);
                const selected: any[] = projected
                    .filter((p: any) => p.dist <= threshold)
                    .sort((a: any, b: any) => a.chain - b.chain);
                const finalSelected = selected.length >= 2
                    ? selected
                    : [...projected as any[]]
                        .sort((a: any, b: any) => a.dist - b.dist)
                        .slice(0, Math.min(2, projected.length))
                        .sort((/** @type {any} */ a, b) => a.chain - b.chain);
                if (finalSelected.length < 2)
                    return;
                const selectedIds = new Set(finalSelected.map((s: any) => s.well.id));
                const selectedOrder = finalSelected.map((s: any) => s.well.id);
                const remaining = allWells.map((w) => w.id).filter((id) => !selectedIds.has(id));
                const finalOrder = [...selectedOrder, ...remaining];
                for (const id of finalOrder) {
                    const li = listEl.querySelector(`.xs-well-item[data-well-id="${id}"]`);
                    if (li)
                        listEl.appendChild(li);
                }
                /** @type {any[]} */ ([...listEl.querySelectorAll('.xs-well-item')]).forEach((li) => {
                    const id = li.dataset.wellId || '';
                    const cb = li.querySelector('.xs-well-cb');
                    if (cb)
                        cb.checked = selectedIds.has(id);
                });
                /** @type {number|null} */
                let prev: any = null;
                for (const s of /** @type {any[]} */ (finalSelected)) {
                    const li = listEl.querySelector(`.xs-well-item[data-well-id="${s.well.id}"]`);
                    const input = (li?.querySelector('.xs-dist-input') || null);
                    if (!input)
                        continue;
                    if (prev == null) {
                        input.value = '';
                    }
                    else {
                        input.value = String(Math.max(1, Math.round(s.chain - prev)));
                    }
                    prev = s.chain;
                }
                refreshDistances();
                mapOverlay.remove();
            });
        });
        adjustBtn.addEventListener('click', async () => {
            const { selected } = collectSelectedWellsAndDistances();
            if (selected.length < 2)
                return;
            const [{ buildInterpretation }, { buildModalShell: openModal }] = await Promise.all([
                import('./stratigraphyEngine.js'),
                import('../../../../utils/ui/modals.js'),
            ]);
            const interp = buildInterpretation(selected, {
                confidenceThreshold: modeSelect.value === 'adjusted' ? 0.38 : 0.48,
            });
            const { overlay: editOverlay, body: editBody, footer: editFooter, } = openModal({
                title: t('wellProfile.adjustContactsTooltip'),
                width: '980px',
                onClose: () => editOverlay.remove(),
            });
            if (editFooter)
                editFooter.style.display = 'none';
            const tableWrap = document.createElement('div');
            tableWrap.style.cssText =
                'max-height:460px;overflow:auto;border:1px solid var(--border-color,#2d3144);border-radius:6px;';
            const table = document.createElement('table');
            table.style.cssText = 'width:100%;font-size:11px;border-collapse:collapse;';
            table.innerHTML = `
                <thead><tr style="position:sticky;top:0;background:var(--surface-2,#121821);">
                    <th style="text-align:left;padding:6px;">${t('wellProfile.pair')}</th>
                    <th style="text-align:left;padding:6px;">${t('wellProfile.unit')}</th>
                    <th style="text-align:left;padding:6px;">${t('wellProfile.score')}</th>
                    <th style="text-align:left;padding:6px;">Offset topo (m)</th>
                    <th style="text-align:left;padding:6px;">Offset base (m)</th>
                </tr></thead>
                <tbody></tbody>
            `;
            const tbody = (table.querySelector('tbody'));
            if (!tbody)
                return;
            for (const pair of interp.pairs) {
                for (const seg of pair.segments) {
                    if (seg.discontinuity || !seg.left || !seg.right)
                        continue;
                    const key = `${pair.pairIndex}|${seg.leftIndex ?? 'x'}|${seg.rightIndex ?? 'x'}`;
                    const row = document.createElement('tr');
                    const curr = (manualEdits[key] || {});
                    row.innerHTML = `
                        <td style="padding:4px 6px;">${pair.leftWell.name || pair.leftWell.id} → ${pair.rightWell.name || pair.rightWell.id}</td>
                        <td style="padding:4px 6px;">${seg.soilType}</td>
                        <td style="padding:4px 6px;">${Math.round(seg.score * 100)}%</td>
                        <td style="padding:4px 6px;"><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2230" data-kind="top" data-key="${key}" type="number" step="0.1" value="${toFiniteNumber(curr.topOffset, 0)}" style="width:90px;" /></td>
                        <td style="padding:4px 6px;"><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2231" data-kind="bottom" data-key="${key}" type="number" step="0.1" value="${toFiniteNumber(curr.bottomOffset, 0)}" style="width:90px;" /></td>
                    `;
                    tbody.appendChild(row);
                }
            }
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm btn-secondary';
            resetBtn.textContent = t('wellProfile.resetAdjustments');
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-sm btn-primary';
            saveBtn.textContent = t('wellProfile.saveAdjustments');
            actions.appendChild(resetBtn);
            actions.appendChild(saveBtn);
            tableWrap.appendChild(table);
            editBody.appendChild(tableWrap);
            editBody.appendChild(actions);
            document.body.appendChild(editOverlay);
            resetBtn.addEventListener('click', () => {
                manualEdits = {};
                /** @type {HTMLInputElement[]} */ ([...tbody.querySelectorAll('input[type="number"]')]).forEach((inp) => {
                    inp.value = '0';
                });
            });
            saveBtn.addEventListener('click', async () => {
                /** @type {Record<string, any>} */
                const nextEdits: AnyRecord = {};
                for (const inp of /** @type {HTMLInputElement[]} */ ([
                    ...tbody.querySelectorAll('input[type="number"]'),
                ])) {
                    const key = inp.dataset.key || '';
                    const kind = inp.dataset.kind || '';
                    const v = parseFloat(inp.value);
                    if (!Number.isFinite(v) || Math.abs(v) < 1e-6)
                        continue;
                    if (!nextEdits[key])
                        nextEdits[key] = { topOffset: 0, bottomOffset: 0 };
                    if (kind === 'top')
                        nextEdits[key].topOffset = v;
                    if (kind === 'bottom')
                        nextEdits[key].bottomOffset = v;
                }
                manualEdits = nextEdits;
                editHistory.push({
                    timestamp: new Date().toISOString(),
                    actor: await getActor(),
                    editsCount: Object.keys(nextEdits).length,
                });
                editOverlay.remove();
            });
        });
        const renderSectionFromCurrentSelection = (preserveZoom = false) => {
            const { selected, customDistances } = collectSelectedWellsAndDistances();
            if (selected.length < 2) {
                svgWrapper.innerHTML =
                    '<p style="font-size:11px;color:#d97706;text-align:center;padding:20px;">Selecione ao menos 2 poços.</p>';
                exportBtn.disabled = true;
                confBadge.textContent = t('wellProfile.confidenceNone');
                return;
            }
            const svgEl = buildCrossSectionSVG(selected, {
                preserveOrder: true,
                customDistances,
                showCorrelation: corrCb.checked,
                showWaterLevel: wlCb.checked,
                showInterpolationAreas: interpCb.checked,
                showUncertainty: uncCb.checked,
                showCota: cotaCb.checked,
                showDistanceLabels: distCb.checked,
                confidenceThreshold: modeSelect.value === 'adjusted' ? 0.38 : 0.48,
                manualEdits,
                showEditHandles: editSvgCb.checked,
            });
            if (!svgEl) {
                svgWrapper.innerHTML =
                    '<p style="font-size:11px;color:#dc2626;text-align:center;padding:20px;">Não foi possível gerar a seção. Verifique se os poços possuem camadas litológicas.</p>';
                exportBtn.disabled = true;
                lastSVG = null;
                confBadge.textContent = t('wellProfile.confidenceNone');
                return;
            }
            svgWrapper.innerHTML = '';
            svgWrapper.appendChild(svgEl);
            if (editSvgCb.checked)
                wireSvgHandles(svgEl);
            exportBtn.disabled = false;
            addToReportBtn.disabled = false;
            lastSVG = svgEl;
            lastSelected = selected;
            lastRenderState = {
                mode: modeSelect.value,
                showCorrelation: corrCb.checked,
                showWaterLevel: wlCb.checked,
                showInterpolationAreas: interpCb.checked,
                showUncertainty: uncCb.checked,
                showCota: cotaCb.checked,
                showDistanceLabels: distCb.checked,
                confidenceMean: parseFloat(svgEl.dataset.confidenceMean || '0') || 0,
                confidenceThreshold: parseFloat(svgEl.dataset.confidenceThreshold || '0') || 0,
                manualEditsCount: Object.keys(manualEdits || {}).length,
                generatedAt: new Date().toISOString(),
            };
            const confidencePct = Math.round(lastRenderState.confidenceMean * 100);
            confBadge.textContent = t('wellProfile.confidencePercent', { percent: confidencePct });
            confBadge.style.borderColor = confidencePct >= 70 ? '#16a34a' : confidencePct >= 45 ? '#d97706' : '#dc2626';
            svgEl.dataset.baseWidth = svgEl.getAttribute('width') || '0';
            svgEl.dataset.baseHeight = svgEl.getAttribute('height') || '0';
            if (!preserveZoom)
                zoomLevel = 1;
            applyZoom();
            // Wire export
            exportBtn.onclick = () => {
                const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'cross-section.svg';
                a.click();
                URL.revokeObjectURL(url);
            };
        };
        // Gerar seção ao clicar
        genBtn.addEventListener('click', () => renderSectionFromCurrentSelection());
        editSvgCb.addEventListener('change', () => {
            if (lastSVG)
                renderSectionFromCurrentSelection();
        });
        cotaCb.addEventListener('change', () => {
            if (lastSVG)
                renderSectionFromCurrentSelection(true);
        });
        distCb.addEventListener('change', () => {
            if (lastSVG)
                renderSectionFromCurrentSelection(true);
        });
        addToReportBtn.addEventListener('click', async () => {
            if (!lastSVG)
                return;
            const esc = (s: any) => String(s || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            const svgToPngDataUrl = (svgEl: any) => new Promise((resolve, reject) => {
                const svgTxt = svgEl.outerHTML;
                const svgBlob = new Blob([svgTxt], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                const img = new Image();
                img.onload = () => {
                    const baseW = parseFloat(svgEl.dataset.baseWidth || svgEl.getAttribute('width') || 1200);
                    const baseH = parseFloat(svgEl.dataset.baseHeight || svgEl.getAttribute('height') || 600);
                    const scale = 2;
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(baseW * scale));
                    canvas.height = Math.max(1, Math.round(baseH * scale));
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Canvas 2D context is unavailable'));
                        return;
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    reject(e);
                };
                img.src = url;
            });
            let imageSrc: string;
            try {
                imageSrc = String(await svgToPngDataUrl(lastSVG));
            }
            catch {
                imageSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(lastSVG.outerHTML)}`;
            }
            const names = lastSelected.map((w) => w.name || w.id).join(', ');
            const confidencePct = Math.round((lastRenderState?.confidenceMean || 0) * 100);
            const latestEdit = editHistory[editHistory.length - 1];
            const snippet = `
<figure style="margin:12px 0;padding:10px;border:1px solid #d1d5db;border-radius:8px;">
  <img src="${imageSrc}" alt="Seção geológica transversal (${esc(names)})" style="width:100%;height:auto;display:block;border:1px solid #e5e7eb;border-radius:6px;" />
  <figcaption style="margin-top:6px;font-size:12px;color:#4b5563;">
    Seção geológica transversal — ${esc(names)}.<br/>
    Modo: <strong>${esc(lastRenderState?.mode || 'auto')}</strong> |
    Correlação: ${lastRenderState?.showCorrelation ? 'ON' : 'OFF'} |
    Interpolar áreas: ${lastRenderState?.showInterpolationAreas ? 'ON' : 'OFF'} |
    Incerteza: ${lastRenderState?.showUncertainty ? 'ON' : 'OFF'} |
    Confiança média: ${confidencePct}% |
    Ajustes manuais: ${lastRenderState?.manualEditsCount || 0}${latestEdit ? ` (último por ${esc(latestEdit.actor)} em ${esc(latestEdit.timestamp)})` : ''}.
  </figcaption>
</figure><p></p>`;
            try {
                // eslint-disable-next-line
                const [{ setReportContent, getReport }, { showToast }] = await Promise.all([
                    import('../../../../utils/report/manager.js'),
                    import('../../../../utils/ui/toast.js'),
                ]);
                const editorEl = document.getElementById('report-editor-content');
                if (editorEl && editorEl.isContentEditable) {
                    editorEl.focus();
                    document.execCommand('insertHTML', false, snippet);
                    setReportContent(editorEl.innerHTML);
                }
                else {
                    const report = getReport();
                    setReportContent((report.content || '') + snippet);
                }
                window.switchConstellationTab?.('report');
                /** @type {any} */ (window).showToast?.(t('wellProfile.sectionAddedToReport'), 'success');
            }
            catch (err: any) {
                console.error('[WellProfile] Falha ao adicionar seção no Report:', err);
            }
        });
    }
    // ----------------------------------------------------------------
    // EDITOR - Inline editing of lithologic and constructive layers
    // ----------------------------------------------------------------
    _toggleEditor() {
        const editorEl = (this._container?.querySelector('.ecbt-fm-well__editor') || null);
        if (!editorEl)
            return;
        const isVisible = editorEl.style.display !== 'none';
        if (isVisible) {
            editorEl.style.display = 'none';
        }
        else {
            this._renderEditor(editorEl);
            editorEl.style.display = '';
        }
    }
    _renderEditor(/** @type {HTMLElement} */ editorEl: any) {
        const profile = this._element?.data?.profile || this.getDefaultData();
        // eslint-disable-next-line
        const depth = this._element?.data?.construction?.totalDepth || profile?.constructive?.totalDepth || 50;
        const lithoLayers = profile.lithologic || [];
        const constrElements = profile.constructive?.elements || [];
        // eslint-disable-next-line
        const soilOptions = Object.entries(SOIL_LABELS)
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join('');
        // eslint-disable-next-line
        const constrOptions = Object.entries(CONSTR_LABELS)
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join('');
        editorEl.innerHTML = `
            <div style="padding:8px;font-size:11px;border-top:1px solid var(--neutral-200,#e5e7eb);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <strong>Lithologic Layers (${lithoLayers.length})</strong>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__add-litho">+ Layer</button>
                </div>
                <table style="width:100%;font-size:10px;border-collapse:collapse;">
                    <thead><tr style="background:var(--neutral-100,#f5f5f5);">
                        <th style="padding:2px 4px;text-align:left;">From (m)</th>
                        <th style="padding:2px 4px;text-align:left;">To (m)</th>
                        <th style="padding:2px 4px;text-align:left;">${t('wellProfile.soilType')}</th>
                        <th style="padding:2px 4px;text-align:left;">${t('wellProfile.description')}</th>
                        <th style="padding:2px 4px;text-align:left;">${t('wellProfile.sucs')}</th>
                        <th style="padding:2px 4px;text-align:left;">${t('wellProfile.consistency')}</th>
                        <th></th>
                    </tr></thead>
                    <tbody class="ecbt-fm-well__litho-rows">
                        ${lithoLayers
            .map((/** @type {any} */ l: any, i: any) => {
            const st = l.soilType || l.type || 'clay';
            const swatchColor = SOIL_COLORS[String(st)] || '#ccc';
            const soilOpts = Object.entries(SOIL_LABELS)
                .map(([k, v]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${v}</option>`)
                .join('');
            const consopts = _getConsistencyOptions(st, l.consistency || '');
            return `
                        <tr data-idx="${i}">
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2502" type="number" value="${l.from}" step="0.5" style="width:50px;font-size:10px;" data-field="from"></td>
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2503" type="number" value="${l.to}" step="0.5" style="width:50px;font-size:10px;" data-field="to"></td>
                            <td>
                                <div style="display:flex;align-items:center;gap:3px;">
                                    <span class="ecbt-fm-well__soil-swatch" style="display:inline-block;width:11px;height:11px;border-radius:2px;border:1px solid #888;background:${swatchColor};flex-shrink:0;"></span>
                                    <select data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:select:L2507" style="font-size:10px;flex:1;min-width:80px;" data-field="soilType">${soilOpts}</select>
                                </div>
                            </td>
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2510" type="text" value="${l.description || ''}" style="width:80px;font-size:10px;" data-field="description"></td>
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2511" type="text" value="${l.sucs || ''}" placeholder="CL…" style="width:36px;font-size:10px;" title="${t('wellProfile.sucsTooltip')}" data-field="sucs"></td>
                            <td><select data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:select:L2512" style="font-size:10px;" data-field="consistency">${consopts}</select></td>
                            <td><button class="ecbt-fm-well__del-litho" data-idx="${i}" style="cursor:pointer;color:var(--error,red);border:none;background:none;">&#10005;</button></td>
                        </tr>`;
        })
            .join('')}
                    </tbody>
                </table>

                <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px;">
                    <strong>Constructive Elements (${constrElements.length})</strong>
                    <button class="btn btn-sm btn-secondary ecbt-fm-well__add-constr">+ Element</button>
                </div>
                <table style="width:100%;font-size:10px;border-collapse:collapse;">
                    <thead><tr style="background:var(--neutral-100,#f5f5f5);">
                        <th style="padding:2px 4px;text-align:left;">Topo (m)</th>
                        <th style="padding:2px 4px;text-align:left;">Base (m)</th>
                        <th style="padding:2px 4px;text-align:left;">${t('wellProfile.type')}</th>
                        <th></th>
                    </tr></thead>
                    <tbody class="ecbt-fm-well__constr-rows">
                        ${constrElements
            .map((/** @type {any} */ c: any, i: any) => {
            const top = c.topDepth ?? c.from ?? 0;
            const bot = c.bottomDepth ?? c.to ?? 0;
            const constrOpts = Object.entries(CONSTR_LABELS)
                .map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`)
                .join('');
            return `
                        <tr data-idx="${i}">
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2544" type="number" value="${top}" step="0.5" style="width:50px;font-size:10px;" data-field="topDepth"></td>
                            <td><input data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:input:L2545" type="number" value="${bot}" step="0.5" style="width:50px;font-size:10px;" data-field="bottomDepth"></td>
                            <td><select data-field-meta="true" data-field-meta-key="auto-pos:WellProfileModule:select:L2546" style="font-size:10px;" data-field="type">${constrOpts}</select></td>
                            <td><button class="ecbt-fm-well__del-constr" data-idx="${i}" style="cursor:pointer;color:var(--error,red);border:none;background:none;">&#10005;</button></td>
                        </tr>`;
        })
            .join('')}
                    </tbody>
                </table>

                <div style="margin-top:8px;text-align:right;">
                    <button class="btn btn-sm btn-primary ecbt-fm-well__save-profile">${t('wellProfile.saveProfile')}</button>
                </div>
            </div>
        `;
        // Wire events
        editorEl.querySelector('.ecbt-fm-well__add-litho')?.addEventListener('click', () => {
            const lastTo = lithoLayers.length > 0 ? lithoLayers[lithoLayers.length - 1].to : 0;
            this._addLithoLayer({
                from: lastTo,
                to: lastTo + 5,
                soilType: 'clay',
                description: '',
                sucs: '',
                consistency: '',
                moisture: '',
                observations: '',
                color: '',
            });
        });
        editorEl.querySelector('.ecbt-fm-well__add-constr')?.addEventListener('click', () => {
            const lastTo = constrElements.length > 0 ? constrElements[constrElements.length - 1].to : 0;
            this._addConstrElement({ from: lastTo, to: lastTo + 5, type: 'blank_casing' });
        });
        editorEl.querySelectorAll('.ecbt-fm-well__del-litho').forEach((btn: any) => {
            btn.addEventListener('click', () => this._removeLithoLayer(parseInt(btn.dataset.idx)));
        });
        editorEl.querySelectorAll('.ecbt-fm-well__del-constr').forEach((btn: any) => {
            btn.addEventListener('click', () => this._removeConstrElement(parseInt(btn.dataset.idx)));
        });
        editorEl.querySelector('.ecbt-fm-well__save-profile')?.addEventListener('click', () => {
            this._saveEditorState(editorEl);
        });
        // Atualiza swatch ao mudar tipo de solo
        editorEl.querySelectorAll('[data-field="soilType"]').forEach((sel: any) => {
            sel.addEventListener('change', () => {
                const swatch = sel.closest('td')?.querySelector('.ecbt-fm-well__soil-swatch');
                if (swatch)
                    swatch.style.background = SOIL_COLORS[String(sel.value)] || '#ccc';
                // Recarrega opções de consistência conforme tipo
                const row = sel.closest('tr');
                const consSel = row?.querySelector('[data-field="consistency"]');
                if (consSel) {
                    const curVal = consSel.value;
                    consSel.innerHTML = _getConsistencyOptions(sel.value, curVal);
                }
            });
        });
    }
    _ensureProfile() {
        if (!this._element?.data)
            return;
        if (!this._element.data.profile) {
            this._element.data.profile = this.getDefaultData();
        }
    }
    _addLithoLayer(layer: any) {
        this._ensureProfile();
        if (!this._element.data.profile.lithologic)
            this._element.data.profile.lithologic = [];
        this._element.data.profile.lithologic.push(layer);
        this._render();
        this._toggleEditor(); // Re-open editor
    }
    _removeLithoLayer(/** @type {number} */ idx: any) {
        this._ensureProfile();
        this._element.data.profile.lithologic?.splice(idx, 1);
        this._render();
        this._toggleEditor();
    }
    _addConstrElement(elem: any) {
        this._ensureProfile();
        if (!this._element.data.profile.constructive) {
            this._element.data.profile.constructive = { totalDepth: 50, elements: [] };
        }
        if (!this._element.data.profile.constructive.elements) {
            this._element.data.profile.constructive.elements = [];
        }
        this._element.data.profile.constructive.elements.push(elem);
        this._render();
        this._toggleEditor();
    }
    _removeConstrElement(/** @type {number} */ idx: any) {
        this._ensureProfile();
        this._element.data.profile.constructive?.elements?.splice(idx, 1);
        this._render();
        this._toggleEditor();
    }
    _saveEditorState(/** @type {HTMLElement} */ editorEl: any) {
        this._ensureProfile();
        const profile = this._element.data.profile;
        // Read litho rows - preserva campos não exibidos no editor (moisture, observations, color)
        const lithoRows = ([...editorEl.querySelectorAll('.ecbt-fm-well__litho-rows tr')]);
        const origLitho = profile.lithologic || [];
        profile.lithologic = lithoRows.map((row) => {
            const origIdx = parseInt(row.dataset.idx);
            const orig = origLitho[origIdx] || {};
            return {
                ...orig,
                from: parseFloat(row.querySelector('[data-field="from"]')?.value || '') || 0,
                to: parseFloat(row.querySelector('[data-field="to"]')?.value || '') || 0,
                soilType: row.querySelector('[data-field="soilType"]')?.value || 'clay',
                description: row.querySelector('[data-field="description"]')?.value || '',
                sucs: row.querySelector('[data-field="sucs"]')?.value || '',
                consistency: row.querySelector('[data-field="consistency"]')?.value || '',
            };
        });
        // Read constr rows - usa topDepth/bottomDepth (campo correto do modelo)
        const constrRows = ([...editorEl.querySelectorAll('.ecbt-fm-well__constr-rows tr')]);
        if (!profile.constructive)
            profile.constructive = { totalDepth: 50, elements: [] };
        const origConstr = profile.constructive.elements || [];
        profile.constructive.elements = constrRows.map((row) => {
            const origIdx = parseInt(row.dataset.idx);
            const orig = origConstr[origIdx] || {};
            return {
                ...orig,
                topDepth: parseFloat(row.querySelector('[data-field="topDepth"]')?.value || '') || 0,
                bottomDepth: parseFloat(row.querySelector('[data-field="bottomDepth"]')?.value || '') || 0,
                type: row.querySelector('[data-field="type"]')?.value || 'blank_casing',
            };
        });
        // Re-render SVG
        this._render();
        // Notify ecbyts that element changed
        try {
            const { updateElement } = window;
            if (typeof updateElement === 'function') {
                updateElement(this._element.id, { data: this._element.data });
            }
        }
        catch (e: any) {
            console.debug('[wellProfile] update-element-after-stratigraphy:', 
            /** @type {any} */ (e)?.message || e); /* original silent */
        }
        // Update 3D mesh with new profile
        this._update3DMesh();
    }
    /**
     * Atualiza a mesh 3D do poço com os novos dados do profile.
     * Recria a representação 3D com textura litológica e elementos construtivos.
     */
    async _update3DMesh() {
        if (!this._element?.id)
            return;
        try {
            // Importa funções do wellProfile3D
            const { createWellProfile3D } = await import('./wellProfile3D.js');
            // Encontra a mesh 3D existente na cena
            const findMesh = () => {
                const elementsGroup = window._scene?.getObjectByName('elements');
                if (!elementsGroup)
                    return null;
                return elementsGroup.children.find((child: any) => child.userData?.elementId === this._element.id);
            };
            const existingGroup = findMesh();
            if (!existingGroup)
                return;
            // Cria novo grupo de profile
            const newProfileGroup = createWellProfile3D(this._element);
            if (!newProfileGroup)
                return;
            // Preserva transformação de posição do grupo existente
            newProfileGroup.position.copy(existingGroup.position);
            // Remove filhos antigos do grupo existente (mantém o grupo pai)
            while (existingGroup.children.length > 0) {
                const child = existingGroup.children[0];
                existingGroup.remove(child);
                // Dispose recursos
                if (child.geometry)
                    child.geometry.dispose();
                if (child.material) {
                    if (child.material.map)
                        child.material.map.dispose();
                    child.material.dispose();
                }
            }
            // Adiciona novos filhos
            while (newProfileGroup.children.length > 0) {
                existingGroup.add(newProfileGroup.children[0]);
            }
            // Atualiza metadata
            existingGroup.userData.profileVersion = Date.now();
            existingGroup.userData.hasProfile = true;
            // Solicita re-render da cena
            if (typeof window.requestRender === 'function') {
                window.requestRender();
            }
            console.debug(`[WellProfileModule] 3D mesh updated for ${this._element.id}`);
        }
        catch (err: any) {
            console.warn('[WellProfileModule] Failed to update 3D mesh:', err);
        }
    }
    /**
     * Handler de exportacao SVG.
     */
    _handleExport() {
        const svg = this.exportSVG();
        if (!svg)
            return;
        // Download como arquivo
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this._element?.name || 'well-profile'}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
//# sourceMappingURL=WellProfileModule.js.map
