// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   SEED BUILT-INS — MOD-LIB-MIG-001 (Calvin 2026-06-11 "seguir")
   Primeiros 5 built-ins migrados para library modules via S4 APIs.

   Cada built-in:
   - Vive como LibraryManifest declarativo (sem código executável)
   - Referencia handler_keys CANÔNICOS já registrados no ACTION_REGISTRY
   - Passa por validateLibraryManifest (B1 trust model)
   - Registra-se via S4 (registerAction/Template/BroadcastPreset/FieldMeta)

   Migração end-to-end provada por seedBuiltinLibraryModules(). Os 5
   foram escolhidos por cobrir as 4 APIs S4 + serem auditavelmente
   úteis (não dummy).

   Pattern para futuros built-ins (~45 restantes do CBLD): copiar este
   arquivo, mudar declarations, adicionar ao array BUILTIN_MANIFESTS.
   ================================================================ */

import {
    registerAction,
    registerReportTemplate,
    registerBroadcastPreset,
    registerFieldMeta,
    setCanonicalHandlerKeys,
} from './registry.js';
import type { LibraryManifest } from './_libraryTrustModelPure.js';

// ----------------------------------------------------------------
// 5 BUILT-IN MANIFESTS — cobre as 4 S4 APIs (action/template/preset/meta)
// ----------------------------------------------------------------

const CONAMA_420_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.conama-420.actions',
    module_name: 'CONAMA 420 Actions Pack',
    author: { name: 'ecbyts core', contact: 'https://github.com/calvinsiost/ecbyts' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'conama-420.seed-domain',
                label_i18n: 'compliance.preset.br-conama-420-ar4.name',
                intent: 'seed_conama_420_domain',
                handler_key: 'handleSeedConama420Domain',
            },
            {
                id: 'compliance.open-details',
                label_i18n: 'compliance.details.title',
                intent: 'open_compliance_details_modal',
                handler_key: 'handleOpenComplianceDetails',
            },
        ],
    },
};

const CETESB_REPORT_TEMPLATE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.cetesb.report-templates',
    module_name: 'CETESB Report Templates',
    author: { name: 'ecbyts core' },
    capabilities: ['register_report_template'],
    declarations: {
        report_templates: [
            {
                id: 'cetesb-avaliacao-preliminar',
                name: 'CETESB Avaliação Preliminar (Fase I)',
                markdown: '## Avaliacao Preliminar\n\n{{observationSummary}}\n\n{{exceedanceTable}}\n\n## MCA\n\n{{cmaTable}}',
                bindings: ['observationSummary', 'exceedanceTable', 'cmaTable'],
            },
            {
                id: 'cetesb-investigacao-confirmatoria',
                name: 'CETESB Investigação Confirmatória (Fase II)',
                markdown: '## Fase II\n\n{{observationTable}}\n\n{{topContaminants}}',
                bindings: ['observationTable', 'topContaminants'],
            },
        ],
    },
};

const RADAR_DEFAULT_PRESETS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.radar.default-presets',
    module_name: 'Radar Default Broadcast Presets',
    author: { name: 'ecbyts core' },
    capabilities: ['register_broadcast_preset'],
    declarations: {
        broadcast_presets: [
            { id: 'public-summary', label: 'Public Summary', visibility: 'public' },
            { id: 'regulator-full', label: 'Regulator Full Disclosure', visibility: 'restricted' },
            { id: 'investor-aggregated', label: 'Investor Aggregated', visibility: 'restricted' },
        ],
    },
};

const FIELD_META_OHS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.ohs',
    module_name: 'OHS Field Meta (NR-15/ACGIH)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'ohs.worker.shift', kind: 'string', regulation: 'NR-15' },
            { id: 'ohs.exposure.duration_h', kind: 'number', unit: 'hour' },
            { id: 'ohs.bei.creatinine_ug_g', kind: 'number', regulation: 'ACGIH-BEI-2024' },
            { id: 'ohs.epi.respirator_class', kind: 'string', regulation: 'NR-6' },
        ],
    },
};

const FIELD_META_HYDROMET_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.hydromet',
    module_name: 'Hydromet Field Meta (acid leach/cyanidation)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'hydromet.tank.acid_strength_gL', kind: 'number', unit: 'g/L', acid: 'H2SO4' },
            { id: 'hydromet.tank.lixiviant', kind: 'string', allowed: 'CN|H2SO4|HCl|NH3' },
            { id: 'hydromet.tank.temperature_C', kind: 'number', unit: 'celsius' },
            { id: 'hydromet.tank.flow_m3h', kind: 'number', unit: 'm3/h' },
        ],
    },
};

