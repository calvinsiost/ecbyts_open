// @ts-check
// Generated from src/app/js/core/ingestion/wizard.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// ----------------------------------------------------------------
// LAZY IMPORT - getAllElements para calculo de existingCount
// Importado de forma sincrona no ponto de uso (modulo ja carregado)
// ----------------------------------------------------------------
import { getAllElements } from '../elements/manager.js';
import { detectDateLocale } from './dateNormalizer.js';
import { detectKnownLocation } from './locationDetection.js';

// ----------------------------------------------------------------
// TIPOS — modelam a estrutura solta da planilha parseada e do estado
// do wizard. Mantidos deliberadamente permissivos (índices abertos)
// porque as linhas vêm de planilhas heterogêneas; tipar os campos
// efetivamente acessados elimina o `any` sem inventar contratos rígidos.
// ----------------------------------------------------------------

/** Linha de uma planilha: mapa coluna→valor cru. */
type SheetRow = Record<string, unknown>;

/** Uma aba da planilha parseada. */
interface ParsedSheet {
    name: string;
    rows?: SheetRow[];
    rowCount?: number;
    [key: string]: unknown;
}

/** Planilha parseada (saída do parser). */
interface ParsedSpreadsheet {
    sheets?: ParsedSheet[];
    [key: string]: unknown;
}

/** Formato detectado pelo detector de formato. */
interface FormatInfo {
    type: string;
    confidence: number;
    [key: string]: unknown;
}

/** Mapeamento proposto de uma coluna fonte → campo alvo. */
interface ColumnMapping {
    sourceSheet: string;
    sourceColumn: string;
    targetField?: string | null;
    needsHumanReview?: boolean;
    method?: string;
    confidence?: number;
    [key: string]: unknown;
}

/** Mapeamento de uma aba fonte → entidade alvo. */
interface SheetMapping {
    sourceSheet: string;
    targetEntity: string;
    [key: string]: unknown;
}

/** Ambiguidade detectada no mapeamento (tipo + valor de origem). */
interface Ambiguity {
    type: string;
    sourceValue: string;
    [key: string]: unknown;
}

/** Proposta de mapeamento completa. */
interface MappingProposal {
    columns?: ColumnMapping[];
    sheetMappings?: SheetMapping[];
    ambiguities?: Ambiguity[];
    [key: string]: unknown;
}

/** Faixa de datas observada na validação. */
interface DateRange {
    min?: string | null;
    max?: string | null;
}

/** Estatísticas agregadas da validação. */
interface ValidationStats {
    locations: number;
    campaigns: number;
    results: number;
    detected: number;
    nonDetect: number;
    chemicals: string[];
    exceedances: number;
    dateRange: DateRange;
    [key: string]: unknown;
}

/** Relatório de validação. */
interface ValidationReport {
    stats: ValidationStats;
    warnings?: unknown[];
    errors?: unknown[];
    [key: string]: unknown;
}

/** Centroide/origem sugerida para georreferenciamento. */
interface OriginPoint {
    lat: number;
    lon: number;
    count: number;
    source?: 'auto' | 'manual';
}

/** Decisões tomadas pelo humano ao longo do wizard. Campos variam por domínio. */
interface WizardDecisions {
    formatConfirmed: boolean;
    columnOverrides: Record<string, string>;
    ambiguityResolutions: Record<string, unknown>;
    domain: 'environmental' | 'ohs';
    dateLocale?: 'dd/mm' | 'mm/dd' | 'auto';
    clearStrategy?: string;
    quickImport?: boolean;
    suggestedOrigin?: { lat?: number; lon?: number; count?: number } | null;
    // Campos ambientais
    nonDetectStrategy?: string;
    campaignStrategy?: string;
    multilevelStrategy?: string;
    coordinateOrigin?: unknown;
    importActionLevels?: boolean;
    elevationStrategy?: string;
    geoOffsetX?: number;
    geoOffsetY?: number;
    geoRotationDeg?: number;
    // Campos OHS
    gheStrategy?: string;
    sampleTypeStrategy?: string;
    lgpdStrategy?: string;
    oelSource?: string;
    importAptitude?: boolean;
    [key: string]: unknown;
}

/** Estado completo do wizard (imutável entre transições). */
interface WizardState {
    step: string;
    parsed: ParsedSpreadsheet;
    format: FormatInfo;
    mapping: MappingProposal;
    validation: ValidationReport;
    decisions: WizardDecisions;
    history: string[];
}

/** Info de step para a UI — campos-base comuns + campos específicos do step. */
interface StepInfo {
    stepId: string;
    stepNumber: number;
    totalSteps: number;
    canGoBack: boolean;
    canGoForward: boolean;
    isLastStep: boolean;
    title: string;
    subtitle: string;
    [key: string]: unknown;
}

/** Resumo de qualidade de dados por local (step DOMAIN_DECISIONS). */
interface LocationQuality {
    name: unknown;
    hasCoords: boolean;
    hasElevation: boolean;
    hasDepth: boolean;
    hasDiameter: boolean;
}

