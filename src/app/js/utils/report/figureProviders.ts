// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Provedores de figura built-in, AUTO-REGISTRADOS. Importar este módulo (side-effect)
// registra os provedores nativos no figureProviderRegistry. Futuras features (ou funções
// implementadas por usuários) registram os seus do mesmo jeito — o bot/UI descobrem todos.
//
// Provedores podem enumerar CANDIDATOS (recortes do dataset): ex. o raio por área/zona ou
// por pluma (contaminante/aquífero), para o usuário SELECIONAR quais figuras inserir.
import { registerFigureProvider } from '../../core/report/figureProviderRegistry.js';
import { getElementGroups, getElementGroup } from '../groups/manager.js';

const _hasPos = (e: any) => !!(e?.position || e?.data?.position);

function _groups(): any[] {
    try {
        return getElementGroups() || [];
    } catch (e: any) {
        console.debug('[figureProviders:groups]', e?.message || e);
        return [];
    }
}
function _groupOf(id: any): string | null {
    try {
        return getElementGroup(id);
    } catch {
        return null;
    }
}

/** Recorta os elementos conforme o scope do candidato (grupo/área ou pluma + sua área). */
function _slice(elements: any[], scope: any): any[] {
    const els = Array.isArray(elements) ? elements : [];
    if (!scope) return els;
    if (scope.groupId) return els.filter((e) => _groupOf(e?.id) === scope.groupId);
    if (scope.plumeId) {
        const plume = els.find((e) => e?.id === scope.plumeId);
        const gid = plume ? _groupOf(plume.id) : null;
        return els.filter((e) => e?.id === scope.plumeId || (gid && _groupOf(e?.id) === gid));
    }
    return els;
}

// (1) Raio de 500 m (GAC) — scope-aware: todos / por área-zona / por pluma (recorte).
registerFigureProvider({
    id: 'radius-500m',
    label: 'Raio de 500 m (GAC)',
    order: 10,
    isApplicable: (ctx: any) => Array.isArray(ctx?.elements) && ctx.elements.some(_hasPos),
    listCandidates: (ctx: any) => {
        const els = (ctx?.elements || []).filter(_hasPos);
        const groups = _groups();
        const cands: any[] = [{ candidateId: 'all', label: 'Raio 500 m — todos os elementos', scope: null }];
        for (const g of groups) {
            if (els.some((e: any) => _groupOf(e?.id) === g.id)) {
                cands.push({ candidateId: `group:${g.id}`, label: `Raio 500 m — ${g.name || g.id}`, scope: { groupId: g.id } });
            }
        }
        for (const pl of els.filter((e: any) => e?.family === 'plume')) {
            const gid = _groupOf(pl.id);
            const gname = gid ? groups.find((g: any) => g.id === gid)?.name || '' : '';
            const lbl = `Pluma — ${pl?.name || pl?.id}${gname ? ` · ${gname}` : ''}`;
            cands.push({ candidateId: `plume:${pl.id}`, label: lbl, scope: { plumeId: pl.id } });
        }
        return cands;
    },
    generate: async (ctx: any, candidate: any) => {
        const { buildRadiusPlanDataUrl }: any = await import('./_radiusPlanRenderer.js' as string);
        const els = _slice(ctx?.elements || [], candidate?.scope);
        if (!els.length) return null;
        const label = candidate?.label || 'Entorno — raio de 500 m (GAC, CETESB DD 038/2017)';
        // Cartografia: PRIMÁRIO = família blueprint (DXF/CAD surveyado) per diretiva
        // Calvin 2026-05-29. SECUNDÁRIO = basemap aéreo top-down (Fase 1.7).
        // Degradação graciosa avisa explicitamente quando não há nem um nem outro.
        const allEls: any[] = Array.isArray(ctx?.elements) ? ctx.elements : [];
        const blueprintElements = allEls.filter((e: any) => e?.family === 'blueprint' && Array.isArray(e?.data?.vertices));
        let basemapDataUrl: string | undefined;
        let source: string;
        if (blueprintElements.length > 0) {
            const names = blueprintElements.map((b: any) => b?.name).filter(Boolean).slice(0, 3).join(', ');
            source = `Cartografia: blueprint DXF/CAD${names ? ` (${names})` : ''}`;
        } else {
            source = 'Sem blueprint cartográfico — esquemático';
        }
        // Aerial top-down como camada adicional (não substitui blueprint).
        try {
            const { captureTopDownBasemap }: any = await import('../scene/captureTopDown.js' as string);
            let sumX = 0;
            let sumZ = 0;
            let n = 0;
            for (const el of els) {
                const p = el?.position || el?.data?.position;
                if (p && typeof p.x === 'number' && typeof p.z === 'number') {
                    sumX += p.x;
                    sumZ += p.z;
                    n++;
                }
            }
            if (n > 0) {
                const cap = await captureTopDownBasemap({
                    centroidX: sumX / n,
                    centroidZ: sumZ / n,
                    radiusM: 1000, // espelha o R_outer da figura (raio de contexto)
                    padding: 0.1,
                });
                if (cap) {
                    basemapDataUrl = cap;
                    if (blueprintElements.length === 0) {
                        source = 'Basemap: viewport ecbyts (top-down) — sem blueprint';
                    } else {
                        source += ' + basemap aéreo';
                    }
                }
            }
        } catch (e: any) {
            console.debug('[radius-500m:basemap]', e?.message || e);
        }
        return {
            dataUrl: buildRadiusPlanDataUrl(els, {
                radiusM: 500,
                title: label,
                basemapDataUrl,
                blueprintElements: blueprintElements.length > 0 ? blueprintElements : undefined,
                centerLabel: { source },
            }),
            caption: label,
        };
    },
});