// ----------------------------------------------------------------
// Wave 2 — +5 built-ins (Calvin 2026-06-11 "seguir") cobrindo mais
// domínios: OHS actions, hydromet actions, emergency workflow,
// field meta geology + hydrogeology
// ----------------------------------------------------------------

const OHS_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.ohs.actions',
    module_name: 'OHS (Health Monitoring) Actions',
    author: { name: 'ecbyts core' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'ohs.open-tour',
                label_i18n: 'guidedTourHydrometOhs',
                intent: 'open_guided_tour',
                handler_key: 'handleStartGuidedTour',
                params_schema: { tourId: 'string' },
            },
        ],
    },
};

const HYDROMET_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.hydromet.actions',
    module_name: 'Hydrometallurgy Actions',
    author: { name: 'ecbyts core' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'hydromet.add-tank',
                label_i18n: 'gtHydrometOhsAddTank',
                intent: 'add_leaching_tank',
                handler_key: 'handleAddElement',
                params_schema: { familyId: 'string', name: 'string', x: 'number', y: 'number' },
            },
            {
                id: 'hydromet.add-observation',
                label_i18n: 'gtHydrometOhsChemParams',
                intent: 'add_chem_observation',
                handler_key: 'handleAddObservation',
                params_schema: { elementId: 'string', parameterId: 'string', value: 'number', unit: 'string' },
            },
        ],
    },
};

const EMERGENCY_WORKFLOW_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.emergency.actions',
    module_name: 'Emergency Response Workflow Actions',
    author: { name: 'ecbyts core' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'emergency.open-picker',
                label_i18n: 'gtHydrometOhsEmergency',
                intent: 'open_workflow_picker',
                handler_key: 'handleOpenWorkflowPicker',
            },
            {
                id: 'emergency.open-ingestion',
                label_i18n: 'guidedTourEmergencyResponse',
                intent: 'open_ingestion_modal',
                handler_key: 'handleOpenIngestionModal',
            },
        ],
    },
};

const FIELD_META_GEOLOGY_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.geology',
    module_name: 'Geology Field Meta (ABNT NBR 13441)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'geology.layer.lithology', kind: 'string', regulation: 'ABNT-NBR-13441' },
            { id: 'geology.layer.thickness_m', kind: 'number', unit: 'meter' },
            { id: 'geology.layer.dip_deg', kind: 'number', unit: 'degree', range: '0-90' },
            { id: 'geology.layer.strike_deg', kind: 'number', unit: 'degree', range: '0-360' },
            { id: 'geology.fault.kinematics', kind: 'string', allowed: 'normal|reverse|strike_slip|oblique' },
        ],
    },
};

const FIELD_META_HYDROGEOLOGY_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.hydrogeology',
    module_name: 'Hydrogeology Field Meta',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'hydro.well.transmissivity_m2d', kind: 'number', unit: 'm2/day' },
            { id: 'hydro.well.hydraulic_conductivity_md', kind: 'number', unit: 'm/day' },
            { id: 'hydro.well.storativity', kind: 'number', range: '0-1' },
            { id: 'hydro.aquifer.type', kind: 'string', allowed: 'confined|unconfined|leaky|perched' },
            { id: 'hydro.water_level.elevation_m', kind: 'number', unit: 'meter', datum: 'SIRGAS-2000' },
        ],
    },
};

// ----------------------------------------------------------------
// Wave 3 — +10 built-ins (Calvin 2026-06-11 "continuar") cobrindo
// matrizes regulatórias restantes: ar, água superficial, solo,
// resíduos, ruído, GHG + templates OHS/GHG + presets mineração +
// action de consistência
// ----------------------------------------------------------------

const FIELD_META_AIR_QUALITY_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.air-quality',
    module_name: 'Air Quality Field Meta (CONAMA 491/2018)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'air.station.pollutant', kind: 'string', allowed: 'MP10|MP2.5|O3|CO|NO2|SO2|Pb' },
            { id: 'air.sample.averaging_period_h', kind: 'number', unit: 'hour', regulation: 'CONAMA-491' },
            { id: 'air.sample.concentration_ugm3', kind: 'number', unit: 'ug/m3' },
            { id: 'air.station.aqi_band', kind: 'string', allowed: 'boa|moderada|ruim|muito_ruim|pessima' },
            { id: 'air.meteo.wind_speed_ms', kind: 'number', unit: 'm/s' },
        ],
    },
};

