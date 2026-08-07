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

/* ================================================================
   SENSOR MODULE — Entry point for IoT sensor data hydration
   Ponto de entrada para hidratação de dados do sensor IoT

   O sensor é preenchido dinamicamente via getAppData(),
   que executa o pipeline de busca em 3 estágios e transforma
   os dados brutos em um perfil unificado com avaliação de identidade.

   Uso:
     import { getAppData } from './index.js';
     const updatedData = await getAppData(element);

   ================================================================ */

import { fetchSensorData } from './fetcher.js';
import { transformSensorData, evaluateIdentity } from './transformer.js';

// ----------------------------------------------------------------
// PUBLIC API
// Interface pública do módulo sensor
// ----------------------------------------------------------------

/**
 * Get complete sensor application data via external API hydration.
 * Busca e transforma dados do sensor de 3 fontes externas de API.
 *
 * Pipeline:
 *   1. fetchSensorData() → raw { identity, metadata, weather }
 *   2. transformSensorData() → { profile, weather }
 *   3. evaluateIdentity() → { modelId, quantitative, key }
 *
 * @param {{ data?: any }} element - The sensor element
 * @returns {Promise<Record<string, any> & { errors: string[], lastFetch: string, _autoRefreshActive?: boolean }>} Complete sensor data with profile and evaluation
 */
export async function getAppData(element: any) {
    const data = (element.data || {} as any);
    const userId = data.userId || Math.ceil(Math.random() * 10);
    const apiKey = data.connectorKey || '';
    const monitoredParameters = Array.isArray(data.monitoredParameters)
        ? data.monitoredParameters
        : ['temperature', 'pH', 'conductivity', 'water_level'];

    const endpoints = data.endpoints || {};
    const geoCoordinates = data.geoCoordinates || null;
    const previousReadings = data.latestReadings || [];

    // Stage 1-3: fetch raw data from external APIs (including multiparameter readings)
    const rawData = await fetchSensorData({
        userId,
        apiKey,
        monitoredParameters,
        endpoints,
        geoCoordinates,
        previousReadings,
    });

    // Transform: merge identity + metadata, normalize units
    const { profile, weather } = transformSensorData((rawData as any));

    // Evaluate: generate id_modelo + quantitativo + chave triplet
    const evaluation = await evaluateIdentity(profile, weather, userId);

    return ({
        ...element.data,
        profile,
        evaluation,
        weather,
        latestReadings: rawData.readings || [],
        lastFetch: new Date().toISOString(),
        errors: rawData.errors,
    } as Record<string, any> & { errors: string[], lastFetch: string });
}
