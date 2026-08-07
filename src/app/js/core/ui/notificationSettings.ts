// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-72 - Notification Settings (pure-logic, zero DOM)
 * Modela canais, categorias, digest e quiet hours para notificacoes.
 *
 * Imutavel: todo "setter" retorna um novo state frozen.
 */

const VALID_CHANNELS = Object.freeze(['in_app', 'email', 'push', 'sms'] as const);
const VALID_CATEGORIES = Object.freeze(['mention', 'comment', 'task', 'system', 'security', 'marketing'] as const);
const VALID_FREQUENCIES = Object.freeze(['daily', 'weekly', 'instant'] as const);

export type Channel = (typeof VALID_CHANNELS)[number];
export type EventCategory = (typeof VALID_CATEGORIES)[number];
export type DigestFrequency = (typeof VALID_FREQUENCIES)[number];

export interface ChannelConfig {
    channel: Channel;
    enabled: boolean;
    categories: Set<EventCategory>;
}

export interface DigestConfig {
    enabled: boolean;
    frequency: DigestFrequency;
    sendAtHour: number;
    weekday: number;
}

export interface QuietHoursConfig {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone: string;
    exceptCritical: boolean;
}

export interface NotificationSettingsState {
    channels: Map<Channel, Readonly<ChannelConfig>>;
    digest: Readonly<DigestConfig>;
    quietHours: Readonly<QuietHoursConfig>;
}

export interface NotificationSettingsOptions {
    channels?: Partial<
        Record<
            Channel,
            {
                enabled?: boolean;
                categories?: Iterable<EventCategory>;
            }
        >
    >;
    digest?: Partial<DigestConfig>;
    quietHours?: Partial<QuietHoursConfig>;
}

export interface NotificationEvent {
    channel: unknown;
    category: unknown;
    severity?: unknown;
    now: unknown;
}

export interface NotificationSettingsSummary {
    enabledChannels: Channel[];
    categoriesPerChannel: Record<Channel, EventCategory[]>;
    digestEnabled: boolean;
    quietActive: boolean;
}

function assertChannel(channel: unknown): asserts channel is Channel {
    if (typeof channel !== 'string' || !VALID_CHANNELS.includes(channel as Channel)) {
        throw new Error(`Invalid channel: ${String(channel)}`);
    }
}

function assertCategory(category: unknown): asserts category is EventCategory {
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as EventCategory)) {
        throw new Error(`Invalid category: ${String(category)}`);
    }
}

function assertFrequency(frequency: unknown): asserts frequency is DigestFrequency {
    if (typeof frequency !== 'string' || !VALID_FREQUENCIES.includes(frequency as DigestFrequency)) {
        throw new Error(`Invalid digest frequency: ${String(frequency)}`);
    }
}

function assertHour(hour: unknown, label = 'hour'): asserts hour is number {
    if (!Number.isInteger(hour) || Number(hour) < 0 || Number(hour) > 23) {
        throw new Error(`Invalid ${label}: ${String(hour)} (must be integer 0..23)`);
    }
}

function assertWeekday(weekday: unknown): asserts weekday is number {
    if (!Number.isInteger(weekday) || Number(weekday) < 0 || Number(weekday) > 6) {
        throw new Error(`Invalid weekday: ${String(weekday)} (must be integer 0..6)`);
    }
}

function freezeChannelConfig(cfg: ChannelConfig): Readonly<ChannelConfig> {
    const categories = new Set(cfg.categories);
    const frozen = Object.freeze({
        channel: cfg.channel,
        enabled: !!cfg.enabled,
        categories,
    });
    return frozen;
}

function defaultChannelConfig(channel: Channel, enabled: boolean): Readonly<ChannelConfig> {
    // Defaults sensatos: tudo exceto marketing
    const cats = VALID_CATEGORIES.filter((c) => c !== 'marketing');
    return freezeChannelConfig({
        channel,
        enabled,
        categories: new Set(cats),
    });
}

function defaultDigest(): Readonly<DigestConfig> {
    return Object.freeze({
        enabled: true,
        frequency: 'weekly',
        sendAtHour: 9,
        weekday: 1, // Monday
    });
}

function defaultQuietHours(): Readonly<QuietHoursConfig> {
    return Object.freeze({
        enabled: false,
        startHour: 22,
        endHour: 7,
        timezone: 'UTC',
        exceptCritical: true,
    });
}

