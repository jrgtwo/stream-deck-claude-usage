import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** One subscription window as reported by Claude Code's status line input. */
export type LimitWindow = {
	usedPercent: number;
	/** Epoch milliseconds. */
	resetsAt: number;
};

export type Limits = {
	/** When the status line script last saved limits, epoch milliseconds. */
	updatedAt: number;
	fiveHour?: LimitWindow;
	sevenDay?: LimitWindow;
};

/** Written by statusline/statusline.mjs whenever Claude Code refreshes its status line. */
export const LIMITS_FILE = path.join(process.env.CLAUDE_CONFIG_DIR?.split(/[,;]/)[0] || path.join(os.homedir(), ".claude"), "streamdeck-usage.json");

function toWindow(raw: any): LimitWindow | undefined {
	if (typeof raw?.used_percentage !== "number" || typeof raw?.resets_at !== "number") return undefined;
	return { usedPercent: raw.used_percentage, resetsAt: raw.resets_at * 1000 };
}

/** Reads the saved limits, or undefined if the status line script hasn't written any yet. */
export async function readLimits(file = LIMITS_FILE): Promise<Limits | undefined> {
	try {
		const data = JSON.parse(await readFile(file, "utf8"));
		return {
			updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
			fiveHour: toWindow(data.rate_limits?.five_hour),
			sevenDay: toWindow(data.rate_limits?.seven_day),
		};
	} catch {
		return undefined;
	}
}

/** One saved reading of both windows' used percentage. Resets are epoch seconds. */
export type Reading = { t: number; h?: number; hr?: number; w?: number; wr?: number };

/** Written by statusline/statusline.mjs each time a used percentage or reset time changes. */
export const HISTORY_FILE = path.join(path.dirname(LIMITS_FILE), "streamdeck-usage-history.jsonl");

// Reset times for the same window can drift slightly between responses; larger jumps mean a new window.
const SAME_WINDOW_SECONDS = 10 * 60;

/** Reads saved readings, oldest first. */
export async function readHistory(file = HISTORY_FILE): Promise<Reading[]> {
	let text: string;
	try {
		text = await readFile(file, "utf8");
	} catch {
		return [];
	}
	const readings: Reading[] = [];
	for (const line of text.split("\n")) {
		try {
			const r = JSON.parse(line);
			if (typeof r?.t === "number") readings.push(r);
		} catch {
			// Skip blank or partially written lines.
		}
	}
	return readings.sort((a, b) => a.t - b.t);
}

/**
 * Percentage points of a window's limit used between `from` and `to`, from consecutive readings.
 * Each increase is attributed to the time of the later reading. When a window resets between two
 * readings, the later reading's whole value counts (usage since the reset).
 */
export function usedBetween(readings: Reading[], window: "five-hour" | "weekly", from: number, to: number): number {
	const [usedKey, resetKey] = window === "five-hour" ? (["h", "hr"] as const) : (["w", "wr"] as const);
	let total = 0;
	let prev: Reading | undefined;
	for (const r of readings) {
		const used = r[usedKey];
		if (typeof used !== "number") continue;
		if (prev && r.t > from && r.t <= to) {
			const prevUsed = prev[usedKey] as number;
			const sameWindow = Math.abs((r[resetKey] ?? 0) - (prev[resetKey] ?? 0)) < SAME_WINDOW_SECONDS;
			total += sameWindow ? Math.max(0, used - prevUsed) : used;
		}
		prev = r;
	}
	return total;
}
