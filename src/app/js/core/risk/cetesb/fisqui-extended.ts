// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// FisQui-extended — catálogo COMPLETO das substâncias químicas de interesse (SQIs)
// extraído da aba FisQui da planilha CETESB v4.00 (mar/2026) via openpyxl direto.
// Complementa fisqui.ts (que tem só as 20 SQIs canônicas do ADR-A5).
//
// FONTE: tests/fixtures/cetesb-protected-cells-fixture.json (gerado por
// scripts/cetesb-extract-via-external-link.py)
// GERADO POR: scripts/cetesb-build-extended-catalogs.py
//
// SPEC: CETESB-RISK-001 RF-1.2 (cobertura estendida)

export interface FisQuiExtendedEntry {
    readonly name: string;
    /** PM — Peso Molecular (g/mol) */
    readonly pm: number | null;
    /** Heff — Constante de Henry efetiva (adimensional) */
    readonly heff: number | null;
    /** ρ — Densidade (g/cm³) */
    readonly rho: number | null;
    /** Koc — Coef. partição carbono orgânico/água (L/kg) */
    readonly koc: number | null;
    /** S — Solubilidade (mg/L) */
    readonly s: number | null;
    /** Dair — Difusão no ar (cm²/s) */
    readonly dair: number | null;
    /** Dwat — Difusão na água (cm²/s) */
    readonly dwat: number | null;
}