const FIELD_META_WATER_QUALITY_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.water-quality',
    module_name: 'Surface Water Field Meta (CONAMA 357/2005)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'water.body.class', kind: 'string', allowed: 'especial|1|2|3|4', regulation: 'CONAMA-357' },
            { id: 'water.sample.od_mgL', kind: 'number', unit: 'mg/L' },
            { id: 'water.sample.dbo_mgL', kind: 'number', unit: 'mg/L' },
            { id: 'water.sample.turbidity_ntu', kind: 'number', unit: 'NTU' },
            { id: 'water.sample.thermotolerant_coliforms', kind: 'number', unit: 'NMP/100mL' },
        ],
    },
};

const FIELD_META_SOIL_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.soil',
    module_name: 'Soil Field Meta (CONAMA 420/2009)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'soil.sample.depth_m', kind: 'number', unit: 'meter' },
            { id: 'soil.sample.texture', kind: 'string', allowed: 'arenoso|siltoso|argiloso|organico' },
            { id: 'soil.threshold.tier', kind: 'string', allowed: 'VR|VP|VI', regulation: 'CONAMA-420' },
            { id: 'soil.use.scenario', kind: 'string', allowed: 'agricola|residencial|industrial' },
        ],
    },
};

const FIELD_META_WASTE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.waste',
    module_name: 'Waste Field Meta (ABNT NBR 10004)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'waste.class', kind: 'string', allowed: 'I|IIA|IIB', regulation: 'ABNT-NBR-10004' },
            { id: 'waste.stream.volume_m3', kind: 'number', unit: 'm3' },
            { id: 'waste.disposal.method', kind: 'string', allowed: 'aterro|coprocessamento|reciclagem|incineracao' },
            { id: 'waste.mtr.number', kind: 'string', regulation: 'SINIR' },
        ],
    },
};

const FIELD_META_NOISE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.noise',
    module_name: 'Noise Field Meta (ABNT NBR 10151)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'noise.sample.laeq_db', kind: 'number', unit: 'dB(A)', regulation: 'ABNT-NBR-10151' },
            { id: 'noise.sample.period', kind: 'string', allowed: 'diurno|noturno' },
            { id: 'noise.zone.type', kind: 'string', allowed: 'residencial|misto|industrial|hospitalar' },
            { id: 'noise.source.kind', kind: 'string', allowed: 'fixa|movel|impulsiva' },
        ],
    },
};

const FIELD_META_GHG_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.ghg',
    module_name: 'GHG Field Meta (GHG Protocol + IPCC AR6)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'ghg.emission.scope', kind: 'string', allowed: '1|2|3', regulation: 'GHG-Protocol' },
            { id: 'ghg.emission.gas', kind: 'string', allowed: 'CO2|CH4|N2O|HFC|PFC|SF6|NF3' },
            { id: 'ghg.emission.tco2e', kind: 'number', unit: 'tCO2e', gwp: 'IPCC-AR6-100y' },
            { id: 'ghg.factor.source', kind: 'string', regulation: 'IPCC-2006' },
        ],
    },
};

const OHS_REPORT_TEMPLATES_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.ohs.report-templates',
    module_name: 'OHS Report Templates (PCMSO/PGR)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_report_template'],
    declarations: {
        report_templates: [
            {
                id: 'ohs-pcmso-anual',
                name: 'Relatório Anual PCMSO (NR-7)',
                markdown: '## PCMSO — Relatorio Anual\n\n{{observationSummary}}\n\n{{exceedanceTable}}',
                bindings: ['observationSummary', 'exceedanceTable'],
            },
            {
                id: 'ohs-pgr-inventario',
                name: 'Inventário de Riscos PGR (NR-1)',
                markdown: '## PGR — Inventario de Riscos\n\n{{observationTable}}\n\n{{topContaminants}}',
                bindings: ['observationTable', 'topContaminants'],
            },
        ],
    },
};

const GHG_REPORT_TEMPLATE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.ghg.report-templates',
    module_name: 'GHG Inventory Report Template',
    author: { name: 'ecbyts core' },
    capabilities: ['register_report_template'],
    declarations: {
        report_templates: [
            {
                id: 'ghg-inventario-corporativo',
                name: 'Inventário GHG Corporativo (GHG Protocol)',
                markdown: '## Inventario de Emissoes GEE\n\n{{observationSummary}}\n\n{{dateRange}}\n\n{{observationTable}}',
                bindings: ['observationSummary', 'dateRange', 'observationTable'],
            },
        ],
    },
};

const RADAR_MINING_PRESETS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.radar.mining-presets',
    module_name: 'Radar Mining Broadcast Presets (ANM/ICMM)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_broadcast_preset'],
    declarations: {
        broadcast_presets: [
            { id: 'anm-dam-safety', label: 'ANM Seguranca de Barragens (SIGBM)', visibility: 'restricted' },
            { id: 'icmm-community', label: 'ICMM Community Disclosure', visibility: 'public' },
        ],
    },
};

