import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** One billed API response from a Claude Code transcript. */
export type UsageEntry = {
	timestamp: number;
	model: string;
	sessionId: string;
	output: number;
	totalTokens: number;
};

// Only today's token and message counts are shown; keep a little more than a day.
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

type FileState = { size: number; offset: number };

/**
 * Incrementally reads Claude Code's local session transcripts (`<config>/projects/**\/*.jsonl`).
 * Only bytes appended since the last scan are parsed, so refreshing every few seconds is cheap.
 */
export class UsageStore {
	private readonly files = new Map<string, FileState>();
	// Keyed by message id + request id: Claude Code writes one line per content block, each repeating the usage.
	private readonly entries = new Map<string, UsageEntry>();
	private scanning: Promise<void> | undefined;

	constructor(private readonly roots: string[] = defaultProjectRoots()) {}

	get hasRoots(): boolean {
		return this.roots.length > 0;
	}

	/** Scan for new transcript data. Concurrent callers share the same scan. */
	refresh(): Promise<void> {
		this.scanning ??= this.scan().finally(() => (this.scanning = undefined));
		return this.scanning;
	}

	/** All entries newer than the retention window, oldest first. */
	list(): UsageEntry[] {
		return [...this.entries.values()].sort((a, b) => a.timestamp - b.timestamp);
	}

	private async scan(): Promise<void> {
		const cutoff = Date.now() - RETENTION_MS;
		for (const root of this.roots) {
			let names: string[];
			try {
				names = await readdir(root, { recursive: true });
			} catch {
				continue;
			}
			for (const name of names) {
				if (!name.endsWith(".jsonl")) continue;
				const file = path.join(root, name);
				try {
					const info = await stat(file);
					if (info.mtimeMs < cutoff) continue;
					await this.readFile(file, info.size);
				} catch {
					// File vanished or is locked mid-write; pick it up next scan.
				}
			}
		}
		for (const [key, entry] of this.entries) {
			if (entry.timestamp < cutoff) this.entries.delete(key);
		}
	}

	private async readFile(file: string, size: number): Promise<void> {
		let state = this.files.get(file);
		if (state && size === state.size) return;
		if (!state || size < state.offset) {
			// New or rewritten file: parse from the start. Duplicates collapse by key.
			state = { size: 0, offset: 0 };
			this.files.set(file, state);
		}

		const length = size - state.offset;
		const buffer = Buffer.alloc(length);
		const handle = await open(file, "r");
		try {
			await handle.read(buffer, 0, length, state.offset);
		} finally {
			await handle.close();
		}

		// Only consume complete lines; a partially written last line is read again next time.
		const end = buffer.lastIndexOf(0x0a);
		if (end === -1) return;
		for (const line of buffer.subarray(0, end).toString("utf8").split("\n")) {
			this.parseLine(line);
		}
		state.offset += end + 1;
		state.size = size;
	}

	private parseLine(line: string): void {
		if (!line.includes('"usage"')) return;
		let row: any;
		try {
			row = JSON.parse(line);
		} catch {
			return;
		}
		const message = row?.message;
		const usage = message?.usage;
		if (row.type !== "assistant" || !usage || !message.model || message.model === "<synthetic>") return;

		const timestamp = Date.parse(row.timestamp);
		if (Number.isNaN(timestamp)) return;

		const output = num(usage.output_tokens);
		const key = `${message.id ?? row.uuid}:${row.requestId ?? ""}`;
		this.entries.set(key, {
			timestamp,
			model: message.model,
			sessionId: row.sessionId ?? "",
			output,
			totalTokens: num(usage.input_tokens) + output + num(usage.cache_creation_input_tokens) + num(usage.cache_read_input_tokens),
		});
	}
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Locations Claude Code stores transcripts in, honouring CLAUDE_CONFIG_DIR. */
export function defaultProjectRoots(): string[] {
	const configured = process.env.CLAUDE_CONFIG_DIR?.split(/[,;]/).map((dir) => dir.trim()).filter(Boolean) ?? [];
	const dirs = configured.length > 0 ? configured : [path.join(os.homedir(), ".claude"), path.join(os.homedir(), ".config", "claude")];
	return [...new Set(dirs.map((dir) => path.join(dir, "projects")))].filter((dir) => existsSync(dir));
}
