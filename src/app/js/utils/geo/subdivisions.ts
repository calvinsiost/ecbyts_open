// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SUBDIVISIONS — Estados, Províncias e Regiões

   Subdivisões administrativas para países selecionados.
   ISO 3166-2 onde disponível.
   ================================================================ */

interface Subdivision {
    code: string;
    name: string;
    name_pt?: string;
    ibge_code?: string;
    timezone: string;
}

// Argentina (24 províncias + 1 Cidade Autônoma)
export const AR_SUBDIVISIONS: Subdivision[] = [
    { code: 'B', name: 'Buenos Aires', name_pt: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires' },
    {
        code: 'C',
        name: 'Ciudad Autónoma de Buenos Aires',
        name_pt: 'Cidade Autônoma de Buenos Aires',
        timezone: 'America/Argentina/Buenos_Aires',
    },
    { code: 'K', name: 'Catamarca', name_pt: 'Catamarca', timezone: 'America/Argentina/Catamarca' },
    { code: 'H', name: 'Chaco', name_pt: 'Chaco', timezone: 'America/Argentina/Cordoba' },
    { code: 'U', name: 'Chubut', name_pt: 'Chubut', timezone: 'America/Argentina/Catamarca' },
    { code: 'W', name: 'Corrientes', name_pt: 'Corrientes', timezone: 'America/Argentina/Cordoba' },
    { code: 'X', name: 'Córdoba', name_pt: 'Córdoba', timezone: 'America/Argentina/Cordoba' },
    { code: 'E', name: 'Entre Ríos', name_pt: 'Entre Ríos', timezone: 'America/Argentina/Cordoba' },
    { code: 'P', name: 'Formosa', name_pt: 'Formosa', timezone: 'America/Argentina/Cordoba' },
    { code: 'Y', name: 'Jujuy', name_pt: 'Jujuy', timezone: 'America/Argentina/Jujuy' },
    { code: 'L', name: 'La Pampa', name_pt: 'La Pampa', timezone: 'America/Argentina/Salta' },
    { code: 'F', name: 'La Rioja', name_pt: 'La Rioja', timezone: 'America/Argentina/La_Rioja' },
    { code: 'M', name: 'Mendoza', name_pt: 'Mendoza', timezone: 'America/Argentina/Mendoza' },
    { code: 'N', name: 'Misiones', name_pt: 'Missões', timezone: 'America/Argentina/Cordoba' },
    { code: 'Q', name: 'Neuquén', name_pt: 'Neuquén', timezone: 'America/Argentina/Salta' },
    { code: 'R', name: 'Río Negro', name_pt: 'Río Negro', timezone: 'America/Argentina/Salta' },
    { code: 'A', name: 'Salta', name_pt: 'Salta', timezone: 'America/Argentina/Salta' },
    { code: 'J', name: 'San Juan', name_pt: 'San Juan', timezone: 'America/Argentina/San_Juan' },
    { code: 'D', name: 'San Luis', name_pt: 'San Luis', timezone: 'America/Argentina/San_Luis' },
    { code: 'Z', name: 'Santa Cruz', name_pt: 'Santa Cruz', timezone: 'America/Argentina/Rio_Gallegos' },
    { code: 'S', name: 'Santa Fe', name_pt: 'Santa Fé', timezone: 'America/Argentina/Cordoba' },
    { code: 'G', name: 'Santiago del Estero', name_pt: 'Santiago del Estero', timezone: 'America/Argentina/Cordoba' },
    { code: 'V', name: 'Tierra del Fuego', name_pt: 'Terra do Fogo', timezone: 'America/Argentina/Ushuaia' },
    { code: 'T', name: 'Tucumán', name_pt: 'Tucumán', timezone: 'America/Argentina/Tucuman' },
];

// Brasil (27 unidades federativas)
export const BR_SUBDIVISIONS: Subdivision[] = [
    { code: 'AC', name: 'Acre', ibge_code: '12', timezone: 'America/Rio_Branco' },
    { code: 'AL', name: 'Alagoas', ibge_code: '27', timezone: 'America/Maceio' },
    { code: 'AP', name: 'Amapá', ibge_code: '16', timezone: 'America/Belem' },
    { code: 'AM', name: 'Amazonas', ibge_code: '13', timezone: 'America/Manaus' },
    { code: 'BA', name: 'Bahia', ibge_code: '29', timezone: 'America/Bahia' },
    { code: 'CE', name: 'Ceará', ibge_code: '23', timezone: 'America/Fortaleza' },
    { code: 'DF', name: 'Distrito Federal', ibge_code: '53', timezone: 'America/Sao_Paulo' },
    { code: 'ES', name: 'Espírito Santo', ibge_code: '32', timezone: 'America/Sao_Paulo' },
    { code: 'GO', name: 'Goiás', ibge_code: '52', timezone: 'America/Sao_Paulo' },
    { code: 'MA', name: 'Maranhão', ibge_code: '21', timezone: 'America/Fortaleza' },
    { code: 'MT', name: 'Mato Grosso', ibge_code: '51', timezone: 'America/Cuiaba' },
    { code: 'MS', name: 'Mato Grosso do Sul', ibge_code: '50', timezone: 'America/Campo_Grande' },
    { code: 'MG', name: 'Minas Gerais', ibge_code: '31', timezone: 'America/Sao_Paulo' },
    { code: 'PA', name: 'Pará', ibge_code: '15', timezone: 'America/Belem' },
    { code: 'PB', name: 'Paraíba', ibge_code: '25', timezone: 'America/Fortaleza' },
    { code: 'PR', name: 'Paraná', ibge_code: '41', timezone: 'America/Sao_Paulo' },
    { code: 'PE', name: 'Pernambuco', ibge_code: '26', timezone: 'America/Recife' },
    { code: 'PI', name: 'Piauí', ibge_code: '22', timezone: 'America/Fortaleza' },
    { code: 'RJ', name: 'Rio de Janeiro', ibge_code: '33', timezone: 'America/Sao_Paulo' },
    { code: 'RN', name: 'Rio Grande do Norte', ibge_code: '24', timezone: 'America/Fortaleza' },
    { code: 'RS', name: 'Rio Grande do Sul', ibge_code: '43', timezone: 'America/Sao_Paulo' },
    { code: 'RO', name: 'Rondônia', ibge_code: '11', timezone: 'America/Porto_Velho' },
    { code: 'RR', name: 'Roraima', ibge_code: '14', timezone: 'America/Boa_Vista' },
    { code: 'SC', name: 'Santa Catarina', ibge_code: '42', timezone: 'America/Sao_Paulo' },
    { code: 'SP', name: 'São Paulo', ibge_code: '35', timezone: 'America/Sao_Paulo' },
    { code: 'SE', name: 'Sergipe', ibge_code: '28', timezone: 'America/Maceio' },
    { code: 'TO', name: 'Tocantins', ibge_code: '17', timezone: 'America/Araguaia' },
];

// Chile (16 regiões)
export const CL_SUBDIVISIONS: Subdivision[] = [
    { code: 'AI', name: 'Aisén del General Carlos Ibáñez del Campo', name_pt: 'Aysén', timezone: 'America/Santiago' },
    { code: 'AN', name: 'Antofagasta', name_pt: 'Antofagasta', timezone: 'America/Santiago' },
    { code: 'AP', name: 'Arica y Parinacota', name_pt: 'Arica e Parinacota', timezone: 'America/Santiago' },
    { code: 'AT', name: 'Atacama', name_pt: 'Atacama', timezone: 'America/Santiago' },
    { code: 'BI', name: 'Biobío', name_pt: 'Biobío', timezone: 'America/Santiago' },
    { code: 'CO', name: 'Coquimbo', name_pt: 'Coquimbo', timezone: 'America/Santiago' },
    { code: 'AR', name: 'La Araucanía', name_pt: 'Araucanía', timezone: 'America/Santiago' },
    { code: 'LI', name: "Libertador General Bernardo O'Higgins", name_pt: "O'Higgins", timezone: 'America/Santiago' },
    { code: 'LL', name: 'Los Lagos', name_pt: 'Los Lagos', timezone: 'America/Santiago' },
    { code: 'LR', name: 'Los Ríos', name_pt: 'Los Ríos', timezone: 'America/Santiago' },
    {
        code: 'MA',
        name: 'Magallanes y de la Antártica Chilena',
        name_pt: 'Magalhães',
        timezone: 'America/Punta_Arenas',
    },
    { code: 'ML', name: 'Maule', name_pt: 'Maule', timezone: 'America/Santiago' },
    { code: 'NB', name: 'Ñuble', name_pt: 'Ñuble', timezone: 'America/Santiago' },
    { code: 'RM', name: 'Región Metropolitana de Santiago', name_pt: 'Santiago', timezone: 'America/Santiago' },
    { code: 'TA', name: 'Tarapacá', name_pt: 'Tarapacá', timezone: 'America/Santiago' },
    { code: 'VS', name: 'Valparaíso', name_pt: 'Valparaíso', timezone: 'America/Santiago' },
];

// Colômbia (32 departamentos + 1 capital)
export const CO_SUBDIVISIONS: Subdivision[] = [
    { code: 'AMA', name: 'Amazonas', name_pt: 'Amazonas', timezone: 'America/Bogota' },
    { code: 'ANT', name: 'Antioquia', name_pt: 'Antioquia', timezone: 'America/Bogota' },
    { code: 'ARA', name: 'Arauca', name_pt: 'Arauca', timezone: 'America/Bogota' },
    { code: 'ATL', name: 'Atlántico', name_pt: 'Atlântico', timezone: 'America/Bogota' },
    { code: 'BOL', name: 'Bolívar', name_pt: 'Bolívar', timezone: 'America/Bogota' },
    { code: 'BOY', name: 'Boyacá', name_pt: 'Boyacá', timezone: 'America/Bogota' },
    { code: 'CAL', name: 'Caldas', name_pt: 'Caldas', timezone: 'America/Bogota' },
    { code: 'CAQ', name: 'Caquetá', name_pt: 'Caquetá', timezone: 'America/Bogota' },
    { code: 'CAS', name: 'Casanare', name_pt: 'Casanare', timezone: 'America/Bogota' },
    { code: 'CAU', name: 'Cauca', name_pt: 'Cauca', timezone: 'America/Bogota' },
    { code: 'CES', name: 'Cesar', name_pt: 'Cesar', timezone: 'America/Bogota' },
    { code: 'CHO', name: 'Chocó', name_pt: 'Chocó', timezone: 'America/Bogota' },
    { code: 'CUN', name: 'Cundinamarca', name_pt: 'Cundinamarca', timezone: 'America/Bogota' },
    { code: 'COR', name: 'Córdoba', name_pt: 'Córdoba', timezone: 'America/Bogota' },
    { code: 'DC', name: 'Bogotá D.C.', name_pt: 'Bogotá', timezone: 'America/Bogota' },
    { code: 'GUA', name: 'Guainía', name_pt: 'Guainía', timezone: 'America/Bogota' },
    { code: 'GUV', name: 'Guaviare', name_pt: 'Guaviare', timezone: 'America/Bogota' },
    { code: 'HUI', name: 'Huila', name_pt: 'Huila', timezone: 'America/Bogota' },
    { code: 'LAG', name: 'La Guajira', name_pt: 'La Guajira', timezone: 'America/Bogota' },
    { code: 'MAG', name: 'Magdalena', name_pt: 'Magdalena', timezone: 'America/Bogota' },
    { code: 'MET', name: 'Meta', name_pt: 'Meta', timezone: 'America/Bogota' },
    { code: 'NAR', name: 'Nariño', name_pt: 'Nariño', timezone: 'America/Bogota' },
    { code: 'NSA', name: 'Norte de Santander', name_pt: 'Norte de Santander', timezone: 'America/Bogota' },
    { code: 'PUT', name: 'Putumayo', name_pt: 'Putumayo', timezone: 'America/Bogota' },
    { code: 'QUI', name: 'Quindío', name_pt: 'Quindío', timezone: 'America/Bogota' },
    { code: 'RIS', name: 'Risaralda', name_pt: 'Risaralda', timezone: 'America/Bogota' },
    { code: 'SAN', name: 'Santander', name_pt: 'Santander', timezone: 'America/Bogota' },
    { code: 'SAP', name: 'San Andrés y Providencia', name_pt: 'San Andrés e Providência', timezone: 'America/Bogota' },
    { code: 'SUC', name: 'Sucre', name_pt: 'Sucre', timezone: 'America/Bogota' },
    { code: 'TOL', name: 'Tolima', name_pt: 'Tolima', timezone: 'America/Bogota' },
    { code: 'VAC', name: 'Valle del Cauca', name_pt: 'Valle del Cauca', timezone: 'America/Bogota' },
    { code: 'VAU', name: 'Vaupés', name_pt: 'Vaupés', timezone: 'America/Bogota' },
    { code: 'VID', name: 'Vichada', name_pt: 'Vichada', timezone: 'America/Bogota' },
];

// México (32 estados)
export const MX_SUBDIVISIONS: Subdivision[] = [
    { code: 'AGU', name: 'Aguascalientes', name_pt: 'Aguascalientes', timezone: 'America/Mexico_City' },
    { code: 'BCN', name: 'Baja California', name_pt: 'Baixa Califórnia', timezone: 'America/Tijuana' },
    { code: 'BCS', name: 'Baja California Sur', name_pt: 'Baixa Califórnia do Sul', timezone: 'America/Mazatlan' },
    { code: 'CAM', name: 'Campeche', name_pt: 'Campeche', timezone: 'America/Merida' },
    { code: 'COA', name: 'Coahuila', name_pt: 'Coahuila', timezone: 'America/Monterrey' },
    { code: 'COL', name: 'Colima', name_pt: 'Colima', timezone: 'America/Mexico_City' },
    { code: 'CHP', name: 'Chiapas', name_pt: 'Chiapas', timezone: 'America/Mexico_City' },
    { code: 'CHH', name: 'Chihuahua', name_pt: 'Chihuahua', timezone: 'America/Chihuahua' },
    { code: 'CMX', name: 'Ciudad de México', name_pt: 'Cidade do México', timezone: 'America/Mexico_City' },
    { code: 'DUR', name: 'Durango', name_pt: 'Durango', timezone: 'America/Monterrey' },
    { code: 'GUA', name: 'Guanajuato', name_pt: 'Guanajuato', timezone: 'America/Mexico_City' },
    { code: 'GRO', name: 'Guerrero', name_pt: 'Guerrero', timezone: 'America/Mexico_City' },
    { code: 'HID', name: 'Hidalgo', name_pt: 'Hidalgo', timezone: 'America/Mexico_City' },
    { code: 'JAL', name: 'Jalisco', name_pt: 'Jalisco', timezone: 'America/Mexico_City' },
    { code: 'MEX', name: 'México', name_pt: 'Estado do México', timezone: 'America/Mexico_City' },
    { code: 'MIC', name: 'Michoacán', name_pt: 'Michoacán', timezone: 'America/Mexico_City' },
    { code: 'MOR', name: 'Morelos', name_pt: 'Morelos', timezone: 'America/Mexico_City' },
    { code: 'NAY', name: 'Nayarit', name_pt: 'Nayarit', timezone: 'America/Mazatlan' },
    { code: 'NLE', name: 'Nuevo León', name_pt: 'Nuevo León', timezone: 'America/Monterrey' },
    { code: 'OAX', name: 'Oaxaca', name_pt: 'Oaxaca', timezone: 'America/Mexico_City' },
    { code: 'PUE', name: 'Puebla', name_pt: 'Puebla', timezone: 'America/Mexico_City' },
    { code: 'QUE', name: 'Querétaro', name_pt: 'Querétaro', timezone: 'America/Mexico_City' },
    { code: 'ROO', name: 'Quintana Roo', name_pt: 'Quintana Roo', timezone: 'America/Cancun' },
    { code: 'SLP', name: 'San Luis Potosí', name_pt: 'San Luis Potosí', timezone: 'America/Mexico_City' },
    { code: 'SIN', name: 'Sinaloa', name_pt: 'Sinaloa', timezone: 'America/Mazatlan' },
    { code: 'SON', name: 'Sonora', name_pt: 'Sonora', timezone: 'America/Hermosillo' },
    { code: 'TAB', name: 'Tabasco', name_pt: 'Tabasco', timezone: 'America/Mexico_City' },
    { code: 'TAM', name: 'Tamaulipas', name_pt: 'Tamaulipas', timezone: 'America/Monterrey' },
    { code: 'TLA', name: 'Tlaxcala', name_pt: 'Tlaxcala', timezone: 'America/Mexico_City' },
    { code: 'VER', name: 'Veracruz', name_pt: 'Veracruz', timezone: 'America/Mexico_City' },
    { code: 'YUC', name: 'Yucatán', name_pt: 'Yucatán', timezone: 'America/Merida' },
    { code: 'ZAC', name: 'Zacatecas', name_pt: 'Zacatecas', timezone: 'America/Mexico_City' },
];

// Estados Unidos (50 estados + DC)
export const US_SUBDIVISIONS: Subdivision[] = [
    { code: 'AL', name: 'Alabama', timezone: 'America/Chicago' },
    { code: 'AK', name: 'Alaska', timezone: 'America/Anchorage' },
    { code: 'AZ', name: 'Arizona', timezone: 'America/Phoenix' },
    { code: 'AR', name: 'Arkansas', timezone: 'America/Chicago' },
    { code: 'CA', name: 'California', timezone: 'America/Los_Angeles' },
    { code: 'CO', name: 'Colorado', timezone: 'America/Denver' },
    { code: 'CT', name: 'Connecticut', timezone: 'America/New_York' },
    { code: 'DE', name: 'Delaware', timezone: 'America/New_York' },
    { code: 'DC', name: 'District of Columbia', name_pt: 'Distrito de Colúmbia', timezone: 'America/New_York' },
    { code: 'FL', name: 'Florida', timezone: 'America/New_York' },
    { code: 'GA', name: 'Georgia', timezone: 'America/New_York' },
    { code: 'HI', name: 'Hawaii', timezone: 'Pacific/Honolulu' },
    { code: 'ID', name: 'Idaho', timezone: 'America/Boise' },
    { code: 'IL', name: 'Illinois', timezone: 'America/Chicago' },
    { code: 'IN', name: 'Indiana', timezone: 'America/Indianapolis' },
    { code: 'IA', name: 'Iowa', timezone: 'America/Chicago' },
    { code: 'KS', name: 'Kansas', timezone: 'America/Chicago' },
    { code: 'KY', name: 'Kentucky', timezone: 'America/New_York' },
    { code: 'LA', name: 'Louisiana', timezone: 'America/Chicago' },
    { code: 'ME', name: 'Maine', timezone: 'America/New_York' },
    { code: 'MD', name: 'Maryland', timezone: 'America/New_York' },
    { code: 'MA', name: 'Massachusetts', timezone: 'America/New_York' },
    { code: 'MI', name: 'Michigan', timezone: 'America/Detroit' },
    { code: 'MN', name: 'Minnesota', timezone: 'America/Chicago' },
    { code: 'MS', name: 'Mississippi', timezone: 'America/Chicago' },
    { code: 'MO', name: 'Missouri', timezone: 'America/Chicago' },
    { code: 'MT', name: 'Montana', timezone: 'America/Denver' },
    { code: 'NE', name: 'Nebraska', timezone: 'America/Chicago' },
    { code: 'NV', name: 'Nevada', timezone: 'America/Los_Angeles' },
    { code: 'NH', name: 'New Hampshire', timezone: 'America/New_York' },
    { code: 'NJ', name: 'New Jersey', timezone: 'America/New_York' },
    { code: 'NM', name: 'New Mexico', timezone: 'America/Denver' },
    { code: 'NY', name: 'New York', timezone: 'America/New_York' },
    { code: 'NC', name: 'North Carolina', timezone: 'America/New_York' },
    { code: 'ND', name: 'North Dakota', timezone: 'America/Chicago' },
    { code: 'OH', name: 'Ohio', timezone: 'America/New_York' },
    { code: 'OK', name: 'Oklahoma', timezone: 'America/Chicago' },
    { code: 'OR', name: 'Oregon', timezone: 'America/Los_Angeles' },
    { code: 'PA', name: 'Pennsylvania', timezone: 'America/New_York' },
    { code: 'RI', name: 'Rhode Island', timezone: 'America/New_York' },
    { code: 'SC', name: 'South Carolina', timezone: 'America/New_York' },
    { code: 'SD', name: 'South Dakota', timezone: 'America/Chicago' },
    { code: 'TN', name: 'Tennessee', timezone: 'America/Chicago' },
    { code: 'TX', name: 'Texas', timezone: 'America/Chicago' },
    { code: 'UT', name: 'Utah', timezone: 'America/Denver' },
    { code: 'VT', name: 'Vermont', timezone: 'America/New_York' },
    { code: 'VA', name: 'Virginia', timezone: 'America/New_York' },
    { code: 'WA', name: 'Washington', timezone: 'America/Los_Angeles' },
    { code: 'WV', name: 'West Virginia', timezone: 'America/New_York' },
    { code: 'WI', name: 'Wisconsin', timezone: 'America/Chicago' },
    { code: 'WY', name: 'Wyoming', timezone: 'America/Denver' },
];

// Canadá (13 províncias/territórios)
export const CA_SUBDIVISIONS: Subdivision[] = [
    { code: 'AB', name: 'Alberta', timezone: 'America/Edmonton' },
    { code: 'BC', name: 'British Columbia', name_pt: 'Colúmbia Britânica', timezone: 'America/Vancouver' },
    { code: 'MB', name: 'Manitoba', timezone: 'America/Winnipeg' },
    { code: 'NB', name: 'New Brunswick', timezone: 'America/Moncton' },
    { code: 'NL', name: 'Newfoundland and Labrador', timezone: 'America/St_Johns' },
    { code: 'NS', name: 'Nova Scotia', name_pt: 'Nova Escócia', timezone: 'America/Halifax' },
    { code: 'NT', name: 'Northwest Territories', timezone: 'America/Yellowknife' },
    { code: 'NU', name: 'Nunavut', timezone: 'America/Iqaluit' },
    { code: 'ON', name: 'Ontario', timezone: 'America/Toronto' },
    { code: 'PE', name: 'Prince Edward Island', timezone: 'America/Halifax' },
    { code: 'QC', name: 'Quebec', name_pt: 'Quebec', timezone: 'America/Toronto' },
    { code: 'SK', name: 'Saskatchewan', timezone: 'America/Regina' },
    { code: 'YT', name: 'Yukon', timezone: 'America/Whitehorse' },
];

// Portugal (20 distritos + 2 regiões autónomas)
export const PT_SUBDIVISIONS: Subdivision[] = [
    { code: '01', name: 'Aveiro', timezone: 'Europe/Lisbon' },
    { code: '02', name: 'Beja', timezone: 'Europe/Lisbon' },
    { code: '03', name: 'Braga', timezone: 'Europe/Lisbon' },
    { code: '04', name: 'Bragança', timezone: 'Europe/Lisbon' },
    { code: '05', name: 'Castelo Branco', timezone: 'Europe/Lisbon' },
    { code: '06', name: 'Coimbra', timezone: 'Europe/Lisbon' },
    { code: '07', name: 'Évora', timezone: 'Europe/Lisbon' },
    { code: '08', name: 'Faro', timezone: 'Europe/Lisbon' },
    { code: '09', name: 'Guarda', timezone: 'Europe/Lisbon' },
    { code: '10', name: 'Leiria', timezone: 'Europe/Lisbon' },
    { code: '11', name: 'Lisboa', timezone: 'Europe/Lisbon' },
    { code: '12', name: 'Portalegre', timezone: 'Europe/Lisbon' },
    { code: '13', name: 'Porto', timezone: 'Europe/Lisbon' },
    { code: '14', name: 'Santarém', timezone: 'Europe/Lisbon' },
    { code: '15', name: 'Setúbal', timezone: 'Europe/Lisbon' },
    { code: '16', name: 'Viana do Castelo', timezone: 'Europe/Lisbon' },
    { code: '17', name: 'Vila Real', timezone: 'Europe/Lisbon' },
    { code: '18', name: 'Viseu', timezone: 'Europe/Lisbon' },
    { code: '20', name: 'Açores', timezone: 'Atlantic/Azores' },
    { code: '30', name: 'Madeira', timezone: 'Atlantic/Madeira' },
];

// Espanha (17 comunidades autônomas + 2 cidades autônomas)
export const ES_SUBDIVISIONS: Subdivision[] = [
    { code: 'AN', name: 'Andalucía', name_pt: 'Andaluzia', timezone: 'Europe/Madrid' },
    { code: 'AR', name: 'Aragón', name_pt: 'Aragão', timezone: 'Europe/Madrid' },
    { code: 'AS', name: 'Asturias', name_pt: 'Astúrias', timezone: 'Europe/Madrid' },
    { code: 'IB', name: 'Islas Baleares', name_pt: 'Baleares', timezone: 'Europe/Madrid' },
    { code: 'PV', name: 'País Vasco', name_pt: 'País Basco', timezone: 'Europe/Madrid' },
    { code: 'CN', name: 'Canarias', name_pt: 'Canárias', timezone: 'Atlantic/Canary' },
    { code: 'CB', name: 'Cantabria', timezone: 'Europe/Madrid' },
    { code: 'CL', name: 'Castilla y León', name_pt: 'Castela e Leão', timezone: 'Europe/Madrid' },
    { code: 'CM', name: 'Castilla-La Mancha', timezone: 'Europe/Madrid' },
    { code: 'CT', name: 'Cataluña', name_pt: 'Catalunha', timezone: 'Europe/Madrid' },
    { code: 'CE', name: 'Ceuta', timezone: 'Africa/Ceuta' },
    { code: 'EX', name: 'Extremadura', timezone: 'Europe/Madrid' },
    { code: 'GA', name: 'Galicia', name_pt: 'Galícia', timezone: 'Europe/Madrid' },
    { code: 'MD', name: 'Madrid', timezone: 'Europe/Madrid' },
    { code: 'ML', name: 'Melilla', timezone: 'Africa/Ceuta' },
    { code: 'MC', name: 'Murcia', timezone: 'Europe/Madrid' },
    { code: 'NC', name: 'Navarra', timezone: 'Europe/Madrid' },
    { code: 'RI', name: 'La Rioja', name_pt: 'La Rioja', timezone: 'Europe/Madrid' },
    { code: 'VC', name: 'Comunidad Valenciana', name_pt: 'Comunidade Valenciana', timezone: 'Europe/Madrid' },
];

// Mapa de subdivisões por país
export const SUBDIVISIONS_BY_COUNTRY = {
    AR: AR_SUBDIVISIONS,
    BR: BR_SUBDIVISIONS,
    CL: CL_SUBDIVISIONS,
    CO: CO_SUBDIVISIONS,
    MX: MX_SUBDIVISIONS,
    US: US_SUBDIVISIONS,
    CA: CA_SUBDIVISIONS,
    PT: PT_SUBDIVISIONS,
    ES: ES_SUBDIVISIONS,
};

// Helper functions
export function getSubdivisionsForCountry(countryCode: any) {
    return (SUBDIVISIONS_BY_COUNTRY as Record<string, any>)[countryCode] || null;
}

export function hasSubdivisions(countryCode: any) {
    return countryCode in SUBDIVISIONS_BY_COUNTRY;
}

export function getSubdivisionByCode(countryCode: any, subdivisionCode: any) {
    const subdivisions = getSubdivisionsForCountry(countryCode);
    if (!subdivisions) return null;
    return subdivisions.find((s: any) => s.code === subdivisionCode) || null;
}

export function getDefaultTimezoneForSubdivision(countryCode: any, subdivisionCode: any) {
    const sub = getSubdivisionByCode(countryCode, subdivisionCode);
    return sub?.timezone || null;
}
