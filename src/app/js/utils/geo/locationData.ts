// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LOCATION DATA — Dados administrativos para estrutura organizacional
   
   Dados de países, estados/províncias e municípios para cadastro
   de jurisdição organizacional (não geoespacial).
   
   Escopo: Estrutura organizacional/operacional apenas.
   NÃO inclui: coordenadas, CRS, dados ambientais específicos.
   ================================================================ */

import { COUNTRIES, getCountryByCode, searchCountries } from './countries.js';
import {
    SUBDIVISIONS_BY_COUNTRY,
    getSubdivisionsForCountry,
    hasSubdivisions,
    getDefaultTimezoneForSubdivision,
} from './subdivisions.js';

interface Municipality {
    name: string;
    code: string;
}

interface CountryData {
    default_timezone?: string;
    timezones?: string[];
}

interface LocationLabels {
    [key: string]: {
        section_title: string;
        country: string;
        state: string;
        city: string;
        city_code: string;
        neighborhood: string;
        postal_code: string;
        timezone: string;
        select_country: string;
        select_state: string;
        select_city: string;
        other_city: string;
        search_country: string;
    }
}

// Re-export para compatibilidade
export { COUNTRIES, getCountryByCode, searchCountries };
export { SUBDIVISIONS_BY_COUNTRY, getSubdivisionsForCountry, hasSubdivisions, getDefaultTimezoneForSubdivision };

// Lista de países suportados (mantido para compatibilidade)
export const SUPPORTED_COUNTRIES = COUNTRIES;

// Estados brasileiros - mantido para compatibilidade
export const BR_STATES = SUBDIVISIONS_BY_COUNTRY.BR || [];

// Estados dos EUA - mantido para compatibilidade
export const US_STATES = SUBDIVISIONS_BY_COUNTRY.US || [];

// Municípios principais por estado (top 20 por população)
// Para cidades menores, o usuário pode digitar manualmente
export const BR_MUNICIPALITIES: Record<string, Municipality[]> = {
    SP: [
        { name: 'São Paulo', code: '3550308' },
        { name: 'Guarulhos', code: '3518800' },
        { name: 'Campinas', code: '3509502' },
        { name: 'São Bernardo do Campo', code: '3548708' },
        { name: 'Santo André', code: '3547809' },
        { name: 'Osasco', code: '3534401' },
        { name: 'Sorocaba', code: '3552205' },
        { name: 'Ribeirão Preto', code: '3543402' },
        { name: 'São José dos Campos', code: '3549904' },
        { name: 'Santos', code: '3548500' },
        { name: 'Mauá', code: '3529401' },
        { name: 'Diadema', code: '3513801' },
        { name: 'Jundiaí', code: '3525904' },
        { name: 'Piracicaba', code: '3538709' },
        { name: 'Carapicuíba', code: '3510609' },
        { name: 'Bauru', code: '3506003' },
        { name: 'Itaquaquecetuba', code: '3523107' },
        { name: 'São Vicente', code: '3551009' },
        { name: 'Franca', code: '3516200' },
        { name: 'Praia Grande', code: '3541000' },
    ],
    RJ: [
        { name: 'Rio de Janeiro', code: '3304557' },
        { name: 'São Gonçalo', code: '3304904' },
        { name: 'Duque de Caxias', code: '3301702' },
        { name: 'Nova Iguaçu', code: '3303500' },
        { name: 'Niterói', code: '3303302' },
        { name: 'Belford Roxo', code: '3300456' },
        { name: 'Campos dos Goytacazes', code: '3301008' },
        { name: 'São João de Meriti', code: '3305109' },
        { name: 'Petrópolis', code: '3303906' },
        { name: 'Volta Redonda', code: '3306305' },
    ],
    MG: [
        { name: 'Belo Horizonte', code: '3106200' },
        { name: 'Uberlândia', code: '3170206' },
        { name: 'Contagem', code: '3118601' },
        { name: 'Juiz de Fora', code: '3136702' },
        { name: 'Betim', code: '3106705' },
        { name: 'Montes Claros', code: '3143302' },
        { name: 'Ribeirão das Neves', code: '3154606' },
        { name: 'Uberaba', code: '3170107' },
        { name: 'Governador Valadares', code: '3127701' },
        { name: 'Ipatinga', code: '3131307' },
    ],
    // Outros estados - estrutura similar, populada sob demanda
    // ou via script de build que baixa do IBGE
};

// Funções helpers

/**
 * Get states/provinces for a country
 * @param {string} countryCode - ISO 3166-1 alpha-2
 * @returns {Array<any>} Array of state objects
 */