const CONSISTENCY_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.consistency.actions',
    module_name: 'System Consistency Actions',
    author: { name: 'ecbyts core' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'consistency.open-panel',
                label_i18n: 'admin.consistency.title',
                intent: 'open_consistency_panel',
                handler_key: 'handleOpenConsistencyPanel',
            },
        ],
    },
};

// ----------------------------------------------------------------
// Wave 4 — +10 built-ins (Calvin 2026-06-11 "seguir") cobrindo
// barragens (ANM/SIGBM), mineração, sensores IoT, remediação,
// licenciamento ambiental e PhotoLog
// ----------------------------------------------------------------

const FIELD_META_DAM_SAFETY_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.dam-safety',
    module_name: 'Dam Safety Field Meta (ANM Res. 95/2022 + SIGBM)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'dam.category_risk', kind: 'string', allowed: 'A|B|C', regulation: 'ANM-95-2022' },
            { id: 'dam.associated_potential_damage', kind: 'string', allowed: 'alto|medio|baixo', regulation: 'ANM-95-2022' },
            { id: 'dam.height_m', kind: 'number', unit: 'meter' },
            { id: 'dam.reservoir_volume_hm3', kind: 'number', unit: 'hm3' },
            { id: 'dam.emergency_level', kind: 'string', allowed: '0|1|2|3', regulation: 'SIGBM' },
        ],
    },
};

const FIELD_META_MINING_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.mining',
    module_name: 'Mining Field Meta (open-pit)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'pit.bench_height_m', kind: 'number', unit: 'meter' },
            { id: 'pit.slope_angle_deg', kind: 'number', unit: 'degree', range: '0-90' },
            { id: 'mine.commodity', kind: 'string' },
            { id: 'mine.phase', kind: 'string', allowed: 'pesquisa|implantacao|operacao|fechamento|pos_fechamento' },
        ],
    },
};

const FIELD_META_SENSORS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.sensors',
    module_name: 'IoT Sensors Field Meta',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'sensor.protocol', kind: 'string', allowed: 'mqtt|http|lorawan|modbus' },
            { id: 'sensor.sampling_interval_s', kind: 'number', unit: 'second' },
            { id: 'sensor.battery_pct', kind: 'number', unit: 'percent', range: '0-100' },
            { id: 'sensor.last_calibration_date', kind: 'string' },
        ],
    },
};

const FIELD_META_REMEDIATION_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.remediation',
    module_name: 'Remediation Field Meta',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'remediation.technology', kind: 'string', allowed: 'pump_treat|sve|mna|prb|isco|bioremediation' },
            { id: 'remediation.start_date', kind: 'string' },
            { id: 'remediation.target_cleanup_level', kind: 'number' },
            { id: 'remediation.cost_brl', kind: 'number', unit: 'BRL' },
        ],
    },
};

const FIELD_META_LICENSING_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.licensing',
    module_name: 'Environmental Licensing Field Meta (CONAMA 237)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'license.type', kind: 'string', allowed: 'LP|LI|LO|LOC', regulation: 'CONAMA-237' },
            { id: 'license.number', kind: 'string' },
            { id: 'license.expiry_date', kind: 'string' },
            { id: 'license.agency', kind: 'string' },
        ],
    },
};

const FIELD_META_PHOTOLOG_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.field-meta.photolog',
    module_name: 'PhotoLog Field Meta',
    author: { name: 'ecbyts core' },
    capabilities: ['register_field_meta'],
    declarations: {
        field_meta: [
            { id: 'photo.gps_source', kind: 'string', allowed: 'exif|manual|none' },
            { id: 'photo.condition', kind: 'string', allowed: 'novo|bom|regular|ruim|critico' },
            { id: 'photo.tagged_by_ai', kind: 'string', allowed: 'sim|nao' },
        ],
    },
};

const LICENSING_REPORT_TEMPLATE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.licensing.report-templates',
    module_name: 'Licensing Compliance Report Template',
    author: { name: 'ecbyts core' },
    capabilities: ['register_report_template'],
    declarations: {
        report_templates: [
            {
                id: 'licensing-conformidade',
                name: 'Conformidade de Licenças Ambientais (CONAMA 237)',
                markdown: '## Situacao das Licencas\n\n{{observationSummary}}\n\n{{dateRange}}\n\n{{observationTable}}',
                bindings: ['observationSummary', 'dateRange', 'observationTable'],
            },
        ],
    },
};

