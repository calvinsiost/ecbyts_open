// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// FatTox-extended — catálogo COMPLETO dos parâmetros toxicológicos extraído
// da aba FatTox da planilha CETESB v4.00 (mar/2026). Complementa fatTox.ts.
//
// FONTE: tests/fixtures/cetesb-protected-cells-fixture.json
// GERADO POR: scripts/cetesb-build-extended-catalogs.py
//
// SPEC: CETESB-RISK-001 RF-1.2 (cobertura estendida)

export interface FatToxExtendedEntry {
    readonly name: string;
    /** SFo — Slope factor oral (mg/kg-dia)⁻¹ */
    readonly sfo: number | null;
    /** RfDo — Reference Dose oral (mg/kg-dia) */
    readonly rfdo: number | null;
    /** SFi — Slope factor inalação (mg/kg-dia)⁻¹ */
    readonly sfi: number | null;
    /** RfDi — Reference Dose inalação (mg/kg-dia) */
    readonly rfdi: number | null;
    /** ABSGI — Fração absorvida trato gastrointestinal */
    readonly absgi: number | null;
    /** ABSd — Fração absorvida pela pele */
    readonly absd: number | null;
}

export const FATTOX_EXTENDED: Readonly<Record<string, FatToxExtendedEntry>> = Object.freeze({
    '100-00-5': Object.freeze({ name: "Chloronitrobenzene, p-", sfo: 0.06, rfdo: null, sfi: 0.0007, rfdi: 0.002, absgi: null, absd: 1 }),
    '100-01-6': Object.freeze({ name: "Nitroaniline, 4-", sfo: 0.02, rfdo: null, sfi: 0.004, rfdi: 0.006, absgi: null, absd: 1 }),
    '100-21-0': Object.freeze({ name: "Phthalic Acid, p-", sfo: null, rfdo: null, sfi: 0.5, rfdi: null, absgi: null, absd: 1 }),
    '100-25-4': Object.freeze({ name: "Dinitrobenzene, 1,4-", sfo: null, rfdo: null, sfi: 0.0001, rfdi: null, absgi: null, absd: 1 }),
    '100-41-4': Object.freeze({ name: "Ethylbenzene", sfo: 0.011, rfdo: 2.5e-06, sfi: 0.05, rfdi: 1, absgi: null, absd: 1 }),
    '100-42-5': Object.freeze({ name: "Styrene", sfo: null, rfdo: null, sfi: 0.2, rfdi: 1, absgi: null, absd: 1 }),
    '100-44-7': Object.freeze({ name: "Benzyl Chloride", sfo: 0.17, rfdo: 4.9e-05, sfi: 0.002, rfdi: 0.001, absgi: null, absd: 1 }),
    '100-51-6': Object.freeze({ name: "Benzyl Alcohol", sfo: null, rfdo: null, sfi: 0.1, rfdi: null, absgi: null, absd: 1 }),
    '100-52-7': Object.freeze({ name: "Benzaldehyde", sfo: 0.004, rfdo: null, sfi: 0.1, rfdi: null, absgi: null, absd: 1 }),
    '100-61-8': Object.freeze({ name: "Monomethylaniline", sfo: null, rfdo: null, sfi: 0.002, rfdi: null, absgi: null, absd: 1 }),
    '100-75-4': Object.freeze({ name: "Nitrosopiperidine [N-]", sfo: 9.4, rfdo: 0.0027, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '10025-84-0': Object.freeze({ name: "Lanthanum Chloride Heptahydrate", sfo: null, rfdo: null, sfi: 1.87e-05, rfdi: null, absgi: null, absd: 1 }),
    '10025-85-1': Object.freeze({ name: "Trichloramine", sfo: null, rfdo: null, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '10034-93-2': Object.freeze({ name: "Hydrazine Sulfate", sfo: 3, rfdo: 0.0049, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '10049-04-4': Object.freeze({ name: "Chlorine Dioxide", sfo: null, rfdo: null, sfi: 0.03, rfdi: 0.0002, absgi: null, absd: 1 }),
    '100587-90-4': Object.freeze({ name: "Lanthanum Acetate Hydrate", sfo: null, rfdo: null, sfi: 2.08e-05, rfdi: null, absgi: null, absd: 1 }),
    '10099-58-8': Object.freeze({ name: "Lanthanum Chloride, Anhydrous", sfo: null, rfdo: null, sfi: 2.83e-05, rfdi: null, absgi: null, absd: 1 }),
    '101-14-4': Object.freeze({ name: "Methylene-bis(2-chloroaniline), 4,4'-", sfo: 0.1, rfdo: 0.00043, sfi: 0.002, rfdi: null, absgi: null, absd: 1 }),
    '101-21-3': Object.freeze({ name: "Chlorpropham", sfo: null, rfdo: null, sfi: 0.005, rfdi: null, absgi: null, absd: 1 }),
    '101-61-1': Object.freeze({ name: "Methylene-bis(N,N-dimethyl) Aniline, 4,4'-", sfo: 0.046, rfdo: 1.3e-05, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '101-68-8': Object.freeze({ name: "Methylenediphenyl Diisocyanate", sfo: null, rfdo: null, sfi: null, rfdi: 0.0006, absgi: null, absd: 1 }),
    '101-77-9': Object.freeze({ name: "Methylenebisbenzenamine, 4,4'-", sfo: 1.6, rfdo: 0.00046, sfi: null, rfdi: 0.02, absgi: null, absd: 1 }),
    '101-84-8': Object.freeze({ name: "Diphenyl Ether", sfo: null, rfdo: null, sfi: null, rfdi: 0.0004, absgi: null, absd: 1 }),
    '10102-45-1': Object.freeze({ name: "Thallium (I) Nitrate", sfo: null, rfdo: null, sfi: 1e-05, rfdi: null, absgi: null, absd: 1 }),
    '101200-48-0': Object.freeze({ name: "Tribenuron-methyl", sfo: null, rfdo: null, sfi: 0.008, rfdi: null, absgi: null, absd: 1 }),
    '10124-56-8': Object.freeze({ name: "Sodium hexametaphosphate", sfo: null, rfdo: null, sfi: 1, rfdi: null, absgi: null, absd: 1 }),
    '10159-46-3': Object.freeze({ name: "Pentamethylphosphoramide (PMPA)", sfo: null, rfdo: null, sfi: 0.0001, rfdi: null, absgi: null, absd: 1 }),
    '102-76-1': Object.freeze({ name: "Triacetin", sfo: null, rfdo: null, sfi: 80, rfdi: null, absgi: null, absd: 1 }),
    '10213-10-2': Object.freeze({ name: "Sodium Tungstate Dihydrate", sfo: null, rfdo: null, sfi: 0.0008, rfdi: null, absgi: null, absd: 1 }),
    '1024-57-3': Object.freeze({ name: "Heptachlor Epoxide", sfo: 9.1, rfdo: 0.0026, sfi: 1.3e-05, rfdi: null, absgi: null, absd: 1 }),
    '10265-92-6': Object.freeze({ name: "Methamidophos", sfo: null, rfdo: null, sfi: 5e-05, rfdi: null, absgi: null, absd: 1 }),
    '10277-43-7': Object.freeze({ name: "Lanthanum Nitrate Hexahydrate", sfo: null, rfdo: null, sfi: 1.6e-05, rfdi: null, absgi: null, absd: 1 }),
    '10279-59-1': Object.freeze({ name: "Sodium aluminum phosphate (anhydrous)", sfo: null, rfdo: null, sfi: 4.99, rfdi: null, absgi: null, absd: 1 }),
    '10294-34-5': Object.freeze({ name: "Boron Trichloride", sfo: null, rfdo: null, sfi: 2, rfdi: 0.02, absgi: null, absd: 1 }),
    '103-23-1': Object.freeze({ name: "Di(2-ethylhexyl)adipate", sfo: 0.0012, rfdo: null, sfi: 0.6, rfdi: null, absgi: null, absd: 1 }),
    '103-33-3': Object.freeze({ name: "Azobenzene", sfo: 0.11, rfdo: 3.1e-05, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '103-65-1': Object.freeze({ name: "Propyl benzene", sfo: null, rfdo: null, sfi: 0.1, rfdi: 1, absgi: null, absd: 1 }),
    '103-72-0': Object.freeze({ name: "Phenyl Isothiocyanate", sfo: null, rfdo: null, sfi: 0.0002, rfdi: null, absgi: null, absd: 1 }),
    '10305-76-7': Object.freeze({ name: "Sodium aluminum phosphate (tetrahydrate)", sfo: null, rfdo: null, sfi: 3.52, rfdi: null, absgi: null, absd: 1 }),
    '1031-07-8': Object.freeze({ name: "Endosulfan Sulfate", sfo: null, rfdo: null, sfi: 0.006, rfdi: null, absgi: null, absd: 1 }),
    '104-51-8': Object.freeze({ name: "Butylbenzene, n-", sfo: null, rfdo: null, sfi: 0.05, rfdi: null, absgi: null, absd: 1 }),
    '104-76-7': Object.freeze({ name: "Hexanol, 1-,2-ethyl- (2-Ethyl-1-hexanol)", sfo: 0.0095, rfdo: null, sfi: 0.07, rfdi: 0.0004, absgi: null, absd: 1 }),
    '10453-86-8': Object.freeze({ name: "Resmethrin", sfo: null, rfdo: null, sfi: 0.03, rfdi: null, absgi: null, absd: 1 }),
    '10495-86-0': Object.freeze({ name: "Ammonium perfluorobutanoate", sfo: null, rfdo: null, sfi: 0.001, rfdi: null, absgi: null, absd: 1 }),
    '105-60-2': Object.freeze({ name: "Caprolactam", sfo: null, rfdo: null, sfi: 0.5, rfdi: 0.0022, absgi: null, absd: 1 }),
    '105-67-9': Object.freeze({ name: "Dimethylphenol, 2,4-", sfo: null, rfdo: null, sfi: 0.02, rfdi: null, absgi: null, absd: 1 }),
    '10595-95-6': Object.freeze({ name: "Nitrosomethylethylamine, N-", sfo: 22, rfdo: 0.0063, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '10599-90-3': Object.freeze({ name: "Monochloramine", sfo: null, rfdo: null, sfi: 0.1, rfdi: null, absgi: null, absd: 1 }),
    '106-37-6': Object.freeze({ name: "Dibromobenzene, 1,4-", sfo: null, rfdo: null, sfi: 0.01, rfdi: null, absgi: null, absd: 1 }),
    '106-42-3': Object.freeze({ name: "Xylene, p-", sfo: null, rfdo: null, sfi: 0.2, rfdi: 0.1, absgi: null, absd: 1 }),
    '106-43-4': Object.freeze({ name: "Chlorotoluene, p-", sfo: null, rfdo: null, sfi: 0.02, rfdi: null, absgi: null, absd: 1 }),
    '106-44-5': Object.freeze({ name: "Cresol, p-", sfo: null, rfdo: null, sfi: 0.02, rfdi: 0.6, absgi: null, absd: 1 }),
    '106-46-7': Object.freeze({ name: "Dichlorobenzene, 1,4-", sfo: 0.0054, rfdo: 1.1e-05, sfi: 0.07, rfdi: 0.8, absgi: null, absd: 1 }),
    '106-47-8': Object.freeze({ name: "Chloroaniline, p-", sfo: 0.2, rfdo: null, sfi: 0.0005, rfdi: null, absgi: null, absd: 1 }),
    '106-49-0': Object.freeze({ name: "Toluidine, p-", sfo: 0.03, rfdo: null, sfi: 0.004, rfdi: null, absgi: null, absd: 1 }),
    '106-50-3': Object.freeze({ name: "Phenylenediamine, p-", sfo: null, rfdo: null, sfi: 0.001, rfdi: null, absgi: null, absd: 1 }),
    '106-88-7': Object.freeze({ name: "Epoxybutane, 1,2-", sfo: null, rfdo: null, sfi: null, rfdi: 0.02, absgi: null, absd: 1 }),
    '106-89-8': Object.freeze({ name: "Epichlorohydrin", sfo: 0.0099, rfdo: 1.2e-06, sfi: 0.006, rfdi: 0.001, absgi: null, absd: 1 }),
    '106-93-4': Object.freeze({ name: "Dibromoethane, 1,2-", sfo: 2, rfdo: 0.0006, sfi: 0.009, rfdi: 0.009, absgi: null, absd: 1 }),
    '106-94-5': Object.freeze({ name: "Bromopropane, 1-", sfo: null, rfdo: 3.7e-06, sfi: null, rfdi: 0.1, absgi: null, absd: 1 }),
    '106-99-0': Object.freeze({ name: "Butadiene, 1,3-", sfo: 0.6, rfdo: 3e-05, sfi: null, rfdi: 0.002, absgi: null, absd: 1 }),
    '107-02-8': Object.freeze({ name: "Acrolein", sfo: null, rfdo: null, sfi: 0.0005, rfdi: 2e-05, absgi: null, absd: 1 }),
    '107-04-0': Object.freeze({ name: "Bromo-2-chloroethane, 1-", sfo: null, rfdo: null, sfi: 0.0001, rfdi: 6e-05, absgi: null, absd: 1 }),
    '107-05-1': Object.freeze({ name: "Allyl Chloride", sfo: 0.021, rfdo: 6e-06, sfi: null, rfdi: 0.001, absgi: null, absd: 1 }),
    '107-06-2': Object.freeze({ name: "Dichloroethane, 1,2-", sfo: 0.091, rfdo: 2.6e-05, sfi: 0.006, rfdi: 0.007, absgi: null, absd: 1 }),
    '107-07-3': Object.freeze({ name: "Chloroethanol, 2-", sfo: null, rfdo: null, sfi: 0.02, rfdi: null, absgi: null, absd: 1 }),
    '107-13-1': Object.freeze({ name: "Acrylonitrile", sfo: 0.54, rfdo: 6.8e-05, sfi: 9e-05, rfdi: 0.002, absgi: null, absd: 1 }),
    '107-15-3': Object.freeze({ name: "Ethylene Diamine", sfo: null, rfdo: null, sfi: 0.09, rfdi: null, absgi: null, absd: 1 }),
    '107-18-6': Object.freeze({ name: "Allyl Alcohol", sfo: null, rfdo: null, sfi: 0.004, rfdi: 0.0001, absgi: null, absd: 1 }),
    '107-19-7': Object.freeze({ name: "Propargyl Alcohol", sfo: null, rfdo: null, sfi: 0.002, rfdi: null, absgi: null, absd: 1 }),
    '107-20-0': Object.freeze({ name: "Chloroacetaldehyde, 2-", sfo: 0.27, rfdo: null, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '107-21-1': Object.freeze({ name: "Ethylene Glycol", sfo: null, rfdo: null, sfi: 0.8, rfdi: 0.4, absgi: null, absd: 1 }),
    '107-30-2': Object.freeze({ name: "Chloromethyl Methyl Ether", sfo: 2.4, rfdo: 0.00069, sfi: null, rfdi: null, absgi: null, absd: 1 }),
    '107-98-2': Object.freeze({ name: "Propylene Glycol Monomethyl Ether", sfo: null, rfdo: null, sfi: 0.7, rfdi: 2, absgi: null, absd: 1 }),
    '1071-83-6': Object.freeze({ name: "Glyphosate", sfo: null, rfdo: null, sfi: 0.1, rfdi: null, absgi: null, absd: 1 }),
    '1073-06-9': Object.freeze({ name: "Bromo-3-fluorobenzene, 1-", sfo: null, rfdo: null, sfi: 0.0003, rfdi: null, absgi: null, absd: 1 }),
    '108-05-4': Object.freeze({ name: "Vinyl Acetate", sfo: null, rfdo: null, sfi: 1, rfdi: 0.2, absgi: null, absd: 1 }),
    '108-10-1': Object.freeze({ name: "Methyl Isobutyl Ketone (4-methyl-2-pentanone)", sfo: null, rfdo: null, sfi: null, rfdi: 3, absgi: null, absd: 1 }),
    '108-11-2': Object.freeze({ name: "Methyl-2-Pentanol, 4-", sfo: null, rfdo: null, sfi: null, rfdi: 3, absgi: null, absd: 1 }),
    '108-20-3': Object.freeze({ name: "Diisopropyl Ether", sfo: null, rfdo: null, sfi: null, rfdi: 0.7, absgi: null, absd: 1 }),
    '108-31-6': Object.freeze({ name: "Maleic Anhydride", sfo: null, rfdo: null, sfi: 0.1, rfdi: 0.0007, absgi: null, absd: 1 }),
    '108-36-1': Object.freeze({ name: "Dibromobenzene, 1,3-", sfo: null, rfdo: null, sfi: 0.0004, rfdi: null, absgi: null, absd: 1 }),
    '108-38-3': Object.freeze({ name: "Xylene, m-", sfo: null, rfdo: null, sfi: 0.2, rfdi: 0.1, absgi: null, absd: 1 }),
    '108-39-4': Object.freeze({ name: "Cresol, m-", sfo: null, rfdo: null, sfi: 0.05, rfdi: 0.6, absgi: null, absd: 1 }),
    '108-45-2': Object.freeze({ name: "Phenylenediamine, m-", sfo: null, rfdo: null, sfi: 0.006, rfdi: null, absgi: null, absd: 1 }),
    '108-60-1': Object.freeze({ name: "Bis(2-chloro-1-methylethyl) ether", sfo: null, rfdo: null, sfi: 0.04, rfdi: null, absgi: null, absd: 1 }),
    '108-67-8': Object.freeze({ name: "Trimethylbenzene, 1,3,5-", sfo: null, rfdo: null, sfi: 0.01, rfdi: 0.06, absgi: null, absd: 1 }),
    '108-86-1': Object.freeze({ name: "Bromobenzene", sfo: null, rfdo: null, sfi: 0.008, rfdi: 0.06, absgi: null, absd: 1 }),
    '108-87-2': Object.freeze({ name: "Methylcyclohexane", sfo: null, rfdo: null, sfi: null, rfdi: 0.095, absgi: null, absd: 1 }),
    '108-88-3': Object.freeze({ name: "Toluene", sfo: null, rfdo: null, sfi: 0.08, rfdi: 5, absgi: null, absd: 1 }),
    '108-90-7': Object.freeze({ name: "Chlorobenzene", sfo: null, rfdo: null, sfi: 0.02, rfdi: 0.05, absgi: null, absd: 1 }),
    '108-91-8': Object.freeze({ name: "Cyclohexylamine", sfo: null, rfdo: null, sfi: 0.2, rfdi: null, absgi: null, absd: 1 }),
    '108-94-1': Object.freeze({ name: "Cyclohexanone", sfo: null, rfdo: null, sfi: 5, rfdi: 0.7, absgi: null, absd: 1 }),
    '108-95-2': Object.freeze({ name: "Phenol", sfo: null, rfdo: null, sfi: 0.3, rfdi: 0.2, absgi: null, absd: 1 }),
    '108-98-5': Object.freeze({ name: "Benzenethiol", sfo: null, rfdo: null, sfi: 0.001, rfdi: null, absgi: null, absd: 1 }),
    '108427-53-8': Object.freeze({ name: "Perfluorohexanesulfonate", sfo: null, rfdo: null, sfi: 2e-05, rfdi: null, absgi: null, absd: 1 }),
    '109-66-0': Object.freeze({ name: "Pentane, n-", sfo: null, rfdo: null, sfi: null, rfdi: 1, absgi: null, absd: 1 }),
});

export function getFatToxExtended(cas: string): Readonly<FatToxExtendedEntry> | undefined {
    if (typeof cas !== 'string') return undefined;
    return FATTOX_EXTENDED[cas.trim()];
}

export const FATTOX_EXTENDED_COUNT = 97;
export const FATTOX_EXTENDED_SOURCE = 'CETESBRisk v4.00 mar/2026 FatTox aba (extracted via openpyxl)';
