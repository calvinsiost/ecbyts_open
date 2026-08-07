/**
 * Minimum capability packages for the private early-adopter cohort.
 *
 * This module is intentionally pure and deny-by-default. UI and authorization
 * layers may consume the same catalog, but server-side enforcement remains the
 * authority for granting each capability.
 */

export const EARLY_ADOPTER_PROFILE_IDS = Object.freeze([
    'professor',
    'environmental-consultant',
    'process-specialist',
    'researcher',
    'executive-reviewer',
] as const);

export type EarlyAdopterProfileId = (typeof EARLY_ADOPTER_PROFILE_IDS)[number];

export const EARLY_ADOPTER_CAPABILITY_IDS = Object.freeze([
    'training',
    'files',
    'lesson-modules',
    'ecbt-key',
    'model',
    'data-studio',
    'report',
    'pipelines',
    'gac',
    'pid',
    'technical-bindings',
    'datasets',
    'references',
    'export',
    'prepared-view',
    'key-summary',
    'comments',
] as const);

export type EarlyAdopterCapabilityId = (typeof EARLY_ADOPTER_CAPABILITY_IDS)[number];

export interface ProfileCapabilityPackage {
    readonly profileId: EarlyAdopterProfileId;
    readonly version: 1;
    readonly outcome: string;
    readonly capabilities: readonly EarlyAdopterCapabilityId[];
    readonly firstValueAction: string;
}

function createPackage(
    profileId: EarlyAdopterProfileId,
    outcome: string,
    capabilities: readonly EarlyAdopterCapabilityId[],
    firstValueAction: string,
): ProfileCapabilityPackage {
    return Object.freeze({
        profileId,
        version: 1 as const,
        outcome,
        capabilities: Object.freeze([...capabilities]),
        firstValueAction,
    });
}

export const PROFILE_CAPABILITY_PACKAGES: Readonly<Record<EarlyAdopterProfileId, ProfileCapabilityPackage>> =
    Object.freeze({
        professor: createPackage(
            'professor',
            'Prepare and present a class.',
            ['training', 'files', 'lesson-modules'],
            'Open a prepared class and enter presentation mode.',
        ),
        'environmental-consultant': createPackage(
            'environmental-consultant',
            'Open an ECBT key and produce an environmental analysis.',
            ['ecbt-key', 'model', 'data-studio', 'report'],
            'Open the example ECBT key and locate its summary.',
        ),
        'process-specialist': createPackage(
            'process-specialist',
            'Review or create a technical process flow.',
            ['pipelines', 'gac', 'pid', 'technical-bindings'],
            'Open a pipeline and inspect one process step.',
        ),
        researcher: createPackage(
            'researcher',
            'Organize evidence and reproduce a result.',
            ['files', 'datasets', 'references', 'export'],
            'Open an evidence set and identify its source.',
        ),
        'executive-reviewer': createPackage(
            'executive-reviewer',
            'Understand the result without editing its structure.',
            ['prepared-view', 'key-summary', 'comments'],
            'Open a prepared view and register a comment.',
        ),
    });

const PROFILE_ID_SET: ReadonlySet<string> = new Set(EARLY_ADOPTER_PROFILE_IDS);
const CAPABILITY_ID_SET: ReadonlySet<string> = new Set(EARLY_ADOPTER_CAPABILITY_IDS);

/** Returns null for unknown input so callers cannot accidentally grant a default package. */
export function getProfileCapabilityPackage(profileId: unknown): ProfileCapabilityPackage | null {
    if (typeof profileId !== 'string' || !PROFILE_ID_SET.has(profileId)) return null;
    return PROFILE_CAPABILITY_PACKAGES[profileId as EarlyAdopterProfileId];
}

/**
 * Combines the minimum package with explicitly approved, known capabilities.
 * Unknown additions fail closed instead of silently broadening access.
 */
export function resolveProfileCapabilities(
    profileId: unknown,
    additionalCapabilities: readonly unknown[] = [],
): readonly EarlyAdopterCapabilityId[] {
    const profilePackage = getProfileCapabilityPackage(profileId);
    if (!profilePackage) return Object.freeze([]);

    const approvedAdditional = additionalCapabilities.filter(
        (capability): capability is EarlyAdopterCapabilityId =>
            typeof capability === 'string' && CAPABILITY_ID_SET.has(capability),
    );

    return Object.freeze([...new Set([...profilePackage.capabilities, ...approvedAdditional])]);
}

export function validateProfileCapabilityCatalog(): readonly string[] {
    const issues: string[] = [];

    for (const profileId of EARLY_ADOPTER_PROFILE_IDS) {
        const profilePackage = PROFILE_CAPABILITY_PACKAGES[profileId];
        if (profilePackage.profileId !== profileId) issues.push(`${profileId}: profileId mismatch`);
        if (profilePackage.capabilities.length === 0) issues.push(`${profileId}: empty capability package`);
        if (!profilePackage.outcome.trim()) issues.push(`${profileId}: missing outcome`);
        if (!profilePackage.firstValueAction.trim()) issues.push(`${profileId}: missing first-value action`);
        if (new Set(profilePackage.capabilities).size !== profilePackage.capabilities.length) {
            issues.push(`${profileId}: duplicate capabilities`);
        }
        for (const capability of profilePackage.capabilities) {
            if (!CAPABILITY_ID_SET.has(capability)) issues.push(`${profileId}: unknown capability ${capability}`);
        }
    }

    return Object.freeze(issues);
}