/** Elemento já existente no modelo (subset dos campos acessados aqui). */
interface ExistingElement {
    name?: string;
    family?: string;
    data?: { latitude?: unknown; longitude?: unknown; sys_loc_code?: unknown; [key: string]: unknown };
    [key: string]: unknown;
}

/** Plano de ingestão final passado ao ingester. */
interface IngestionPlan {
    parsed: ParsedSpreadsheet;
    format: FormatInfo;
    mapping: MappingProposal;
    decisions: WizardDecisions;
    validation: ValidationReport;
    domain: 'environmental' | 'ohs';
}
/* ================================================================
   INGESTION WIZARD — Human-in-the-loop state machine
   Maquina de estados do wizard de assistencia humana.

   5 etapas guiadas:
   1. FORMAT_CONFIRM — Confirmar formato detectado
   2. COLUMN_MAPPING — Revisar/corrigir mapeamento de colunas
   3. AMBIGUITY_RESOLUTION — Resolver ambiguidades (tipos, quimicos)
   4. DOMAIN_DECISIONS — Decisoes de dominio (non-detect, campanhas)
   5. REVIEW_AND_CONFIRM — Resumo final e aprovacao

   A assistencia humana NAO e opcional — e parte do algoritmo.
   ================================================================ */
// ----------------------------------------------------------------
// STEPS
// ----------------------------------------------------------------
const STEPS = ['FORMAT_CONFIRM', 'COLUMN_MAPPING', 'AMBIGUITY_RESOLUTION', 'DOMAIN_DECISIONS', 'REVIEW_AND_CONFIRM'];
/**
 * Coerce a valor para array (ou array vazio). Genérico: o chamador
 * declara o tipo dos elementos, eliminando `any` nos callbacks.
 */
function asArray<T = unknown>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}
// ----------------------------------------------------------------
// WIZARD LIFECYCLE
// ----------------------------------------------------------------
/**
 * Cria estado inicial do wizard.
 *
 * @param {ParsedSpreadsheet} parsed - Dados parseados
 * @param {FormatInfo} format - Formato detectado
 * @param {MappingProposal} mapping - Proposta de mapeamento
 * @param {ValidationReport} validation - Resultado da validacao
 * @returns {WizardState}
 */
export function createWizard(
    parsed: ParsedSpreadsheet,
    format: FormatInfo,
    mapping: MappingProposal,
    validation: ValidationReport,
): WizardState {
    // Detecta dominio: 'environmental' ou 'ohs'
    const domain: 'environmental' | 'ohs' = format.type.startsWith('ohs-') ? 'ohs' : 'environmental';
    const decisions: WizardDecisions = {
        formatConfirmed: false,
        columnOverrides: {},
        ambiguityResolutions: {},
        domain,
    };
    if (domain === 'environmental') {
        // Decisoes ambientais (existentes + novas D2/D3/D6/D11/D12)
        Object.assign(decisions, {
            nonDetectStrategy: 'flag_null',
            campaignStrategy: 'auto',
            campaignNames: null,
            multilevelStrategy: 'separate',
            coordinateOrigin: 'auto',
            importActionLevels: true,
            // D3: estrategia de limpeza pre-ingestao
            clearStrategy: 'none', // 'none' | 'all' | 'family:well' | etc
            // D11: exportar ECO1 antes de limpar
            exportBeforeClear: false,
            // D2: aplicar centroide como origem do mapa
            applyOrigin: null, // null = ainda nao decidido
            suggestedOrigin: null, // { lat, lon, count }
            // D6: estrategia de duplicatas
            duplicateStrategy: 'replace', // 'replace' | 'append' | 'skip'
            // D15: profundidade/diametro default quando ausente nos dados
            defaultWellDepth: 50,
            defaultWellDiameter: 4,
            // D16: estrategia para pontos sem coordenadas
            missingCoordsStrategy: 'origin', // 'origin' | 'grid' | 'exclude'
            // D17: gerar boundary automaticamente (convex hull)
            generateBoundary: false, // default false, habilitado se >=3 pontos com coords
            // D18: gerar superficie de terreno pos-merge
            generateTerrain: false,
            // D19: aplicar imagem aerea ao terreno
            generateAerial: true,
            // D20: cota default quando ausente
            defaultElevation: 0,
            // VILA LOBOS: estrategia de posicionamento vertical
            elevationStrategy: 'file', // 'file' | 'dem' | 'zero'
            // VILA LOBOS: ajustes manuais de georreferenciamento (metros/graus)
            geoOffsetX: 0, // metros (easting local)
            geoOffsetY: 0, // metros (northing local)
            geoRotationDeg: 0, // graus
            // D21: locale de data para normalizacao (auto-detectado)
            dateLocale: 'auto', // 'dd/mm' | 'mm/dd' | 'auto'
            // D22: canonicalizar IDs de pocos (PM 01 → PM-01)
            canonicalize: true,
        });
    } else {
        // Decisoes OHS
        Object.assign(decisions, {
            gheStrategy: 'create_groups', // 'create_groups' | 'ignore'
            sampleTypeStrategy: 'separate', // 'separate' (area→area, personal→individual) | 'all_worker'
            lgpdStrategy: 'pseudonymize', // 'pseudonymize' | 'keep_identified' | 'anonymize'
            oelSource: 'ACGIH', // 'ACGIH' | 'NR-15' | 'NIOSH' | 'custom'
            importAptitude: false, // true se PCMSO detectado
            campaignStrategy: 'auto',
            campaignNames: null,
        });
    }
    return {
        step: 'FORMAT_CONFIRM',
        parsed,
        format,
        mapping,
        validation,
        decisions,
        history: ['FORMAT_CONFIRM'],
    };
}
/**
 * Avanca o wizard para o proximo step ou aplica decisao no step atual.
 * Retorna novo estado (imutavel).
 */
