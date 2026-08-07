// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Catálogo canônico dos 4 cenários receptor CETESB (DD 103/2007/C/E v4.00).
// Pure-logic, Object.freeze, sem THREE/DOM/IDB. Suporta `core/risk/cetesb`.
//
// Fonte: Manual do Usuário Planilhas CETESB (abril 2026) §4.1 (Cenários) +
// detalhamento das vias canônicas por receptor.
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (CETESB-RISK-001) RF-1.1
// ADR: src/app/js/core/risk/cetesb/ADR.md A1+A2

export type ScenarioId = 'RES_URB' | 'RES_RUR' | 'TRAB_COM_IND' | 'TRAB_OBRA_CIV';

/** Meio físico impactado: solo / água subterrânea / ar ambiente. */
export type Medium = 'soil' | 'groundwater' | 'air';

/**
 * Via de ingresso (exposure pathway).
 * - `ingestion_soil`: ingestão direta de solo (mãos→boca)
 * - `dermal_soil`: contato dérmico com solo
 * - `inhalation_particulate_soil`: inalação de partículas de solo (poeira)
 * - `inhalation_vapor_soil`: inalação de vapores volatilizados do solo
 * - `ingestion_groundwater`: ingestão de água subterrânea
 * - `dermal_groundwater`: contato dérmico com água subterrânea
 * - `inhalation_vapor_groundwater`: intrusão de vapor da água sub para ar interno
 * - `inhalation_ambient_air`: inalação de ar ambiente externo
 * - `ingestion_vegetables`: ingestão de vegetais cultivados sobre solo impactado
 *   (RES_RUR específico)
 */
export type Pathway =
    | 'ingestion_soil'
    | 'dermal_soil'
    | 'inhalation_particulate_soil'
    | 'inhalation_vapor_soil'
    | 'ingestion_groundwater'
    | 'dermal_groundwater'
    | 'inhalation_vapor_groundwater'
    | 'inhalation_ambient_air'
    | 'ingestion_vegetables';

export interface ScenarioDef {
    /** Identificador estável usado em API + storage. */
    readonly id: ScenarioId;
    /** Rótulo curto canônico (não traduzido — UI consome via i18n). */
    readonly receptorLabel: string;
    /** Vias canônicas habilitadas para o cenário. */
    readonly pathways: ReadonlyArray<Pathway>;
    /** Meios físicos que o cenário considera por padrão. */
    readonly defaultMedia: ReadonlyArray<Medium>;
    /** Nome da planilha .xlsm oficial CETESB equivalente. */
    readonly officialSpreadsheet: string;
    /** Notas técnicas (Manual §4.1 + ANexos B/C). */
    readonly notes: string;
}

