import { type Reading, usedBetween } from "./limits";
import type { UsageEntry } from "./store";

const HOUR = 60 * 60 * 1000;

/** Token and message counts for today, from local transcripts. */
export type Activity = { tokens: number; output: number; messages: number; sessions: number };

/** Percentage points of a limit used in a period, and when the saved history starts covering it. */
export type PeriodUsage = { percent: number; since?: number };

export type Snapshot = {
	now: number;
	today: Activity;
	/** Share of the weekly limit used, by period. */
	usedToday: PeriodUsage;
	usedWeek: PeriodUsage;
	usedMonth: PeriodUsage;
	/** Share of the 5-hour limit used in the last 60 minutes. */
	usedLastHour: PeriodUsage;
	/** Share of the weekly limit used per local day for the last 7 days, oldest first; the last is today. */
	dailyUsed: number[];
	hasHistory: boolean;
};

function startOfLocalDay(time: number, daysAgo = 0): number {
	const d = new Date(time);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo).getTime();
}

function activity(entries: UsageEntry[]): Activity {
	const sessions = new Set<string>();
	const a: Activity = { tokens: 0, output: 0, messages: entries.length, sessions: 0 };
	for (const e of entries) {
		a.tokens += e.totalTokens;
		a.output += e.output;
		sessions.add(e.sessionId);
	}
	a.sessions = sessions.size;
	return a;
}

/**
 * @param entries Transcript usage entries.
 * @param readings Saved limit readings, oldest first.
 */
export function snapshot(entries: UsageEntry[], readings: Reading[], now = Date.now()): Snapshot {
	const today = startOfLocalDay(now);
	const d = new Date(now);
	const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
	const firstReading = readings[0]?.t;

	const period = (window: "five-hour" | "weekly", from: number): PeriodUsage => ({
		percent: usedBetween(readings, window, from, now),
		// The first reading only sets a baseline, so usage before it is unknown.
		since: firstReading !== undefined && firstReading > from ? firstReading : undefined,
	});

	return {
		now,
		today: activity(entries.filter((e) => e.timestamp >= today)),
		usedToday: period("weekly", today),
		usedWeek: period("weekly", startOfLocalDay(now, 6)),
		usedMonth: period("weekly", monthStart),
		usedLastHour: period("five-hour", now - HOUR),
		dailyUsed: Array.from({ length: 7 }, (_, i) =>
			usedBetween(readings, "weekly", startOfLocalDay(now, 6 - i), i === 6 ? now : startOfLocalDay(now, 5 - i)),
		),
		hasHistory: readings.length > 0,
	};
}