export function advanceWizard(state: WizardState, userDecision: Partial<WizardDecisions>): WizardState {
    const newState: WizardState = {
        ...state,
        decisions: { ...state.decisions, ...userDecision },
    };
    // Determina proximo step
    const currentIdx = STEPS.indexOf(state.step);
    let nextIdx = currentIdx + 1;
    // D8: Quick Import - pula COLUMN_MAPPING, AMBIGUITY_RESOLUTION e DOMAIN_DECISIONS
    // quando formato tem alta confianca, mapeamento nao precisa de revisao humana,
    // e usuario optou por Quick Import no FORMAT_CONFIRM step.
    if (newState.decisions.quickImport && state.step === 'FORMAT_CONFIRM') {
        nextIdx = STEPS.indexOf('REVIEW_AND_CONFIRM');
    } else {
        // Pula AMBIGUITY_RESOLUTION se nao ha ambiguidades
        if (STEPS[nextIdx] === 'AMBIGUITY_RESOLUTION') {
            const unresolvedAmbiguities = getUnresolvedAmbiguities(newState);
            if (unresolvedAmbiguities.length === 0) {
                nextIdx++;
            }
        }
    }
    const nextStep = STEPS[nextIdx];
    if (nextStep !== undefined) {
        newState.step = nextStep;
        newState.history = [...state.history, nextStep];
    }
    return newState;
}
/**
 * Verifica se Quick Import e possivel para o estado atual.
 * Condicoes: formato reconhecido com confianca >= 0.8,
 * nenhuma coluna precisa de revisao humana, sem ambiguidades.
 *
 * @param {WizardState} state
 * @returns {boolean}
 */
export function isQuickImportEligible(state: WizardState): boolean {
    if (!state.format || state.format.confidence < 0.8) return false;
    // Verifica se ha colunas que precisam revisao humana
    const needsReview = asArray<ColumnMapping>(state.mapping?.columns).some((c) => c.needsHumanReview);
    if (needsReview) return false;
    // Verifica se ha ambiguidades nao resolvidas
    const ambiguities = getUnresolvedAmbiguities(state);
    if (ambiguities.length > 0) return false;
    return true;
}
/**
 * Volta o wizard para o step anterior.
 *
 * @param {WizardState} state
 * @returns {WizardState}
 */
export function goBackWizard(state: WizardState): WizardState {
    const currentIdx = STEPS.indexOf(state.step);
    if (currentIdx <= 0) return state;
    let prevIdx = currentIdx - 1;
    // Pula AMBIGUITY_RESOLUTION se nao ha ambiguidades
    if (STEPS[prevIdx] === 'AMBIGUITY_RESOLUTION') {
        const unresolvedAmbiguities = getUnresolvedAmbiguities(state);
        if (unresolvedAmbiguities.length === 0) {
            prevIdx--;
        }
    }
    if (prevIdx < 0) prevIdx = 0;
    const prevStep = STEPS[prevIdx] ?? state.step;
    return {
        ...state,
        step: prevStep,
        history: [...state.history, prevStep],
    };
}
/**
 * Retorna info do step atual para renderizacao na UI.
 *
 * @param {WizardState} state
 * @returns {StepInfo}
 */
