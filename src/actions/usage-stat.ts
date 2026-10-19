import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { RENAMED_STATS, renderMessage, renderStat, STAT_IDS, toDataUrl, type StatId } from "../render";
import { readHistory, readLimits } from "../usage/limits";
import { readSessions } from "../usage/sessions";
import { snapshot } from "../usage/stats";
import { UsageStore } from "../usage/store";

type UsageSettings = {
	stat?: StatId;
};

const REFRESH_MS = 15_000;

/** A key that shows one Claude Code usage stat. Pressing it cycles to the next stat. */
@action({ UUID: "com.jonat.claude-usage.stat" })
export class UsageStat extends SingletonAction<UsageSettings> {
	private readonly store = new UsageStore();
	private readonly visible = new Map<string, { action: KeyAction<UsageSettings>; stat: StatId; image?: string }>();
	private timer: NodeJS.Timeout | undefined;

	override async onWillAppear(ev: WillAppearEvent<UsageSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.visible.set(ev.action.id, { action: ev.action, stat: statOf(ev.payload.settings) });
		this.timer ??= setInterval(() => void this.update(), REFRESH_MS);
		await this.update(ev.action.id);
	}

	override onWillDisappear(ev: WillDisappearEvent<UsageSettings>): void {
		this.visible.delete(ev.action.id);
		if (this.visible.size === 0 && this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<UsageSettings>): Promise<void> {
		const key = this.visible.get(ev.action.id);
		if (!key) return;
		key.stat = statOf(ev.payload.settings);
		await this.update(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<UsageSettings>): Promise<void> {
		const key = this.visible.get(ev.action.id);
		if (!key) return;
		key.stat = STAT_IDS[(STAT_IDS.indexOf(key.stat) + 1) % STAT_IDS.length];
		await ev.action.setSettings({ ...ev.payload.settings, stat: key.stat });
		await this.update(ev.action.id);
	}

	/** Re-scan transcripts and redraw one key, or every visible key. */
	private async update(onlyId?: string): Promise<void> {
		try {
			await this.store.refresh();
		} catch (error) {
			streamDeck.logger.error("Failed to read Claude Code transcripts", error);
		}
		const [limits, history, sessions] = await Promise.all([readLimits(), readHistory(), readSessions()]);
		const snap = snapshot(this.store.list(), history);
		for (const [id, key] of this.visible) {
			if (onlyId && id !== onlyId) continue;
			const svg = !this.store.hasRoots && !limits ? renderMessage("Claude", "No data", "~/.claude missing") : renderStat(key.stat, snap, limits, sessions);
			if (svg === key.image) continue;
			key.image = svg;
			await key.action.setImage(toDataUrl(svg));
		}
	}
}

function statOf(settings: UsageSettings): StatId {
	const stat = settings.stat && (RENAMED_STATS[settings.stat] ?? settings.stat);
	return stat && STAT_IDS.includes(stat) ? stat : "limit-5h";
}