const DAM_SAFETY_REPORT_TEMPLATE_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.dam-safety.report-templates',
    module_name: 'Dam Safety Review Report Template (RPSB)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_report_template'],
    declarations: {
        report_templates: [
            {
                id: 'dam-rpsb',
                name: 'Revisão Periódica de Segurança de Barragem (ANM)',
                markdown: '## RPSB\n\n{{observationSummary}}\n\n{{exceedanceTable}}\n\n{{topContaminants}}',
                bindings: ['observationSummary', 'exceedanceTable', 'topContaminants'],
            },
        ],
    },
};

const RADAR_REGULATORY_PRESETS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.radar.regulatory-presets',
    module_name: 'Radar Regulatory Broadcast Presets (CETESB/IBAMA)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_broadcast_preset'],
    declarations: {
        broadcast_presets: [
            { id: 'cetesb-gac-disclosure', label: 'CETESB GAC Disclosure (DD 038/2017)', visibility: 'restricted' },
            { id: 'ibama-federal', label: 'IBAMA Federal Disclosure', visibility: 'restricted' },
        ],
    },
};

const NAVIGATION_ACTIONS_MANIFEST: LibraryManifest = {
    schema_version: '1.0.0',
    module_id: 'builtin.navigation.actions',
    module_name: 'Navigation Actions (tours + ingestion)',
    author: { name: 'ecbyts core' },
    capabilities: ['register_action'],
    declarations: {
        actions: [
            {
                id: 'nav.open-guided-tours',
                label_i18n: 'guidedToursTitle',
                intent: 'open_guided_tours_picker',
                handler_key: 'handleOpenGuidedTours',
            },
            {
                id: 'nav.open-ingestion',
                label_i18n: 'smartImport',
                intent: 'open_ingestion_wizard',
                handler_key: 'handleOpenIngestionModal',
            },
        ],
    },
};

// ----------------------------------------------------------------
// Wave 5 (final) — +20 built-ins (Calvin 2026-06-11 "seguir") fechando
// MOD-LIB-MIG-001 em 50/50: poços, campanhas, biota, erosão, efluentes,
// tanques, transporte, saúde clínica, meteorologia, infraestrutura,
// sondagem, comunidade + 4 templates + 4 presets + 3 actions
// ----------------------------------------------------------------