export function getWizardStep(state: WizardState): StepInfo {
    const stepIdx = STEPS.indexOf(state.step);
    const totalSteps = STEPS.length;
    const base = {
        stepId: state.step,
        stepNumber: stepIdx + 1,
        totalSteps,
        canGoBack: stepIdx > 0,
        canGoForward: stepIdx < totalSteps - 1,
        isLastStep: stepIdx === totalSteps - 1,
        title: getStepTitle(state.step),
        subtitle: getStepSubtitle(state),
    };
    switch (state.step) {
        case 'FORMAT_CONFIRM': {
            // D3/D6/D12: contar elementos existentes no modelo
            const existingElements = getAllElements() as ExistingElement[];
            const existingCount = existingElements.length;
            // D2: calcular centroide dos locais importados
            const locations = asArray<ParsedSheet>(state.parsed.sheets).find((s) =>
                asArray<SheetMapping>(state.mapping?.sheetMappings).some(
                    (m) => m.sourceSheet === s.name && m.targetEntity === 'elements',
                ),
            );
            let suggestedOrigin: OriginPoint | null = null;
            let georefPreview: {
                totalLocations: number;
                withCoordinates: number;
                detectedDatum: string | null;
                datumWarning: boolean | string | null;
            } | null = null;
            if (locations) {
                const latCol = asArray<ColumnMapping>(state.mapping?.columns).find(
                    (c) => c.sourceSheet === locations.name && c.targetField === 'latitude',
                );
                const lonCol = asArray<ColumnMapping>(state.mapping?.columns).find(
                    (c) => c.sourceSheet === locations.name && c.targetField === 'longitude',
                );
                if (latCol && lonCol) {
                    const lats = asArray<SheetRow>(locations.rows)
                        .map((r) => Number(r[latCol.sourceColumn]))
                        .filter((v) => !isNaN(v) && v >= -90 && v <= 90);
                    const lons = asArray<SheetRow>(locations.rows)
                        .map((r) => Number(r[lonCol.sourceColumn]))
                        .filter((v) => !isNaN(v) && v >= -180 && v <= 180);
                    if (lats.length > 0) {
                        suggestedOrigin = {
                            lat: lats.reduce((a, b) => a + b, 0) / lats.length,
                            lon: lons.reduce((a, b) => a + b, 0) / lons.length,
                            count: lats.length,
                            source: 'auto',
                        };
                    }
                    // Preview georef no step de formato (stage 3 embutido)
                    const datumSet = new Set<string>();
                    for (const row of locations.rows || []) {
                        const d = row.alt_coord_type_code || row.coord_type || row.datum || row.coordinate_datum;
                        if (d) datumSet.add(String(d).trim().toUpperCase());
                    }
                    const detectedDatum = [...datumSet][0] || null;
                    const safeDatums = [
                        'WGS84',
                        'WGS 84',
                        'SIRGAS2000',
                        'SIRGAS 2000',
                        'SIRGAS',
                        'EPSG:4326',
                        'EPSG:4674',
                    ];
                    const datumWarning =
                        detectedDatum && !safeDatums.some((safeDatum) => String(detectedDatum).includes(safeDatum));
                    georefPreview = {
                        totalLocations: locations.rows?.length || 0,
                        withCoordinates: lats.length,
                        detectedDatum,
                        datumWarning,
                    };
                }
            }
            // Mantem origem escolhida manualmente no mapa, se existir.
            const manualOrigin = state.decisions?.suggestedOrigin;
            if (manualOrigin && Number.isFinite(manualOrigin.lat) && Number.isFinite(manualOrigin.lon)) {
                suggestedOrigin = {
                    lat: Number(manualOrigin.lat),
                    lon: Number(manualOrigin.lon),
                    count: Number(manualOrigin.count || suggestedOrigin?.count || 1),
                    source: 'manual',
                };
            }
            const locationDetection = suggestedOrigin ? detectKnownLocation(suggestedOrigin) : null;
            // D2: default applyOrigin = true se modelo vazio
            const applyOriginDefault = existingCount === 0 && suggestedOrigin != null;
            // D12: aviso de coordenadas distantes (so se clearStrategy='none' e modelo tem elementos)
            let distanceWarning: {
                km: number;
                existingCentroid: { lat: number; lon: number };
                newCentroid: OriginPoint;
            } | null = null;
            if (suggestedOrigin && existingCount > 0 && state.decisions.clearStrategy === 'none') {
                const existingWithCoords = existingElements
                    .map((e) => ({
                        lat: e.data?.latitude as number,
                        lon: e.data?.longitude as number,
                    }))
                    .filter((p) => p.lat != null && !isNaN(p.lat));
                if (existingWithCoords.length > 0) {
                    const exLat = existingWithCoords.reduce((a, p) => a + p.lat, 0) / existingWithCoords.length;
                    const exLon = existingWithCoords.reduce((a, p) => a + p.lon, 0) / existingWithCoords.length;
                    const dist = haversineKm(exLat, exLon, suggestedOrigin.lat, suggestedOrigin.lon);
                    if (dist > 50) {
                        distanceWarning = {
                            km: Math.round(dist),
                            existingCentroid: { lat: exLat, lon: exLon },
                            newCentroid: suggestedOrigin,
                        };
                    }
                }
            }
            // D21: auto-detectar locale de datas (DD/MM vs MM/DD)
            if (state.decisions.dateLocale === 'auto') {
                const samplesSheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) =>
                    asArray<SheetMapping>(state.mapping?.sheetMappings).some(
                        (m) => m.sourceSheet === s.name && m.targetEntity === 'samples',
                    ),
                );
                if (samplesSheet) {
                    const dateCol = asArray<ColumnMapping>(state.mapping?.columns).find(
                        (c) => c.sourceSheet === samplesSheet.name && c.targetField === 'sampleDate',
                    );
                    if (dateCol) {
                        const dateValues = asArray<SheetRow>(samplesSheet.rows)
                            .slice(0, 30)
                            .map((r) => r[dateCol.sourceColumn]);
                        state.decisions.dateLocale = detectDateLocale(dateValues);
                    }
                }
                // Fallback se nao encontrou coluna de data
                if (state.decisions.dateLocale === 'auto') state.decisions.dateLocale = 'dd/mm';
            }
            // D8: mapeamento de abas com contagem real
            const sheetNames = asArray<ParsedSheet>(state.parsed.sheets).map((s) => s.name);
            const entityMap: Record<string, string> = {
                Locais: 'Elements (po\u00e7os)',
                Amostras: 'Amostras de campo',
                'Testes e Resultados': 'Observa\u00e7\u00f5es',
                'ref_N\u00edveis de A\u00e7\u00e3o': 'N\u00edveis de a\u00e7\u00e3o',
            };
            const sheetMappingInfo = sheetNames
                .filter(
                    (n) => (asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === n)?.rows?.length || 0) >= 5,
                )
                .map((n) => ({
                    name: n,
                    entity: entityMap[n] || null,
                    count: (asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === n)?.rows?.length || 1) - 1,
                }));
            return {
                ...base,
                format: state.format,
                stats: state.validation.stats,
                sheetsFound: asArray<ParsedSheet>(state.parsed.sheets).map((s) => ({
                    name: s.name,
                    rowCount: s.rowCount,
                })),
                existingModelWarning:
                    existingCount > 0
                        ? {
                              count: existingCount,
                              families: [...new Set(existingElements.map((e) => e.family))],
                          }
                        : null,
                // D8: Quick Import eligibility
                quickImportEligible: isQuickImportEligible(state),
                suggestedOrigin,
                locationDetection,
                georefPreview,
                applyOriginDefault,
                distanceWarning,
                sheetMappingInfo,
                showExportBeforeClear: existingCount > 0,
            };
        }
        case 'COLUMN_MAPPING':
            return {
                ...base,
                columns: getMergedColumns(state),
                previewData: getPreviewData(state),
            };
        case 'AMBIGUITY_RESOLUTION':
            return {
                ...base,
                ambiguities: getUnresolvedAmbiguities(state),
            };
        case 'DOMAIN_DECISIONS':
            if (state.decisions.domain === 'ohs') {
                return {
                    ...base,
                    domain: 'ohs',
                    stats: state.validation.stats,
                    hasGHE: detectGHE(state),
                    hasMixedSampleTypes: detectMixedSampleTypes(state),
                    hasWorkerPII: detectWorkerPII(state),
                    hasPCMSO: state.format.type === 'ohs-pcmso',
                    hasMultipleCampaigns: state.validation.stats.campaigns > 1,
                    decisions: state.decisions,
                };
            }
            {
                // D5: detectar aba de thresholds e exibir badge
                const sheetNames = asArray<ParsedSheet>(state.parsed.sheets).map((s) => s.name);
                const thresholdSheet = sheetNames.find((n) => /n[íi]vel|action.level|threshold/i.test(n));
                const thresholdSheetInfo = thresholdSheet
                    ? {
                          detected: true,
                          sheetName: thresholdSheet,
                          count:
                              (asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === thresholdSheet)?.rows
                                  ?.length || 1) - 1,
                      }
                    : null;
                // D4: calcular valor medio dos limites de deteccao dos ND (amostra de 100)
                let mdlAvg: number | null = null;
                let mdlUnit: string | null = null;
                if (state.validation.stats.nonDetect > 0 && state.parsed) {
                    const dlValues: number[] = [];
                    const unitFreq: Record<string, number> = {};
                    for (const sheet of asArray<ParsedSheet>(state.parsed.sheets)) {
                        for (const row of asArray<SheetRow>(sheet.rows)) {
                            if (dlValues.length >= 100) break;
                            const flag = String(row.detect_flag || row.detectFlag || '').toUpperCase();
                            if (flag !== 'N') continue;
                            const dl = parseFloat(
                                (row.method_detection_limit || row.detectionLimit || row.mdl || '') as string,
                            );
                            const unit = String(row.result_unit || row.unit || '').trim();
                            if (!isNaN(dl) && dl > 0) {
                                dlValues.push(dl);
                                if (unit) unitFreq[unit] = (unitFreq[unit] || 0) + 1;
                            }
                        }
                    }
                    if (dlValues.length > 0) {
                        mdlAvg = dlValues.reduce((a, b) => a + b, 0) / dlValues.length;
                        mdlUnit = Object.entries(unitFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                    }
                }
                // D21: calcular estatisticas de qualidade dos dados para informar decisoes
                const locations: LocationQuality[] = [];
                for (const sheet of asArray<ParsedSheet>(state.parsed.sheets)) {
                    for (const row of asArray<SheetRow>(sheet.rows)) {
                        const name = row.sys_loc_code || row.elementName || row.loc_name;
                        if (name && !locations.find((l) => l.name === name)) {
                            locations.push({
                                name,
                                hasCoords: row.latitude != null && row.longitude != null,
                                hasElevation: row.elevation != null && String(row.elevation).trim() !== '',
                                hasDepth:
                                    row.total_depth != null ||
                                    row.depth != null ||
                                    row.totalDepth != null ||
                                    row.borehole_depth != null ||
                                    row.profundidade != null,
                                hasDiameter:
                                    row.borehole_diameter != null || row.diameter != null || row.diametro != null,
                            });
                        }
                    }
                }
                // G4: detectar datum das coordenadas
                const datumSet = new Set<string>();
                for (const sheet of asArray<ParsedSheet>(state.parsed.sheets)) {
                    for (const row of asArray<SheetRow>(sheet.rows)) {
                        const d = row.alt_coord_type_code || row.coord_type || row.datum || row.coordinate_datum;
                        if (d) datumSet.add(String(d).trim().toUpperCase());
                    }
                }
                const detectedDatum = [...datumSet][0] || null;
                const safeDatums = ['WGS84', 'WGS 84', 'SIRGAS2000', 'SIRGAS 2000', 'SIRGAS', 'EPSG:4326', 'EPSG:4674'];
                const datumWarning =
                    detectedDatum && safeDatums.some((safeDatum) => String(detectedDatum).includes(safeDatum)) === false;
                const dataQuality = {
                    totalLocations: locations.length,
                    withCoordinates: locations.filter((l) => l.hasCoords).length,
                    withElevation: locations.filter((l) => l.hasElevation).length,
                    withDepth: locations.filter((l) => l.hasDepth).length,
                    withDiameter: locations.filter((l) => l.hasDiameter).length,
                    detectedDatum,
                    datumWarning,
                };
                return {
                    ...base,
                    domain: 'environmental',
                    stats: state.validation.stats,
                    dataQuality,
                    hasNonDetects: state.validation.stats.nonDetect > 0,
                    hasMultipleCampaigns: state.validation.stats.campaigns > 1,
                    hasMultilevelWells: detectMultilevelWells(state),
                    hasCoordinates: detectCoordinates(state),
                    hasActionLevels: detectActionLevels(state),
                    thresholdSheetInfo,
                    mdlAvg,
                    mdlUnit,
                    detectedDateLocale: state.decisions.dateLocale,
                    decisions: state.decisions,
                };
            }
        case 'REVIEW_AND_CONFIRM': {
            // D6: detectar duplicatas quando clearStrategy='none'
            let duplicateWarning: { count: number; examples: string[] } | null = null;
            if (state.decisions.clearStrategy === 'none') {
                const existingCodes = new Set(
                    (getAllElements() as ExistingElement[])
                        .map((e) => e.data?.sys_loc_code || e.name)
                        .filter(Boolean),
                );
                const locSheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) =>
                    asArray<SheetMapping>(state.mapping?.sheetMappings).some(
                        (m) => m.sourceSheet === s.name && m.targetEntity === 'elements',
                    ),
                );
                if (locSheet) {
                    const nameCol = asArray<ColumnMapping>(state.mapping?.columns).find(
                        (c) => c.sourceSheet === locSheet.name && c.targetField === 'elementName',
                    );
                    if (nameCol) {
                        const incomingCodes = asArray<SheetRow>(locSheet.rows)
                            .map((row) => row[nameCol.sourceColumn])
                            .filter(Boolean)
                            .map(String);
                        const overlapping = [...new Set(incomingCodes)].filter((c) => existingCodes.has(c));
                        if (overlapping.length > 0) {
                            duplicateWarning = { count: overlapping.length, examples: overlapping.slice(0, 3) };
                        }
                    }
                }
            }
            return {
                ...base,
                stats: state.validation.stats,
                decisions: state.decisions,
                warnings: state.validation.warnings,
                errors: state.validation.errors,
                summary: buildSummary(state),
                duplicateWarning,
            };
        }
        default:
            return base;
    }
}
/**
 * Verifica se o wizard esta completo (todas as etapas concluidas).
 * @param {WizardState} state
 * @returns {boolean}
 */
