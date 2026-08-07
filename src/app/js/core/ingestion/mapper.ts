// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   INGESTION MAPPER — Column mapping with multi-region aliases
   Mapeamento deterministico de colunas EDD para schema ecbyts.

   Camada 1: Aliases fixos por regiao (sem IA, 100% offline)
   Camada 2: Fallback para LLM quando formato desconhecido

   Inclui resolucao de:
   - CAS Number → parameterId
   - loc_type → familyId
   - Unidades EDD → unitId ecbyts

   FONTES DOS ALIASES (proveniencia legal):
   Os aliases de colunas abaixo cobrem nomes de multiplos formatos.
   Todos derivados de documentos governamentais de dominio publico
   (US gov works, 17 USC §105) ou especificacoes abertas publicadas:
   - EPA Region 2/3/5 Superfund EDD Manuals (epa.gov, public domain)
   - NYSDEC Environmental Data Submission Guide (dec.ny.gov, public record)
   - DNREC EQuIS Data Submittal Guide (dnrec.delaware.gov, public record)
   - WQX Web Services (epa.gov/waterdata, public domain)
   NAO derivados de documentacao proprietaria da EarthSoft (help.earthsoft.com).
   Nomes de colunas como sys_loc_code, DT_LOCATION sao convencoes publicadas
   em documentos EPA/estaduais e nao sao protegiveis por copyright.
   - EPA EDD R2/R3/R5: sys_loc_code, sys_sample_code, etc.
   - EQuIS Schema: LOC_ID, SYS_SAMPLE_CODE (similar ao EDD)
   - WQX: MonitoringLocationIdentifier, CharacteristicName, etc.
   - SEDD: mesmos nomes do EDD (subconjunto simplificado)
   - ERPIMS: LOCID, SAMPID, PARAM, CONC, QUALF
   - ADaM: STA_ID, SAM_ID, ANA_TYPE, RES_VALUE, RES_QUAL
   - ESdat: SampleCode, ChemCode, Result_Total, LOR_Num
   - LIMS-Export: LabSampleID, ClientSampleID, Analyte, MDL, RDL
   - AIHA Essential Data Attributes: worker_id, ghe, agent, twa_8h, stel
   - DOEHRS-IH EDD: ssn_last4, ghe_code, agent_name, oel
   - NR-15/PPRA/PGR: matricula, agente, nivel, limite_tolerancia
   - PCMSO: exame, resultado, apto
   - LIMS Biomonitoring: patient_id, analyte, specimen, bei
   Ver parser.js para descricao completa de cada formato.
   ================================================================ */
import { CONFIG } from '../../config.js';
import { PARAMETER_RANGES } from '../elements/randomModel.js';
/**
 * @typedef {{name: string, headers: string[], rows: Array<Record<string, any>>, rowCount: number}} ParsedSheet
 * @typedef {{sheets: ParsedSheet[]}} ParsedSpreadsheet
 * @typedef {{name?: string}} ClassifiedSheet
 * @typedef {{classified?: Record<string, ClassifiedSheet>}} FormatInfo
 * @typedef {{sourceSheet: string, sourceColumn: string, targetField: string | null, confidence: number, method: string, alternatives: any[], needsHumanReview: boolean}} ColumnMapping
 * @typedef {{sourceSheet: string, targetEntity: string}} SheetMapping
 * @typedef {{type: string, sourceValue: string, suggestedTarget: string | null, confidence: number, context: string}} MappingAmbiguity
 * @typedef {{columns: ColumnMapping[], sheetMappings: SheetMapping[], ambiguities: MappingAmbiguity[]}} MappingProposal
 * @typedef {{sendMessage(prompt: string): Promise<string> | string}} MappingAiClient
 * @typedef {{id: string, name?: string, names?: Record<string, string>, symbol?: string}} ConfigNamedItem
 * @typedef {{unitId?: string, min: number, max: number}} ParameterRange
 */
