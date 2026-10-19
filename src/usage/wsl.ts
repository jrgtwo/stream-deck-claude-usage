import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

// Listing distros spawns wsl.exe, so only check for newly started or stopped ones this often.
const CACHE_MS = 60_000;

let cached: { at: number; dirs: Promise<string[]> } | undefined;

/**
 * Claude Code config dirs (`~/.claude`) inside running WSL distros, as `\\wsl.localhost\...` paths.
 * Stopped distros are skipped: touching their files would boot them and keep WSL from idling.
 */
export function wslClaudeDirs(): Promise<string[]> {
	if (process.platform !== "win32") return Promise.resolve([]);
	if (!cached || Date.now() - cached.at > CACHE_MS) {
		cached = { at: Date.now(), dirs: findDirs().catch(() => []) };
	}
	return cached.dirs;
}

async function findDirs(): Promise<string[]> {
	const dirs: string[] = [];
	for (const distro of await runningDistros()) {
		const root = `\\\\wsl.localhost\\${distro}`;
		let homes: string[] = [];
		try {
			homes = (await readdir(path.join(root, "home"))).map((user) => path.join(root, "home", user));
		} catch {}
		for (const home of [...homes, path.join(root, "root")]) {
			const dir = path.join(home, ".claude");
			if (existsSync(dir)) dirs.push(dir);
		}
	}
	return dirs;
}

function runningDistros(): Promise<string[]> {
	return new Promise((resolve) => {
		// wsl.exe writes UTF-16LE. With nothing running it prints a message and exits non-zero.
		execFile("wsl.exe", ["--list", "--running", "--quiet"], { encoding: "utf16le", windowsHide: true, timeout: 10_000 }, (error, stdout) => {
			if (error) return resolve([]);
			resolve(
				stdout
					.split(/\r?\n/)
					.map((name) => name.replace(/\0/g, "").trim())
					.filter(Boolean),
			);
		});
	});
}
