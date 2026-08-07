// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CHEMISTRY — Barrel / re-export index
   Barril de exportacoes do modulo de quimica

   Exporta:
   - CAS Registry (validacao, lookup, busca multilingual)
   - CAS Dataset (base de dados multilingue PT/EN/ES)
   - Contaminant Fate (parametros de destino e transporte)
   ================================================================ */

export * from './casRegistry.js';
export * from './casDataset.js';
export * from './contaminantFate.js';
export * from './bioavailabilityFactors.js';
export * from './remediationKinetics.js';
export * from './speciationChemistry.js';
export * from './sorptionKinetics.js';
export * from './isotopeFractionation.js';
export * from './fugacityLevelI.js';