// ----------------------------------------------------------------
// COLUMN ALIAS TABLE - Multi-region EDD column names
// Nomes de colunas que significam a mesma coisa em regioes diferentes.
// ----------------------------------------------------------------
/** @type {Record<string, string[]>} */
const COLUMN_ALIASES = {
    // Aliases cobrem: EPA EDD R2/R3/R5, EQuIS, WQX, ERPIMS, ADaM, ESdat, LIMS-Export
    elementName: [
        'sys_loc_code',
        'location_code',
        'loc_code',
        'loc_name',
        'site_id',
        'point_id',
        'station_id',
        'monitoringlocationidentifier',
        'monitoringlocationname', // WQX
        'locid',
        'sta_id', // ERPIMS, ADaM
        'loc_id', // EQuIS
        'location_id',
    ], // ESdat
    latitude: [
        'latitude',
        'y_coordinate',
        'lat',
        'coord_y',
        'lat_dd',
        'latitudemeasure', // WQX
        'lat_y', // ESdat
        'decimallatitude', // Darwin Core / GBIF
    ],
    longitude: [
        'longitude',
        'x_coordinate',
        'long',
        'lng',
        'coord_x',
        'lon_dd',
        'longitudemeasure', // WQX
        'long_x', // ESdat
        'decimallongitude', // Darwin Core / GBIF
    ],
    datum: [
        'coord_sys_desc',
        'horizontal_datum',
        'horz_datum_code',
        'datum',
        'coord_system',
        'horizontalcoordinatereferencesystemdatumname', // WQX
        'geodeticdatum', // Darwin Core / GBIF
        'footprintsrs', // Darwin Core / OGC
    ],
    locType: ['loc_type', 'location_type', 'loc_type_code', 'point_type', 'loc_purpose', 'monitoringlocationtypename'], // WQX
    locDescription: [
        'loc_desc',
        'location_description',
        'description',
        'loc_name',
        'remark',
        'monitoringlocationdescriptiontext',
    ], // WQX
    building: ['building_code', 'building', 'facility'],
    sampleCode: [
        'sys_sample_code',
        'sample_code',
        'sample_id',
        'sample_name',
        'activityidentifier', // WQX
        'sampid',
        'sam_id', // ERPIMS, ADaM
        'samplecode', // ESdat
        'labsampleid',
        'clientsampleid',
    ], // LIMS-Export
    sampleDate: [
        'sample_start_date',
        'sample_date',
        'collection_date',
        'date',
        'sample_datetime',
        'activitystartdate', // WQX
        'samdate', // ERPIMS
        'sampledate_time',
    ], // ESdat
    matrix: [
        'sample_matrix_code',
        'matrix',
        'matrix_code',
        'sample_matrix',
        'activitymedianname', // WQX
        'matrix_desc',
    ], // ERPIMS
    sampleType: [
        'sample_type_code',
        'sample_type',
        'test_type',
        'activitytypecode', // WQX
        'qctype',
    ], // LIMS-Export
    chemicalName: [
        'chemical_name',
        'analyte_name',
        'analyte_code',
        'analyte',
        'param_name',
        'parameter_name',
        'characteristicname', // WQX
        'param',
        'ana_type', // ERPIMS, ADaM
        'chemname',
        'chemcode', // ESdat
        'analyte_name_lims', // LIMS-Export
        'chemicalname', // Darwin Core / GBIF
        'geosubstancename', // Geological substance (Darwin Core ext.)
    ],
    casNumber: ['cas_rn', 'cas_number', 'cas_no', 'cas', 'param_code', 'casregistryid'], // WQX
    resultValue: [
        'result_value',
        'result',
        'concentration',
        'value',
        'measured_value',
        'final_result',
        'resultmeasurevalue', // WQX
        'conc',
        'res_value', // ERPIMS, ADaM
        'result_total', // ESdat
        'chemicalquantity', // Darwin Core ext.
        'geoquantity', // Geological quantity (Darwin Core ext.)
        'organismquantity', // Biological count (Darwin Core)
    ],
    resultUnit: [
        'result_unit',
        'unit',
        'result_unit_code',
        'units',
        'detection_limit_unit',
        'resultmeasure_measureunitcode', // WQX
        'units_erpims', // ERPIMS
        'result_unit_esdat', // ESdat
        'chemicalquantitytype', // Darwin Core ext.
        'geoquantitytype', // Geological unit (Darwin Core ext.)
        'organismquantitytype', // Biological unit (Darwin Core)
    ],
    detectFlag: [
        'detect_flag',
        'detected',
        'det_flag',
        'detection_flag',
        'reportable_result',
        'resultdetectionconditiontext', // WQX
        'detflag',
    ], // ERPIMS
    detectionLimit: [
        'reporting_detection_limit',
        'detection_limit',
        'method_detection_limit',
        'rdl',
        'mdl',
        'quantitation_limit',
        'detectionquantitationlimitmeasure_measurevalue', // WQX
        'lor_num', // ESdat
        'mdl_lims',
        'rdl_lims',
    ], // LIMS-Export
    qualifier: [
        'lab_qualifiers',
        'lab_qualifier',
        'qualifier',
        'interpreted_qualifiers',
        'data_qualifier',
        'validator_qualifiers',
        'resultstatusidentifier', // WQX
        'qualf',
        'res_qual',
    ], // ERPIMS, ADaM
    labName: [
        'lab_name_code',
        'lab_code',
        'laboratory',
        'lab_name',
        'laboratoryname', // WQX
        'lab_lims',
    ], // LIMS-Export
    method: [
        'lab_anl_method_name',
        'analytical_method',
        'analysis_method',
        'test_method',
        'analytic_method',
        'resultanalyticalmethodidentifier', // WQX
        'method_esdat',
    ], // ESdat
    taskCode: [
        'task_code',
        'sampling_reason',
        'event_code',
        'campaign_code',
        'sample_delivery_group',
        'projectidentifier',
    ], // WQX
    samplingMethod: [
        'sampling_method',
        'collection_method',
        'sample_method',
        'samplecollectionmethodidentifier', // WQX
        'samplingprotocol', // Darwin Core / GBIF
    ],
    samplingCompany: ['sampling_company_code', 'sampling_company', 'sampler', 'contractor'],
    fraction: ['fraction', 'sample_fraction', 'phase', 'resultsamplefractiontext'], // WQX
    dilution: ['dilution_factor', 'dilution'],
    analysisDate: ['analysis_date', 'analysis_datetime', 'analyzed_date', 'analysisdate_lims'], // LIMS-Export
    prepMethod: ['prep_method', 'preparation_method', 'prep_method_name'],
    elevation: ['alt_x_coord', 'elevation', 'z_coordinate', 'altitude', 'verticalmeasure_measurevalue'], // WQX
    state: ['loc_state_code', 'state', 'estado', 'statecode'], // WQX
    county: ['loc_county_code', 'county', 'municipio', 'countycode'], // WQX
    district: ['loc_district_code', 'district', 'bairro'],
    observationDate: ['observation_date', 'obs_date'],
    coordType: ['alt_coord_type_code', 'coord_type'],
    totalDepth: [
        'total_depth',
        'borehole_depth',
        'depth',
        'well_depth',
        'profundidade',
        'profundidade_total',
        'prof_total',
        'screen_bottom_depth',
        'completion_depth',
    ],
    boreholeDiameter: [
        'borehole_diameter',
        'diameter',
        'casing_diameter',
        'diametro',
        'diametro_poco',
        'well_diameter',
    ],
    actionLevelCode: ['action_level_code', 'standard_code', 'reference_code'],
    actionLevel: ['action_level', 'standard_value', 'reference_value', 'limit_value'],
    actionLevelNote: ['action_level_note', 'standard_source', 'reference_source'],
    // --- Uncertainty (ISO/IEC 17025, GUM) aliases ---
    uncertainty: [
        'uncertainty',
        'expanded_uncertainty',
        'measurement_uncertainty',
        'combined_uncertainty',
        'unc',
        'u_expanded',
        'u_k2',
        'standard_uncertainty',
        'incerteza',
        'incerteza_expandida',
        'result_uncertainty',
        'unc_expanded',
    ],
    uncertaintyType: ['uncertainty_type', 'unc_type', 'uncertainty_unit', 'tipo_incerteza', 'unc_category'],
    coverageFactor: ['coverage_factor', 'k_factor', 'k_value', 'fator_cobertura', 'fator_k', 'coverage_k'],
    // --- OHS (Occupational Health & Safety) aliases ---
    // Fontes: AIHA Essential Data Attributes, DOEHRS-IH EDD, NR-15, PPRA/PGR, PCMSO, LIMS Biomonitoring
    workerId: [
        'worker_id',
        'employee_id',
        'matricula',
        'badge_number',
        'ssn_last4',
        'cpf',
        'funcionario_id',
        'trabalhador',
        'patient_id',
    ],
    workerName: [
        'worker_name',
        'employee_name',
        'nome_funcionario',
        'nome_trabalhador',
        'patient_name',
        'nome_paciente',
    ],
    gheId: ['ghe', 'ghe_code', 'ghe_id', 'grupo_homogeneo', 'seg', 'similar_exposure_group', 'exposure_group'],
    jobTitle: ['job_title', 'cargo', 'funcao', 'occupation', 'soc_code', 'cbo', 'job_description', 'atividade'],
    department: [
        'department',
        'setor',
        'sector',
        'area',
        'departamento',
        'cost_center',
        'zona',
        'local_trabalho',
        'workplace',
    ],
    exposureAgent: [
        'agent',
        'agent_name',
        'agente',
        'hazard',
        'risco_agente',
        'chemical_agent',
        'physical_agent',
        'biological_agent',
        'agente_nocivo',
        'exposure_agent',
    ],
    exposureRoute: ['exposure_route', 'via_exposicao', 'route', 'pathway', 'via_absorcao', 'absorption_route'],
    sampleTypeOHS: [
        'sample_type_ohs',
        'tipo_amostra_ohs',
        'tipo_medicao',
        'area_sample',
        'personal_sample',
        'monitoring_type',
    ], // area vs pessoal
    twa8h: ['twa_8h', 'twa', 'time_weighted_average', 'concentracao_media', 'media_ponderada', 'avg_exposure'],
    stel: ['stel', 'short_term', 'exposicao_curta', 'limite_curta', 'short_term_exposure_limit'],
    ceilingValue: ['ceiling', 'teto', 'valor_teto', 'ceiling_value', 'limite_teto'],
    oel: [
        'oel',
        'oelv',
        'occupational_exposure_limit',
        'limite_exposicao',
        'tlv',
        'pel',
        'rel',
        'limite_tolerancia',
        'lt',
        'weel',
        'exposure_limit',
    ],
    bei: ['bei', 'biological_exposure_index', 'ibmp', 'indice_biologico', 'biological_limit'],
    specimen: [
        'specimen',
        'biological_matrix',
        'matriz_biologica',
        'blood',
        'urine',
        'sangue',
        'urina',
        'material_biologico',
        'specimen_type',
        'tipo_material',
    ],
    ppeStatus: ['ppe', 'ppe_status', 'epi', 'epi_utilizado', 'protection', 'equipamento_protecao', 'ppe_worn'],
    incidentType: ['incident_type', 'tipo_acidente', 'accident_type', 'event_type', 'tipo_evento', 'natureza_acidente'],
    severity: ['severity', 'severidade', 'gravidade', 'injury_severity', 'grau_lesao'],
    probability: ['probability', 'probabilidade', 'likelihood', 'frequencia', 'freq_exposicao'],
    daysLost: ['days_lost', 'dias_perdidos', 'lost_time', 'dias_afastamento', 'lost_workdays'],
    aptitude: ['aptitude', 'aptidao', 'fit_for_duty', 'apto', 'resultado_aso', 'medical_clearance'],
    examType: ['exam_type', 'tipo_exame', 'medical_exam', 'exame', 'tipo_aso', 'surveillance_type'],
    naicsCode: ['naics', 'naics_code', 'sic', 'sic_code', 'cnae', 'cnae_code', 'industry_code', 'codigo_atividade'],
    durationHours: ['duration_hours', 'duracao_horas', 'exposure_duration', 'tempo_exposicao', 'sampling_duration'],
    insalubrityGrade: ['grau_insalubridade', 'insalubrity_grade', 'insalubridade', 'unhealthy_grade', 'grau'],
    riskLevel: ['risk_level', 'nivel_risco', 'risk_rating', 'classificacao_risco', 'risk_score'],
};
// ----------------------------------------------------------------
// LOC_TYPE → FAMILY MAPPING
// Converte tipos de local do EDD para familias ecbyts.
// ----------------------------------------------------------------
/** @type {Record<string, string>} */
const LOC_TYPE_MAP = {
    // Portugues
    'poço de monitoramento': 'well',
    'poco de monitoramento': 'well',
    'poço de bombeamento': 'well',
    'poco de bombeamento': 'well',
    piezômetro: 'well',
    piezometro: 'well',
    sondagem: 'well',
    nascente: 'spring',
    lago: 'lake',
    lagoa: 'lake',
    represa: 'lake',
    rio: 'river',
    córrego: 'river',
    riacho: 'river',
    corrego: 'river',
    tanque: 'tank',
    reservatório: 'tank',
    reservatorio: 'tank',
    edificação: 'building',
    edificacao: 'building',
    prédio: 'building',
    predio: 'building',
    resíduo: 'waste',
    residuo: 'waste',
    aterro: 'waste',
    lixão: 'waste',
    lixao: 'waste',
    limite: 'boundary',
    perímetro: 'boundary',
    perimetro: 'boundary',
    // English
    'monitoring well': 'well',
    mw: 'well',
    'pumping well': 'well',
    pw: 'well',
    'extraction well': 'well',
    'recovery well': 'well',
    piezometer: 'well',
    'soil boring': 'well',
    borehole: 'well',
    well: 'well',
    boring: 'well',
    probe: 'well',
    spring: 'spring',
    lake: 'lake',
    pond: 'lake',
    reservoir: 'lake',
    river: 'river',
    stream: 'river',
    creek: 'river',
    tank: 'tank',
    ust: 'tank',
    ast: 'tank',
    'storage tank': 'tank',
    building: 'building',
    structure: 'building',
    waste: 'waste',
    landfill: 'waste',
    disposal: 'waste',
    boundary: 'boundary',
    property: 'boundary',
    fence: 'boundary',
    perimeter: 'boundary',
    'surface water': 'lake',
    sw: 'lake',
    sediment: 'lake',
    sed: 'lake',
    soil: 'marker',
    air: 'marker',
    sv: 'marker',
    'soil vapor': 'marker',
};
// ----------------------------------------------------------------
// CAS NUMBER → PARAMETER ID
// Mapeamento de CAS para parametros do ecbyts.
// ----------------------------------------------------------------
/** @type {Record<string, string>} */
const CAS_TO_PARAM = {
    '71-43-2': 'benzene',
    '108-88-3': 'toluene',
    '100-41-4': 'ethylbenzene',
    '1330-20-7': 'xylenes',
    '7440-38-2': 'arsenic',
    '7440-43-9': 'cadmium',
    '7440-47-3': 'chromium',
    '18540-29-9': 'chromium_vi',
    '7439-92-1': 'lead',
    '7439-97-6': 'mercury',
    '7440-50-8': 'copper',
    '7440-66-6': 'zinc',
    '7440-02-0': 'nickel',
    '8006-61-9': 'tph_gasoline',
    '68476-34-6': 'tph_diesel',
    '91-20-3': 'naphthalene',
    '127-18-4': 'pce',
    '79-01-6': 'tce',
    '75-01-4': 'vinyl_chloride',
    '75-09-2': 'dcm',
    '67-66-3': 'chloroform',
    '56-23-5': 'carbon_tetrachloride',
    '107-06-2': '1_2_dca',
    '78-87-5': '1_2_dcp',
};
// ----------------------------------------------------------------
// UNIT MAPPING - EDD units to ecbyts unit IDs
// ----------------------------------------------------------------
/** @type {Record<string, string>} */
const UNIT_MAP = {
    'ug/l': 'ug_L',
    'µg/l': 'ug_L',
    'ug/L': 'ug_L',
    'mg/l': 'mg_L',
    'mg/L': 'mg_L',
    'mg/kg': 'mg_kg',
    'ug/kg': 'ug_kg',
    ppm: 'ppm',
    ppb: 'ppb',
    ph: 'pH',
    'us/cm': 'uS_cm',
    'µs/cm': 'uS_cm',
    'ms/cm': 'mS_cm',
    mv: 'mV',
    celsius: 'celsius',
    '°c': 'celsius',
    m: 'm',
    cm: 'cm',
    ft: 'ft',
    'l/s': 'L_s',
    'm3/h': 'm3_h',
    '%': 'percent',
    ntu: 'NTU',
    // OHS units
    'mg/m3': 'mg_m3',
    'mg/m³': 'mg_m3',
    'f/cm3': 'fibras_cm3',
    'f/cm³': 'fibras_cm3',
    'fibras/cm3': 'fibras_cm3',
    'ug/g creat': 'ug_g_crea',
    'µg/g creat': 'ug_g_crea',
    'ug/g creat.': 'ug_g_crea',
    'µg/g creat.': 'ug_g_crea',
    'ug/dl': 'ug_dL',
    'µg/dl': 'ug_dL',
    dba: 'dBA',
    'db(a)': 'dBA',
    db: 'dBA',
    msv: 'mSv',
    usv: 'uSv',
    µsv: 'uSv',
    'bq/m3': 'Bq_m3',
    'bq/m³': 'Bq_m3',
    lux: 'lux',
    hours: 'h',
    horas: 'h',
};
// ----------------------------------------------------------------
// DETERMINISTIC MAPPING
// ----------------------------------------------------------------
/**
 * Mapeia colunas de forma deterministica usando alias table.
 * Retorna proposta de mapeamento com confianca 1.0 para matches exatos.
 *
 * @param {ParsedSpreadsheet} parsed
 * @param {FormatInfo} format
 * @returns {MappingProposal}
 */