// (2) Cena 3D — pluma(s)/modelo (captura única do viewport).
registerFigureProvider({
    id: 'scene-3d',
    label: 'Vista 3D',
    order: 20,
    isApplicable: () => true,
    generate: async (ctx: any) => {
        const { sceneOwner }: any = await import('../../core/scene/lifecycleOwner.js' as string);
        const url = await sceneOwner.captureFrame();
        if (!url) return null;
        const plumes = (ctx?.elements || []).filter((e: any) => e?.family === 'plume');
        return {
            dataUrl: url,
            caption: plumes.length ? `Pluma(s) de contaminação — vista 3D (${plumes.length})` : 'Vista 3D do modelo',
        };
    },
});

// (4) PhotoLog — documentação fotográfica de campo (CETESB DD 038/2017 IC §2.1.n).
// Um candidato por foto. Lê `ctx.photos` (pré-buscado pelo consumidor — photolog/manager
// não é importável fora do browser); a imagem é resolvida no generate (lazy getPhotoBlob).
function _blobToDataUrl(blob: any): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const fr = new FileReader();
            fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
        } catch (e: any) {
            console.debug('[figureProviders:photo:blob]', e?.message || e);
            resolve(null);
        }
    });
}
registerFigureProvider({
    id: 'photolog',
    label: 'Documentação fotográfica (PhotoLog)',
    order: 25,
    isApplicable: (ctx: any) => Array.isArray(ctx?.photos) && ctx.photos.length > 0,
    listCandidates: (ctx: any) =>
        (ctx?.photos || []).map((p: any) => ({
            candidateId: String(p.id),
            label: `Foto — ${p.description || p.filename || p.timestamp || p.id}`,
            scope: { photoId: p.id },
        })),
    generate: async (_ctx: any, candidate: any) => {
        const photoId = candidate?.scope?.photoId;
        if (!photoId) return null; // PhotoLog é só por seleção (sem default)
        const mgr: any = await import('../../core/photolog/manager.js' as string);
        const blob = await mgr.getPhotoBlob?.(photoId);
        if (!blob) return null;
        const dataUrl = await _blobToDataUrl(blob);
        if (!dataUrl) return null;
        return { dataUrl, caption: candidate?.label || 'Documentação fotográfica de campo' };
    },
});

// (3) Mapas geológico/pedológico/hidrogeológico — camadas vetoriais das Libraries.
registerFigureProvider({
    id: 'geo-pedo-maps',
    label: 'Mapa geológico/pedológico',
    order: 30,
    isApplicable: () => true,
    generate: async () => {
        const vlo: any = await import('../../core/io/geo/vectorLayerOverlay.js' as string);
        const all = vlo.getVectorLayersList?.() || [];
        const geo = all.filter((l: any) =>
            /geolog|pedolog|hidrogeo|hydrogeo|litolog|\bsolo\b|geologic/i.test(String(l?.name || '')),
        );
        if (!geo.length) return null;
        for (const l of geo) {
            if (!l.loaded && vlo.loadVectorLayer) {
                try {
                    await vlo.loadVectorLayer(l.id);
                } catch (e: any) {
                    console.debug('[figureProviders:geo:load]', e?.message || e);
                }
            }
            vlo.setVectorLayerVisible?.(l.id, true);
        }
        const { sceneOwner }: any = await import('../../core/scene/lifecycleOwner.js' as string);
        const url = await sceneOwner.captureFrame();
        if (!url) return null;
        const names = geo.map((l: any) => l.name).filter(Boolean).join(', ');
        return {
            dataUrl: url,
            caption: `Mapa geológico/pedológico/hidrogeológico do entorno${names ? ` — ${names}` : ''} (dados das Libraries)`,
        };
    },
});

