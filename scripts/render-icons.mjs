// Renders the plugin's marketplace icon SVG to the PNG sizes Stream Deck requires.
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const dir = "com.jonat.claude-usage.sdPlugin/imgs/plugin";
const svg = readFileSync(`${dir}/marketplace.svg`);
for (const [suffix, width] of [["", 288], ["@2x", 576]]) {
	const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
	writeFileSync(`${dir}/marketplace${suffix}.png`, png);
}