export function mapDeterministic(parsed: any, format: any) {
    /** @type {ColumnMapping[]} */
    const columns = [];
    /** @type {SheetMapping[]} */
    const sheetMappings: any[] = [];
    /** @type {MappingAmbiguity[]} */
    const ambiguities = [];
    // Mapeia cada sheet para uma entidade
    for (const sheet of parsed.sheets) {
        const category = Object.keys(format.classified || {}).find((k) => format.classified?.[k]?.name === sheet.name) || null;
        if (category) {
            const entityMap: Record<string, string> = {
                locations: 'elements',
                samples: 'samples',
                results: 'results',
                wells: 'wells',
                waterLevels: 'waterLevels',
                actionLevels: 'actionLevels',
            };
            /** @type {Record<string, string>} */
            const entityMapByCategory = entityMap;
            if (entityMapByCategory[category]) {
                sheetMappings.push({
                    sourceSheet: sheet.name,
                    targetEntity: entityMapByCategory[category],
                });
            }
        }
        // Mapeia colunas
        for (const header of sheet.headers) {
            const normalized = header.toLowerCase().trim();
            let matched = false;
            for (const [targetField, aliases] of Object.entries(COLUMN_ALIASES)) {
                if (aliases.includes(normalized)) {
                    columns.push({
                        sourceSheet: sheet.name,
                        sourceColumn: header,
                        targetField,
                        confidence: 1.0,
                        method: 'rule',
                        alternatives: [],
                        needsHumanReview: false,
                    });
                    matched = true;
                    break;
                }
            }
            if (!matched && header.trim()) {
                columns.push({
                    sourceSheet: sheet.name,
                    sourceColumn: header,
                    targetField: null,
                    confidence: 0,
                    method: 'rule',
                    alternatives: [],
                    needsHumanReview: true,
                });
            }
        }
    }
    // Detecta ambiguidades de loc_type
    const locSheet = parsed.sheets.find((s: any) => {
        const mapping = sheetMappings.find((m: any) => m.sourceSheet === s.name);
        return mapping?.targetEntity === 'elements';
    });
    if (locSheet) {
        const locTypeCol = columns.find((c) => c.sourceSheet === locSheet.name && c.targetField === 'locType');
        if (locTypeCol) {
            const uniqueTypes = new Set();
            for (const row of locSheet.rows) {
                const val = row[locTypeCol.sourceColumn];
                if (val)
                    uniqueTypes.add(String(val).trim());
            }
            for (const eddType of uniqueTypes) {
                const sourceValue = String(eddType);
                const family = resolveLocType(sourceValue);
                if (!family) {
                    ambiguities.push({
                        type: 'loc_type',
                        sourceValue,
                        suggestedTarget: 'well', // default
                        confidence: 0.3,
	            context: `Encontrado em ${locSheet.rows.filter((r: any) => String(r[locTypeCol.sourceColumn] || '').trim() === sourceValue).length} de ${locSheet.rows.length} linhas`,
                    });
                }
            }
        }
    }
    // Detecta ambiguidades de quimicos nao mapeados
    const resultSheet = parsed.sheets.find((s: any) => {
        const mapping = sheetMappings.find((m: any) => m.sourceSheet === s.name);
        return mapping?.targetEntity === 'results';
    });
    if (resultSheet) {
        const chemCol = columns.find((c) => c.sourceSheet === resultSheet.name && c.targetField === 'chemicalName');
        const casCol = columns.find((c) => c.sourceSheet === resultSheet.name && c.targetField === 'casNumber');
        if (chemCol || casCol) {
            /** @type {Map<string, {name: string, cas: string, count: number}>} */
            const uniqueChems = new Map();
            for (const row of resultSheet.rows) {
                const name = chemCol ? String(row[chemCol.sourceColumn] || '').trim() : '';
                const cas = casCol ? String(row[casCol.sourceColumn] || '').trim() : '';
                const key = cas || name;
                if (key && !uniqueChems.has(key)) {
                    uniqueChems.set(key, { name, cas, count: 0 });
                }
                if (key) {
                    const entry = uniqueChems.get(key);
                    if (entry)
                        entry.count++;
                }
            }
            for (const [_key, info] of uniqueChems) {
                const paramId = resolveChemical(info.name, info.cas);
                if (!paramId) {
                    ambiguities.push({
                        type: 'chemical',
                        sourceValue: `${info.name} (CAS: ${info.cas || 'N/A'})`,
                        suggestedTarget: null,
                        confidence: 0,
                        context: `${info.count} resultados`,
                    });
                }
            }
        }
    }
    return { columns, sheetMappings, ambiguities };
}
// ----------------------------------------------------------------
// AI-ASSISTED MAPPING (Camada 2)
// ----------------------------------------------------------------
/**
 * Mapeia colunas usando LLM quando formato desconhecido.
 * Monta prompt com schema ecbyts e amostra dos dados.
 *
 * @param {ParsedSpreadsheet} parsed
 * @param {MappingAiClient} aiClient - LLM client com metodo sendMessage()
 * @returns {Promise<MappingProposal>}
 */