// (13) Mapa geológico 2D formatado (F7 da gap analysis CETESB DD 038/2017 IC §2.1.f) —
// renderer SVG com legenda cronoestratigráfica CGMW/CPRM. Extrai geological units
// de blueprints OR vector layers; fault lineaments de elementos family='fault'.
// Distinto do provider `geo-pedo-maps` (que captura o viewport 3D): este é
// formatado 2D com legenda científica completa.
function _geologicalUnitsFromElements(elements: any[]): any[] {
    const units: any[] = [];
    for (const el of elements || []) {
        if (el?.family !== 'blueprint') continue;
        const geo = el?.data?.geologicalUnits;
        if (!Array.isArray(geo)) continue;
        for (const u of geo) {
            if (u && Array.isArray(u.polygon) && u.polygon.length >= 3) {
                units.push({
                    id: u.id,
                    code: String(u.code || 'UND'),
                    name: u.name,
                    description: u.description,
                    polygon: u.polygon,
                    age: u.age,
                    lithology: u.lithology,
                });
            }
        }
    }
    return units;
}
function _faultLineamentsFromElements(elements: any[]): any[] {
    const faults: any[] = [];
    for (const el of elements || []) {
        if (el?.family !== 'fault') continue;
        const line = el?.data?.lineament || el?.data?.line;
        if (!Array.isArray(line) || line.length < 2) continue;
        faults.push({
            id: el.id,
            name: el.name,
            line,
            strike: typeof el?.data?.strike === 'number' ? el.data.strike : undefined,
            dip: typeof el?.data?.dip === 'number' ? el.data.dip : undefined,
            type: el?.data?.faultType || 'unknown',
        });
    }
    return faults;
}
registerFigureProvider({
    id: 'geological-map-2d',
    label: 'Mapa geológico 2D formatado',
    order: 33,
    isApplicable: (ctx: any) => {
        const els = ctx?.elements || [];
        return _geologicalUnitsFromElements(els).length + _faultLineamentsFromElements(els).length > 0;
    },
    generate: async (ctx: any) => {
        const els = ctx?.elements || [];
        const units = _geologicalUnitsFromElements(els);
        const faults = _faultLineamentsFromElements(els);
        if (units.length === 0 && faults.length === 0) return null;
        const { buildGeologicalMapDataUrl }: any = await import('./_geologicalMapRenderer.js' as string);
        const title = 'Mapa geológico do entorno (2D formatado)';
        return {
            dataUrl: buildGeologicalMapDataUrl(units, faults, {
                title,
                showLegend: true,
                showFaults: true,
                centerLabel: {
                    datum: 'SIRGAS 2000 / UTM 23S — CGMW Stratigraphic Chart',
                    source: 'Modelo ecbyts — unidades CPRM/SBG (blueprint.geologicalUnits)',
                },
            }),
            caption: title + ` (${units.length} unidade(s), ${faults.length} falha(s))`,
        };
    },
});

// (6) Evolução temporal (F14-F21 da gap analysis CETESB DD 038/2017 IC §2.1.k) —
// gráficos de concentração vs tempo por parâmetro, com poços como séries e
// thresholds VI (mais restritivo entre jurisdições disponíveis) como linhas tracejadas.
// Candidatos = um por parameterId com ≥2 observações datadas (anti-ponto-único).
const _SERIES_PALETTE = [
    '#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad',
    '#16a085', '#d35400', '#2c3e50', '#7f8c8d', '#c0392b',
];

function _getObs(el: any): any[] {
    // observations vivem em el.observations (createObservation) OU el.data.observations
    // (compliance overlay). Aceitar ambos defensivamente.
    if (Array.isArray(el?.observations)) return el.observations;
    if (Array.isArray(el?.data?.observations)) return el.data.observations;
    return [];
}
function _obsValue(obs: any): number | null {
    // Schema atual usa `value` (compliance overlay); legado/random gen usa `reading`.
    if (obs == null) return null;
    const v = obs.value != null ? obs.value : obs.reading;
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}
function _paramKey(obs: any): string | null {
    // parameterId é o canônico; fallback para parameter/cas.
    return (obs?.parameterId || obs?.parameter || obs?.cas) ?? null;
}
function _paramsInDataset(elements: any[]): Map<string, { count: number; wells: Set<string>; unit: string }> {
    const idx = new Map<string, { count: number; wells: Set<string>; unit: string }>();
    for (const el of elements || []) {
        const obs = _getObs(el);
        for (const o of obs) {
            const pid = _paramKey(o);
            if (!pid) continue;
            if (_obsValue(o) == null) continue;
            if (!o?.date) continue;
            let entry = idx.get(pid);
            if (!entry) {
                entry = { count: 0, wells: new Set(), unit: String(o?.unit || 'µg/L') };
                idx.set(pid, entry);
            }
            entry.count++;
            entry.wells.add(el?.id || el?.name || 'unknown');
        }
    }
    return idx;
}

