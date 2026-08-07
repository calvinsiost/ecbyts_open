// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AGENT CHANNEL READER — Pure-logic parser for docs/AGENT_CHANNEL.md

   Implements SPEC_ADMIN_AGENT_CHANNEL_READER_V2 (scoped to ecbyts):
   converts the multi-LLM channel markdown into a structured timeline
   that the admin UI consumes. Pure functions only — no DOM, no I/O.

   Parser segmenta o markdown em mensagens (cada bloco
   `AGENT (timestamp - topic):` mais bullets de corpo) e agrupa por
   tópico para reconstruir threads. Status (🟢/🟡/🔴/🔵/⚪) e corrId
   são extraídos quando presentes. Filtros suportam agent, status,
   topic e busca textual.

   AGENT_CHANNEL.md permanece source of truth (read-only neste reader).
   ================================================================ */

export type AgentName = 'CLAUDE' | 'CODEX' | 'KIMI' | 'GEMINI' | 'OLLAMA' | 'CALVIN' | string;

export type MessageStatus = 'open' | 'in-progress' | 'resolved' | 'blocked' | 'draft' | 'unknown';

export type ChannelMessage = {
    agent: AgentName;
    timestamp: string;
    topic: string;
    body: string;
    status: MessageStatus;
    corrId: string | null;
    rawHeader: string;
    lineStart: number;
};

export type ChannelTimeline = {
    messages: ChannelMessage[];
    threads: ChannelThread[];
    agents: AgentName[];
    statuses: MessageStatus[];
    topics: string[];
};

export type ChannelThread = {
    topic: string;
    messages: ChannelMessage[];
    lastStatus: MessageStatus;
    lastTimestamp: string;
    agents: AgentName[];
    messageCount: number;
};

export type ChannelFilter = {
    agent?: AgentName | 'all';
    status?: MessageStatus | 'all';
    topic?: string;
    search?: string;
};

// ----------------------------------------------------------------
// Constants & helpers
// ----------------------------------------------------------------

const KNOWN_AGENTS: ReadonlyArray<AgentName> = ['CLAUDE', 'CODEX', 'KIMI', 'GEMINI', 'OLLAMA', 'CALVIN'];

// Header pattern: `AGENT (timestamp - topic):`
// - AGENT must be 2..16 uppercase letters/digits/underscores
// - body starts on the same or next line
const HEADER_RE = /^([A-Z][A-Z0-9_]{1,15})\s*\(([^)]+?)\)\s*:\s*$/;

const STATUS_PATTERNS: ReadonlyArray<{ glyph: string; status: MessageStatus }> = [
    { glyph: '🟢', status: 'resolved' },
    { glyph: '🟡', status: 'open' },
    { glyph: '🔵', status: 'in-progress' },
    { glyph: '🔴', status: 'blocked' },
    { glyph: '⚪', status: 'draft' },
];

const CORR_ID_RE = /\b(?:corr_id|CorrID|CORR_ID|corrId)[:\s=]+([A-Za-z0-9_-]{4,64})/;

/**
 * Detect message status from glyphs in header + body.
 * Priority order: explicit status keyword in header > glyph in header > glyph in body.
 */
export function detectStatus(header: string, body: string): MessageStatus {
    const headerLower = header.toLowerCase();
    if (/\b(blocked|blocker)\b/.test(headerLower)) return 'blocked';
    if (/\b(resolved|done|closed|✅)\b/.test(headerLower)) return 'resolved';
    if (/\b(in[- ]progress|wip|launched|integrating)\b/.test(headerLower)) return 'in-progress';
    if (/\b(draft|wip-draft|proposal)\b/.test(headerLower)) return 'draft';

    for (const { glyph, status } of STATUS_PATTERNS) {
        if (header.includes(glyph)) return status;
    }
    for (const { glyph, status } of STATUS_PATTERNS) {
        if (body.includes(glyph)) return status;
    }
    return 'unknown';
}

/**
 * Extract corrId/correlation id when present in header or body.
 */
export function extractCorrId(header: string, body: string): string | null {
    const fromHeader = header.match(CORR_ID_RE);
    if (fromHeader && fromHeader[1]) return fromHeader[1];
    const fromBody = body.match(CORR_ID_RE);
    if (fromBody && fromBody[1]) return fromBody[1];
    return null;
}

/**
 * Parse the `(timestamp - topic)` portion of a header.
 * Splits on the first ` - ` separator; fallback returns whole as timestamp.
 */
export function parseHeaderMeta(meta: string): { timestamp: string; topic: string } {
    const idx = meta.indexOf(' - ');
    if (idx === -1) {
        return { timestamp: meta.trim(), topic: '' };
    }
    return {
        timestamp: meta.slice(0, idx).trim(),
        topic: meta.slice(idx + 3).trim(),
    };
}

/**
 * Normalize topic into a stable key for thread grouping.
 * Lower-cases and collapses whitespace; drops trailing punctuation.
 */
export function normalizeTopic(topic: string): string {
    return topic
        .toLowerCase()
        .replace(/[\s\-_]+/g, '-')
        .replace(/[^\p{L}\p{N}-]/gu, '')
        .replace(/^-+|-+$/g, '');
}

// ----------------------------------------------------------------
// Core parser
// ----------------------------------------------------------------

/**
 * parseChannelMd — segment AGENT_CHANNEL.md text into ChannelMessage[].
 *
 * Algorithm:
 *   1. Split input into lines.
 *   2. Scan for header lines matching HEADER_RE where the agent token is
 *      in KNOWN_AGENTS (or matches the pattern strictly for forward-compat).
 *   3. Body = lines after header until the next header or EOF.
 *   4. Skip code-fenced blocks (```...```) when looking for headers — they
 *      must not start a new message.
 */