export function isWizardComplete(state: WizardState): boolean {
    return state.step === 'REVIEW_AND_CONFIRM' && state.decisions.formatConfirmed;
}
/**
 * Constroi o plano de ingestao final a partir do estado do wizard.
 * Este plano e passado ao ingester.js para execucao.
 *
 * @param {WizardState} state
 * @returns {IngestionPlan}
 */
export function buildIngestionPlan(state: WizardState): IngestionPlan {
    // Aplica overrides de coluna do humano ao mapping
    const finalMapping = applyColumnOverrides(state.mapping, state.decisions.columnOverrides);
    return {
        parsed: state.parsed,
        format: state.format,
        mapping: finalMapping,
        decisions: { ...state.decisions },
        validation: state.validation,
        domain: state.decisions.domain,
    };
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
function getStepTitle(step: string): string {
    const titles: Record<string, string> = {
        FORMAT_CONFIRM: 'Confirmar Formato',
        COLUMN_MAPPING: 'Mapeamento de Colunas',
        AMBIGUITY_RESOLUTION: 'Resolver Ambiguidades',
        DOMAIN_DECISIONS: 'Decisoes de Dominio',
        REVIEW_AND_CONFIRM: 'Revisar e Confirmar',
    };
    return titles[step] || step;
}
function getStepSubtitle(state: WizardState): string {
    switch (state.step) {
        case 'FORMAT_CONFIRM':
            return `Formato detectado: ${state.format.type} (confianca: ${Math.round(state.format.confidence * 100)}%)`;
        case 'COLUMN_MAPPING':
            return `${state.mapping.columns!.length} colunas encontradas`;
        case 'AMBIGUITY_RESOLUTION': {
            const unresolved = getUnresolvedAmbiguities(state);
            return `${unresolved.length} ambiguidade(s) para resolver`;
        }
        case 'DOMAIN_DECISIONS':
            return 'Decisoes que so o especialista pode tomar';
        case 'REVIEW_AND_CONFIRM':
            return 'Revise o resumo e confirme a ingestao';
        default:
            return '';
    }
}
function getUnresolvedAmbiguities(state: WizardState): Ambiguity[] {
    return asArray<Ambiguity>(state.mapping.ambiguities).filter((a) => {
        const key = `${a.type}:${a.sourceValue}`;
        return !state.decisions.ambiguityResolutions[key];
    });
}
function getMergedColumns(state: WizardState) {
    return asArray<ColumnMapping>(state.mapping.columns).map((col) => {
        const override = state.decisions.columnOverrides[`${col.sourceSheet}:${col.sourceColumn}`];
        return {
            ...col,
            targetField: override || col.targetField,
            isOverridden: !!override,
        };
    });
}
function getPreviewData(state: WizardState): Record<string, SheetRow[]> {
    // Retorna primeiras 5 linhas de cada sheet para preview
    const preview: Record<string, SheetRow[]> = {};
    for (const sheet of asArray<ParsedSheet>(state.parsed.sheets)) {
        preview[sheet.name] = asArray<SheetRow>(sheet.rows).slice(0, 5);
    }
    return preview;
}
function detectMultilevelWells(state: WizardState) {
    const locSheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) => {
        return asArray<SheetMapping>(state.mapping.sheetMappings).some(
            (m) => m.sourceSheet === s.name && m.targetEntity === 'elements',
        );
    });
    if (!locSheet) return { has: false, count: 0, examples: [] };
    const nameCol = asArray<ColumnMapping>(state.mapping.columns).find(
        (c) => c.sourceSheet === locSheet.name && c.targetField === 'elementName',
    );
    if (!nameCol) return { has: false, count: 0, examples: [] };
    const names = asArray<SheetRow>(locSheet.rows).map((r) => String(r[nameCol.sourceColumn] || ''));
    const multilevel = names.filter((n) => /[AB]$/i.test(n));
    return {
        has: multilevel.length > 0,
        count: multilevel.length,
        examples: multilevel.slice(0, 4),
    };
}
function detectCoordinates(state: WizardState) {
    const hasLat = asArray<ColumnMapping>(state.mapping.columns).some((c) => c.targetField === 'latitude');
    const hasLng = asArray<ColumnMapping>(state.mapping.columns).some((c) => c.targetField === 'longitude');
    return { has: hasLat && hasLng };
}
function detectActionLevels(state: WizardState) {
    return {
        has: asArray<SheetMapping>(state.mapping.sheetMappings).some((m) => m.targetEntity === 'actionLevels'),
    };
}
// --- OHS detection helpers ---
/**
 * Detecta se dados contem coluna GHE com grupos.
 */