export async function mapWithAI(parsed: any, aiClient: any) {
    if (!aiClient?.sendMessage) {
        throw new Error('AI client nao disponivel. Use mapeamento manual.');
    }
    const schema = buildEcbytsSchema();
    const preview = buildDataPreview(parsed);
    const prompt = `You are mapping environmental monitoring data columns to the ecbyts schema.

ECBYTS SCHEMA (target fields):
${JSON.stringify(schema, null, 2)}

SOURCE DATA (first 3 rows per sheet):
${preview}

For each source column, suggest the best target field. Return JSON:
{
  "mappings": [
    {"sourceSheet": "...", "sourceColumn": "...", "targetField": "...", "confidence": 0.0-1.0}
  ],
  "sheetMappings": [
    {"sourceSheet": "...", "targetEntity": "elements|samples|results|campaigns|actionLevels"}
  ]
}

Only return the JSON, nothing else.`;
    const response = await aiClient.sendMessage(prompt);
    try {
        const parsed = /** @type {{mappings?: Array<Record<string, any>>, sheetMappings?: SheetMapping[]}} */ (JSON.parse(response));
        /** @type {ColumnMapping[]} */
        const columns = (parsed.mappings || []).map((m: any) => ({
            ...m,
            sourceSheet: String(m.sourceSheet || ''),
            sourceColumn: String(m.sourceColumn || ''),
            targetField: m.targetField == null ? null : String(m.targetField),
            confidence: Number(m.confidence) || 0,
            method: 'ai',
            alternatives: [],
            needsHumanReview: (Number(m.confidence) || 0) < 0.8
        }));
        return {
            columns,
            sheetMappings: parsed.sheetMappings || [],
            ambiguities: columns
                .filter((c: any) => c.confidence < 0.5)
                .map((c: any) => ({
                type: 'column',
                sourceValue: c.sourceColumn,
                suggestedTarget: c.targetField,
                confidence: c.confidence,
                context: `Sheet: ${c.sourceSheet}`
            })),
        };
    }
    catch {
        throw new Error('Resposta da IA nao pode ser interpretada como JSON.');
    }
}
/**
 * Constroi schema ecbyts simplificado para o prompt da IA.
 */
