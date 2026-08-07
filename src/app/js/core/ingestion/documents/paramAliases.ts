// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * paramAliases.js - Deterministic parameter name dictionary
 * ADR-022: Neuro-Symbolic Document Ingestion - Layer 2 (Deterministic Anchoring)
 *
 * Dicionario curado de ~200 substancias ambientais com nomes PT-BR, EN, ES,
 * sinonimos, abreviacoes e nomes comerciais. Mapeia para parameterId do CONFIG.PARAMETERS
 * ou do CAS_TO_PARAM do mapper.js.
 *
 * Fontes: CONFIG.PARAMETERS (~80 params), CONAMA 420/2009, CETESB DD-256/2016,
 * EPA Method Series, WHO Guidelines - todas de dominio publico.
 *
 * @module core/ingestion/documents/paramAliases
 */

import { safeSetItem } from '../../../utils/storage/storageMonitor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove acentos e diacriticos de uma string
 * Usa normalizacao Unicode NFD + regex para combining marks
 * @param {string} str
 * @returns {string}
 */
function stripAccents(str: any) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza string para lookup: lowercase, trim, strip accents, collapse whitespace
 * @param {string} str
 * @returns {string}
 */
function normalize(str: any) {
    return stripAccents(str.toLowerCase().trim()).replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Built-in Alias Table
// ---------------------------------------------------------------------------
// Cada entrada: parameterId → array de aliases (todos em lowercase, sem acentos)
// O normalize() sera aplicado na busca, nao no armazenamento - os valores aqui
// ja estao normalizados para lookup direto.

const BUILTIN_ALIASES = {
    // -----------------------------------------------------------------------
    // BTEX
    // -----------------------------------------------------------------------
    benzene: ['benzene', 'benzeno', 'benceno', 'c6h6', 'benzol', 'phenyl hydride', 'hidreto de fenila', 'bnz'],
    toluene: ['toluene', 'tolueno', 'toluol', 'methylbenzene', 'metilbenzeno', 'c7h8', 'phenyl methane', 'tol'],
    ethylbenzene: [
        'ethylbenzene',
        'etilbenzeno',
        'ethyl benzene',
        'etil benzeno',
        'eb',
        'phenylethane',
        'feniletano',
        'c8h10 ethyl',
    ],
    styrene: ['styrene', 'estireno', 'estirol', 'vinylbenzene', 'vinilbenzeno', 'feniletileno', 'phenylethylene'],
    xylenes: [
        'xylenes',
        'xilenos',
        'xilenos totais',
        'total xylenes',
        'xylene',
        'xileno',
        'xilol',
        'dimetilbenzeno',
        'dimethylbenzene',
        'o-xileno',
        'o-xylene',
        'm-xileno',
        'm-xylene',
        'p-xileno',
        'p-xylene',
        'xilenos (soma)',
        'xylenes (total)',
        'm,p-xilenos',
        'm,p-xylenes',
        'meta+para xilenos',
    ],
    btex: ['btex', 'btex (soma)', 'btex (total)', 'btex total', 'benzeno tolueno etilbenzeno xilenos'],

    // -----------------------------------------------------------------------
    // PAHs (Polycyclic Aromatic Hydrocarbons)
    // -----------------------------------------------------------------------
    naphthalene: ['naphthalene', 'naftaleno', 'naftalina', 'c10h8', 'naphtalene', 'naftalen'],

    // -----------------------------------------------------------------------
    // TPH (Total Petroleum Hydrocarbons)
    // -----------------------------------------------------------------------
    tph: [
        'tph',
        'total petroleum hydrocarbons',
        'hidrocarbonetos totais de petroleo',
        'htp',
        'hidrocarbonetos totais',
        'petroleum hydrocarbons',
        'tph total',
        'htp total',
    ],
    tph_gasoline: [
        'tph gasoline',
        'tph gasolina',
        'tph faixa gasolina',
        'tph gasoline range',
        'gro',
        'gasoline range organics',
        'hidrocarbonetos faixa gasolina',
        'tph-gro',
        'c6-c10',
        'c6 a c10',
        'c6-c12',
    ],
    tph_diesel: [
        'tph diesel',
        'tph faixa diesel',
        'tph diesel range',
        'dro',
        'diesel range organics',
        'hidrocarbonetos faixa diesel',
        'tph-dro',
        'c10-c28',
        'c10 a c28',
        'c10-c40',
        'c12-c28',
    ],

    // -----------------------------------------------------------------------
    // VOCs (Volatile Organic Compounds)
    // -----------------------------------------------------------------------
    voc: [
        'voc',
        'vocs',
        'cov',
        'covs',
        'volatile organic compounds',
        'compostos organicos volateis',
        'compuestos organicos volatiles',
        'organicos volateis',
    ],

    // -----------------------------------------------------------------------
    // Chlorinated Solvents
    // -----------------------------------------------------------------------
    pce: [
        'pce',
        'tetracloroetileno',
        'tetrachloroethylene',
        'tetrachloroethene',
        'percloroetileno',
        'perchloroethylene',
        'perc',
        'tetracloroeteno',
        'c2cl4',
    ],
    tce: ['tce', 'tricloroetileno', 'trichloroethylene', 'trichloroethene', 'tricloroeteno', 'c2hcl3'],
    vinyl_chloride: [
        'vinyl chloride',
        'cloreto de vinila',
        'cloruro de vinilo',
        'chloroethylene',
        'cloroetileno',
        'cloroeteno',
        'vcm',
        'monocloroetileno',
        'c2h3cl',
        'cv',
        'vc',
    ],
    cis_1_2_dce: [
        'cis-1,2-dicloroeteno',
        'cis-1,2-dichloroethene',
        'cis-1,2-dichloroethylene',
        'cis-1,2-dicloroetileno',
        'cis-dce',
        'cis-1,2-dce',
        'c-dce',
        'cis 1,2 dicloroeteno',
        'cis 1,2 dicloroetileno',
    ],
    trans_1_2_dce: [
        'trans-1,2-dicloroeteno',
        'trans-1,2-dichloroethene',
        'trans-1,2-dichloroethylene',
        'trans-1,2-dicloroetileno',
        'trans-dce',
        'trans-1,2-dce',
        't-dce',
        'trans 1,2 dicloroeteno',
        'trans 1,2 dicloroetileno',
    ],
    '1_1_dce': [
        '1,1-dicloroeteno',
        '1,1-dichloroethene',
        '1,1-dichloroethylene',
        '1,1-dicloroetileno',
        '1,1-dce',
        'vinylidene chloride',
        'cloreto de vinilideno',
    ],
    '1_1_dca': ['1,1-dicloroetano', '1,1-dichloroethane', '1,1-dca', 'ethylidene dichloride', 'dicloreto de etilideno'],
    '1_1_1_tca': [
        '1,1,1-tricloroetano',
        '1,1,1-trichloroethane',
        '1,1,1-tca',
        'methyl chloroform',
        'cloroformio de metila',
        'metilcloroformio',
    ],
    '1_4_dioxane': ['1,4-dioxano', '1,4-dioxane', 'dioxano', 'dioxane', 'p-dioxano', 'dietileno dioxido'],
    dcm: ['dcm', 'diclorometano', 'dichloromethane', 'methylene chloride', 'cloreto de metileno', 'ch2cl2'],
    chloroform: ['chloroform', 'cloroformio', 'trichloromethane', 'triclorometano', 'chcl3'],
    carbon_tetrachloride: [
        'carbon tetrachloride',
        'tetracloreto de carbono',
        'tetrachloromethane',
        'tetraclorometano',
        'ccl4',
        'perclorometano',
    ],
    '1_2_dca': [
        '1,2-dicloroetano',
        '1,2-dichloroethane',
        '1,2-dca',
        'dicloroetano',
        'dichloroethane',
        'edc',
        'ethylene dichloride',
        'dicloreto de etileno',
    ],
    '1_2_dcp': [
        '1,2-dicloropropano',
        '1,2-dichloropropane',
        '1,2-dcp',
        'dicloropropano',
        'dichloropropane',
        'propylene dichloride',
    ],

    // -----------------------------------------------------------------------
    // Metals
    // -----------------------------------------------------------------------
    arsenic: [
        'arsenic',
        'arsenio',
        'arsenico',
        'as',
        'arsenio total',
        'arsenic total',
        'arsenio dissolvido',
        'dissolved arsenic',
        'arsen', // Norwegian (Bokmål)
    ],
    cadmium: [
        'cadmium',
        'cadmio',
        'cd',
        'cadmio total',
        'cadmium total',
        'cadmio dissolvido',
        'dissolved cadmium',
        'kadmium', // Norwegian (Bokmål)
    ],
    chromium: [
        'chromium',
        'cromo',
        'cromo total',
        'chromium total',
        'cr',
        'cr total',
        'cromo dissolvido',
        'krom', // Norwegian (Bokmål)
    ],
    chromium_vi: [
        'chromium vi',
        'cromo hexavalente',
        'cromo vi',
        'cr vi',
        'cr(vi)',
        'cr6+',
        'hexavalent chromium',
        'chromium hexavalent',
        'cromo 6+',
        'cromato',
    ],
    lead: [
        'lead',
        'chumbo',
        'plomo',
        'pb',
        'chumbo total',
        'lead total',
        'chumbo dissolvido',
        'dissolved lead',
        'bly', // Norwegian (Bokmål)
    ],
    mercury: [
        'mercury',
        'mercurio',
        'hg',
        'mercurio total',
        'mercury total',
        'mercurio dissolvido',
        'dissolved mercury',
        'kvikksolv', // Norwegian (Bokmål) — Kvikksølv normalized
    ],
    copper: [
        'copper',
        'cobre',
        'cu',
        'cobre total',
        'copper total',
        'cobre dissolvido',
        'dissolved copper',
        'kobber', // Norwegian (Bokmål)
    ],
    zinc: [
        'zinc',
        'zinco',
        'zn',
        'zinco total',
        'zinc total',
        'zinco dissolvido',
        'dissolved zinc',
        'sink', // Norwegian (Bokmål)
    ],
    nickel: [
        'nickel',
        'niquel',
        'ni',
        'niquel total',
        'nickel total',
        'niquel dissolvido',
        'dissolved nickel',
        'nikkel', // Norwegian (Bokmål)
    ],
    iron: ['iron', 'ferro', 'hierro', 'fe', 'ferro total', 'iron total', 'ferro dissolvido', 'dissolved iron'],
    manganese: ['manganese', 'manganes', 'manganeso', 'mn', 'manganes total', 'manganese total', 'manganes dissolvido'],
    aluminum: ['aluminum', 'aluminium', 'aluminio', 'al', 'aluminio total', 'aluminum total', 'aluminio dissolvido'],
    barium: ['barium', 'bario', 'ba', 'bario total', 'barium total'],
    selenium: ['selenium', 'selenio', 'se', 'selenio total', 'selenium total'],
    silver: ['silver', 'prata', 'plata', 'ag', 'prata total', 'silver total'],
    antimony: ['antimony', 'antimonio', 'sb', 'antimonio total'],
    beryllium: ['beryllium', 'berilio', 'be', 'berilio total'],
    cobalt: ['cobalt', 'cobalto', 'co', 'cobalto total'],
    molybdenum: ['molybdenum', 'molibdenio', 'mo', 'molibdenio total'],
    thallium: ['thallium', 'talio', 'tl', 'talio total'],
    tin: ['tin', 'estanho', 'sn', 'estanho total'],
    vanadium: [
        'vanadium',
        'vanadio',
        'v',
        'vanadio total',
        'vanadium', // Norwegian — same spelling
    ],
    boron: [
        'boron',
        'boro',
        'b',
        'boro total',
        'bor', // Norwegian (Bokmål)
    ],

    // -----------------------------------------------------------------------
    // Physical-Chemical Parameters
    // -----------------------------------------------------------------------
    pH: ['ph', 'potencial hidrogenico', 'potencial hidrogenionico', 'hydrogen potential', 'acidez', 'acidity'],
    conductivity: [
        'conductivity',
        'condutividade',
        'condutividade eletrica',
        'conductividad',
        'conductividad electrica',
        'electrical conductivity',
        'ec',
        'ce',
        'specific conductance',
    ],
    temperature: ['temperature', 'temperatura', 'temp', 'temp.'],
    redox: [
        'redox',
        'orp',
        'potencial redox',
        'redox potential',
        'oxidation reduction potential',
        'eh',
        'potencial de oxidacao reducao',
    ],
    water_level: [
        'water level',
        'nivel de agua',
        "nivel d'agua",
        'nivel dagua',
        'nivel estatico',
        'static water level',
        'profundidade do na',
        'depth to water',
        'dtw',
        'nivel piezometrico',
        'piezometric level',
        'carga hidraulica',
        'hydraulic head',
        'nivel freatico',
        'water table depth',
        'water table level',
    ],
    flow_rate: [
        'flow rate',
        'vazao',
        'caudal',
        'flow',
        'vazao de purga',
        'purge flow',
        'pumping rate',
        'taxa de bombeamento',
    ],
    dissolved_oxygen: ['dissolved oxygen', 'oxigenio dissolvido', 'od', 'do', 'oxigeno disuelto', 'oxygen dissolved'],
    turbidity: ['turbidity', 'turbidez', 'turbiedad', 'ntu'],
    alkalinity: ['alkalinity', 'alcalinidade', 'alcalinidad', 'alcalinidade total', 'total alkalinity'],
    hardness: ['hardness', 'dureza', 'dureza total', 'total hardness', 'dureza da agua', 'water hardness'],
    chloride: ['chloride', 'cloreto', 'cloruro', 'cl-', 'cloretos'],
    sulfate: ['sulfate', 'sulfato', 'so4', 'so42-', 'sulfatos'],
    nitrate: ['nitrate', 'nitrato', 'no3', 'no3-', 'nitratos', 'nitrato como n', 'nitrate as n'],
    nitrite: ['nitrite', 'nitrito', 'no2', 'no2-', 'nitritos'],
    ammonia: [
        'ammonia',
        'amonia',
        'amoniaco',
        'nh3',
        'nh4+',
        'nitrogenio amoniacal',
        'ammoniacal nitrogen',
        'ammonium',
    ],
    phosphate: [
        'phosphate',
        'fosfato',
        'po4',
        'po43-',
        'fosfatos',
        'fosforo total',
        'total phosphorus',
        'ortofosfato',
        'orthophosphate',
    ],
    fluoride: ['fluoride', 'fluoreto', 'fluoruro', 'f-', 'fluoretos'],
    cyanide: [
        'cyanide',
        'cianeto',
        'cianuro',
        'cn-',
        'cianetos',
        'cianeto total',
        'total cyanide',
        'cianeto livre',
        'free cyanide',
    ],
    phenols: ['phenols', 'fenois', 'fenoles', 'fenois totais', 'total phenols', 'indice de fenois', 'phenol index'],

    // -----------------------------------------------------------------------
    // Emissions & Air Quality
    // -----------------------------------------------------------------------
    ghg_scope1: [
        'ghg scope 1',
        'escopo 1',
        'scope 1',
        'emissoes diretas',
        'direct emissions',
        'gee escopo 1',
        'co2 direto',
    ],
    ghg_scope2: [
        'ghg scope 2',
        'escopo 2',
        'scope 2',
        'emissoes indiretas',
        'indirect emissions',
        'gee escopo 2',
        'co2 indireto',
    ],
    pm25: [
        'pm2.5',
        'pm 2.5',
        'pm2,5',
        'particulate matter 2.5',
        'material particulado 2,5',
        'material particulado fino',
        'fine particulate matter',
    ],
    pm10: [
        'pm10',
        'pm 10',
        'particulate matter 10',
        'material particulado 10',
        'material particulado inalavel',
        'inhalable particulate matter',
    ],
    nox: ['nox', 'nitrogen oxides', 'oxidos de nitrogenio', 'no2', 'dioxido de nitrogenio', 'nitrogen dioxide'],
    sox: ['sox', 'sulfur oxides', 'oxidos de enxofre', 'so2', 'dioxido de enxofre', 'sulfur dioxide'],

    // -----------------------------------------------------------------------
    // Waste
    // -----------------------------------------------------------------------
    waste_total: ['waste total', 'residuos totais', 'total waste', 'residuos solidos totais', 'total solid waste'],
    waste_hazardous: [
        'hazardous waste',
        'residuos perigosos',
        'residuo perigoso',
        'classe i',
        'class i waste',
        'residuos classe i',
    ],
    waste_recycled_pct: [
        'waste recycled',
        'residuos reciclados',
        'taxa de reciclagem',
        'recycling rate',
        'percentual reciclado',
        'recycled percentage',
    ],

    // -----------------------------------------------------------------------
    // Effluent
    // -----------------------------------------------------------------------
    effluent_flow: [
        'effluent flow',
        'vazao de efluente',
        'vazao efluente',
        'effluent discharge',
        'descarga de efluente',
    ],
    bod: [
        'bod',
        'dbo',
        'dbo5',
        'bod5',
        'biochemical oxygen demand',
        'demanda bioquimica de oxigenio',
        'demanda bioquimica de oxigeno',
        'dbo 5 dias',
        'bod 5 day',
    ],
    cod: ['cod', 'dqo', 'chemical oxygen demand', 'demanda quimica de oxigenio', 'demanda quimica de oxigeno'],
    tss: [
        'tss',
        'sst',
        'total suspended solids',
        'solidos suspensos totais',
        'solidos suspendidos totales',
        'suspended solids',
    ],
    tds: [
        'tds',
        'std',
        'total dissolved solids',
        'solidos dissolvidos totais',
        'solidos disueltos totales',
        'dissolved solids',
    ],
    oil_grease: ['oil and grease', 'oleos e graxas', 'oil & grease', 'o&g', 'aceites y grasas', 'oleos graxas', 'og'],
    color: ['color', 'cor', 'colour', 'cor verdadeira', 'true color', 'cor aparente', 'apparent color'],

    // -----------------------------------------------------------------------
    // H&S (Health & Safety)
    // -----------------------------------------------------------------------
    frequency_rate: [
        'frequency rate',
        'taxa de frequencia',
        'tasa de frecuencia',
        'tf',
        'fr',
        'accident frequency rate',
    ],
    severity_rate: ['severity rate', 'taxa de gravidade', 'tasa de gravedad', 'tg', 'sr', 'accident severity rate'],
    ltir: ['ltir', 'lost time injury rate', 'taxa de lesoes com afastamento', 'lost time incident rate'],
    near_miss: [
        'near miss',
        'quase acidente',
        'casi accidente',
        'near misses',
        'quase acidentes',
        'incidente sem lesao',
    ],
    noise_exposure: [
        'noise exposure',
        'exposicao ao ruido',
        'exposicion al ruido',
        'ruido',
        'noise',
        'noise level',
        'nivel de ruido',
        'nivel de pressao sonora',
        'sound pressure level',
    ],

    // -----------------------------------------------------------------------
    // Biodiversity
    // -----------------------------------------------------------------------
    species_count: [
        'species count',
        'contagem de especies',
        'riqueza de especies',
        'species richness',
        'numero de especies',
        'number of species',
    ],
    protected_area: [
        'protected area',
        'area protegida',
        'area de protecao',
        'area de preservacao',
        'preservation area',
    ],
    biodiversity_index: [
        'biodiversity index',
        'indice de biodiversidade',
        'shannon index',
        'indice de shannon',
        'simpson index',
        'indice de simpson',
        'diversity index',
        'indice de diversidade',
    ],

    // -----------------------------------------------------------------------
    // Pesticides & Herbicides (CONAMA 420)
    // -----------------------------------------------------------------------
    aldrin_dieldrin: ['aldrin', 'dieldrin', 'aldrin + dieldrin', 'aldrin e dieldrin', 'aldrin/dieldrin'],
    ddt: ['ddt', 'ddt total', 'ddt (total)', 'diclorodifeniltricloroetano', 'dde', 'ddd', 'ddt + dde + ddd'],
    endrin: ['endrin', 'endrina'],
    hch: [
        'hch',
        'lindane',
        'lindano',
        'hexaclorociclohexano',
        'hexachlorocyclohexane',
        'bhc',
        'gamma-hch',
        'alpha-hch',
    ],
    heptachlor: ['heptachlor', 'heptacloro', 'heptachlor epoxide', 'epoxido de heptacloro', 'heptacloro + epoxido'],
    atrazine: ['atrazine', 'atrazina', 'atrazina e metabolitos'],
    glyphosate: ['glyphosate', 'glifosato', 'roundup', 'glifosato e ampa', 'ampa'],
    '2_4_d': ['2,4-d', '2,4-diclorofenoxiacetico', '2,4-dichlorophenoxyacetic', 'acido 2,4-diclorofenoxiacetico'],

    // -----------------------------------------------------------------------
    // PCBs & Dioxins
    // -----------------------------------------------------------------------
    pcb: [
        'pcb',
        'pcbs',
        'bifenilas policloradas',
        'polychlorinated biphenyls',
        'ascarel',
        'aroclor',
        'pcb total',
        'pcb totais',
    ],
    dioxins_furans: [
        'dioxins',
        'dioxinas',
        'furans',
        'furanos',
        'dioxinas e furanos',
        'dioxins and furans',
        'pcdd/f',
        'pcdd',
        'pcdf',
        'teq',
        'toxicity equivalents',
    ],

    // -----------------------------------------------------------------------
    // Biogeochemical Indicators (Natural Attenuation / MNA)
    // -----------------------------------------------------------------------
    ethane: ['ethane', 'etano', 'c2h6'],
    ethene: ['ethene', 'eteno', 'etileno', 'ethylene', 'c2h4'],
    methane: ['methane', 'metano', 'ch4', 'gas metano'],
    carbon_dioxide: ['carbon dioxide', 'dioxido de carbono', 'co2', 'gas carbonico', 'dioxido de carbono dissolvido'],
    sulfide: ['sulfide', 'sulfeto', 'sulfeto de hidrogenio', 'h2s', 'hydrogen sulfide', 'sulfureto'],
    ferrous_iron: [
        'ferrous iron',
        'ferro ii',
        'ferro ferroso',
        'fe2+',
        'fe(ii)',
        'ferro 2+',
        'ferro bivalente',
        'ferro reduzido',
    ],
    ferric_iron: [
        'ferric iron',
        'ferro iii',
        'ferro ferrico',
        'fe3+',
        'fe(iii)',
        'ferro 3+',
        'ferro trivalente',
        'ferro oxidado',
    ],
    manganese_ii: [
        'manganese ii',
        'manganes ii',
        'mn2+',
        'mn(ii)',
        'manganes dissolvido',
        'manganes reduzido',
        'manganes bivalente',
    ],
    toc: ['toc', 'cot', 'carbono organico total', 'total organic carbon', 'carbono organico', 'organic carbon'],

    // -----------------------------------------------------------------------
    // Microbiological
    // -----------------------------------------------------------------------
    total_coliforms: ['total coliforms', 'coliformes totais', 'coliformes totales', 'coliformes', 'coliforms'],
    fecal_coliforms: [
        'fecal coliforms',
        'coliformes fecais',
        'coliformes termotolerantes',
        'thermotolerant coliforms',
        'e. coli',
        'e.coli',
        'escherichia coli',
        'coliformes fecales',
    ],
    heterotrophic_bacteria: [
        'heterotrophic bacteria',
        'bacterias heterotroficas',
        'contagem de heterotroficas',
        'heterotrophic plate count',
        'hpc',
    ],

    // -----------------------------------------------------------------------
    // PAHs - EPA 16 Priority Pollutants (IUPAC names)
    // Ref: EPA Method 8270, CONAMA 420/2009 Anexo II
    // -----------------------------------------------------------------------
    acenaphthene: ['acenaphthene', 'acenafteno', 'acenafteno', 'acenaften'],
    acenaphthylene: ['acenaphthylene', 'acenaftileno', 'acenaftylen'],
    anthracene: ['anthracene', 'antraceno', 'antracen'],
    benz_a_anthracene: [
        'benz(a)anthracene',
        'benz[a]anthracene',
        'benzo(a)antraceno',
        'benz(a)antracen',
        '1,2-benzanthracene',
        '1,2-benzantraceno',
    ],
    benzo_a_pyrene: [
        'benzo(a)pyrene',
        'benzo[a]pyrene',
        'benzo(a)pireno',
        'benzo(a)pyren',
        'bap',
        '3,4-benzopyrene',
        '3,4-benzopireno',
    ],
    benzo_b_fluoranthene: [
        'benzo(b)fluoranthene',
        'benzo[b]fluoranthene',
        'benzo(b)fluoranteno',
        'benzo(b)fluoranten',
        'bbf',
    ],
    benzo_k_fluoranthene: [
        'benzo(k)fluoranthene',
        'benzo[k]fluoranthene',
        'benzo(k)fluoranteno',
        'benzo(k)fluoranten',
        'bkf',
    ],
    benzo_ghi_perylene: [
        'benzo(ghi)perylene',
        'benzo[ghi]perylene',
        'benzo(ghi)perileno',
        'benzo(g,h,i)perylene',
        'bghip',
    ],
    chrysene: ['chrysene', 'criseno', 'chrysen'],
    dibenz_ah_anthracene: [
        'dibenz(a,h)anthracene',
        'dibenz[a,h]anthracene',
        'dibenzo(a,h)antraceno',
        'dibenz(a,h)antracen',
        'dbaha',
        'dibenzantraceno',
    ],
    fluoranthene: ['fluoranthene', 'fluoranteno', 'fluoranten'],
    fluorene: ['fluorene', 'fluoreno', 'fluoren'],
    indeno_123cd_pyrene: [
        'indeno(1,2,3-cd)pyrene',
        'indeno[1,2,3-cd]pyrene',
        'indeno(1,2,3-cd)pireno',
        'indeno(1,2,3-c,d)pyrene',
        'ip',
        'indeno(1,2,3-cd)pyren',
    ],
    phenanthrene: ['phenanthrene', 'fenantreno', 'fenantren'],
    pyrene: ['pyrene', 'pireno', 'pyren'],
    pah_total: [
        'pah total',
        'pah totais',
        'total pah',
        'hpa total',
        'hpa totais',
        'total pahs',
        'pah16',
        'hpa 16',
        'sum pah',
        'soma hpa',
        'polycyclic aromatic hydrocarbons',
        'hidrocarbonetos aromaticos policiclicos',
    ],

    // -----------------------------------------------------------------------
    // Alkylated PAHs (OSPAR CEMP standard groups)
    // Ref: OSPAR Coordinated Environmental Monitoring Programme
    // -----------------------------------------------------------------------
    c1_naphthalenes: [
        'c1-naphthalenes',
        'c1-alkylnaphthalenes',
        'c1-naftalenos',
        'c1-alkylnaftalener',
        'methylnaphthalenes',
        'metilnaftalenos',
    ],
    c2_naphthalenes: [
        'c2-naphthalenes',
        'c2-alkylnaphthalenes',
        'c2-naftalenos',
        'c2-alkylnaftalener',
        'dimethylnaphthalenes',
        'dimetilnaftalenos',
    ],
    c3_naphthalenes: [
        'c3-naphthalenes',
        'c3-alkylnaphthalenes',
        'c3-naftalenos',
        'c3-alkylnaftalener',
        'trimethylnaphthalenes',
    ],
    c1_phenanthrenes: [
        'c1-phenanthrenes',
        'c1-alkylphenanthrenes',
        'c1-fenantrenos',
        'c1-alkylfenantren',
        'methylphenanthrenes',
        'metilfenantrenos',
    ],
    c2_phenanthrenes: ['c2-phenanthrenes', 'c2-alkylphenanthrenes', 'c2-fenantrenos', 'c2-alkylfenantren'],
    c3_phenanthrenes: ['c3-phenanthrenes', 'c3-alkylphenanthrenes', 'c3-fenantrenos', 'c3-alkylfenantren'],

    // -----------------------------------------------------------------------
    // PFAS - Per/Polyfluoroalkyl Substances (individual compounds)
    // Ref: IUPAC nomenclature, Stockholm Convention Annex B
    // -----------------------------------------------------------------------
    pfos: [
        'pfos',
        'perfluorooctane sulfonate',
        'sulfonato de perfluorooctano',
        'perfluorooctane sulfonic acid',
        'acido perfluorooctano sulfonico',
    ],
    pfoa: ['pfoa', 'perfluorooctanoic acid', 'acido perfluorooctanoico', 'perfluorooctanoate', 'perfluorooctanoato'],
    pfhxs: ['pfhxs', 'perfluorohexane sulfonate', 'sulfonato de perfluorohexano', 'perfluorohexane sulfonic acid'],
    pfna: ['pfna', 'perfluorononanoic acid', 'acido perfluorononanoico'],
    pfda: ['pfda', 'perfluorodecanoic acid', 'acido perfluorodecanoico'],
    fts_4_2: ['4:2 fts', '4:2 fluorotelomer sulfonate', '4:2 fluorotelomero sulfonato'],
    fts_6_2: ['6:2 fts', '6:2 fluorotelomer sulfonate', '6:2 fluorotelomero sulfonato'],
    fts_8_2: ['8:2 fts', '8:2 fluorotelomer sulfonate', '8:2 fluorotelomero sulfonato'],
    pfas_total: [
        'pfas total',
        'pfas totais',
        'total pfas',
        'sum pfas',
        'soma pfas',
        'substancias perfluoroalquil totais',
    ],

    // -----------------------------------------------------------------------
    // Radionuclides
    // Ref: IAEA Safety Standards, IUPAC isotope notation
    // -----------------------------------------------------------------------
    lead_210: ['210pb', 'pb-210', 'lead-210', 'chumbo-210', 'plomo-210'],
    radium_226: ['226ra', 'ra-226', 'radium-226', 'radio-226'],
    radium_228: ['228ra', 'ra-228', 'radium-228', 'radio-228'],
    thorium_228: ['228th', 'th-228', 'thorium-228', 'torio-228'],
    potassium_40: ['40k', 'k-40', 'potassium-40', 'potassio-40'],
    cesium_137: ['137cs', 'cs-137', 'cesium-137', 'cesio-137'],

    // -----------------------------------------------------------------------
    // Granulometry / Grain Size - Sediment & Soil Classification
    // Ref: ISO 14688, Wentworth scale, ABNT NBR 6502
    // -----------------------------------------------------------------------
    grain_size: [
        'grain size',
        'granulometria',
        'kornstorrelse',
        'particle size',
        'tamanho de grao',
        'distribuicao granulometrica',
        'grain size distribution',
    ],
    clay_fraction: ['clay', 'argila', 'leire', 'clay fraction', 'fracao argila', 'clay content', 'teor de argila'],
    silt_fraction: ['silt', 'silte', 'silt fraction', 'fracao silte', 'silt content', 'teor de silte'],
    sand_fine: ['fine sand', 'areia fina', 'fin sand'],
    sand_medium: ['medium sand', 'areia media', 'medium sand'],
    sand_coarse: ['coarse sand', 'areia grossa', 'grov sand'],
    sand_very_fine: ['very fine sand', 'areia muito fina', 'veldig fin sand'],
    sand_very_coarse: ['very coarse sand', 'areia muito grossa', 'veldig grov sand'],
    gravel: ['gravel', 'cascalho', 'grus', 'pedregulho'],
    pelite: ['pelite', 'pelito', 'pelita'],
    sorting: ['sorting', 'selecao', 'grau de selecao'],
    skewness: ['skewness', 'assimetria', 'curtose de assimetria'],
    kurtosis: ['kurtosis', 'curtose'],

    // -----------------------------------------------------------------------
    // Sediment Organic / Sulfur Indicators
    // Ref: ISO 10694, OSPAR CEMP guidelines
    // -----------------------------------------------------------------------
    tom: ['tom', 'total organic matter', 'materia organica total', 'mot', 'loss on ignition', 'perda ao fogo', 'loi'],
    total_sulfur: ['ts', 'total sulfur', 'enxofre total', 'total s'],

    // -----------------------------------------------------------------------
    // Norwegian aliases for existing metals
    // Ref: Standard Norwegian chemical nomenclature (Bokmål)
    // -----------------------------------------------------------------------
    // (merged into existing entries via additional aliases)
};

// ---------------------------------------------------------------------------
// Lookup Index (built once at load time)
// ---------------------------------------------------------------------------

/** @type {Map<string, string>|null} normalized alias → parameterId */
let lookupMap: any = null;

/** @type {Map<string, string>|null} user-defined aliases from localStorage */
let userAliases: any = null;

const STORAGE_KEY = 'ecbyts_param_aliases';

/**
 * Builds the lookup map from BUILTIN_ALIASES + user overrides
 * @returns {Map<string, string>}
 */
function buildLookupMap() {
    const map = new Map();

    // Built-in aliases
    for (const [paramId, aliases] of Object.entries(BUILTIN_ALIASES)) {
        for (const alias of aliases) {
            const key = normalize(alias);
            // First-write wins - earlier entries have priority
            if (!map.has(key)) {
                map.set(key, paramId);
            }
        }
    }

    // User overrides (higher priority - overwrite built-in)
    const userMap = getUserAliases();
    for (const [alias, paramId] of userMap.entries()) {
        map.set(normalize(alias), paramId);
    }

    return map;
}

/**
 * Loads user-defined aliases from localStorage
 * @returns {Map<string, string>}
 */
function getUserAliases() {
    if (userAliases) return userAliases;

    userAliases = new Map();
    try {
        const raw = localStorage.getItem(STORAGE_KEY) || '';
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null) {
                for (const [alias, paramId] of Object.entries(parsed)) {
                    userAliases.set(alias, paramId);
                }
            }
        }
    } catch (e) {
        console.warn('[paramAliases] Failed to load user aliases:', /** @type {any} */ (e as any)?.message);
    }
    return userAliases;
}

