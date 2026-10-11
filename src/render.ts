import type { Limits, LimitWindow } from "./usage/limits";
import type { PeriodUsage, Snapshot } from "./usage/stats";

export const STATS = {
	"limit-5h": "5-hour limit used",
	"limit-week": "Weekly limit used",
	"used-today": "Used today",
	"used-week": "Used last 7 days",
	"used-month": "Used this month",
	"tokens-today": "Tokens today",
	"messages-today": "Messages today",
	"used-hour": "Used last hour",
	"chart-week": "7-day chart",
} as const;

/** Stat ids saved by earlier versions, mapped to what replaced them. */
export const RENAMED_STATS: Record<string, StatId> = {
	"cost-today": "used-today",
	"cost-week": "used-week",
	"cost-month": "used-month",
	"burn-rate": "used-hour",
};

// Used-percentage thresholds at which the ring turns amber, then red.
const WARN_USED = 75;
const DANGER_USED = 90;
// Saved limits older than this are shown dimmed: no Claude Code session has refreshed them.
const STALE_MS = 60 * 60 * 1000;

export type StatId = keyof typeof STATS;

export const STAT_IDS = Object.keys(STATS) as StatId[];

const SIZE = 144;
const COLORS = {
	background: "#141413",
	label: "#9c9a92",
	value: "#faf9f5",
	accent: "#d97757",
	track: "#3a3935",
	muted: "#7a4a38",
	warn: "#e8b04a",
	danger: "#e5534b",
	stale: "#6b6a65",
};
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export function formatTokens(n: number): string {
	if (n < 1_000) return `${Math.round(n)}`;
	const [value, suffix] = n < 1e6 ? [n / 1e3, "K"] : n < 1e9 ? [n / 1e6, "M"] : [n / 1e9, "B"];
	return `${value < 10 ? value.toFixed(1) : Math.round(value)}${suffix}`;
}

export function formatPercent(n: number): string {
	return n > 0 && n < 10 ? `${n.toFixed(1)}%` : `${Math.round(n)}%`;
}

function formatDuration(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	const days = Math.floor(minutes / 1440);
	const h = Math.floor((minutes % 1440) / 60);
	if (days > 0) return `${days}d ${h}h`;
	return h > 0 ? `${h}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

function escape(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function text(x: number, y: number, size: number, fill: string, content: string, weight = 400, spacing = 0): string {
	return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}" text-anchor="middle">${escape(content)}</text>`;
}

function valueSize(value: string): number {
	return value.length <= 4 ? 44 : value.length <= 5 ? 40 : value.length <= 6 ? 34 : 28;
}

/** Standard tile: small label on top, a large value, and a secondary line. */
function tile(label: string, value: string, detail: string): string {
	return svg(
		text(72, 30, 17, COLORS.label, label.toUpperCase(), 600, 1.5) +
			text(72, 86, valueSize(value), COLORS.value, value, 700) +
			text(72, 116, 17, COLORS.accent, detail, 500),
	);
}

/** Ring gauge of the percentage used in a subscription window, with time until it resets. */
function limitRing(label: string, window: LimitWindow | undefined, limits: Limits | undefined, now: number): string {
	if (!limits) return tile(label, "—", "open Claude Code");
	// Claude Code drops a window once it resets, and a saved window can pass its reset while idle.
	const reset = !window || now >= window.resetsAt;
	const used = reset ? 0 : Math.min(100, Math.max(0, window.usedPercent));
	const stale = !reset && now - limits.updatedAt > STALE_MS;
	const color = stale ? COLORS.stale : used >= DANGER_USED ? COLORS.danger : used >= WARN_USED ? COLORS.warn : COLORS.accent;

	const r = 40;
	const circumference = 2 * Math.PI * r;
	const arc = (circumference * used) / 100;
	const ring =
		`<circle cx="72" cy="74" r="${r}" fill="none" stroke="${COLORS.track}" stroke-width="9"/>` +
		`<circle cx="72" cy="74" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" ` +
		`stroke-dasharray="${arc.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 72 74)"/>`;
	const value = `${Math.round(used)}%`;
	const detail = reset ? "reset" : stale ? `${formatDuration(now - limits.updatedAt)} ago` : `resets ${formatDuration(window.resetsAt - now)}`;
	return svg(
		text(72, 22, 15, COLORS.label, label.toUpperCase(), 600, 1.5) +
			ring +
			text(72, 84, value.length > 3 ? 26 : 30, stale ? COLORS.label : COLORS.value, value, 700) +
			text(72, 136, 15, stale ? COLORS.label : color, detail, 500),
	);
}

/** Tile for the share of a limit used over a period, noting when history only covers part of it. */
function periodTile(label: string, usage: PeriodUsage, of: string, s: Snapshot): string {
	if (!s.hasHistory) return tile(label, "—", "open Claude Code");
	return tile(label, formatPercent(usage.percent), usage.since ? `since ${formatSince(usage.since, s.now)}` : of);
}

function formatSince(time: number, now: number): string {
	const d = new Date(time);
	return now - time < 24 * 60 * 60 * 1000
		? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
		: d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function chart(dailyUsed: number[]): string {
	const max = Math.max(...dailyUsed, 1);
	const total = dailyUsed.reduce((a, b) => a + b, 0);
	const barWidth = 12;
	const gap = (112 - barWidth * dailyUsed.length) / (dailyUsed.length - 1);
	const bars = dailyUsed.map((used, i) => {
		const height = Math.max(2, Math.round((used / max) * 70));
		const x = 16 + i * (barWidth + gap);
		const fill = i === dailyUsed.length - 1 ? COLORS.accent : COLORS.muted;
		return `<rect x="${x.toFixed(1)}" y="${128 - height}" width="${barWidth}" height="${height}" rx="2" fill="${fill}"/>`;
	});
	return svg(text(72, 30, 17, COLORS.label, "7 DAYS", 600, 1.5) + text(72, 50, 18, COLORS.value, formatPercent(total), 700) + bars.join(""));
}

function svg(body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${COLORS.background}"/>${body}</svg>`;
}

export function renderMessage(label: string, value: string, detail = ""): string {
	return tile(label, value, detail);
}

export function renderStat(stat: StatId, s: Snapshot, limits: Limits | undefined): string {
	switch (stat) {
		case "limit-5h":
			return limitRing("5h used", limits?.fiveHour, limits, s.now);
		case "limit-week":
			return limitRing("Week used", limits?.sevenDay, limits, s.now);
		case "used-today":
			return periodTile("Today", s.usedToday, "of weekly", s);
		case "used-week":
			return periodTile("7 days", s.usedWeek, "of weekly", s);
		case "used-month":
			return periodTile(new Date(s.now).toLocaleString("en-US", { month: "short" }), s.usedMonth, "of weekly", s);
		case "tokens-today":
			return tile("Tokens", formatTokens(s.today.tokens), `${formatTokens(s.today.output)} out`);
		case "messages-today":
			return tile("Msgs today", `${s.today.messages}`, `${s.today.sessions} session${s.today.sessions === 1 ? "" : "s"}`);
		case "used-hour":
			return periodTile("Last hour", s.usedLastHour, "of 5h limit", s);
		case "chart-week":
			return s.hasHistory ? chart(s.dailyUsed) : tile("7 days", "—", "open Claude Code");
	}
}

export function toDataUrl(svgMarkup: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svgMarkup)}`;
}
