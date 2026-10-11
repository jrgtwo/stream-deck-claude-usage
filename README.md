# Claude Usage for Stream Deck

Shows how much of your Claude subscription limits you have used, as percentages, on Stream Deck keys.
Everything is local; nothing is sent anywhere.

- **Limit percentages** come from Claude Code itself. It passes `rate_limits` (5-hour and weekly
  `used_percentage` and `resets_at`) to its status line command. `statusline/statusline.mjs` saves them to
  `~/.claude/streamdeck-usage.json`, and appends every change to `~/.claude/streamdeck-usage-history.jsonl`.
  The plugin reads both. Set it up in `~/.claude/settings.json`:

  ```json
  "statusLine": { "type": "command", "command": "node \"C:/Users/jonat/projects/streamDeck/claude/statusline/statusline.mjs\"" }
  ```
- **Token and message counts** are read from Claude Code transcripts (`~/.claude/projects/**/*.jsonl`).

Drag **Claude Usage → Usage Stat** onto a key, pick a stat in the settings panel, or press the key to cycle:

| Stat | Shows |
| --- | --- |
| 5-hour limit used | % used in the current 5-hour window, ring gauge, time until reset |
| Weekly limit used | % used in the 7-day window, ring gauge, time until reset |
| Used today / last 7 days / this month | % of the weekly limit used in that period |
| Used last hour | % of the 5-hour limit used in the last 60 minutes |
| Tokens today | All tokens (input, output, cache), plus output tokens |
| Messages today | API responses, plus session count |
| 7-day chart | % of the weekly limit used per day, today highlighted |

Keys refresh every 15 seconds.

## Caveats

- **Period stats (today, 7 days, month, last hour) come from saved readings.** They add up each increase between
  consecutive readings (and the new value after a reset), so they only count usage since the history started.
  When the history doesn't cover the whole period the key says "since …".
- **Limit percentages update only while Claude Code is running.** They are account-wide (claude.ai usage counts too),
  but only refresh when a Claude Code session updates its status line. After an hour without an update the ring
  turns grey and shows how old the data is. Once a window passes its reset time the key shows 0%.

## Development

```sh
npm install
npm run build          # bundle to com.jonat.claude-usage.sdPlugin/bin/plugin.js
npm run watch          # rebuild and restart the plugin on every change
npm run test:stats     # print the stats the keys would show; add `-- <dir>` to dump key SVGs
npm run validate       # check the manifest with the Elgato CLI
```

The plugin folder is linked into Stream Deck with `npm run link`. Restarting from the CLI needs
developer mode (`npx streamdeck dev`).
