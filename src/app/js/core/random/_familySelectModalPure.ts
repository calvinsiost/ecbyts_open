// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   FAMILY-SELECT-MODAL — barrel das fatias de lógica pura.

   Reexporta as funções puras extraídas de utils/ui/familySelectModal.ts
   (filtro de famílias, formatação de slider, montagem de options) num
   único módulo, para que o modal as importe com UM import só (menor
   fan-out / acoplamento) sem perder a granularidade dos módulos-fonte
   (cada um mantém o seu teste byte-parity dedicado).
   ================================================================ */

export { randomFamilyIds, clearableFamilyIds, familyRowStates } from './_familyListPure.js';
export type { FamilyRowState } from './_familyListPure.js';
export { formatSliderOutput } from './_sliderFormatPure.js';
export type { SliderDensityLabels } from './_sliderFormatPure.js';
export { collectRandomOptions } from './_collectOptionsPure.js';
export type { RawSliderValues, RawBooleanValues, RawSegmentedValues } from './_collectOptionsPure.js';