registerFigureProvider({
    id: 'temporal-chart',
    label: 'Evolução temporal (concentração × tempo)',
    order: 50,
    isApplicable: (ctx: any) => {
        const idx = _paramsInDataset(ctx?.elements || []);
        for (const [, info] of idx) {
            if (info.count >= 2) return true; // ao menos 1 parâmetro com 2+ obs datadas
        }
        return false;
    },
    listCandidates: (ctx: any) => {
        const idx = _paramsInDataset(ctx?.elements || []);
        const cands: any[] = [];
        for (const [pid, info] of idx) {
            if (info.count < 2) continue;
            const label = `Evolução de ${pid} — ${info.wells.size} ponto(s), ${info.count} obs`;
            cands.push({ candidateId: `param:${pid}`, label, scope: { parameterId: pid, unit: info.unit } });
        }
        // Ordenar por contagem decrescente (parâmetros com mais dados primeiro)
        return cands;
    },
    generate: async (ctx: any, candidate: any) => {
        const pid: string | null = candidate?.scope?.parameterId || null;
        const unit: string = candidate?.scope?.unit || 'µg/L';
        if (!pid) return null;
        const elements: any[] = Array.isArray(ctx?.elements) ? ctx.elements : [];

        // Agrupa observações desse parâmetro por elemento (well).
        const seriesByWell = new Map<string, { color: string; points: Array<{ t: string; v: number }>; label: string }>();
        let colorIdx = 0;
        for (const el of elements) {
            const obs = _getObs(el);
            const pts: Array<{ t: string; v: number }> = [];
            for (const o of obs) {
                if (_paramKey(o) !== pid) continue;
                const v = _obsValue(o);
                if (v == null) continue;
                if (!o?.date) continue;
                pts.push({ t: String(o.date), v });
            }
            if (pts.length === 0) continue;
            pts.sort((a, b) => (a.t < b.t ? -1 : 1));
            const wellName = String(el?.name || el?.id || 'sem-nome');
            const color = _SERIES_PALETTE[colorIdx % _SERIES_PALETTE.length];
            colorIdx++;
            seriesByWell.set(el?.id || wellName, { color: color as string, points: pts, label: wellName });
        }
        const series = Array.from(seriesByWell.values());
        if (!series.length) return null;

        // Thresholds: most-stringent VI mundial + CETESB DD 256 (BR-SP) se disponível.
        const thresholds: Array<{ label: string; value: number; severity?: 'vp' | 'vi' | 'cma' | 'custom' }> = [];
        try {
            const gt: any = await import('../../core/validation/globalThresholds.js' as string);
            const most = gt.getMostStringentThreshold?.(pid, 'groundwater');
            if (most && typeof most.value === 'number') {
                thresholds.push({
                    label: `VI ${most.jurisdiction} (${most.value} ${most.unit || 'ug_L'})`,
                    value: most.value,
                    severity: 'vi',
                });
            }
        } catch (e: any) {
            console.debug('[temporal-chart:thresholds]', e?.message || e);
        }

        const { buildTemporalChartDataUrl }: any = await import('./_temporalChartRenderer.js' as string);
        const title = `Evolução temporal de ${pid}`;
        return {
            dataUrl: buildTemporalChartDataUrl(series, {
                title,
                unit,
                thresholds,
                centerLabel: {
                    datum: 'Datas em formato ISO',
                    source: 'Observações do modelo ecbyts + thresholds globalThresholds.ts',
                },
            }),
            caption: `Evolução temporal de ${pid} — ${series.length} ponto(s) monitorado(s)`,
        };
    },
});

