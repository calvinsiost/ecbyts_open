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
   SITE RESEARCH — Public data lookup for conceptual model
   Consulta de dados publicos para modelo conceitual

   Este modulo busca informacoes de APIs publicas gratuitas
   para ajudar a montar o modelo conceitual de uma area.

   FONTES:
   - Nominatim (OpenStreetMap) — Geocodificacao e busca de enderecos
   - IBGE API — Dados de municipio, estado, regiao
   - Overpass API (OpenStreetMap) — Uso do solo, hidrografia, industrias

   FUNCIONALIDADES:
   - Geocodificar enderecos → lat/long
   - Geocodificacao reversa lat/long → endereco
   - Buscar dados do municipio (IBGE)
   - Buscar pontos de interesse no entorno (rios, industrias, etc.)
   ================================================================ */

// ================================================================
// NOMINATIM - OpenStreetMap geocoding
// Geocodificacao e busca de enderecos
// ================================================================

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ecbyts/1.0 (environmental-digital-twin)';

type AnyRecord = Record<string, any>;
interface NearbyNamedFeature {
    name: string;
    type: string;
    lat?: number;
    lon?: number;
}
interface NearbyLandUse {
    type: string;
    name: string;
}
interface NearbyFeatures {
    waterBodies: NearbyNamedFeature[];
    industries: NearbyNamedFeature[];
    sensitiveSites: NearbyNamedFeature[];
    landUse: NearbyLandUse[];
    roads: NearbyNamedFeature[];
}
interface ResearchParams {
    address?: string;
    lat?: number;
    lon?: number;
    radius?: number;
}
interface SiteResearchReport {
    success: boolean;
    query: ResearchParams;
    location: AnyRecord | null;
    address: AnyRecord | null;
    municipio: AnyRecord | null;
    nearbyFeatures: NearbyFeatures | null;
    summary: string;
    timestamp: string;
}

/**
 * Geocode an address to lat/lon coordinates.
 * Converte endereco em coordenadas lat/lon.
 *
 * @param query - Endereco, nome de empresa, local
 * @returns - { lat, lon, displayName, type, address }
 */
export async function geocodeAddress(query: string): Promise<AnyRecord | null> {
    try {
        const url =
            `${NOMINATIM_BASE}/search?` +
            new URLSearchParams({
                q: query,
                format: 'json',
                addressdetails: '1',
                limit: '1',
                countrycodes: 'br',
                'accept-language': 'pt-BR',
            });

        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
        });

        if (!response.ok) throw new Error(`Nominatim: HTTP ${response.status}`);
        const data = (await response.json()) as AnyRecord[];

        if (data.length === 0) return null;

        const result = data[0] as AnyRecord;
        return {
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            displayName: result.display_name,
            type: result.type,
            category: result.category,
            address: result.address || {},
            boundingBox: result.boundingbox,
        };
    } catch (e) {
        console.error('[SiteResearch] Geocode error:', (e as any).message);
        return null;
    }
}

/**
 * Reverse geocode lat/lon to address.
 * Converte coordenadas em endereco.
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns - { displayName, address, ... }
 */
export async function reverseGeocode(lat: number, lon: number): Promise<AnyRecord | null> {
    try {
        const url =
            `${NOMINATIM_BASE}/reverse?` +
            new URLSearchParams({
                lat: String(lat),
                lon: String(lon),
                format: 'json',
                addressdetails: '1',
                'accept-language': 'pt-BR',
            });

        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
        });

        if (!response.ok) throw new Error(`Nominatim reverse: HTTP ${response.status}`);
        const result = (await response.json()) as AnyRecord;

        if (result.error) return null;

        return {
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
            displayName: result.display_name,
            address: result.address || {},
        };
    } catch (e) {
        console.error('[SiteResearch] Reverse geocode error:', (e as any).message);
        return null;
    }
}

// ================================================================
// IBGE API - Dados de municipios brasileiros
// ================================================================

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1';

/**
 * Search IBGE municipality by name.
 * Busca municipio no IBGE pelo nome.
 *
 * @param municipioName - Nome do municipio
 * @param uf - UF (opcional, ex: "SP")
 * @returns
 */
export async function searchMunicipio(municipioName: string, uf = ''): Promise<AnyRecord | null> {
    try {
        // Busca todos os municipios e filtra (IBGE nao tem endpoint de busca por nome)
        const endpoint = uf
            ? `${IBGE_BASE}/localidades/estados/${uf}/municipios`
            : `${IBGE_BASE}/localidades/municipios`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`IBGE: HTTP ${response.status}`);

        const municipios = (await response.json()) as AnyRecord[];
        const normalizedQuery = municipioName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');

        const found = municipios.find((m) => {
            const normalized = m.nome
                .toLowerCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '');
            return normalized === normalizedQuery || normalized.includes(normalizedQuery);
        });

        if (!found) return null;

        return {
            id: found.id,
            nome: found.nome,
            uf: found.microrregiao?.mesorregiao?.UF?.sigla || uf,
            ufNome: found.microrregiao?.mesorregiao?.UF?.nome || '',
            regiao: found.microrregiao?.mesorregiao?.UF?.regiao?.nome || '',
            microrregiao: found.microrregiao?.nome || '',
            mesorregiao: found.microrregiao?.mesorregiao?.nome || '',
        };
    } catch (e) {
        console.error('[SiteResearch] IBGE error:', (e as any).message);
        return null;
    }
}