const W5_FIELD_META: ReadonlyArray<LibraryManifest> = [
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.wells',
        module_name: 'Monitoring Wells Field Meta (ABNT NBR 15495)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'well.diameter_mm', kind: 'number', unit: 'mm', regulation: 'ABNT-NBR-15495' },
                { id: 'well.depth_m', kind: 'number', unit: 'meter' },
                { id: 'well.static_level_m', kind: 'number', unit: 'meter' },
                { id: 'well.dynamic_level_m', kind: 'number', unit: 'meter' },
                { id: 'well.drilling_method', kind: 'string', allowed: 'rotativa|percussao|trado|hollow_auger' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.campaigns',
        module_name: 'Sampling Campaigns Field Meta',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'campaign.lab_name', kind: 'string' },
                { id: 'campaign.sampling_method', kind: 'string', allowed: 'low_flow|bailer|grab|composite' },
                { id: 'campaign.chain_of_custody', kind: 'string' },
                { id: 'campaign.weather_conditions', kind: 'string' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.biotic',
        module_name: 'Biotic Field Meta (habitat/espécies)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'habitat.biome', kind: 'string', allowed: 'mata_atlantica|cerrado|amazonia|caatinga|pampa|pantanal' },
                { id: 'habitat.indicator_species', kind: 'string' },
                { id: 'habitat.conservation_status', kind: 'string', allowed: 'preservado|degradado|em_recuperacao' },
                { id: 'habitat.app_area', kind: 'string', allowed: 'sim|nao', regulation: 'Lei-12651-2012' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.erosion',
        module_name: 'Erosion Field Meta (USLE/RUSLE)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'erosion.k_factor', kind: 'number' },
                { id: 'erosion.slope_pct', kind: 'number', unit: 'percent', range: '0-100' },
                { id: 'erosion.cover_type', kind: 'string', allowed: 'vegetacao_densa|pasto|solo_exposto|impermeabilizado' },
                { id: 'erosion.gully_present', kind: 'string', allowed: 'sim|nao' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.effluents',
        module_name: 'Effluents Field Meta (CONAMA 430/2011)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'effluent.flow_m3h', kind: 'number', unit: 'm3/h', regulation: 'CONAMA-430' },
                { id: 'effluent.discharge_ph', kind: 'number', range: '0-14' },
                { id: 'effluent.temperature_c', kind: 'number', unit: 'celsius' },
                { id: 'effluent.treatment_stage', kind: 'string', allowed: 'bruto|primario|secundario|terciario' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.tanks-storage',
        module_name: 'Storage Tanks Field Meta (NBR 17505)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'tank.stored_product', kind: 'string' },
                { id: 'tank.capacity_m3', kind: 'number', unit: 'm3', regulation: 'ABNT-NBR-17505' },
                { id: 'tank.containment', kind: 'string', allowed: 'bacia|parede_dupla|nenhuma' },
                { id: 'tank.installation', kind: 'string', allowed: 'aereo|subterraneo|semi_enterrado' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.transport',
        module_name: 'Transport Field Meta (rotas/frota)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'transport.modal', kind: 'string', allowed: 'rodoviario|ferroviario|duto|hidroviario' },
                { id: 'transport.vehicle_plate', kind: 'string' },
                { id: 'transport.mopp_certified', kind: 'string', allowed: 'sim|nao', regulation: 'ANTT-5947' },
                { id: 'transport.dangerous_goods_class', kind: 'string' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.health-clinical',
        module_name: 'Clinical Health Field Meta (ASO/NR-7)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'aso.exam_type', kind: 'string', allowed: 'admissional|periodico|retorno|mudanca_risco|demissional', regulation: 'NR-7' },
                { id: 'aso.result', kind: 'string', allowed: 'apto|apto_com_restricao|inapto' },
                { id: 'aso.restrictions', kind: 'string' },
                { id: 'aso.next_exam_date', kind: 'string' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.weather',
        module_name: 'Weather Field Meta (INMET)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'weather.precipitation_mm', kind: 'number', unit: 'mm' },
                { id: 'weather.temperature_c', kind: 'number', unit: 'celsius' },
                { id: 'weather.wind_direction_deg', kind: 'number', unit: 'degree', range: '0-360' },
                { id: 'weather.humidity_pct', kind: 'number', unit: 'percent', range: '0-100' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.infrastructure',
        module_name: 'Infrastructure Field Meta (edificações)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'building.use', kind: 'string', allowed: 'industrial|administrativo|residencial|deposito' },
                { id: 'building.area_m2', kind: 'number', unit: 'm2' },
                { id: 'building.construction_year', kind: 'number' },
                { id: 'building.asbestos_presence', kind: 'string', allowed: 'sim|nao|nao_avaliado' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.stratigraphy',
        module_name: 'Stratigraphy Field Meta (sondagem)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'boring.method', kind: 'string', allowed: 'spt|cpt|rotativa|mista', regulation: 'ABNT-NBR-6484' },
                { id: 'boring.nspt', kind: 'number' },
                { id: 'boring.water_table_depth_m', kind: 'number', unit: 'meter' },
                { id: 'boring.refusal_depth_m', kind: 'number', unit: 'meter' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.field-meta.community',
        module_name: 'Community Stakeholders Field Meta',
        author: { name: 'ecbyts core' },
        capabilities: ['register_field_meta'],
        declarations: {
            field_meta: [
                { id: 'stakeholder.type', kind: 'string', allowed: 'residente|comerciante|ong|poder_publico|imprensa' },
                { id: 'stakeholder.distance_m', kind: 'number', unit: 'meter' },
                { id: 'stakeholder.engagement_level', kind: 'string', allowed: 'informar|consultar|envolver|colaborar' },
            ],
        },
    },
];

const W5_TEMPLATES: ReadonlyArray<LibraryManifest> = [
    {
        schema_version: '1.0.0',
        module_id: 'builtin.monitoring.report-templates',
        module_name: 'Semiannual Monitoring Report Template',
        author: { name: 'ecbyts core' },
        capabilities: ['register_report_template'],
        declarations: {
            report_templates: [
                {
                    id: 'monitoring-semestral',
                    name: 'Relatório Semestral de Monitoramento',
                    markdown: '## Monitoramento Semestral\n\n{{observationSummary}}\n\n{{dateRange}}\n\n{{exceedanceTable}}',
                    bindings: ['observationSummary', 'dateRange', 'exceedanceTable'],
                },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.emergency.report-templates',
        module_name: 'Post-Emergency Report Template',
        author: { name: 'ecbyts core' },
        capabilities: ['register_report_template'],
        declarations: {
            report_templates: [
                {
                    id: 'emergency-pos-evento',
                    name: 'Relatório Pós-Emergência (SAO/ESH)',
                    markdown: '## Relatorio Pos-Emergencia\n\n{{observationSummary}}\n\n{{topContaminants}}\n\n{{observationTable}}',
                    bindings: ['observationSummary', 'topContaminants', 'observationTable'],
                },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.audit.report-templates',
        module_name: 'ESG Audit Report Template',
        author: { name: 'ecbyts core' },
        capabilities: ['register_report_template'],
        declarations: {
            report_templates: [
                {
                    id: 'audit-esg',
                    name: 'Relatório de Auditoria ESG',
                    markdown: '## Auditoria ESG\n\n{{observationSummary}}\n\n{{exceedanceTable}}\n\n{{dateRange}}',
                    bindings: ['observationSummary', 'exceedanceTable', 'dateRange'],
                },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.wells.report-templates',
        module_name: 'Well Installation Report Template',
        author: { name: 'ecbyts core' },
        capabilities: ['register_report_template'],
        declarations: {
            report_templates: [
                {
                    id: 'wells-instalacao',
                    name: 'Relatório de Instalação de Poços (NBR 15495)',
                    markdown: '## Instalacao de Pocos\n\n{{observationSummary}}\n\n{{observationTable}}',
                    bindings: ['observationSummary', 'observationTable'],
                },
            ],
        },
    },
];

const W5_PRESETS: ReadonlyArray<LibraryManifest> = [
    {
        schema_version: '1.0.0',
        module_id: 'builtin.radar.finance-presets',
        module_name: 'Radar Finance Broadcast Presets (ESG/seguro)',
        author: { name: 'ecbyts core' },
        capabilities: ['register_broadcast_preset'],
        declarations: {
            broadcast_presets: [
                { id: 'esg-investor', label: 'ESG Investor Disclosure', visibility: 'restricted' },
                { id: 'insurer-underwriting', label: 'Insurer Underwriting Package', visibility: 'restricted' },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.radar.community-presets',
        module_name: 'Radar Community Broadcast Presets',
        author: { name: 'ecbyts core' },
        capabilities: ['register_broadcast_preset'],
        declarations: {
            broadcast_presets: [
                { id: 'community-local', label: 'Comunidade Local (transparência)', visibility: 'public' },
                { id: 'ngo-watchdog', label: 'ONG / Watchdog Access', visibility: 'restricted' },
            ],
        },
    },
];

const W5_ACTIONS: ReadonlyArray<LibraryManifest> = [
    {
        schema_version: '1.0.0',
        module_id: 'builtin.data-entry.actions',
        module_name: 'Data Entry Actions',
        author: { name: 'ecbyts core' },
        capabilities: ['register_action'],
        declarations: {
            actions: [
                {
                    id: 'data.add-monitoring-well',
                    label_i18n: 'guidedCatElements',
                    intent: 'add_monitoring_well',
                    handler_key: 'handleAddElement',
                    params_schema: { familyId: 'string', name: 'string' },
                },
                {
                    id: 'data.record-field-reading',
                    label_i18n: 'guidedCatFieldData',
                    intent: 'record_field_reading',
                    handler_key: 'handleAddObservation',
                    params_schema: { elementId: 'string', parameterId: 'string', value: 'number', unit: 'string' },
                },
            ],
        },
    },
    {
        schema_version: '1.0.0',
        module_id: 'builtin.tours.actions',
        module_name: 'Tours Actions',
        author: { name: 'ecbyts core' },
        capabilities: ['register_action'],
        declarations: {
            actions: [
                {
                    id: 'tours.start-specific',
                    label_i18n: 'guidedToursTitle',
                    intent: 'start_specific_tour',
                    handler_key: 'handleStartGuidedTour',
                    params_schema: { tourId: 'string' },
                },
            ],
        },
    },
];

export const BUILTIN_MANIFESTS: ReadonlyArray<LibraryManifest> = Object.freeze([
    // Wave 1
    CONAMA_420_ACTIONS_MANIFEST,
    CETESB_REPORT_TEMPLATE_MANIFEST,
    RADAR_DEFAULT_PRESETS_MANIFEST,
    FIELD_META_OHS_MANIFEST,
    FIELD_META_HYDROMET_MANIFEST,
    // Wave 2
    OHS_ACTIONS_MANIFEST,
    HYDROMET_ACTIONS_MANIFEST,
    EMERGENCY_WORKFLOW_ACTIONS_MANIFEST,
    FIELD_META_GEOLOGY_MANIFEST,
    FIELD_META_HYDROGEOLOGY_MANIFEST,
    // Wave 3
    FIELD_META_AIR_QUALITY_MANIFEST,
    FIELD_META_WATER_QUALITY_MANIFEST,
    FIELD_META_SOIL_MANIFEST,
    FIELD_META_WASTE_MANIFEST,
    FIELD_META_NOISE_MANIFEST,
    FIELD_META_GHG_MANIFEST,
    OHS_REPORT_TEMPLATES_MANIFEST,
    GHG_REPORT_TEMPLATE_MANIFEST,
    RADAR_MINING_PRESETS_MANIFEST,
    CONSISTENCY_ACTIONS_MANIFEST,
    // Wave 4
    FIELD_META_DAM_SAFETY_MANIFEST,
    FIELD_META_MINING_MANIFEST,
    FIELD_META_SENSORS_MANIFEST,
    FIELD_META_REMEDIATION_MANIFEST,
    FIELD_META_LICENSING_MANIFEST,
    FIELD_META_PHOTOLOG_MANIFEST,
    LICENSING_REPORT_TEMPLATE_MANIFEST,
    DAM_SAFETY_REPORT_TEMPLATE_MANIFEST,
    RADAR_REGULATORY_PRESETS_MANIFEST,
    NAVIGATION_ACTIONS_MANIFEST,
    // Wave 5 (final)
    ...W5_FIELD_META,
    ...W5_TEMPLATES,
    ...W5_PRESETS,
    ...W5_ACTIONS,
]);

// ----------------------------------------------------------------
// Canonical handlers do app que built-ins podem referenciar
// ----------------------------------------------------------------

/**
 * Whitelist mínima de handler_keys aceitos. Caller (main.ts) pode
 * estender com o ACTION_REGISTRY completo via setCanonicalHandlerKeys.
 * Esta seed estática garante que os 2 manifests de actions passem
 * mesmo se o ACTION_REGISTRY não tiver sido populado ainda.
 */
export const SEED_CANONICAL_HANDLER_KEYS: ReadonlySet<string> = Object.freeze(
    new Set([
        'handleSeedConama420Domain',
        'handleOpenComplianceDetails',
        'handleAddElement',
        'handleAddObservation',
        'handleOpenIngestionModal',
        'handleOpenWorkflowPicker',
        'handleStartGuidedTour',
        'handleOpenGuidedTours',
        'handleOpenConsistencyPanel',
    ]),
) as ReadonlySet<string>;

// ----------------------------------------------------------------
// Bootstrap: chamado em main.ts init após registry estar pronto
// ----------------------------------------------------------------

export interface SeedResult {
    total: number;
    accepted: number;
    rejected: number;
    perManifest: ReadonlyArray<{ module_id: string; accepted: boolean; itemsRegistered: number }>;
}

/**
 * Seed the 5 built-in library modules via S4 registry. Idempotent:
 * re-running substitui entries existentes (mesmo module_id).
 *
 * Returns frozen summary for audit / boot-budget reporting.
 */
export function seedBuiltinLibraryModules(): SeedResult {
    // Garante que o trust model conhece os handler_keys dos built-ins
    setCanonicalHandlerKeys(SEED_CANONICAL_HANDLER_KEYS);

    const perManifest: { module_id: string; accepted: boolean; itemsRegistered: number }[] = [];
    let accepted = 0;
    let rejected = 0;

    for (const m of BUILTIN_MANIFESTS) {
        let result: { accepted: boolean; itemsRegistered: number };
        if (m.capabilities.includes('register_action')) {
            const r = registerAction(m);
            result = { accepted: r.accepted, itemsRegistered: r.itemsRegistered };
        } else if (m.capabilities.includes('register_report_template')) {
            const r = registerReportTemplate(m);
            result = { accepted: r.accepted, itemsRegistered: r.itemsRegistered };
        } else if (m.capabilities.includes('register_broadcast_preset')) {
            const r = registerBroadcastPreset(m);
            result = { accepted: r.accepted, itemsRegistered: r.itemsRegistered };
        } else if (m.capabilities.includes('register_field_meta')) {
            const r = registerFieldMeta(m);
            result = { accepted: r.accepted, itemsRegistered: r.itemsRegistered };
        } else {
            result = { accepted: false, itemsRegistered: 0 };
        }
        perManifest.push({
            module_id: m.module_id,
            accepted: result.accepted,
            itemsRegistered: result.itemsRegistered,
        });
        if (result.accepted) accepted++;
        else rejected++;
    }

    return Object.freeze({
        total: BUILTIN_MANIFESTS.length,
        accepted,
        rejected,
        perManifest: Object.freeze(perManifest),
    });
}

/**
 * Util: re-extend the canonical handler key set (used when main.ts has
 * populated ACTION_REGISTRY fully). Idempotent — merges with seed set.
 */
export function extendCanonicalHandlers(extra: ReadonlySet<string>): void {
    const merged = new Set(SEED_CANONICAL_HANDLER_KEYS);
    for (const k of extra) merged.add(k);
    setCanonicalHandlerKeys(merged);
}