// (11) Tabela QA/QC laboratorial (gap CETESB DD 038/2017 IC §2.1.j+§2.4 —
// rastreabilidade analítica crítica). Agrega observations por parameterId e
// calcula métricas QA/QC para o resumo do relatório.
function _aggregateQaQc(elements: any[]): any[] {
    const byParam = new Map<string, any>();
    for (const el of elements || []) {
        const obs = Array.isArray(el?.observations)
            ? el.observations
            : Array.isArray(el?.data?.observations)
              ? el.data.observations
              : [];
        for (const o of obs) {
            const pid = o?.parameterId || o?.parameter || o?.cas;
            if (!pid) continue;
            const v = o?.value != null ? Number(o.value) : Number(o?.reading);
            if (!Number.isFinite(v)) continue;
            let row = byParam.get(pid);
            if (!row) {
                row = {
                    parameterId: pid,
                    parameterName: o?.parameterName || undefined,
                    unit: String(o?.unit || 'µg/L'),
                    method: o?.method || o?.analyticalMethod || undefined,
                    laboratory: o?.laboratory || o?.lab || undefined,
                    accreditation: o?.accreditation || undefined,
                    loq: typeof o?.loq === 'number' ? o.loq : undefined,
                    lod: typeof o?.lod === 'number' ? o.lod : undefined,
                    nSamples: 0,
                    nBelowLoq: 0,
                    nExceedance: 0,
                    duplicateRecoveryPct:
                        typeof o?.duplicateRecoveryPct === 'number' ? o.duplicateRecoveryPct : undefined,
                    uncertaintyClass: o?.uncertainty?.class || undefined,
                    chainOfCustody: o?.chainOfCustody || undefined,
                };
                byParam.set(pid, row);
            }
            row.nSamples++;
            if (row.loq != null && v < row.loq) row.nBelowLoq++;
            // Exceedance é checado pelo orquestrador externo — aqui só conta se obs tem flag
            if (o?.exceedsThreshold === true || o?.severity === 'intervention') row.nExceedance++;
            // Pega o pior chainOfCustody (missing > partial > complete)
            const cocOrder: Record<string, number> = { missing: 3, partial: 2, complete: 1 };
            if (
                o?.chainOfCustody &&
                cocOrder[o.chainOfCustody] != null &&
                cocOrder[o.chainOfCustody]! > (cocOrder[row.chainOfCustody || 'complete'] || 0)
            ) {
                row.chainOfCustody = o.chainOfCustody;
            }
            // Pior uncertaintyClass
            const uOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
            if (
                o?.uncertainty?.class &&
                uOrder[o.uncertainty.class] != null &&
                uOrder[o.uncertainty.class]! > (uOrder[row.uncertaintyClass || 'low'] || 0)
            ) {
                row.uncertaintyClass = o.uncertainty.class;
            }
        }
    }
    return Array.from(byParam.values());
}
registerFigureProvider({
    id: 'qaqc-table',
    label: 'Tabela QA/QC laboratorial',
    order: 55,
    isApplicable: (ctx: any) => _aggregateQaQc(ctx?.elements || []).length > 0,
    generate: async (ctx: any) => {
        const rows = _aggregateQaQc(ctx?.elements || []);
        if (!rows.length) return null;
        const { buildQaQcTableDataUrl }: any = await import('./_qaqcTableRenderer.js' as string);
        const title = 'Resumo QA/QC laboratorial';
        return {
            dataUrl: buildQaQcTableDataUrl(rows, {
                title,
                centerLabel: {
                    datum: 'Rastreabilidade analítica',
                    source: 'Observações do modelo ecbyts — agregado por parameterId',
                },
            }),
            caption: title + ` (${rows.length} parâmetro(s) monitorado(s))`,
        };
    },
});

// (8) Mapa potenciométrico (F5 da gap analysis CETESB DD 038/2017 IC §2.1.l) —
// curvas isopiezométricas + setas de fluxo subterrâneo a partir de cargas
// hidráulicas medidas em poços. parameterId 'water_level' OU 'hydraulic_head'
// OU 'piezometric_head'. Mínimo 3 poços com observação datada de carga.
const _HEAD_PARAM_IDS = new Set(['water_level', 'hydraulic_head', 'piezometric_head']);

function _wellsWithHead(elements: any[]): Array<{ x: number; z: number; head: number; label?: string }> {
    const pts: Array<{ x: number; z: number; head: number; label?: string }> = [];
    for (const el of elements || []) {
        const pos = el?.position || el?.data?.position;
        if (!pos || typeof pos.x !== 'number' || typeof pos.z !== 'number') continue;
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
        const obs = Array.isArray(el?.observations)
            ? el.observations
            : Array.isArray(el?.data?.observations)
              ? el.data.observations
              : [];
        // Pegar a observação MAIS RECENTE de carga (por date string ISO).
        let best: any = null;
        for (const o of obs) {
            const pid = o?.parameterId || o?.parameter;
            if (!_HEAD_PARAM_IDS.has(pid)) continue;
            const v = o?.value != null ? o.value : o?.reading;
            if (v == null || !Number.isFinite(Number(v))) continue;
            if (!o?.date) continue;
            if (!best || String(o.date) > String(best.date)) best = o;
        }
        if (best) {
            pts.push({
                x: pos.x,
                z: pos.z,
                head: Number(best.value != null ? best.value : best.reading),
                label: String(el?.name || el?.id || ''),
            });
        }
    }
    return pts;
}

registerFigureProvider({
    id: 'potentiometric-map',
    label: 'Mapa potenciométrico',
    order: 45,
    isApplicable: (ctx: any) => _wellsWithHead(ctx?.elements || []).length >= 3,
    generate: async (ctx: any) => {
        const pts = _wellsWithHead(ctx?.elements || []);
        if (pts.length < 3) return null;
        const { buildPotentiometricDataUrl }: any = await import('./_potentiometricRenderer.js' as string);
        const title = 'Mapa potenciométrico — superfície piezométrica';
        return {
            dataUrl: buildPotentiometricDataUrl(pts, {
                title,
                centerLabel: {
                    datum: 'SIRGAS 2000 / UTM 23S',
                    source: 'Modelo ecbyts — cargas hidráulicas observadas em poços',
                },
            }),
            caption: title + ` (${pts.length} ponto(s) monitorado(s))`,
        };
    },
});

