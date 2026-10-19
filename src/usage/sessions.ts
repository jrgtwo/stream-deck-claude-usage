import { readFile } from "node:fs/promises";
import path from "node:path";

import { LIMITS_FILE } from "./limits";

/** One Claude Code session's context window usage, as of its last reply. */
export type SessionContext = {
	id: string;
	/** Last time the status line saw this session, epoch milliseconds. */
	updatedAt: number;
	/** Project folder name. */
	project: string;
	name?: string;
	usedPercent: number;
	tokens?: number;
	windowSize?: number;
};

/** Written by statusline/statusline.mjs on each status line refresh. */
export const SESSIONS_FILE = path.join(path.dirname(LIMITS_FILE), "streamdeck-sessions.json");

// Sessions without a reply for this long are treated as closed or idle and hidden.
export const ACTIVE_MS = 60 * 60 * 1000;

/** Sessions with a reply in the last hour, fullest context first. */
export async function readSessions(now = Date.now(), file = SESSIONS_FILE): Promise<SessionContext[]> {
	let data: Record<string, any>;
	try {
		data = JSON.parse(await readFile(file, "utf8"));
	} catch {
		return [];
	}
	const sessions: SessionContext[] = [];
	for (const [id, s] of Object.entries(data ?? {})) {
		if (typeof s?.t !== "number" || typeof s?.used !== "number" || now - s.t > ACTIVE_MS) continue;
		sessions.push({
			id,
			updatedAt: s.t,
			project: typeof s.project === "string" && s.project ? s.project : "session",
			name: typeof s.name === "string" ? s.name : undefined,
			usedPercent: s.used,
			tokens: typeof s.tokens === "number" ? s.tokens : undefined,
			windowSize: typeof s.size === "number" ? s.size : undefined,
		});
	}
	return sessions.sort((a, b) => b.usedPercent - a.usedPercent || b.updatedAt - a.updatedAt);
}