// ================================================================
// OVERPASS API - OpenStreetMap features nearby
// Busca de feicoes proximas via OpenStreetMap
// ================================================================

const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';

/**
 * Query nearby features using Overpass API.
 * Busca feicoes no entorno de um ponto usando Overpass.
 *
 * @param lat - Latitude central
 * @param lon - Longitude central
 * @param radiusMeters - Raio de busca em metros (default 1000)
 * @returns - { waterBodies, industries, schools, hospitals, protectedAreas }
 */
export async function queryNearbyFeatures(lat: number, lon: number, radiusMeters = 1000): Promise<NearbyFeatures> {
    const results: NearbyFeatures = {
        waterBodies: [],
        industries: [],
        sensitiveSites: [],
        landUse: [],
        roads: [],
    };

    try {
        // Query Overpass para multiplos tipos de feicoes
        const query = `
[out:json][timeout:15];
(
  // Corpos d'agua (rios, lagos, nascentes)
  way["natural"="water"](around:${radiusMeters},${lat},${lon});
  way["waterway"](around:${radiusMeters},${lat},${lon});
  node["natural"="spring"](around:${radiusMeters},${lat},${lon});

  // Industrias e postos de combustivel
  node["industrial"](around:${radiusMeters},${lat},${lon});
  way["industrial"](around:${radiusMeters},${lat},${lon});
  node["amenity"="fuel"](around:${radiusMeters},${lat},${lon});

  // Areas sensiveis (escolas, hospitais, creches)
  node["amenity"~"school|hospital|clinic|kindergarten"](around:${radiusMeters},${lat},${lon});
  way["amenity"~"school|hospital|clinic|kindergarten"](around:${radiusMeters},${lat},${lon});

  // Uso do solo
  way["landuse"](around:${radiusMeters},${lat},${lon});

  // Areas protegidas
  way["leisure"="nature_reserve"](around:${radiusMeters},${lat},${lon});
  way["boundary"="protected_area"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;

        const response = await fetch(OVERPASS_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query),
        });

        if (!response.ok) throw new Error(`Overpass: HTTP ${response.status}`);
        const data = (await response.json()) as { elements?: AnyRecord[] };

        // Classifica os resultados
        for (const el of data.elements || []) {
            const tags = el.tags || {};
            const name = tags.name || tags['name:pt'] || '';
            const elLat = el.lat || el.center?.lat;
            const elLon = el.lon || el.center?.lon;

            // Corpos d'agua
            if (tags.natural === 'water' || tags.waterway || tags.natural === 'spring') {
                results.waterBodies.push({
                    name: name || tags.waterway || "Corpo d'água",
                    type: tags.waterway || tags.natural || 'water',
                    lat: elLat,
                    lon: elLon,
                });
            }

            // Industrias e postos
            if (tags.industrial || tags.amenity === 'fuel') {
                results.industries.push({
                    name: name || tags.industrial || 'Posto de combustível',
                    type: tags.industrial || tags.amenity,
                    lat: elLat,
                    lon: elLon,
                });
            }

            // Areas sensiveis
            if (['school', 'hospital', 'clinic', 'kindergarten'].includes(tags.amenity)) {
                results.sensitiveSites.push({
                    name: name || tags.amenity,
                    type: tags.amenity,
                    lat: elLat,
                    lon: elLon,
                });
            }

            // Uso do solo
            if (tags.landuse) {
                results.landUse.push({
                    type: tags.landuse,
                    name: name || tags.landuse,
                });
            }

            // Areas protegidas
            if (tags.leisure === 'nature_reserve' || tags.boundary === 'protected_area') {
                results.sensitiveSites.push({
                    name: name || 'Área protegida',
                    type: 'protected_area',
                    lat: elLat,
                    lon: elLon,
                });
            }
        }
    } catch (e) {
        console.error('[SiteResearch] Overpass error:', (e as any).message);
    }

    return results;
}

// ================================================================
// HELPERS
// ================================================================

/** Mapa de nomes de estados brasileiros para siglas UF (IBGE). */
const UF_MAP: Record<string, string> = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    para: 'PA',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
};

/**
 * Extrai sigla UF de 2 letras do endereco Nominatim.
 * Tenta ISO3166-2-lvl4 (ex: "BR-SP"), depois converte nome do estado.
 *
 * @param address - Objeto address do Nominatim
 * @returns - Sigla UF (ex: "SP") ou '' se nao encontrada
 */
function extractUF(address: AnyRecord | null | undefined): string {
    if (!address) return '';

    // Tenta ISO code (Nominatim pode retornar "BR-SP")
    const iso = address['ISO3166-2-lvl4'] || '';
    if (iso.length >= 4 && iso.startsWith('BR-')) {
        return iso.slice(3, 5);
    }

    // Ja e sigla de 2 letras?
    const state = (address.state || '').trim();
    if (/^[A-Z]{2}$/.test(state)) return state;

    // Converte nome completo para sigla
    const normalized = state
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    return UF_MAP[normalized] || '';
}

// ================================================================
// MAIN RESEARCH FUNCTION
// Funcao principal que agrega todas as fontes
// ================================================================

/**
 * Research a site by address or coordinates for conceptual model.
 * Pesquisa completa de uma area para modelo conceitual.
 *
 * @param params - { address, lat, lon, radius }
 * @returns - Relatório completo da pesquisa
 */
/**
 * @param params
 * @returns
 */
export async function researchSite(params: ResearchParams = {}): Promise<SiteResearchReport> {
    const report: SiteResearchReport = {
        success: false,
        query: params,
        location: null,
        address: null,
        municipio: null,
        nearbyFeatures: null,
        summary: '',
        timestamp: new Date().toISOString(),
    };

    try {
        let lat = params.lat;
        let lon = params.lon;

        // STEP 1: Geocodificar se necessario
        if (params.address && (!lat || !lon)) {
            const geo = await geocodeAddress(params.address);
            if (!geo) {
                report.summary = `Não foi possível localizar: "${params.address}". Tente um endereço mais específico.`;
                return report;
            }
            lat = geo.lat;
            lon = geo.lon;
            report.location = geo;
            report.address = geo.address;
        } else if (lat && lon) {
            // Geocodificacao reversa
            const rev = await reverseGeocode(lat, lon);
            if (rev) {
                report.location = rev;
                report.address = rev.address;
            }
        }

        if (!lat || !lon) {
            report.summary = 'Informe um endereço ou coordenadas (lat/lon) para pesquisar.';
            return report;
        }

        // STEP 2: Buscar dados do municipio no IBGE
        // Passa UF quando disponivel para filtrar por estado (evita buscar todos os ~5570 municipios)
        const cidade = report.address?.city || report.address?.town || report.address?.municipality || '';
        const ufCode = extractUF(report.address);
        if (cidade) {
            report.municipio = await searchMunicipio(cidade, ufCode);
        }

        // STEP 3: Buscar feicoes no entorno via Overpass
        const radius = params.radius || 1000;
        report.nearbyFeatures = await queryNearbyFeatures(lat, lon, radius);

        // STEP 4: Gerar resumo
        report.success = true;
        report.summary = buildSummary(report, radius);
    } catch (e) {
        console.error('[SiteResearch] Research error:', (e as any).message);
        report.summary = `Erro na pesquisa: ${(e as any).message}`;
    }

    return report;
}

/**
 * Build human-readable summary from research data.
 * Constroi resumo legivel dos dados da pesquisa.
 *
 * @param report - Research report
 * @param radius - Search radius in meters
 * @returns
 */
function buildSummary(report: SiteResearchReport, radius: number): string {
    const lines: string[] = [];
    const loc = report.location;
    const _addr = report.address || {};
    const mun = report.municipio;
    const feat = report.nearbyFeatures;

    lines.push('📍 PESQUISA DE ÁREA — MODELO CONCEITUAL\n');

    // Localizacao
    if (loc) {
        lines.push(`📌 Coordenadas: ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`);
        lines.push(`📫 Endereço: ${loc.displayName || 'N/A'}`);
    }

    // Dados IBGE
    if (mun) {
        lines.push(`🏛️ Município: ${mun.nome} — ${mun.uf}`);
        lines.push(`   Região: ${mun.regiao} | Mesorregião: ${mun.mesorregiao}`);
        lines.push(`   Código IBGE: ${mun.id}`);
    }

    // Entorno
    if (feat) {
        lines.push(`\n🔍 ENTORNO (raio de ${radius}m):\n`);

        // Corpos d'agua
        if (feat.waterBodies.length > 0) {
            lines.push(`💧 Corpos d'água (${feat.waterBodies.length}):`);
            feat.waterBodies.slice(0, 5).forEach((w) => {
                lines.push(`   • ${w.name} (${w.type})`);
            });
        } else {
            lines.push("💧 Nenhum corpo d'água identificado no raio.");
        }

        // Industrias
        if (feat.industries.length > 0) {
            lines.push(`🏭 Indústrias/Postos (${feat.industries.length}):`);
            feat.industries.slice(0, 5).forEach((i) => {
                lines.push(`   • ${i.name} (${i.type})`);
            });
        }

        // Areas sensiveis
        if (feat.sensitiveSites.length > 0) {
            lines.push(`⚠️ Áreas sensíveis (${feat.sensitiveSites.length}):`);
            feat.sensitiveSites.slice(0, 5).forEach((s) => {
                lines.push(`   • ${s.name} (${s.type})`);
            });
        }

        // Uso do solo
        if (feat.landUse.length > 0) {
            const types = [...new Set(feat.landUse.map((l) => l.type))];
            lines.push(`🗺️ Uso do solo: ${types.join(', ')}`);
        }
    }

    return lines.join('\n');
}