/**
 * Returns the lookup map, building it lazily on first call
 * @returns {Map<string, string>}
 */
function getLookupMap() {
    if (!lookupMap) {
        lookupMap = buildLookupMap();
    }
    return lookupMap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a parameter name to its parameterId via exact match in the alias table.
 * Returns null if no match found (caller should escalate to semantic matcher).
 *
 * @param {string} name - Parameter name as found in the document
 * @returns {{ parameterId: string, confidence: 'green' } | null}
 */
export function resolveAlias(name: any) {
    if (!name || typeof name !== 'string') return null;

    const key = normalize(name);
    if (!key) return null;

    const map = getLookupMap();
    const paramId = map.get(key);

    if (paramId) {
        return { parameterId: paramId, confidence: 'green' };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Depth-in-name pattern - e.g. "Hg(0-1 cm)" → { base: "Hg", depthFrom: 0, depthTo: 1 }
// Exige numero-hifen-numero + "cm" para evitar falsos positivos
// como "Benz(a)anthracene" que contem parenteses mas nao e profundidade.
// Ref: OSPAR CEMP sediment chemistry convention
// ---------------------------------------------------------------------------

/** @type {RegExp} Matches "ParamName(N-M cm)" or "ParamName(N-Mcm)" */
const DEPTH_IN_NAME_RE = /^(.+?)\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*cm\)$/i;

/**
 * Resolves a parameter name that may contain a depth suffix.
 * First tries exact match. If no match, checks for depth-in-name pattern
 * and retries with the base parameter name.
 *
 * @param {string} name - Parameter name, e.g. "Hg(0-1 cm)" or "TOM(1-3cm)"
 * @returns {{ parameterId: string, confidence: 'green', depthFrom?: number, depthTo?: number, depthUnit?: string } | null}
 */
export function resolveAliasWithDepth(name: any) {
    // Try exact match first
    const exact = resolveAlias(name);
    if (exact) return exact;

    if (!name || typeof name !== 'string') return null;

    const m = name.trim().match(DEPTH_IN_NAME_RE);
    if (!m) return null;

    const baseName = m![1]!.trim();
    const depthFrom = parseFloat(m![2]!);
    const depthTo = parseFloat(m![3]!);

    const baseMatch = resolveAlias(baseName);
    if (baseMatch) {
        return {
            ...baseMatch,
            depthFrom,
            depthTo,
            depthUnit: 'cm',
        };
    }

    return null;
}

/**
 * Returns the full list of known aliases for a given parameterId
 * @param {string} parameterId
 * @returns {string[]}
 */
export function getAliasesForParam(parameterId: any) {
    const builtIn = /** @type {Record<string, string[]>} */ (BUILTIN_ALIASES as any)[parameterId] || [];
    const user = [];
    const userMap = getUserAliases();
    for (const [alias, pId] of userMap.entries()) {
        if (pId === parameterId) user.push(alias);
    }
    return [...builtIn, ...user];
}

/**
 * Returns all known parameterIds in the alias table
 * @returns {string[]}
 */
export function getKnownParameterIds() {
    return Object.keys(BUILTIN_ALIASES);
}

/**
 * Returns the full normalized lookup map (for embedding pre-computation)
 * @returns {Map<string, string>}
 */
export function getFullLookupMap() {
    return new Map(getLookupMap());
}

/**
 * Adds a user-defined alias. Persisted in localStorage.
 * Overwrites existing alias if present.
 *
 * @param {string} alias - The new alias text
 * @param {string} parameterId - Target parameter ID
 */
export function addUserAlias(alias: any, parameterId: any) {
    if (!alias || !parameterId) return;

    const userMap = getUserAliases();
    userMap.set(alias, parameterId);

    // Persist
    /** @type {Record<string, string>} */
    const obj: Record<string, string> = {};
    for (const [a, p] of userMap.entries()) obj[a] = p;
    safeSetItem(STORAGE_KEY, JSON.stringify(obj));

    // Invalidate lookup cache
    lookupMap = null;
}

/**
 * Removes a user-defined alias
 * @param {string} alias
 */
export function removeUserAlias(alias: any) {
    if (!alias) return;

    const userMap = getUserAliases();
    userMap.delete(alias);

    /** @type {Record<string, string>} */
    const obj: Record<string, string> = {};
    for (const [a, p] of userMap.entries()) obj[a] = p;
    safeSetItem(STORAGE_KEY, JSON.stringify(obj));

    lookupMap = null;
}

/**
 * Resets user aliases to empty (keeps built-in)
 */
export function resetUserAliases() {
    userAliases = new Map();
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.debug('[paramAliases] resetRemove:', /** @type {any} */ (e as any)?.message || e);
        /* ignore */
    }
    lookupMap = null;
}

/**
 * Returns the raw BUILTIN_ALIASES object (for export/testing)
 * @returns {Object}
 */
export function getBuiltinAliases() {
    return BUILTIN_ALIASES;
}
