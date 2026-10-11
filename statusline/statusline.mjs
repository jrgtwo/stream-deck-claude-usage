#!/usr/bin/env node
// Claude Code status line command. Claude Code pipes session JSON to stdin, including the
// account's `rate_limits` (5-hour and 7-day used_percentage + resets_at). This script saves
// the latest limits to ~/.claude/streamdeck-usage.json and appends each change to
// ~/.claude/streamdeck-usage-history.jsonl for the Stream Deck plugin, then prints a
// one-line status: model · context · 5h used · weekly used.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = process.env.CLAUDE_CONFIG_DIR?.split(/[,;]/)[0] || path.join(os.homedir(), ".claude");
const LATEST = path.join(DIR, "streamdeck-usage.json");
const HISTORY = path.join(DIR, "streamdeck-usage-history.jsonl");
// Keep roughly the last 45 days of readings; trimmed when the file passes this size.
const HISTORY_MAX_BYTES = 2 * 1024 * 1024;
const HISTORY_KEEP_MS = 45 * 24 * 60 * 60 * 1000;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	let data = {};
	try {
		data = JSON.parse(input);
	} catch {
		// Print nothing useful rather than break the status line.
	}

	const limits = data.rate_limits;
	// Claude Code omits limits before the first response; keep the last saved ones then.
	if (limits && (limits.five_hour || limits.seven_day)) {
		try {
			save(limits);
		} catch {
			// Never fail the status line because of the side files.
		}
	}

	const parts = [];
	if (data.model?.display_name) parts.push(data.model.display_name);
	const ctx = data.context_window?.used_percentage;
	if (typeof ctx === "number") parts.push(`ctx ${Math.round(ctx)}%`);
	const used = (window) => (typeof window?.used_percentage === "number" ? `${Math.round(window.used_percentage)}%` : undefined);
	if (used(limits?.five_hour)) parts.push(`5h ${used(limits.five_hour)} used`);
	if (used(limits?.seven_day)) parts.push(`week ${used(limits.seven_day)} used`);
	process.stdout.write(parts.join(" · "));
});

function save(limits) {
	mkdirSync(DIR, { recursive: true });
	const now = Date.now();
	const reading = {
		t: now,
		h: limits.five_hour?.used_percentage,
		hr: limits.five_hour?.resets_at,
		w: limits.seven_day?.used_percentage,
		wr: limits.seven_day?.resets_at,
	};

	let previous;
	try {
		previous = JSON.parse(readFileSync(LATEST, "utf8")).rate_limits;
	} catch {}
	const changed =
		!previous ||
		!existsSync(HISTORY) ||
		previous.five_hour?.used_percentage !== reading.h ||
		previous.five_hour?.resets_at !== reading.hr ||
		previous.seven_day?.used_percentage !== reading.w ||
		previous.seven_day?.resets_at !== reading.wr;

	const tmp = `${LATEST}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify({ updatedAt: now, rate_limits: limits }));
	renameSync(tmp, LATEST);

	if (!changed) return;
	appendFileSync(HISTORY, `${JSON.stringify(reading)}\n`);
	if (statSync(HISTORY).size > HISTORY_MAX_BYTES) {
		const keep = readFileSync(HISTORY, "utf8")
			.split("\n")
			.filter((line) => line && JSON.parse(line).t > now - HISTORY_KEEP_MS);
		writeFileSync(HISTORY, `${keep.join("\n")}\n`);
	}
}
