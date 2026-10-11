// Bundles src/print-stats.ts with the same toolchain as the plugin, then runs it.
import { spawnSync } from "node:child_process";
import { rollup } from "rollup";
import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";

const file = "node_modules/.cache/print-stats.mjs";
const bundle = await rollup({ input: "src/print-stats.ts", plugins: [typescript({ outputToFilesystem: false }), nodeResolve({ preferBuiltins: true })] });
await bundle.write({ file, format: "es" });
process.exit(spawnSync(process.execPath, [file, ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);
