# Remotion render node (Phase D)

The marketing ad pipeline baseline uses **FFmpeg-first** `media_process` nodes for extract, concat, and mux. **Remotion** is optional later: a `remotion_render` node (or `media_process` operation `remotion`) would accept a **props JSON** contract (timeline: segment URLs, text layers, music URL) and run `npx remotion render` (or [Remotion Lambda](https://www.remotion.dev/docs/lambda)) against a **bundled** composition in this repo.

- **Not** the same as [Remotion’s Claude Code flow](https://www.remotion.dev/docs/ai/claude-code) (local authoring); in-app, Remotion is **render execution** only.
- **Prerequisite**: stable segment JSON and mux behavior from Phases A–C so the composition schema does not churn.
- **Deploy**: Node + Chromium (or Lambda); pin Remotion versions; keep composition props aligned with `workflow-graph` / template exports.