function freezeDigest(
    d: Partial<DigestConfig> & Pick<DigestConfig, 'frequency' | 'sendAtHour' | 'weekday'>,
): Readonly<DigestConfig> {
    assertFrequency(d.frequency);
    assertHour(d.sendAtHour, 'sendAtHour');
    assertWeekday(d.weekday);
    return Object.freeze({
        enabled: !!d.enabled,
        frequency: d.frequency,
        sendAtHour: d.sendAtHour,
        weekday: d.weekday,
    });
}

function freezeQuiet(
    q: Partial<QuietHoursConfig> & Pick<QuietHoursConfig, 'startHour' | 'endHour' | 'timezone'>,
): Readonly<QuietHoursConfig> {
    assertHour(q.startHour, 'startHour');
    assertHour(q.endHour, 'endHour');
    if (typeof q.timezone !== 'string' || !q.timezone) {
        throw new Error('Invalid timezone');
    }
    return Object.freeze({
        enabled: !!q.enabled,
        startHour: q.startHour,
        endHour: q.endHour,
        timezone: q.timezone,
        exceptCritical: !!q.exceptCritical,
    });
}

function freezeState(
    channels: ReadonlyMap<Channel, Readonly<ChannelConfig>>,
    digest: Readonly<DigestConfig>,
    quietHours: Readonly<QuietHoursConfig>,
): Readonly<NotificationSettingsState> {
    const map = new Map<Channel, Readonly<ChannelConfig>>();
    for (const [k, v] of channels) {
        map.set(k, freezeChannelConfig(v));
    }
    return Object.freeze({
        channels: map,
        digest,
        quietHours,
    });
}

/**
 * Cria estado inicial com defaults.
 */
export function createNotificationSettings(
    opts: NotificationSettingsOptions = {},
): Readonly<NotificationSettingsState> {
    const channels = new Map<Channel, Readonly<ChannelConfig>>();
    channels.set('in_app', defaultChannelConfig('in_app', true));
    channels.set('email', defaultChannelConfig('email', true));
    channels.set('push', defaultChannelConfig('push', false));
    channels.set('sms', defaultChannelConfig('sms', false));

    const digest = freezeDigest({ ...defaultDigest(), ...(opts.digest || {}) });
    const quiet = freezeQuiet({ ...defaultQuietHours(), ...(opts.quietHours || {}) });

    if (opts.channels && typeof opts.channels === 'object') {
        for (const [ch, cfg] of Object.entries(opts.channels)) {
            assertChannel(ch);
            const existing = channels.get(ch);
            if (!existing) throw new Error(`Invalid channel: ${ch}`);
            channels.set(
                ch,
                freezeChannelConfig({
                    channel: ch,
                    enabled: cfg.enabled !== undefined ? cfg.enabled : existing.enabled,
                    categories: cfg.categories ? new Set(cfg.categories) : existing.categories,
                }),
            );
        }
    }

    return freezeState(channels, digest, quiet);
}

function cloneChannels(state: Readonly<NotificationSettingsState>): Map<Channel, Readonly<ChannelConfig>> {
    const m = new Map<Channel, Readonly<ChannelConfig>>();
    for (const [k, v] of state.channels) {
        m.set(
            k,
            freezeChannelConfig({
                channel: v.channel,
                enabled: v.enabled,
                categories: new Set(v.categories),
            }),
        );
    }
    return m;
}

function getChannelConfig(
    channels: ReadonlyMap<Channel, Readonly<ChannelConfig>>,
    channel: Channel,
): Readonly<ChannelConfig> {
    const cur = channels.get(channel);
    if (!cur) throw new Error(`Invalid channel: ${channel}`);
    return cur;
}

export function enableChannel(
    state: Readonly<NotificationSettingsState>,
    channel: unknown,
): Readonly<NotificationSettingsState> {
    assertChannel(channel);
    const m = cloneChannels(state);
    const cur = getChannelConfig(m, channel);
    m.set(
        channel,
        freezeChannelConfig({
            channel,
            enabled: true,
            categories: new Set(cur.categories),
        }),
    );
    return freezeState(m, state.digest, state.quietHours);
}

export function disableChannel(
    state: Readonly<NotificationSettingsState>,
    channel: unknown,
): Readonly<NotificationSettingsState> {
    assertChannel(channel);
    const m = cloneChannels(state);
    const cur = getChannelConfig(m, channel);
    m.set(
        channel,
        freezeChannelConfig({
            channel,
            enabled: false,
            categories: new Set(cur.categories),
        }),
    );
    return freezeState(m, state.digest, state.quietHours);
}