function detectGHE(state: WizardState) {
    const gheCol = asArray<ColumnMapping>(state.mapping.columns).find((c) => c.targetField === 'gheId');
    if (!gheCol) return { has: false, count: 0, groups: [] };
    const sheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === gheCol.sourceSheet);
    if (!sheet) return { has: false, count: 0, groups: [] };
    const uniqueGHE = new Set<string>();
    for (const row of asArray<SheetRow>(sheet.rows)) {
        const val = row[gheCol.sourceColumn];
        if (val != null && String(val).trim()) uniqueGHE.add(String(val).trim());
    }
    return {
        has: uniqueGHE.size > 0,
        count: uniqueGHE.size,
        groups: [...uniqueGHE].slice(0, 20),
    };
}
/**
 * Detecta se dados contem ambos sample types: area e personal.
 */
function detectMixedSampleTypes(state: WizardState) {
    const typeCol = asArray<ColumnMapping>(state.mapping.columns).find((c) => c.targetField === 'sampleTypeOHS');
    if (!typeCol) return { has: false, types: [] };
    const sheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === typeCol.sourceSheet);
    if (!sheet) return { has: false, types: [] };
    const types = new Set<string>();
    for (const row of asArray<SheetRow>(sheet.rows)) {
        const val = row[typeCol.sourceColumn];
        if (val != null) types.add(String(val).toLowerCase().trim());
    }
    const normalizedTypes = [...types];
    const hasArea = normalizedTypes.some((t) => ['area', 'area_sample', 'ambiental'].includes(t));
    const hasPersonal = normalizedTypes.some((t) => ['personal', 'personal_sample', 'pessoal'].includes(t));
    return {
        has: hasArea && hasPersonal,
        types: normalizedTypes,
    };
}
/**
 * Detecta se dados contem informacoes pessoais de trabalhadores (LGPD).
 */