function buildEcbytsSchema() {
    const parameters = ( /** @type {ConfigNamedItem[]} */(CONFIG.PARAMETERS || [])).map((p) => p.id).slice(0, 30);
    const units = ( /** @type {ConfigNamedItem[]} */(CONFIG.UNITS || []))
        .map((u) => ({
        id: u.id,
        symbol: u.symbol
    }))
        .slice(0, 20);
    return {
        targetFields: Object.keys(COLUMN_ALIASES),
        parameters,
        units,
        families: [
            'well',
            'plume',
            'lake',
            'river',
            'spring',
            'building',
            'tank',
            'waste',
            'boundary',
            'marker',
            'individual',
            'incident',
            'area',
        ], // OHS families
    };
}
/**
 * Constroi preview dos dados para o prompt da IA.
 */
/**
 * @param {ParsedSpreadsheet} parsed
 */
function buildDataPreview(parsed: any) {
    return parsed.sheets
        .map((s: any) => {
        const rows = s.rows.slice(0, 3).map((r: any) => JSON.stringify(r));
        return `Sheet "${s.name}" (${s.rowCount} rows):\nHeaders: ${s.headers.join(', ')}\n${rows.join('\n')}`;
    })
        .join('\n\n');
}
// ----------------------------------------------------------------
// RESOLVE HELPERS
// ----------------------------------------------------------------
/**
 * Resolve nome/CAS de substancia para parameterId do ecbyts.
 *
 * @param {string} name - Nome do composto (ex: "Benzeno")
 * @param {string} cas - Numero CAS (ex: "71-43-2")
 * @returns {string|null} parameterId ou null
 */