export function setCategoryForChannel(
    state: Readonly<NotificationSettingsState>,
    channel: unknown,
    category: unknown,
    enabled: boolean,
): Readonly<NotificationSettingsState> {
    assertChannel(channel);
    assertCategory(category);
    const m = cloneChannels(state);
    const cur = getChannelConfig(m, channel);
    const cats = new Set(cur.categories);
    if (enabled) cats.add(category);
    else cats.delete(category);
    m.set(
        channel,
        freezeChannelConfig({
            channel,
            enabled: cur.enabled,
            categories: cats,
        }),
    );
    return freezeState(m, state.digest, state.quietHours);
}

export function setDigest(
    state: Readonly<NotificationSettingsState>,
    digestConfig: Partial<DigestConfig>,
): Readonly<NotificationSettingsState> {
    const merged = { ...state.digest, ...digestConfig };
    const next = freezeDigest(merged);
    return freezeState(cloneChannels(state), next, state.quietHours);
}

export function setQuietHours(
    state: Readonly<NotificationSettingsState>,
    quietHours: Partial<QuietHoursConfig>,
): Readonly<NotificationSettingsState> {
    const merged = { ...state.quietHours, ...quietHours };
    const next = freezeQuiet(merged);
    return freezeState(cloneChannels(state), state.digest, next);
}

/**
 * Verifica se o instante `now` esta dentro da janela quiet.
 * Suporta wrap meia-noite (start > end).
 */
export function isInQuietHours(now: unknown, quietHours: Readonly<QuietHoursConfig> | null | undefined): boolean {
    if (!quietHours || !quietHours.enabled) return false;
    if (!(now instanceof Date)) {
        throw new Error('now must be a Date');
    }
    const h = now.getHours();
    const { startHour, endHour } = quietHours;
    if (startHour === endHour) return false; // janela vazia
    if (startHour < endHour) {
        return h >= startHour && h < endHour;
    }
    // wrap: ex 22..7 -> [22,23] U [0,7)
    return h >= startHour || h < endHour;
}

export function getEnabledChannels(state: Readonly<NotificationSettingsState>): Channel[] {
    const out: Channel[] = [];
    for (const [ch, cfg] of state.channels) {
        if (cfg.enabled) out.push(ch);
    }
    return out;
}

export function getCategoriesForChannel(state: Readonly<NotificationSettingsState>, channel: unknown): EventCategory[] {
    assertChannel(channel);
    const cfg = getChannelConfig(state.channels, channel);
    return Array.from(cfg.categories);
}

/**
 * Decide se uma notificacao deve ser enviada agora.
 */
export function shouldSendNotification(state: Readonly<NotificationSettingsState>, ev: NotificationEvent): boolean {
    const { channel, category, severity, now } = ev;
    assertChannel(channel);
    assertCategory(category);
    if (!(now instanceof Date)) {
        throw new Error('now must be a Date');
    }
    const cfg = getChannelConfig(state.channels, channel);
    if (!cfg.enabled) return false;
    if (!cfg.categories.has(category)) return false;

    const isCritical = severity === 'critical';

    // Quiet hours
    if (isInQuietHours(now, state.quietHours)) {
        if (!(state.quietHours.exceptCritical && isCritical)) {
            return false;
        }
    }

    // Digest mode supressa nao-criticas em frequencias batched
    if (
        state.digest.enabled &&
        (state.digest.frequency === 'daily' || state.digest.frequency === 'weekly') &&
        !isCritical
    ) {
        return false;
    }

    return true;
}

export function summarizeNotificationSettings(
    state: Readonly<NotificationSettingsState>,
    now: Date = new Date(),
): NotificationSettingsSummary {
    const enabledChannels = getEnabledChannels(state);
    const categoriesPerChannel = {
        in_app: getCategoriesForChannel(state, 'in_app'),
        email: getCategoriesForChannel(state, 'email'),
        push: getCategoriesForChannel(state, 'push'),
        sms: getCategoriesForChannel(state, 'sms'),
    };
    return {
        enabledChannels,
        categoriesPerChannel,
        digestEnabled: state.digest.enabled,
        quietActive: isInQuietHours(now, state.quietHours),
    };
}

export const __internals = Object.freeze({
    VALID_CHANNELS,
    VALID_CATEGORIES,
    VALID_FREQUENCIES,
});
