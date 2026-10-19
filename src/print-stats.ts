// Prints the stats the plugin would display, and optionally writes each key image as SVG.
// Usage: npm run test:stats [-- <output dir>]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { formatPercent, formatTokens, renderStat, STAT_IDS } from "./render";
import { HISTORY_FILE, LIMITS_FILE, readHistory, readLimits } from "./usage/limits";
import { readSessions, SESSIONS_FILE } from "./usage/sessions";
import { snapshot } from "./usage/stats";
import { allProjectRoots, UsageStore } from "./usage/store";

const store = new UsageStore();
await store.refresh();
const [limits, history, sessions] = await Promise.all([readLimits(), readHistory(), readSessions()]);
const s = snapshot(store.list(), history);

const since = (t?: number) => (t ? ` (since ${new Date(t).toLocaleString()})` : "");
console.log(`Roots:    ${(await allProjectRoots()).join(", ") || "(none)"}`);
console.log(`Limits:   ${limits ? JSON.stringify(limits) : `none yet (${LIMITS_FILE})`}`);
console.log(`History:  ${history.length} readings (${HISTORY_FILE})`);
console.log(`Today:    ${formatPercent(s.usedToday.percent)} of weekly${since(s.usedToday.since)}`);
console.log(`7 days:   ${formatPercent(s.usedWeek.percent)} of weekly${since(s.usedWeek.since)}`);
console.log(`Month:    ${formatPercent(s.usedMonth.percent)} of weekly${since(s.usedMonth.since)}`);
console.log(`Hour:     ${formatPercent(s.usedLastHour.percent)} of 5h${since(s.usedLastHour.since)}`);
console.log(`Daily:    ${s.dailyUsed.map(formatPercent).join(" ")}`);
console.log(`Sessions: ${sessions.map((x) => `${x.project} ${formatPercent(x.usedPercent)}`).join(", ") || `none active (${SESSIONS_FILE})`}`);
console.log(`Activity: ${formatTokens(s.today.tokens)} tok, ${s.today.messages} msgs, ${s.today.sessions} sessions today`);

const out = process.argv[2];
if (out) {
	mkdirSync(out, { recursive: true });
	for (const id of STAT_IDS) writeFileSync(path.join(out, `${id}.svg`), renderStat(id, s, limits, sessions));
	console.log(`Wrote ${STAT_IDS.length} SVGs to ${out}`);
}