/** Catálogo dos 4 cenários receptor — congelado. */
export const RISK_SCENARIOS: ReadonlyArray<ScenarioDef> = Object.freeze([
    Object.freeze({
        id: 'RES_URB' as ScenarioId,
        receptorLabel: 'Residente Urbano',
        pathways: Object.freeze([
            'ingestion_soil',
            'dermal_soil',
            'inhalation_particulate_soil',
            'inhalation_vapor_soil',
            'ingestion_groundwater',
            'dermal_groundwater',
            'inhalation_vapor_groundwater',
            'inhalation_ambient_air',
        ]) as ReadonlyArray<Pathway>,
        defaultMedia: Object.freeze(['soil', 'groundwater', 'air']) as ReadonlyArray<Medium>,
        officialSpreadsheet: 'CETESBRisk-v4.00–ResUrb-Abr2026-blk.xlsm',
        notes:
            'Residente em área urbana (criança + adulto). Inclui ingestão de água subterrânea ' +
            'quando o abastecimento NÃO vem de rede pública. Intrusão de vapor considera ' +
            'edificação residencial típica (Johnson & Ettinger 1991).',
    }),
    Object.freeze({
        id: 'RES_RUR' as ScenarioId,
        receptorLabel: 'Residente Rural',
        pathways: Object.freeze([
            'ingestion_soil',
            'dermal_soil',
            'inhalation_particulate_soil',
            'inhalation_vapor_soil',
            'ingestion_groundwater',
            'dermal_groundwater',
            'inhalation_vapor_groundwater',
            'inhalation_ambient_air',
            'ingestion_vegetables',
        ]) as ReadonlyArray<Pathway>,
        defaultMedia: Object.freeze(['soil', 'groundwater', 'air']) as ReadonlyArray<Medium>,
        officialSpreadsheet: 'CETESBRisk-v4.00–ResRural-Abr2026-blk.xlsm',
        notes:
            'Residente em área rural (criança + adulto). Inclui ingestão de vegetais ' +
            'cultivados sobre solo impactado (única via diferenciadora vs RES_URB). ' +
            'Parâmetros EXP rurais (Manual Anexo C).',
    }),
    Object.freeze({
        id: 'TRAB_COM_IND' as ScenarioId,
        receptorLabel: 'Trabalhador Comercial/Industrial',
        pathways: Object.freeze([
            'ingestion_soil',
            'dermal_soil',
            'inhalation_particulate_soil',
            'inhalation_vapor_groundwater',
            'inhalation_ambient_air',
        ]) as ReadonlyArray<Pathway>,
        defaultMedia: Object.freeze(['soil', 'groundwater', 'air']) as ReadonlyArray<Medium>,
        officialSpreadsheet: 'CETESBRisk-v4.00–TrabComInd-Abr2026-blk.xlsm',
        notes:
            'Trabalhador adulto em comércio/indústria. SEM ingestão de água subterrânea ' +
            '(abastecimento via rede pública assumido). Tempo de exposição limitado a ' +
            'jornada de trabalho (Manual EXP — Anexo C).',
    }),
    Object.freeze({
        id: 'TRAB_OBRA_CIV' as ScenarioId,
        receptorLabel: 'Trabalhador em Obra Civil',
        pathways: Object.freeze([
            'ingestion_soil',
            'dermal_soil',
            'inhalation_particulate_soil',
            'inhalation_vapor_soil',
            'inhalation_ambient_air',
        ]) as ReadonlyArray<Pathway>,
        defaultMedia: Object.freeze(['soil', 'air']) as ReadonlyArray<Medium>,
        officialSpreadsheet: 'CETESBRisk-v4.00–TrabObraCiv-Abr2026-blk.xlsm',
        notes:
            'Trabalhador em obras civis/escavação. Exposição intensiva a partículas e ' +
            'vapores liberados durante escavação. Sem exposição a água subterrânea ' +
            '(escopo restrito a movimentação de solo).',
    }),
]);

const _SCENARIO_INDEX: ReadonlyMap<ScenarioId, ScenarioDef> = new Map(
    RISK_SCENARIOS.map((s) => [s.id, s]),
);

/** Retorna lista canônica de cenários receptor. */
export function listScenarios(): ReadonlyArray<{ id: ScenarioId; label: string; receptor: string }> {
    return RISK_SCENARIOS.map((s) => ({ id: s.id, label: s.receptorLabel, receptor: s.id }));
}

/** Retorna ScenarioDef ou `undefined` se id desconhecido. */
export function getScenario(id: string): ScenarioDef | undefined {
    return _SCENARIO_INDEX.get(id as ScenarioId);
}

/** Verifica se uma via é canônica para o cenário fornecido. */
export function isPathwayApplicable(scenarioId: ScenarioId, pathway: Pathway): boolean {
    const def = _SCENARIO_INDEX.get(scenarioId);
    if (!def) return false;
    return def.pathways.includes(pathway);
}

/** Filtra vias do cenário restritas aos meios habilitados. */
export function filterPathwaysByMedia(
    scenarioId: ScenarioId,
    mediaImpacted: ReadonlyArray<Medium>,
): ReadonlyArray<Pathway> {
    const def = _SCENARIO_INDEX.get(scenarioId);
    if (!def) return [];
    const allowed = new Set(mediaImpacted);
    return def.pathways.filter((p) => {
        if (p.endsWith('_soil')) return allowed.has('soil');
        if (p.endsWith('_groundwater')) return allowed.has('groundwater');
        if (p === 'inhalation_ambient_air') return allowed.has('air');
        if (p === 'ingestion_vegetables') return allowed.has('soil'); // veg cresce no solo
        return false;
    });
}

/** Lista todos os IDs de cenário válidos (helper de validação). */
export const SCENARIO_IDS: ReadonlyArray<ScenarioId> = Object.freeze(
    RISK_SCENARIOS.map((s) => s.id),
);

/** Lista todas as vias canônicas conhecidas (helper de validação). */
export const ALL_PATHWAYS: ReadonlyArray<Pathway> = Object.freeze([
    'ingestion_soil',
    'dermal_soil',
    'inhalation_particulate_soil',
    'inhalation_vapor_soil',
    'ingestion_groundwater',
    'dermal_groundwater',
    'inhalation_vapor_groundwater',
    'inhalation_ambient_air',
    'ingestion_vegetables',
]);

/** Lista todos os meios físicos (helper de validação). */
export const ALL_MEDIA: ReadonlyArray<Medium> = Object.freeze(['soil', 'groundwater', 'air']);