// (7) Perfil litológico/construtivo de poço (F3 da gap analysis CETESB DD 038/2017
// IC §2.1.h) — 1 candidato por poço com profile.lithologic. Renderer SVG puro;
// degradação graciosa se o poço não tem layers definidos.
function _wellsWithProfile(elements: any[]): any[] {
    return (elements || []).filter((e) => {
        const family = e?.family;
        if (family !== 'well' && family !== 'sensor') return false;
        const lito = e?.data?.profile?.lithologic;
        return Array.isArray(lito) && lito.length > 0;
    });
}
// (9) Layout de planta + fontes potenciais (F2 da gap analysis CETESB DD 038/2017
// IC §2.1.i) — classificação fonte-caminho-receptor com simbologia diferenciada:
// primárias (tank/waste_stream) vermelho cheio, secundárias (emission_source/effluent_point)
// laranja, receptores humanos (building) azul forte, ambientais (well/lake/river/spring)
// azul claro, caminhos (route_flow) tracejado, contexto (boundary/blueprint) cinza.
const _PLANT_FAMILIES = new Set([
    'tank', 'waste_stream', 'emission_source', 'effluent_point',
    'building', 'well', 'lake', 'river', 'spring',
    'route_flow', 'boundary', 'blueprint',
]);
function _plantElements(elements: any[]): any[] {
    return (elements || []).filter((e: any) => {
        if (!e?.family || !_PLANT_FAMILIES.has(e.family)) return false;
        const pos = e?.position || e?.data?.position;
        return pos && typeof pos.x === 'number' && typeof pos.z === 'number';
    });
}
registerFigureProvider({
    id: 'source-plant-layout',
    label: 'Layout de planta — fonte/caminho/receptor',
    order: 15,
    isApplicable: (ctx: any) => _plantElements(ctx?.elements || []).length >= 1,
    generate: async (ctx: any) => {
        const els = _plantElements(ctx?.elements || []);
        if (!els.length) return null;
        const { buildSourcePlantLayoutDataUrl }: any = await import('./_sourcePlantLayoutRenderer.js' as string);
        const title = 'Layout de planta — fontes potenciais e receptores';
        return {
            dataUrl: buildSourcePlantLayoutDataUrl(els, {
                title,
                showLegend: true,
                centerLabel: {
                    datum: 'SIRGAS 2000 / UTM 23S',
                    source: 'Modelo ecbyts — classificação fonte-caminho-receptor (CETESB DD 038/2017)',
                },
            }),
            caption: title + ` (${els.length} elemento(s) classificado(s))`,
        };
    },
});

// (12) Mapa de locação de amostragem detalhada (F6 da gap analysis CETESB
// DD 038/2017 IC §2.1.k) — pontos numerados por matriz (AS-01, PM-01, etc.)
// com legenda de tipos e contagens. Distinto de radius-500m (GAC overview)
// e source-plant-layout (fonte-caminho-receptor classification).
const _SAMPLE_FAMILIES = new Set(['sample', 'well', 'marker', 'individual', 'sensor']);
function _familyToMatrix(family: string): string {
    if (family === 'well') return 'groundwater';
    if (family === 'sample') return 'soil';
    if (family === 'individual') return 'biota';
    if (family === 'sensor') return 'air';
    return 'unknown';
}
function _sampleLocations(elements: any[]): any[] {
    return (elements || [])
        .filter((e: any) => {
            if (!e?.family || !_SAMPLE_FAMILIES.has(e.family)) return false;
            const pos = e?.position || e?.data?.position;
            return pos && typeof pos.x === 'number' && typeof pos.z === 'number';
        })
        .map((e: any) => ({
            id: e.id,
            name: e.name,
            family: e.family,
            position: e.position || e.data?.position,
            matrix: e?.data?.matrix || _familyToMatrix(e.family),
            depth: typeof e?.data?.depth === 'number' ? e.data.depth : undefined,
            campaignIds: Array.isArray(e?.data?.campaignIds) ? e.data.campaignIds : undefined,
        }));
}
async function _campaignsList(): Promise<any[]> {
    try {
        const cm: any = await import('../../core/campaigns/manager.js' as string);
        const all = cm.getAllCampaigns?.() || [];
        return all.map((c: any, i: number) => ({
            id: c.id,
            name: c.name || `Campanha ${i + 1}`,
            color: ['#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad'][i % 5],
        }));
    } catch (e: any) {
        console.debug('[sample-locations:campaigns]', e?.message || e);
        return [];
    }
}
registerFigureProvider({
    id: 'sample-locations',
    label: 'Mapa de locação de amostragem',
    order: 18,
    isApplicable: (ctx: any) => _sampleLocations(ctx?.elements || []).length >= 1,
    generate: async (ctx: any) => {
        const locs = _sampleLocations(ctx?.elements || []);
        if (!locs.length) return null;
        const campaigns = await _campaignsList();
        const { buildSampleLocationsDataUrl }: any = await import('./_sampleLocationsRenderer.js' as string);
        const title = 'Mapa de locação de amostragem';
        return {
            dataUrl: buildSampleLocationsDataUrl(locs, {
                title,
                campaigns: campaigns.length > 0 ? campaigns : undefined,
                showLegend: true,
                centerLabel: {
                    datum: 'SIRGAS 2000 / UTM 23S',
                    source: 'Modelo ecbyts — estações por matriz (CETESB DD 038/2017)',
                },
            }),
            caption: title + ` (${locs.length} estação(ões))`,
        };
    },
});

