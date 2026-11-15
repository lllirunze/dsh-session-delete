<div align="center">

<img src="icon.svg" width="76" height="76" alt="Delete session icon">

# Delete session

**Remove session from DSH.**

`DSH Web` · `English / 简体中文` · `No dependencies`

</div>

---

## What it does

- Adds a danger-styled **Delete session** action, marked with a trash icon, to every session menu — `⋯` and right-click.
- Confirms first, then detaches the session from every workspace and clears its archive and pin marks.
- Deletes the session directory and drops its derived projection cache; if the session is open, its panel closes.
- Refuses sessions that are still running, and aborts on an unexpected on-disk layout.

## Install

```bash
dsh plugin --profile desktop add /path/to/dsh-session-delete
```

Or in DSH Desktop: open **Plugins → Add plugin** and choose this folder. Restart DSH afterwards.

## Good to know

- Deletion is permanent — no trash folder, no restore, no undo.
- Only local JSONL-backed sessions are removed from disk; a session without a local log is just detached from workspaces.
- Plain ESM for Host and Client: no build step and no dependencies.

*Private local bundle · Not published to npm.*
