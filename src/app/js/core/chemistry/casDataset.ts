// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CAS DATASET — Top 50 environmental chemicals with multilingual names
   Base de dados das 50 substancias ambientais prioritarias com nomes
   em tres idiomas (EN/PT/ES).

   Referencia principal: CONAMA 420/2009, CETESB DD-256/2016,
   EPA Priority Pollutant List (40 CFR Part 423 Appendix A).
   ================================================================ */

export interface MultilingualName {
    /** English name */
    en: string;
    /** Portuguese (Brazilian) name */
    pt: string;
    /** Spanish name */
    es: string;
}

export interface SubstanceRecord {
    /** CAS Registry Number (e.g. '71-43-2') */
    cas: string;
    /** Names in EN, PT, ES */
    names: MultilingualName;
    /** Additional common names/abbreviations */
    synonyms: string[];
    /** Molecular formula */
    formula: string;
    /** Molecular weight (g/mol) */
    mw: number;
    /** Chemical family/group */
    family: string;
    /** Regulatory category (e.g. 'VOC', 'Metal') */
    category: string;
}

/** @type {SubstanceRecord[]} */
export const SUBSTANCE_DATASET: SubstanceRecord[] = [
    // --- BTEX (Benzene, Toluene, Ethylbenzene, Xylenes) ---
    {
        cas: '71-43-2',
        names: { en: 'Benzene', pt: 'Benzeno', es: 'Benceno' },
        synonyms: ['benzol', 'cyclohexatriene', 'phene'],
        formula: 'C6H6',
        mw: 78.1118,
        family: 'BTEX',
        category: 'VOC',
    },
    {
        cas: '108-88-3',
        names: { en: 'Toluene', pt: 'Tolueno', es: 'Tolueno' },
        synonyms: ['methylbenzene', 'toluol', 'anisen'],
        formula: 'C7H8',
        mw: 92.1405,
        family: 'BTEX',
        category: 'VOC',
    },
    {
        cas: '100-41-4',
        names: { en: 'Ethylbenzene', pt: 'Etilbenzeno', es: 'Etilbenceno' },
        synonyms: ['ethylbenzol', 'phenylethane'],
        formula: 'C8H10',
        mw: 106.165,
        family: 'BTEX',
        category: 'VOC',
    },
    {
        cas: '1330-20-7',
        names: { en: 'Xylenes (mixed)', pt: 'Xilenos (mistura)', es: 'Xilenos (mezcla)' },
        synonyms: ['dimethylbenzene', 'xylol'],
        formula: 'C8H10',
        mw: 106.165,
        family: 'BTEX',
        category: 'VOC',
    },

    // --- Heavy metals / Metais pesados ---
    {
        cas: '7439-92-1',
        names: { en: 'Lead', pt: 'Chumbo', es: 'Plomo' },
        synonyms: ['pb', 'plumbum'],
        formula: 'Pb',
        mw: 207.2,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '7440-38-2',
        names: { en: 'Arsenic', pt: 'Arsenio', es: 'Arsenico' },
        synonyms: ['as', 'arsenic element'],
        formula: 'As',
        mw: 74.9216,
        family: 'Metalloid',
        category: 'Metal',
    },
    {
        cas: '7439-97-6',
        names: { en: 'Mercury', pt: 'Mercurio', es: 'Mercurio' },
        synonyms: ['hg', 'quicksilver', 'hydrargyrum'],
        formula: 'Hg',
        mw: 200.59,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '7440-43-9',
        names: { en: 'Cadmium', pt: 'Cadmio', es: 'Cadmio' },
        synonyms: ['cd', 'cadmium element'],
        formula: 'Cd',
        mw: 112.411,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '18540-29-9',
        names: { en: 'Chromium VI', pt: 'Cromo VI', es: 'Cromo VI' },
        synonyms: ['chromium(vi)', 'hexavalent chromium', 'cr(vi)', 'cr6+'],
        formula: 'Cr',
        mw: 51.996,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '7440-02-0',
        names: { en: 'Nickel', pt: 'Niquel', es: 'Niquel' },
        synonyms: ['ni', 'nickel element'],
        formula: 'Ni',
        mw: 58.6934,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '7440-66-6',
        names: { en: 'Zinc', pt: 'Zinco', es: 'Zinc' },
        synonyms: ['zn', 'zinc element'],
        formula: 'Zn',
        mw: 65.38,
        family: 'Metal',
        category: 'Metal',
    },
    {
        cas: '7440-50-8',
        names: { en: 'Copper', pt: 'Cobre', es: 'Cobre' },
        synonyms: ['cu', 'cuprum'],
        formula: 'Cu',
        mw: 63.546,
        family: 'Metal',
        category: 'Metal',
    },
    {
        cas: '7440-62-2',
        names: { en: 'Vanadium', pt: 'Vanadio', es: 'Vanadio' },
        synonyms: ['v', 'vanadium element'],
        formula: 'V',
        mw: 50.9415,
        family: 'Metal',
        category: 'Metal',
    },
    {
        cas: '7440-48-4',
        names: { en: 'Cobalt', pt: 'Cobalto', es: 'Cobalto' },
        synonyms: ['co', 'cobalt element'],
        formula: 'Co',
        mw: 58.9332,
        family: 'Metal',
        category: 'Metal',
    },
    {
        cas: '7782-49-2',
        names: { en: 'Selenium', pt: 'Selenio', es: 'Selenio' },
        synonyms: ['se', 'selenium element'],
        formula: 'Se',
        mw: 78.96,
        family: 'Metalloid',
        category: 'Metal',
    },
    {
        cas: '7440-36-0',
        names: { en: 'Antimony', pt: 'Antimonio', es: 'Antimonio' },
        synonyms: ['sb', 'stibium'],
        formula: 'Sb',
        mw: 121.76,
        family: 'Metalloid',
        category: 'Metal',
    },
    {
        cas: '7440-28-0',
        names: { en: 'Thallium', pt: 'Talio', es: 'Talio' },
        synonyms: ['tl', 'thallium element'],
        formula: 'Tl',
        mw: 204.3833,
        family: 'Heavy Metal',
        category: 'Metal',
    },
    {
        cas: '7440-47-3',
        names: { en: 'Chromium total', pt: 'Cromo total', es: 'Cromo total' },
        synonyms: ['cr', 'total chromium', 'chromium element'],
        formula: 'Cr',
        mw: 51.996,
        family: 'Metal',
        category: 'Metal',
    },

    // --- Chlorinated solvents / Solventes clorados ---
    {
        cas: '79-01-6',
        names: { en: 'Trichloroethylene', pt: 'Tricloroetileno', es: 'Tricloroetileno' },
        synonyms: ['tce', 'trichloroethene', 'ethylene trichloride'],
        formula: 'C2HCl3',
        mw: 131.387,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '127-18-4',
        names: { en: 'Tetrachloroethylene', pt: 'Tetracloroetileno', es: 'Tetracloroetileno' },
        synonyms: ['pce', 'perchloroethylene', 'tetrachloroethene'],
        formula: 'C2Cl4',
        mw: 165.833,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '75-01-4',
        names: { en: 'Vinyl Chloride', pt: 'Cloreto de Vinila', es: 'Cloruro de Vinilo' },
        synonyms: ['vc', 'chloroethylene', 'chloroethene'],
        formula: 'C2H3Cl',
        mw: 62.498,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '156-59-2',
        names: { en: 'cis-1,2-Dichloroethylene', pt: 'cis-1,2-Dicloroetileno', es: 'cis-1,2-Dicloroetileno' },
        synonyms: ['cis-1,2-dce', 'cis-dce'],
        formula: 'C2H2Cl2',
        mw: 96.943,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '156-60-5',
        names: { en: 'trans-1,2-Dichloroethylene', pt: 'trans-1,2-Dicloroetileno', es: 'trans-1,2-Dicloroetileno' },
        synonyms: ['trans-1,2-dce', 'trans-dce'],
        formula: 'C2H2Cl2',
        mw: 96.943,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '75-35-4',
        names: { en: '1,1-Dichloroethylene', pt: '1,1-Dicloroetileno', es: '1,1-Dicloroetileno' },
        synonyms: ['1,1-dce', 'vinylidene chloride'],
        formula: 'C2H2Cl2',
        mw: 96.943,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '67-66-3',
        names: { en: 'Chloroform', pt: 'Cloroformio', es: 'Cloroformo' },
        synonyms: ['trichloromethane', 'formyl trichloride'],
        formula: 'CHCl3',
        mw: 119.378,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '56-23-5',
        names: { en: 'Carbon Tetrachloride', pt: 'Tetracloreto de Carbono', es: 'Tetracloruro de Carbono' },
        synonyms: ['tetrachloromethane', 'carbon tet', 'ccl4'],
        formula: 'CCl4',
        mw: 153.823,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },
    {
        cas: '75-09-2',
        names: { en: 'Dichloromethane', pt: 'Diclorometano', es: 'Diclorometano' },
        synonyms: ['methylene chloride', 'methylene dichloride', 'dcm'],
        formula: 'CH2Cl2',
        mw: 84.933,
        family: 'Chlorinated Solvent',
        category: 'VOC',
    },

    // --- PAHs (Polycyclic Aromatic Hydrocarbons) ---
    {
        cas: '50-32-8',
        names: { en: 'Benzo[a]pyrene', pt: 'Benzo[a]pireno', es: 'Benzo[a]pireno' },
        synonyms: ['bap', '3,4-benzopyrene', 'benzo(a)pyrene'],
        formula: 'C20H12',
        mw: 252.315,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '91-20-3',
        names: { en: 'Naphthalene', pt: 'Naftaleno', es: 'Naftaleno' },
        synonyms: ['naphthalene', 'moth balls', 'naphthalin'],
        formula: 'C10H8',
        mw: 128.17,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '120-12-7',
        names: { en: 'Anthracene', pt: 'Antraceno', es: 'Antraceno' },
        synonyms: ['anthracen', 'green oil'],
        formula: 'C14H10',
        mw: 178.23,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '206-44-0',
        names: { en: 'Fluoranthene', pt: 'Fluoranteno', es: 'Fluoranteno' },
        synonyms: ['benzo[j,k]acephenthylene', 'idryl'],
        formula: 'C16H10',
        mw: 202.252,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '129-00-0',
        names: { en: 'Pyrene', pt: 'Pireno', es: 'Pireno' },
        synonyms: ['benzo[def]chrysene'],
        formula: 'C16H10',
        mw: 202.252,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '85-01-8',
        names: { en: 'Phenanthrene', pt: 'Fenantreno', es: 'Fenantreno' },
        synonyms: ['phenanthren', 'phenantrin'],
        formula: 'C14H10',
        mw: 178.23,
        family: 'PAH',
        category: 'PAH',
    },
    {
        cas: '218-01-9',
        names: { en: 'Chrysene', pt: 'Criseno', es: 'Criseno' },
        synonyms: ['benzo[a]phenanthrene', '1,2-benzphenanthrene'],
        formula: 'C18H12',
        mw: 228.287,
        family: 'PAH',
        category: 'PAH',
    },

    // --- PCBs ---
    {
        cas: '11097-69-1',
        names: { en: 'Aroclor 1254 (PCB)', pt: 'Aroclor 1254 (PCB)', es: 'Aroclor 1254 (PCB)' },
        synonyms: ['aroclor 1254', 'pcb 1254'],
        formula: 'C12H5Cl5',
        mw: 326.433,
        family: 'PCB',
        category: 'Organochlorine',
    },
    {
        cas: '1336-36-3',
        names: { en: 'PCBs total', pt: 'PCBs total', es: 'PCBs total' },
        synonyms: ['polychlorinated biphenyls', 'pcb total'],
        formula: 'varies',
        mw: 0,
        family: 'PCB',
        category: 'Organochlorine',
    },

    // --- Petroleum / Derivados de petroleo ---
    {
        cas: '1634-04-4',
        names: { en: 'MTBE', pt: 'MTBE', es: 'MTBE' },
        synonyms: ['methyl tert-butyl ether', 'methyl tertiary butyl ether', 'tert-butyl methyl ether'],
        formula: 'C5H12O',
        mw: 88.148,
        family: 'Fuel Oxygenate',
        category: 'VOC',
    },
    {
        cas: '108-95-2',
        names: { en: 'Phenol', pt: 'Fenol', es: 'Fenol' },
        synonyms: ['hydroxybenzene', 'carbolic acid', 'phenic acid'],
        formula: 'C6H6O',
        mw: 94.1112,
        family: 'Phenol',
        category: 'VOC',
    },
    {
        cas: '98-82-8',
        names: { en: 'Isopropylbenzene', pt: 'Isopropilbenzeno', es: 'Isopropilbenceno' },
        synonyms: ['cumene', 'cumol', '2-phenylpropane'],
        formula: 'C9H12',
        mw: 120.192,
        family: 'Aromatic',
        category: 'VOC',
    },
    {
        cas: '100-42-5',
        names: { en: 'Styrene', pt: 'Estireno', es: 'Estireno' },
        synonyms: ['vinylbenzene', 'styrol', 'phenylethylene'],
        formula: 'C8H8',
        mw: 104.1491,
        family: 'Aromatic',
        category: 'VOC',
    },

    // --- Pesticides / Agrotoxicos ---
    {
        cas: '50-29-3',
        names: { en: 'DDT', pt: 'DDT', es: 'DDT' },
        synonyms: ['dichlorodiphenyltrichloroethane', "4,4'-ddt"],
        formula: 'C14H9Cl5',
        mw: 354.486,
        family: 'Organochlorine Pesticide',
        category: 'Pesticide',
    },
    {
        cas: '309-00-2',
        names: { en: 'Aldrin', pt: 'Aldrin', es: 'Aldrin' },
        synonyms: ['octalene', 'aldrex'],
        formula: 'C12H8Cl6',
        mw: 364.911,
        family: 'Organochlorine Pesticide',
        category: 'Pesticide',
    },
    {
        cas: '60-57-1',
        names: { en: 'Dieldrin', pt: 'Dieldrin', es: 'Dieldrin' },
        synonyms: ['octalox', 'alvit'],
        formula: 'C12H8Cl6O',
        mw: 380.91,
        family: 'Organochlorine Pesticide',
        category: 'Pesticide',
    },
    {
        cas: '72-20-8',
        names: { en: 'Endrin', pt: 'Endrin', es: 'Endrin' },
        synonyms: ['hexadrin', 'endrin pesticide'],
        formula: 'C12H8Cl6O',
        mw: 380.91,
        family: 'Organochlorine Pesticide',
        category: 'Pesticide',
    },
    {
        cas: '58-89-9',
        names: { en: 'Lindane', pt: 'Lindano', es: 'Lindano' },
        synonyms: ['gamma-hch', 'gamma-bhc', 'gammexane', 'hexachlorocyclohexane'],
        formula: 'C6H6Cl6',
        mw: 290.83,
        family: 'Organochlorine Pesticide',
        category: 'Pesticide',
    },
    {
        cas: '1912-24-9',
        names: { en: 'Atrazine', pt: 'Atrazina', es: 'Atrazina' },
        synonyms: ['aatrex', 'atranex', '2-chloro-4-(ethylamino)-6-(isopropylamino)-s-triazine'],
        formula: 'C8H14ClN5',
        mw: 215.683,
        family: 'Triazine Herbicide',
        category: 'Pesticide',
    },

    // --- Inorganics / Inorganicos ---
    {
        cas: '7664-41-7',
        names: { en: 'Ammonia', pt: 'Amonia', es: 'Amoniaco' },
        synonyms: ['ammoniak', 'azane', 'ammonia solution'],
        formula: 'NH3',
        mw: 17.0305,
        family: 'Inorganic',
        category: 'Inorganic',
    },
    {
        cas: '7697-37-2',
        names: { en: 'Nitric Acid', pt: 'Acido Nitrico', es: 'Acido Nitrico' },
        synonyms: ['aqua fortis', 'hno3'],
        formula: 'HNO3',
        mw: 63.013,
        family: 'Inorganic',
        category: 'Inorganic',
    },
    {
        cas: '143-33-9',
        names: { en: 'Sodium Cyanide', pt: 'Cianeto de Sodio', es: 'Cianuro de Sodio' },
        synonyms: ['nacn', 'cyanogran'],
        formula: 'NaCN',
        mw: 49.0072,
        family: 'Cyanide',
        category: 'Inorganic',
    },
    {
        cas: '7681-49-4',
        names: { en: 'Sodium Fluoride', pt: 'Fluoreto de Sodio', es: 'Fluoruro de Sodio' },
        synonyms: ['naf', 'sodium fluoride'],
        formula: 'NaF',
        mw: 41.9882,
        family: 'Fluoride',
        category: 'Inorganic',
    },
    {
        cas: '7439-96-5',
        names: { en: 'Manganese', pt: 'Manganes', es: 'Manganeso' },
        synonyms: ['mn', 'manganese element'],
        formula: 'Mn',
        mw: 54.938,
        family: 'Metal',
        category: 'Metal',
    },
    {
        cas: '7440-39-3',
        names: { en: 'Barium', pt: 'Bario', es: 'Bario' },
        synonyms: ['ba', 'barium element'],
        formula: 'Ba',
        mw: 137.327,
        family: 'Metal',
        category: 'Metal',
    },
];

/**
 * Build a lookup index over SUBSTANCE_DATASET by a given key extractor.
 * Constroi um indice de busca sobre o dataset para uma funcao extratora.
 *
 * @param {function(SubstanceRecord): string} keyFn - Key extractor
 * @returns {Map<string, SubstanceRecord>}
 */
export function buildIndex(keyFn: (rec: SubstanceRecord) => string): Map<string, SubstanceRecord> {
    const idx = new Map<string, SubstanceRecord>();
    for (const rec of SUBSTANCE_DATASET) {
        const key = keyFn(rec);
        if (key) idx.set(key.toLowerCase(), rec);
    }
    return idx;
}
