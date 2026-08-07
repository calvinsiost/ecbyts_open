export interface ProductProfile {
    name: string;
    format: 'docx' | 'zip' | 'pdf';
    destinations: {
        official: string;
        mirror: string;
    };
}

// Destinos são caminhos RELATIVOS às raízes de entrega da máquina (a "official"
// é o drive sincronizado de entregas; a "mirror" é o repo irmão acadêmico).
// Caminhos absolutos de usuário nunca ficam hardcoded no fonte (bug de
// portabilidade + leak-scan windows-user-path §2.5): quem materializa uma
// entrega resolve estas bases contra as raízes locais (env/config do runner).
export const PRODUCT_PROFILES: Record<string, ProductProfile> = {
    Funder: {
        name: 'Funder',
        format: 'docx',
        destinations: {
            official: 'ENTREGAS/FUNDER',
            mirror: 'entregas/funder',
        },
    },
    Nature: {
        name: 'Nature',
        format: 'docx',
        destinations: {
            official: 'ENTREGAS/NATURE',
            mirror: 'entregas/nature',
        },
    },
    Zenodo: {
        name: 'Zenodo',
        format: 'zip',
        destinations: {
            official: 'ENTREGAS/ZENODO',
            mirror: 'entregas/zenodo',
        },
    },
    GitHub: {
        name: 'GitHub',
        format: 'zip',
        destinations: {
            official: 'ENTREGAS/GITHUB',
            mirror: 'entregas/github',
        },
    },
};

export function resolveDestinations(profile: ProductProfile, version: number): { official: string; mirror: string } {
    const v = Math.max(1, Math.floor(version));
    const tag = 'v' + v;
    const ext = profile.format;
    const base = profile.name.toUpperCase() + '-' + tag;
    const filename = base + '.' + ext;
    return {
        official: profile.destinations.official + '/' + filename,
        mirror: profile.destinations.mirror + '/' + filename,
    };
}