export function resolveChemical(name: any, cas: any) {
    // 1. CAS exato
    const casMap: Record<string, string> = CAS_TO_PARAM as any;
    if (cas && casMap[cas])
        return casMap[cas];
    // 2. Nome nos parametros do CONFIG
    if (name) {
        const normalized = name.toLowerCase().trim();
        const params = /** @type {ConfigNamedItem[]} */ (CONFIG.PARAMETERS || []);
        for (const p of params) {
            if (p.id === normalized)
                return p.id;
            if (p.name?.toLowerCase() === normalized)
                return p.id;
            if (p.names) {
                for (const lang of Object.values(p.names)) {
                    if (lang.toLowerCase() === normalized)
                        return p.id;
                }
            }
        }
    }
    return null;
}
/**
 * Resolve tipo de local EDD para familyId ecbyts.
 *
 * @param {string} eddType - Tipo de local (ex: "Poço de Monitoramento")
 * @returns {string|null} familyId ou null
 */
export function resolveLocType(eddType: any) {
    if (!eddType)
        return null;
    const normalized = eddType.toLowerCase().trim();
    return (LOC_TYPE_MAP as Record<string, string>)[normalized] || null;
}
/**
 * Resolve unidade EDD para unitId ecbyts.
 *
 * @param {string} eddUnit - Unidade (ex: "ug/L")
 * @returns {string|null} unitId ou null
 */