function detectWorkerPII(state: WizardState) {
    const piiFields = ['workerId', 'workerName'];
    const hasPII = piiFields.some((field) =>
        asArray<ColumnMapping>(state.mapping.columns).some((c) => c.targetField === field),
    );
    // Verifica se tem CPF ou nome explicito
    const hasCPF = asArray<ColumnMapping>(state.mapping.columns).some((c) => {
        const src = c.sourceColumn.toLowerCase();
        return src.includes('cpf') || src.includes('ssn');
    });
    return {
        has: hasPII,
        hasCPF,
        fields: piiFields.filter((f) =>
            asArray<ColumnMapping>(state.mapping.columns).some((c) => c.targetField === f),
        ),
    };
}
function buildSummary(state: WizardState): string[] {
    const s = state.validation.stats;
    const d = state.decisions;
    const lines: string[] = [];
    if (d.domain === 'ohs') {
        // Resumo OHS
        const gheInfo = detectGHE(state);
        const piiInfo = detectWorkerPII(state);
        const workerCount = countUniqueWorkers(state);
        lines.push(`${workerCount} trabalhadores (individual)`);
        if (gheInfo.has) lines.push(`${gheInfo.count} GHE groups`);
        lines.push(`${s.campaigns} campanha(s) de medicao`);
        lines.push(`${s.results} medicoes de exposicao:`);
        lines.push(`  ${s.chemicals.length} agentes: ${s.chemicals.join(', ')}`);
        if (s.dateRange.min && s.dateRange.max) {
            lines.push(`Periodo: ${s.dateRange.min} a ${s.dateRange.max}`);
        }
        if (s.exceedances > 0) {
            lines.push(`⚠ ${s.exceedances} exposicao(oes) acima do limite`);
        }
        lines.push('');
        if (gheInfo.has) lines.push(`GHE: ${d.gheStrategy === 'create_groups' ? 'criar grupos' : 'ignorar'}`);
        lines.push(
            `Tipo amostra: ${d.sampleTypeStrategy === 'separate' ? 'area/pessoal separados' : 'tudo no trabalhador'}`,
        );
        lines.push(`LGPD: ${d.lgpdStrategy}`);
        lines.push(`Limites: ${d.oelSource}`);
        if (d.importAptitude) lines.push('Aptidao PCMSO: importar');
        if (piiInfo.has) lines.push('⚠ Dados pessoais detectados (LGPD)');
    } else {
        // Resumo ambiental (existente)
        lines.push(`${s.locations} locais → elementos (family: well)`);
        lines.push(`${s.campaigns} campanha(s)`);
        lines.push(`${s.results} observacoes:`);
        lines.push(`  ${s.detected} detectados (${Math.round((s.detected / Math.max(s.results, 1)) * 100)}%)`);
        lines.push(`  ${s.nonDetect} nao-detectados (${Math.round((s.nonDetect / Math.max(s.results, 1)) * 100)}%)`);
        lines.push(`  ${s.chemicals.length} parametros: ${s.chemicals.join(', ')}`);
        if (s.dateRange.min && s.dateRange.max) {
            lines.push(`Periodo: ${s.dateRange.min} a ${s.dateRange.max}`);
        }
        if (s.exceedances > 0) {
            lines.push(`${s.exceedances} excedencia(s) regulatoria(s)`);
        }
        lines.push('');
        lines.push(`Nao-detectados: ${d.nonDetectStrategy}`);
        lines.push(`Campanhas: ${d.campaignStrategy}`);
        lines.push(`Multinivel: ${d.multilevelStrategy}`);
        lines.push(`Coordenadas: ${typeof d.coordinateOrigin === 'string' ? d.coordinateOrigin : 'custom'}`);
        lines.push(`Elevacao: ${d.elevationStrategy || 'file'}`);
        if (Number(d.geoOffsetX || 0) !== 0 || Number(d.geoOffsetY || 0) !== 0 || Number(d.geoRotationDeg || 0) !== 0) {
            lines.push(
                `Ajuste georef: dX=${Number(d.geoOffsetX || 0)}m, dY=${Number(d.geoOffsetY || 0)}m, rot=${Number(d.geoRotationDeg || 0)}°`,
            );
        }
        lines.push(`Limites referencia: ${d.importActionLevels ? 'sim' : 'nao'}`);
    }
    return lines;
}
/**
 * Conta trabalhadores unicos nos dados.
 */