export function parseChannelMd(text: string): ChannelMessage[] {
    if (typeof text !== 'string' || text.length === 0) return [];

    const lines = text.split(/\r?\n/);
    const messages: ChannelMessage[] = [];

    let inCodeFence = false;
    let current: {
        agent: AgentName;
        timestamp: string;
        topic: string;
        rawHeader: string;
        lineStart: number;
        bodyLines: string[];
    } | null = null;

    const flush = () => {
        if (!current) return;
        const body = current.bodyLines.join('\n').replace(/\s+$/g, '');
        const status = detectStatus(current.rawHeader, body);
        const corrId = extractCorrId(current.rawHeader, body);
        messages.push({
            agent: current.agent,
            timestamp: current.timestamp,
            topic: current.topic,
            body,
            status,
            corrId,
            rawHeader: current.rawHeader,
            lineStart: current.lineStart,
        });
        current = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';

        // Track code fences — never start a new message inside one.
        if (/^\s{0,3}```/.test(line)) {
            inCodeFence = !inCodeFence;
            if (current) current.bodyLines.push(line);
            continue;
        }

        if (!inCodeFence) {
            const match = line.match(HEADER_RE);
            if (match && match[1] && match[2] !== undefined) {
                const agentToken: string = match[1];
                const meta: string = match[2];
                // Accept known agents, plus future ones with at least one letter.
                const accepted =
                    KNOWN_AGENTS.includes(agentToken) ||
                    (agentToken.length >= 2 && /^[A-Z][A-Z0-9_]*$/.test(agentToken));
                if (accepted) {
                    flush();
                    const { timestamp, topic } = parseHeaderMeta(meta);
                    current = {
                        agent: agentToken,
                        timestamp,
                        topic,
                        rawHeader: line,
                        lineStart: i + 1,
                        bodyLines: [],
                    };
                    continue;
                }
            }
        }

        if (current) {
            current.bodyLines.push(line);
        }
    }
    flush();

    return messages;
}

/**
 * groupThreads — bucket messages by normalized topic. Topics that collide
 * (case-insensitive, punctuation-insensitive) merge into the same thread.
 * Threads without an explicit topic fall under an "(untagged)" pseudo-topic.
 */
export function groupThreads(messages: ChannelMessage[]): ChannelThread[] {
    const buckets = new Map<string, ChannelMessage[]>();
    const displayNames = new Map<string, string>();

    for (const msg of messages) {
        const key = normalizeTopic(msg.topic) || '__untagged__';
        const display = msg.topic.trim() || '(untagged)';
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(msg);
        if (!displayNames.has(key)) displayNames.set(key, display);
    }

    const threads: ChannelThread[] = [];
    for (const [key, msgs] of buckets.entries()) {
        if (msgs.length === 0) continue;
        const last = msgs[msgs.length - 1];
        if (!last) continue;
        const agents = Array.from(new Set(msgs.map((m) => m.agent)));
        threads.push({
            topic: displayNames.get(key) || '(untagged)',
            messages: msgs,
            lastStatus: last.status,
            lastTimestamp: last.timestamp,
            agents,
            messageCount: msgs.length,
        });
    }

    // Stable ordering: thread with the most recent timestamp string first.
    threads.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));
    return threads;
}

/**
 * applyFilter — narrow messages by agent/status/topic/search.
 * 'all' or undefined = no constraint. Search is case-insensitive substring
 * match against body, topic, agent, and timestamp.
 */
export function applyFilter(messages: ChannelMessage[], filter: ChannelFilter): ChannelMessage[] {
    if (!filter) return messages;
    const agent = filter.agent && filter.agent !== 'all' ? filter.agent : null;
    const status = filter.status && filter.status !== 'all' ? filter.status : null;
    const topic = filter.topic ? normalizeTopic(filter.topic) : null;
    const search = filter.search ? filter.search.toLowerCase() : null;

    return messages.filter((msg) => {
        if (agent && msg.agent !== agent) return false;
        if (status && msg.status !== status) return false;
        if (topic && normalizeTopic(msg.topic) !== topic) return false;
        if (search) {
            const haystack = `${msg.agent} ${msg.timestamp} ${msg.topic} ${msg.body}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

/**
 * buildTimeline — full parse + grouping pipeline. Returns the channel
 * structured for UI consumption.
 */
export function buildTimeline(text: string): ChannelTimeline {
    const messages = parseChannelMd(text);
    const threads = groupThreads(messages);
    const agents = Array.from(new Set(messages.map((m) => m.agent))).sort();
    const statuses = Array.from(new Set(messages.map((m) => m.status)));
    const topics = Array.from(new Set(threads.map((t) => t.topic))).sort();
    return { messages, threads, agents, statuses, topics };
}

/**
 * summarizeTimeline — KPI snapshot for the modal header.
 * Computes counts per status and active thread count.
 */
export function summarizeTimeline(timeline: ChannelTimeline): {
    totalMessages: number;
    totalThreads: number;
    openThreads: number;
    blockedThreads: number;
    resolvedThreads: number;
    inProgressThreads: number;
} {
    const open = timeline.threads.filter((t) => t.lastStatus === 'open').length;
    const blocked = timeline.threads.filter((t) => t.lastStatus === 'blocked').length;
    const resolved = timeline.threads.filter((t) => t.lastStatus === 'resolved').length;
    const inProgress = timeline.threads.filter((t) => t.lastStatus === 'in-progress').length;
    return {
        totalMessages: timeline.messages.length,
        totalThreads: timeline.threads.length,
        openThreads: open,
        blockedThreads: blocked,
        resolvedThreads: resolved,
        inProgressThreads: inProgress,
    };
}