export const FISQUI_EXTENDED: Readonly<Record<string, FisQuiExtendedEntry>> = Object.freeze({
    '100-00-5': Object.freeze({ name: "Chloronitrobenzene, p-", pm: 157.56, heff: 0.00019991823385, rho: 1.2979, koc: null, s: 363.2, dair: null, dwat: 0.00793 }),
    '100-01-6': Object.freeze({ name: "Nitroaniline, 4-", pm: 138.13, heff: 5.15126737531e-08, rho: 1.424, koc: null, s: 109.1, dair: null, dwat: 0.00221 }),
    '100-21-0': Object.freeze({ name: "Phthalic Acid, p-", pm: 166.13, heff: 1.586263287e-11, rho: 1.519, koc: null, s: 79.24, dair: null, dwat: 0.00391 }),
    '100-25-4': Object.freeze({ name: "Dinitrobenzene, 1,4-", pm: 168.11, heff: 3.43008994276e-06, rho: 1.625, koc: null, s: 351.6, dair: null, dwat: 0.00167 }),
    '100-41-4': Object.freeze({ name: "Ethylbenzene", pm: 106.17, heff: 0.3221586263287, rho: 0.8626, koc: null, s: 446.1, dair: null, dwat: 0.0493 }),
    '100-42-5': Object.freeze({ name: "Styrene", pm: 104.15, heff: 0.11242845461979, rho: 0.9016, koc: null, s: 446.1, dair: null, dwat: 0.0372 }),
    '100-44-7': Object.freeze({ name: "Benzyl Chloride", pm: 126.59, heff: 0.01684382665576, rho: 1.1004, koc: null, s: 446.1, dair: null, dwat: 0.0103 }),
    '100-51-6': Object.freeze({ name: "Benzyl Alcohol", pm: 108.14, heff: 1.377759608e-05, rho: 1.0419, koc: null, s: 21.46, dair: null, dwat: 0.00209 }),
    '100-52-7': Object.freeze({ name: "Benzaldehyde", pm: 106.13, heff: 0.00109157808667, rho: 1.0401, koc: null, s: 11.09, dair: null, dwat: 0.00383 }),
    '100-61-8': Object.freeze({ name: "Monomethylaniline", pm: 107.16, heff: 0.00036304170074, rho: 0.9891, koc: null, s: 82.08, dair: null, dwat: 0.00498 }),
    '100-75-4': Object.freeze({ name: "Nitrosopiperidine [N-]", pm: 114.15, heff: 3.45053148e-05, rho: 1.0631, koc: null, s: 167.5, dair: null, dwat: 0.000622 }),
    '10025-84-0': Object.freeze({ name: "Lanthanum Chloride Heptahydrate", pm: 371.371, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '10025-85-1': Object.freeze({ name: "Trichloramine", pm: null, heff: null, rho: null, koc: null, s: null, dair: null, dwat: null }),
    '10034-93-2': Object.freeze({ name: "Hydrazine Sulfate", pm: 128.1, heff: null, rho: 1.378, koc: null, s: null, dair: null, dwat: 0.001 }),
    '10049-04-4': Object.freeze({ name: "Chlorine Dioxide", pm: 67.45, heff: 1.64, rho: 2.757, koc: null, s: null, dair: null, dwat: 0.001 }),
    '100587-90-4': Object.freeze({ name: "Lanthanum Acetate Hydrate", pm: 334.05, heff: null, rho: null, koc: null, s: null, dair: null, dwat: null }),
    '10099-58-8': Object.freeze({ name: "Lanthanum Chloride, Anhydrous", pm: 245.26, heff: null, rho: 3.84, koc: null, s: null, dair: null, dwat: 0.001 }),
    '101-14-4': Object.freeze({ name: "Methylene-bis(2-chloroaniline), 4,4'-", pm: 267.16, heff: 1.65985282093e-09, rho: null, koc: null, s: 5698, dair: null, dwat: 0.0197 }),
    '101-21-3': Object.freeze({ name: "Chlorpropham", pm: 213.67, heff: 2.326246934e-05, rho: 1.18, koc: null, s: 350.7, dair: null, dwat: 0.0213 }),
    '101-61-1': Object.freeze({ name: "Methylene-bis(N,N-dimethyl) Aniline, 4,4'-", pm: 254.38, heff: 4.37448896157e-08, rho: null, koc: null, s: 2667, dair: null, dwat: 0.047 }),
    '101-68-8': Object.freeze({ name: "Methylenediphenyl Diisocyanate", pm: 250.26, heff: 3.659035159e-05, rho: 1.197, koc: null, s: 284900, dair: null, dwat: 0.181 }),
    '101-77-9': Object.freeze({ name: "Methylenebisbenzenamine, 4,4'-", pm: 198.27, heff: 2.16680294358e-09, rho: null, koc: null, s: 2126, dair: null, dwat: 0.00138 }),
    '101-84-8': Object.freeze({ name: "Diphenyl Ether", pm: 170.21, heff: 0.011406378, rho: 1.0661, koc: null, s: 1950, dair: null, dwat: 0.109 }),
    '10102-45-1': Object.freeze({ name: "Thallium (I) Nitrate", pm: 267.38, heff: null, rho: 5.55, koc: null, s: null, dair: null, dwat: 0.001 }),
    '101200-48-0': Object.freeze({ name: "Tribenuron-methyl", pm: 395.4, heff: 4.1700735895e-12, rho: null, koc: null, s: 94.69, dair: null, dwat: 0.000468 }),
    '10124-56-8': Object.freeze({ name: "Sodium hexametaphosphate", pm: 611.17, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '10159-46-3': Object.freeze({ name: "Pentamethylphosphoramide (PMPA)", pm: 165.177, heff: 2.9765e-05, rho: 1.07, koc: null, s: 3.12, dair: null, dwat: 5.705124239e-05 }),
    '102-76-1': Object.freeze({ name: "Triacetin", pm: 218.21, heff: 5.03e-07, rho: 1.1583, koc: null, s: 40.73, dair: null, dwat: 0.000137 }),
    '10213-10-2': Object.freeze({ name: "Sodium Tungstate Dihydrate", pm: 329.85, heff: null, rho: 3.25, koc: null, s: null, dair: null, dwat: 0.001 }),
    '1024-57-3': Object.freeze({ name: "Heptachlor Epoxide", pm: 389.32, heff: 0.00085854456255, rho: 1.91, koc: null, s: 10110, dair: null, dwat: 0.0209 }),
    '10265-92-6': Object.freeze({ name: "Methamidophos", pm: 141.13, heff: 3.54946852003e-08, rho: 1.31, koc: null, s: 5.407, dair: null, dwat: 7.44e-05 }),
    '10277-43-7': Object.freeze({ name: "Lanthanum Nitrate Hexahydrate", pm: 433.011, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '10279-59-1': Object.freeze({ name: "Sodium aluminum phosphate (anhydrous)", pm: 897.81, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '10294-34-5': Object.freeze({ name: "Boron Trichloride", pm: 117.17, heff: 0.748, rho: 0.004789, koc: null, s: null, dair: null, dwat: 0.001 }),
    '103-23-1': Object.freeze({ name: "Di(2-ethylhexyl)adipate", pm: 370.58, heff: 1.774325429e-05, rho: 0.922, koc: null, s: 36000, dair: null, dwat: 3.23 }),
    '103-33-3': Object.freeze({ name: "Azobenzene", pm: 182.23, heff: 0.0005519215045, rho: 1.203, koc: null, s: 3759, dair: null, dwat: 0.0514 }),
    '103-65-1': Object.freeze({ name: "Propyl benzene", pm: 120.2, heff: 0.42927228127555, rho: 0.8593, koc: null, s: 813.1, dair: null, dwat: 0.0939 }),
    '103-72-0': Object.freeze({ name: "Phenyl Isothiocyanate", pm: 135.19, heff: 0.12142273098937, rho: 1.1303, koc: null, s: 218.8, dair: null, dwat: 0.0413 }),
    '10305-76-7': Object.freeze({ name: "Sodium aluminum phosphate (tetrahydrate)", pm: 949.864, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '1031-07-8': Object.freeze({ name: "Endosulfan Sulfate", pm: 422.93, heff: 1.328699918e-05, rho: null, koc: null, s: 9847, dair: null, dwat: 0.00179 }),
    '104-51-8': Object.freeze({ name: "Butylbenzene, n-", pm: 134.22, heff: 0.65004088307441, rho: 0.8601, koc: null, s: 1482, dair: null, dwat: 0.225 }),
    '104-76-7': Object.freeze({ name: "Hexanol, 1-,2-ethyl- (2-Ethyl-1-hexanol)", pm: 130.23, heff: 0.001083401, rho: 0.8319, koc: null, s: 35.28, dair: null, dwat: 0.019 }),
    '10453-86-8': Object.freeze({ name: "Resmethrin", pm: 338.45, heff: 5.43744889616e-06, rho: null, koc: null, s: 311400, dair: null, dwat: 0.238 }),
    '10495-86-0': Object.freeze({ name: "Ammonium perfluorobutanoate", pm: 231.07, heff: 0.00205, rho: 0.641, koc: null, s: 75.86, dair: null, dwat: 0.00168807358469 }),
    '105-60-2': Object.freeze({ name: "Caprolactam", pm: 113.16, heff: 1.0343417825e-06, rho: 1.02, koc: null, s: 24.5, dair: null, dwat: 0.001 }),
    '105-67-9': Object.freeze({ name: "Dimethylphenol, 2,4-", pm: 122.17, heff: 3.887980376e-05, rho: 0.965, koc: null, s: 491.8, dair: null, dwat: 0.0109 }),
    '10595-95-6': Object.freeze({ name: "Nitrosomethylethylamine, N-", pm: 88.11, heff: 5.887162715e-05, rho: 0.9448, koc: null, s: 43.47, dair: null, dwat: 0.000533 }),
    '10599-90-3': Object.freeze({ name: "Monochloramine", pm: 51.48, heff: null, rho: null, koc: null, s: null, dair: null, dwat: 0.001 }),
    '106-37-6': Object.freeze({ name: "Dibromobenzene, 1,4-", pm: 235.91, heff: 0.03650858544563, rho: 2.261, koc: null, s: 375.3, dair: null, dwat: 0.0245 }),
    '106-42-3': Object.freeze({ name: "Xylene, p-", pm: 106.17, heff: 0.28209321340965, rho: 0.861, koc: null, s: 375.3, dair: null, dwat: 0.0493 }),
    '106-43-4': Object.freeze({ name: "Chlorotoluene, p-", pm: 126.59, heff: 0.17906786590352, rho: 1.0697, koc: null, s: 375.3, dair: null, dwat: 0.0498 }),
    '106-44-5': Object.freeze({ name: "Cresol, p-", pm: 108.14, heff: 4.088307441e-05, rho: 1.0185, koc: null, s: 300.4, dair: null, dwat: 0.00754 }),
    '106-46-7': Object.freeze({ name: "Dichlorobenzene, 1,4-", pm: 147, heff: 0.09852820932134, rho: 1.2475, koc: null, s: 375.3, dair: null, dwat: 0.0453 }),
    '106-47-8': Object.freeze({ name: "Chloroaniline, p-", pm: 127.57, heff: 4.742436631e-05, rho: 1.429, koc: null, s: 112.7, dair: null, dwat: 0.00496 }),
    '106-49-0': Object.freeze({ name: "Toluidine, p-", pm: 107.16, heff: 8.25838103e-05, rho: 0.9619, koc: null, s: 112.7, dair: null, dwat: 0.00329 }),
    '106-50-3': Object.freeze({ name: "Phenylenediamine, p-", pm: 108.14, heff: 2.7514309076e-08, rho: null, koc: null, s: 33.83, dair: null, dwat: 0.000245 }),
    '106-88-7': Object.freeze({ name: "Epoxybutane, 1,2-", pm: 72.108, heff: 0.0073589533933, rho: 0.8297, koc: null, s: 9.907, dair: null, dwat: 0.00231 }),
    '106-89-8': Object.freeze({ name: "Epichlorohydrin", pm: 92.526, heff: 0.00124284546198, rho: 1.183, koc: null, s: 9.907, dair: null, dwat: 0.000944 }),
    '106-93-4': Object.freeze({ name: "Dibromoethane, 1,2-", pm: 187.86, heff: 0.02657399836468, rho: 2.1683, koc: null, s: 39.6, dair: null, dwat: 0.00278 }),
    '106-94-5': Object.freeze({ name: "Bromopropane, 1-", pm: 122.99, heff: 0.29926, rho: 1.3537, koc: null, s: 39.6, dair: null, dwat: 0.00795 }),
    '106-99-0': Object.freeze({ name: "Butadiene, 1,3-", pm: 54.092, heff: 3.00899427636958, rho: 0.6149, koc: null, s: 39.6, dair: null, dwat: 0.0164 }),
    '107-02-8': Object.freeze({ name: "Acrolein", pm: 56.065, heff: 0.00498773507768, rho: 0.84, koc: null, s: 1, dair: null, dwat: 0.000748 }),
    '107-04-0': Object.freeze({ name: "Bromo-2-chloroethane, 1-", pm: 143.41, heff: 0.03716271463614, rho: 1.7392, koc: null, s: 39.6, dair: null, dwat: 0.00464 }),
    '107-05-1': Object.freeze({ name: "Allyl Chloride", pm: 76.526, heff: 0.44971381847915, rho: 0.9376, koc: null, s: 39.6, dair: null, dwat: 0.0112 }),
    '107-06-2': Object.freeze({ name: "Dichloroethane, 1,2-", pm: 98.96, heff: 0.04824202780049, rho: 1.2454, koc: null, s: 39.6, dair: null, dwat: 0.0042 }),
    '107-07-3': Object.freeze({ name: "Chloroethanol, 2-", pm: 80.515, heff: 3.1112e-05, rho: 1.2019, koc: null, s: 1.904, dair: null, dwat: 0.000579 }),
    '107-13-1': Object.freeze({ name: "Acrylonitrile", pm: 53.064, heff: 0.00564186426819, rho: 0.8007, koc: null, s: 8.511, dair: null, dwat: 0.00116 }),
    '107-15-3': Object.freeze({ name: "Ethylene Diamine", pm: 60.099, heff: 7.07277187244e-08, rho: 0.8979, koc: null, s: 14.87, dair: null, dwat: 3.18e-05 }),
    '107-18-6': Object.freeze({ name: "Allyl Alcohol", pm: 58.081, heff: 0.00020400654129, rho: 0.854, koc: null, s: 1.904, dair: null, dwat: 0.000959 }),
    '107-19-7': Object.freeze({ name: "Propargyl Alcohol", pm: 56.065, heff: 4.701553557e-05, rho: 0.9478, koc: null, s: 1.904, dair: null, dwat: 0.000424 }),
    '107-20-0': Object.freeze({ name: "Chloroacetaldehyde, 2-", pm: 78.499, heff: 0.00097710547833, rho: 1.19, koc: null, s: 1, dair: null, dwat: 0.00065 }),
    '107-21-1': Object.freeze({ name: "Ethylene Glycol", pm: 62.069, heff: 2.45298446443e-06, rho: 1.1135, koc: null, s: 1, dair: null, dwat: 8.77e-05 }),
    '107-30-2': Object.freeze({ name: "Chloromethyl Methyl Ether", pm: 80.515, heff: 0.01242845461979, rho: 1.063, koc: null, s: 5.322, dair: null, dwat: 0.000905 }),
    '107-98-2': Object.freeze({ name: "Propylene Glycol Monomethyl Ether", pm: 90.123, heff: 3.761242845e-05, rho: 0.962, koc: null, s: 1, dair: null, dwat: 0.000231 }),
    '1071-83-6': Object.freeze({ name: "Glyphosate", pm: 169.07, heff: 8.5854456255e-11, rho: null, koc: null, s: 2100, dair: null, dwat: 4.54e-08 }),
    '1073-06-9': Object.freeze({ name: "Bromo-3-fluorobenzene, 1-", pm: 175, heff: 0.10220768601799, rho: 1.7081, koc: null, s: 375.3, dair: null, dwat: 0.0142 }),
    '108-05-4': Object.freeze({ name: "Vinyl Acetate", pm: 86.091, heff: 0.02089125102208, rho: 0.9256, koc: null, s: 5.583, dair: null, dwat: 0.00157 }),
    '108-10-1': Object.freeze({ name: "Methyl Isobutyl Ketone (4-methyl-2-pentanone)", pm: 100.16, heff: 0.00564186426819, rho: 0.7965, koc: null, s: 12.6, dair: null, dwat: 0.00319 }),
    '108-11-2': Object.freeze({ name: "Methyl-2-Pentanol, 4-", pm: 102.18, heff: 0.00181929681112, rho: 0.8075, koc: null, s: 8.155, dair: null, dwat: 0.00544 }),
    '108-20-3': Object.freeze({ name: "Diisopropyl Ether", pm: 102.18, heff: 0.10466067048242, rho: 0.7192, koc: null, s: 22.79, dair: null, dwat: 0.00428 }),
    '108-31-6': Object.freeze({ name: "Maleic Anhydride", pm: 98.059, heff: 0.00016067048242, rho: 1.314, koc: null, s: 1, dair: null, dwat: 0.00525 }),
    '108-36-1': Object.freeze({ name: "Dibromobenzene, 1,3-", pm: 235.91, heff: 0.0507, rho: 1.9523, koc: null, s: 375.3, dair: null, dwat: 0.0231 }),
    '108-38-3': Object.freeze({ name: "Xylene, m-", pm: 106.17, heff: 0.29354047424366, rho: 0.8641, koc: null, s: 375.3, dair: null, dwat: 0.0532 }),
    '108-39-4': Object.freeze({ name: "Cresol, m-", pm: 108.14, heff: 3.499591169e-05, rho: 1.0339, koc: null, s: 300.4, dair: null, dwat: 0.00777 }),
    '108-45-2': Object.freeze({ name: "Phenylenediamine, m-", pm: 108.14, heff: 5.1103843009e-08, rho: 1.0096, koc: null, s: 33.83, dair: null, dwat: 0.000234 }),
    '108-60-1': Object.freeze({ name: "Bis(2-chloro-1-methylethyl) ether", pm: 171.07, heff: 0.00303352412101, rho: 1.103, koc: null, s: 82.92, dair: null, dwat: 0.00764 }),
    '108-67-8': Object.freeze({ name: "Trimethylbenzene, 1,3,5-", pm: 120.2, heff: 0.3585445625511, rho: 0.8615, koc: null, s: 602.1, dair: null, dwat: 0.0621 }),
    '108-86-1': Object.freeze({ name: "Bromobenzene", pm: 157.01, heff: 0.10098119378577, rho: 1.495, koc: null, s: 233.9, dair: null, dwat: 0.02 }),
    '108-87-2': Object.freeze({ name: "Methylcyclohexane", pm: 98.19, heff: 17.579721995094, rho: 0.7694, koc: null, s: 233.9, dair: null, dwat: 0.11 }),
    '108-88-3': Object.freeze({ name: "Toluene", pm: 92.142, heff: 0.27146361406378, rho: 0.8623, koc: null, s: 233.9, dair: null, dwat: 0.0311 }),
    '108-90-7': Object.freeze({ name: "Chlorobenzene", pm: 112.56, heff: 0.12714636140638, rho: 1.1058, koc: null, s: 233.9, dair: null, dwat: 0.0282 }),
    '108-91-8': Object.freeze({ name: "Cyclohexylamine", pm: 99.177, heff: 0.00017007358953, rho: 0.8191, koc: null, s: 32.17, dair: null, dwat: 0.00425 }),
    '108-94-1': Object.freeze({ name: "Cyclohexanone", pm: 98.146, heff: 0.00036794766966, rho: 0.9478, koc: null, s: 17.38, dair: null, dwat: 0.00152 }),
    '108-95-2': Object.freeze({ name: "Phenol", pm: 94.114, heff: 1.361406378e-05, rho: 1.0545, koc: null, s: 187.2, dair: null, dwat: 0.00434 }),
    '108-98-5': Object.freeze({ name: "Benzenethiol", pm: 110.18, heff: 0.01369582992641, rho: 1.0775, koc: null, s: 233.9, dair: null, dwat: 0.0178 }),
    '108427-53-8': Object.freeze({ name: "Perfluorohexanesulfonate", pm: 399.1, heff: null, rho: 1.841, koc: null, s: 112.2, dair: null, dwat: 0.00025807510933 }),
    '109-66-0': Object.freeze({ name: "Pentane, n-", pm: 72.151, heff: 51.1038430089943, rho: 0.6262, koc: null, s: 72.17, dair: null, dwat: 0.11 }),
});

export function getFisQuiExtended(cas: string): Readonly<FisQuiExtendedEntry> | undefined {
    if (typeof cas !== 'string') return undefined;
    return FISQUI_EXTENDED[cas.trim()];
}

export const FISQUI_EXTENDED_COUNT = 97;
export const FISQUI_EXTENDED_SOURCE = 'CETESBRisk v4.00 mar/2026 FisQui aba (extracted via openpyxl)';