function countUniqueWorkers(state: WizardState): number {
    const workerCol = asArray<ColumnMapping>(state.mapping.columns).find((c) => c.targetField === 'workerId');
    if (!workerCol) return 0;
    const sheet = asArray<ParsedSheet>(state.parsed.sheets).find((s) => s.name === workerCol.sourceSheet);
    if (!sheet) return 0;
    const unique = new Set<string>();
    for (const row of asArray<SheetRow>(sheet.rows)) {
        const val = row[workerCol.sourceColumn];
        if (val != null && String(val).trim()) unique.add(String(val).trim());
    }
    return unique.size;
}
/**
 * D12: Calcula distancia em km entre dois pontos geograficos (Haversine).
 * Usado para alertar quando dados importados estao distantes do modelo atual.
 *
 * @param {number} lat1 @param {number} lon1
 * @param {number} lat2 @param {number} lon2
 * @returns {number} Distancia em km
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function applyColumnOverrides(mapping: MappingProposal, overrides: Record<string, string>): MappingProposal {
    if (!overrides || Object.keys(overrides).length === 0) return mapping;
    return {
        ...mapping,
        columns: asArray<ColumnMapping>(mapping.columns).map((col) => {
            const key = `${col.sourceSheet}:${col.sourceColumn}`;
            if (overrides[key]) {
                return { ...col, targetField: overrides[key], method: 'human', confidence: 1.0 };
            }
            return col;
        }),
    };
}