registerFigureProvider({
    id: 'well-profile',
    label: 'Perfil litológico/construtivo de poço',
    order: 35,
    isApplicable: (ctx: any) => _wellsWithProfile(ctx?.elements || []).length > 0,
    listCandidates: (ctx: any) =>
        _wellsWithProfile(ctx?.elements || []).map((w: any) => ({
            candidateId: `well:${w.id}`,
            label: `Perfil — ${w?.name || w?.id}`,
            scope: { wellId: w.id },
        })),
    generate: async (ctx: any, candidate: any) => {
        const wellId = candidate?.scope?.wellId;
        if (!wellId) return null;
        const well = (ctx?.elements || []).find((e: any) => e?.id === wellId);
        if (!well) return null;
        try {
            const eng: any = await import('../../core/elements/families/well/stratigraphyEngine.js' as string);
            const layers = eng.normalizeWellProfile?.(well) || [];
            if (!layers.length) return null;
            const { buildWellProfileDataUrl }: any = await import('./_wellProfileRenderer.js' as string);
            const pos = well?.position || well?.data?.position;
            const constructive = well?.data?.profile?.constructive || undefined;
            const title = candidate?.label || `Perfil — ${well?.name || well?.id}`;
            return {
                dataUrl: buildWellProfileDataUrl(layers, {
                    title,
                    wellName: well?.name || well?.id,
                    elevation: typeof well?.data?.elevation === 'number' ? well.data.elevation : undefined,
                    coords: pos && typeof pos.x === 'number' && typeof pos.z === 'number' ? pos : undefined,
                    datum: 'SIRGAS 2000 / UTM 23S',
                    constructive,
                    centerLabel: { source: 'Modelo ecbyts — core/elements/families/well' },
                }),
                caption: title,
            };
        } catch (e: any) {
            console.debug('[well-profile:generate]', e?.message || e);
            return null;
        }
    },
});

// (10) Distribuição vertical 3D / isoconcentração (F22-F33 da gap analysis CETESB
// DD 038/2017 IC §2.1.m) — extrai samples de voxel/interpolation layers e renderiza
// 3-vistas (planta + 2 cortes verticais N-S e L-W) com gradiente de concentração.
async function _voxelSamplesForParam(parameterId: string): Promise<any[] | null> {
    try {
        const im: any = await import('../../core/interpolation/manager.js' as string);
        const layers = im.getAllLayers?.() || [];
        // Procura layer com parameterId casando + grid 3D
        const layer = layers.find((l: any) =>
            l && l.visible && (l.type === 'voxel' || l.type === 'concentration') && l.parameterId === parameterId,
        );
        if (!layer || !layer.grid) return null;
        // Tentativa de samplear: se .samples já existe usa, senão tenta achatamento simples
        if (Array.isArray(layer.samples) && layer.samples.length) return layer.samples;
        // Achatamento de grid: assume xs/ys/zs arrays + values array 3D
        const xs = layer.grid.xs, ys = layer.grid.ys, zs = layer.grid.zs, vals = layer.grid.values;
        if (!Array.isArray(xs) || !Array.isArray(ys) || !Array.isArray(zs) || !vals) return null;
        const out: any[] = [];
        for (let ix = 0; ix < xs.length; ix++) {
            for (let iz = 0; iz < zs.length; iz++) {
                for (let iy = 0; iy < ys.length; iy++) {
                    const v = vals?.[ix]?.[iz]?.[iy];
                    if (typeof v === 'number' && Number.isFinite(v)) {
                        out.push({ x: xs[ix], y: ys[iy], z: zs[iz], v });
                    }
                }
            }
        }
        // Cap em 5000 para perf
        return out.length > 5000 ? out.slice(0, 5000) : out;
    } catch (e: any) {
        console.debug('[vertical-distribution:samples]', e?.message || e);
        return null;
    }
}
async function _availableVoxelParams(): Promise<string[]> {
    try {
        const im: any = await import('../../core/interpolation/manager.js' as string);
        const layers = im.getAllLayers?.() || [];
        const params = new Set<string>();
        for (const l of layers) {
            if (l?.visible && (l.type === 'voxel' || l.type === 'concentration') && l.parameterId) {
                params.add(String(l.parameterId));
            }
        }
        return Array.from(params);
    } catch {
        return [];
    }
}
registerFigureProvider({
    id: 'vertical-distribution',
    label: 'Distribuição vertical 3D (isoconcentração)',
    order: 38,
    isApplicable: () => true, // listCandidates filtra assincronamente
    listCandidates: () => {
        // Sync: emite 1 candidato genérico; generate filtra por parameterId
        // Em runtime, expandiremos via getAllLayers em generate.
        return [{ candidateId: 'all-params', label: 'Distribuição vertical — todos os parâmetros voxel', scope: { allParams: true } }];
    },
    generate: async (_ctx: any, candidate: any) => {
        const params = await _availableVoxelParams();
        if (!params.length) return null;
        // MVP: usa o primeiro parâmetro disponível (TODO: candidato por param)
        const pid = candidate?.scope?.parameterId || params[0];
        const samples = await _voxelSamplesForParam(pid);
        if (!samples || samples.length < 4) return null;
        const { buildVerticalDistributionDataUrl }: any = await import('./_verticalDistributionRenderer.js' as string);
        const title = `Distribuição vertical 3D — ${pid}`;
        return {
            dataUrl: buildVerticalDistributionDataUrl(samples, {
                title,
                parameterId: pid,
                unit: 'µg/L',
                centerLabel: {
                    datum: 'SIRGAS 2000 / UTM 23S',
                    source: 'Modelo ecbyts — voxel interpolation layer',
                },
            }),
            caption: title + ` (${samples.length} amostra(s) 3D)`,
        };
    },
});