export function resolveUnit(eddUnit: any) {
    if (!eddUnit)
        return null;
    const normalized = eddUnit.toLowerCase().trim();
    const unitMap: Record<string, string> = UNIT_MAP as any;
    if (unitMap[normalized])
        return unitMap[normalized];
    // Tentativa com a string original (case-sensitive)
    if (unitMap[eddUnit.trim()])
        return unitMap[eddUnit.trim()];
    // Match parcial nos CONFIG.UNITS
    const units = /** @type {ConfigNamedItem[]} */ (CONFIG.UNITS || []);
    for (const u of units) {
        if (u.id === eddUnit.trim() || u.symbol === eddUnit.trim())
            return u.id;
    }
    return null;
}
// ----------------------------------------------------------------
// UNIT INFERENCE BY MAGNITUDE
// Quando a planilha nao tem coluna de unidade, usa a ordem de grandeza
// do valor para inferir a unidade mais provavel.
// Ref: PARAMETER_RANGES contém min/max tipico por unitId.
// ----------------------------------------------------------------
/**
 * Infere a unidade mais provavel para um parametro com base no valor numerico.
 * Compara o valor contra faixas tipicas em diferentes unidades usando escala log.
 *
 * @param {string} parameterId - ID do parametro (ex: 'benzene')
 * @param {number} value - Valor numerico sem unidade
 * @returns {{ suggestedUnit: string, confidence: number } | null}
 *   null se parametro nao tem range definido ou valor e invalido
 */
export function inferUnitFromMagnitude(parameterId: any, value: any) {
    if (!parameterId || value == null || isNaN(value) || value <= 0)
        return null;
    const ranges = /** @type {Record<string, ParameterRange>} */ (PARAMETER_RANGES);
    const range = ranges[parameterId];
    if (!range || !range.unitId)
        return null;
    // Para a unidade padrao, calcular quao bem o valor se encaixa na faixa
    const median = Math.sqrt(range.min * range.max); // geometric mean
    if (median <= 0)
        return null;
    const logRatio = Math.abs(Math.log10(value) - Math.log10(median));
    const rangeMagnitude = Math.log10(range.max / range.min);
    // Score: 1.0 = perfeito (valor = mediana), 0.0 = muito longe
    const score = Math.max(0, 1 - logRatio / Math.max(rangeMagnitude, 1));
    if (score >= 0.3) {
        return {
            suggestedUnit: range.unitId,
            confidence: Math.min(score, 0.95), // cap em 0.95 — nunca 100% certo sem coluna
        };
    }
    return null;
}
// Export for testing
export { COLUMN_ALIASES, LOC_TYPE_MAP, CAS_TO_PARAM, UNIT_MAP };
//# sourceMappingURL=mapper.js.map