export function getStatesForCountry(countryCode: string): any[] {
    return getSubdivisionsForCountry(countryCode) || [];
}

/**
 * Check if country has lazy-loadable municipality data
 * @param {string} countryCode
 * @returns {boolean}
 */
export function hasLazyMunicipalityData(countryCode: string): boolean {
    // Países com arquivos JSON em data/municipalities/
    return ['BR', 'US'].includes(countryCode?.toUpperCase() ?? '');
}

/**
 * Get municipalities for a state
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Array<any>} Array of municipality objects
 */
export function getMunicipalitiesForState(countryCode: string, stateCode: string): any[] {
    const muni = BR_MUNICIPALITIES;
    if (countryCode === 'BR' && muni[stateCode]) {
        return muni[stateCode];
    }
    // Para outros países, retorna array vazio (entrada manual)
    return [];
}

/**
 * Get timezone for a state (default)
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {string} IANA timezone
 */
export function getDefaultTimezone(countryCode: string, stateCode: string): string {
    // Tenta timezone da subdivisão primeiro
    if (stateCode) {
        const tz = getDefaultTimezoneForSubdivision(countryCode, stateCode);
        if (tz) return tz;
    }

    // Fallback para timezone do país
    const country = getCountryByCode(countryCode) as CountryData;
    return country?.default_timezone || 'UTC';
}

/**
 * Get all timezones for a country
 * @param {string} countryCode
 * @returns {Array<any>} Array of IANA timezone strings
 */
export function getTimezonesForCountry(countryCode: string): any[] {
    const country = getCountryByCode(countryCode) as CountryData;
    return country?.timezones || ['UTC'];
}

/**
 * Validate postal code format (basic)
 * @param {string} countryCode
 * @param {string} postalCode
 * @returns {boolean}
 */
export function isValidPostalCode(countryCode: string, postalCode: string): boolean {
    if (!postalCode) return true; // Optional

    const patterns: Record<string, RegExp> = {
        BR: /^\d{5}-?\d{3}$/, // 05425-070 ou 05425070
        US: /^\d{5}(-\d{4})?$/, // 90210 ou 90210-1234
        MX: /^\d{5}$/, // 12345
        AR: /^[A-Z]\d{4}[A-Z]{3}$/i, // B1636ARV
        CL: /^\d{7}$/, // 1234567
        CO: /^\d{6}$/, // 110111
        CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, // K1A 0B1
        PT: /^\d{4}-?\d{3}$/, // 1000-001
        ES: /^\d{5}$/, // 28001
    };

    const pattern = patterns[countryCode];
    if (!pattern) return true; // Unknown country, accept anything
    return pattern.test(postalCode);
}

// Default location schema for new nodes
export const DEFAULT_LOCATION = {
    country: 'BR',
    country_name: 'Brasil',
    state: '',
    state_name: '',
    city: '',
    city_code: '',
    neighborhood: '',
    postal_code: '',
    timezone: 'America/Sao_Paulo',
};

// Labels i18n (para uso no UI)
export const LOCATION_LABELS: LocationLabels = {
    pt: {
        section_title: 'Localização Administrativa',
        country: 'País',
        state: 'Estado',
        city: 'Município',
        city_code: 'Código IBGE',
        neighborhood: 'Bairro',
        postal_code: 'CEP',
        timezone: 'Timezone',
        select_country: 'Selecione o país',
        select_state: 'Selecione o estado',
        select_city: 'Selecione o município',
        other_city: 'Outro (digite)',
        search_country: 'Buscar país...',
    },
    en: {
        section_title: 'Administrative Location',
        country: 'Country',
        state: 'State/Province',
        city: 'City/Municipality',
        city_code: 'City Code',
        neighborhood: 'Neighborhood',
        postal_code: 'ZIP/Postal Code',
        timezone: 'Timezone',
        select_country: 'Select country',
        select_state: 'Select state',
        select_city: 'Select city',
        other_city: 'Other (type)',
        search_country: 'Search country...',
    },
    es: {
        section_title: 'Ubicación Administrativa',
        country: 'País',
        state: 'Estado/Provincia',
        city: 'Ciudad/Municipio',
        city_code: 'Código',
        neighborhood: 'Barrio',
        postal_code: 'Código Postal',
        timezone: 'Zona Horaria',
        select_country: 'Seleccione país',
        select_state: 'Seleccione estado',
        select_city: 'Seleccione ciudad',
        other_city: 'Otro (escriba)',
        search_country: 'Buscar país...',
    },
};