// (5) Seções hidrogeológicas (F8-F13 da gap analysis CETESB) — corte 2D ao longo de
// uma transecto A-B através das camadas geológicas do modelo. Aplicável apenas se
// houver layers de geologia visíveis (interpolation manager). 2 candidatos default
// (E-W, N-S através do centroide); transecta usando core/interpolation/crossSection.
async function _hasGeologyLayers(): Promise<boolean> {
    try {
        const im: any = await import('../../core/interpolation/manager.js' as string);
        const layers = im.getAllLayers?.() || [];
        return layers.some((l: any) => l && l.type === 'geology' && l.visible && l.grid);
    } catch (e: any) {
        console.debug('[figureProviders:cs:check]', e?.message || e);
        return false;
    }
}
function _bboxOf(elements: any[]): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let n = 0;
    for (const e of elements || []) {
        const p = e?.position || e?.data?.position;
        if (p && typeof p.x === 'number' && typeof p.z === 'number') {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
            n++;
        }
    }
    if (n < 2) return null;
    return { minX, maxX, minZ, maxZ };
}
registerFigureProvider({
    id: 'cross-section',
    label: 'Seção hidrogeológica',
    order: 40,
    isApplicable: () => true, // checagem real é assíncrona; deixa o listCandidates filtrar
    listCandidates: () => [
        { candidateId: 'aa-ew', label: "Seção A-A' — leste-oeste (através do centroide)", scope: { axis: 'ew' } },
        { candidateId: 'bb-ns', label: "Seção B-B' — norte-sul (através do centroide)", scope: { axis: 'ns' } },
    ],
    generate: async (ctx: any, candidate: any) => {
        const ok = await _hasGeologyLayers();
        if (!ok) return null;
        const bb = _bboxOf(ctx?.elements || []);
        if (!bb) return null;
        const cxM = (bb.minX + bb.maxX) / 2;
        const czM = (bb.minZ + bb.maxZ) / 2;
        const halfX = Math.max(50, (bb.maxX - bb.minX) / 2);
        const halfZ = Math.max(50, (bb.maxZ - bb.minZ) / 2);
        const axis = candidate?.scope?.axis === 'ns' ? 'ns' : 'ew';
        const start = axis === 'ew' ? { x: cxM - halfX, z: czM } : { x: cxM, z: czM - halfZ };
        const end = axis === 'ew' ? { x: cxM + halfX, z: czM } : { x: cxM, z: czM + halfZ };
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lenM = Math.sqrt(dx * dx + dz * dz);
        try {
            const cs: any = await import('../../core/interpolation/crossSection.js' as string);
            const samples = cs.sampleAlongLine?.(start, end, 200) || [];
            const polys = cs.generateLayerPolygons?.(samples) || [];
            if (!polys.length) return null;
            const { buildCrossSectionDataUrl }: any = await import('./_crossSectionRenderer.js' as string);
            const title = candidate?.label || (axis === 'ew' ? "Seção Hidrogeológica A-A'" : "Seção Hidrogeológica B-B'");
            return {
                dataUrl: buildCrossSectionDataUrl(polys, {
                    title,
                    transectLengthM: lenM,
                    centerLabel: { datum: 'SIRGAS 2000 / UTM 23S', source: 'Modelo ecbyts — camadas geológicas' },
                }),
                caption: title,
            };
        } catch (e: any) {
            console.debug('[figureProviders:cs:generate]', e?.message || e);
            return null;
        }
    },
});
