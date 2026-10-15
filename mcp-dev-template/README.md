# OpenPage MCP server

An [MCP](https://modelcontextprotocol.io) server that exposes the **OpenPage**
builder's design-token system to an AI agent, so it can read, generate and
re-theme page templates — the OpenPage equivalent of driving WordPress +
Elementor through an MCP.

Everything is expressed in **tokens** (theme colors/fonts/radii, H1–P
typography per breakpoint, per-block style tokens), matching
`frontend/lib/openpage/design-system.ts` and `theme-presets.ts`. A change made
through the MCP server renders identically in the visual builder and on the
published site.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable           | Default                  | Purpose                                                         |
| ------------------ | ------------------------ | -------------------------------------------------------------- |
| `OP_SITE_FILE`     | —                        | Default path to the OpenPage site JSON the tools operate on.    |
| `OP_API_BASE_URL`  | `http://127.0.0.1:3000`  | Backend base URL (used by the `*_ai_*` / `*_page_design` tools).|
| `OP_API_TOKEN`     | —                        | Bearer JWT for an org user. Required for the AI tools.          |
| `OP_MCP_TRANSPORT` | `stdio`                  | `stdio` or `http`.                                              |
| `OP_MCP_PORT`      | `7801`                   | Port when `OP_MCP_TRANSPORT=http` (`POST /mcp`, `GET /health`). |

## Build & run

```bash
npm install
npm run build      # emits dist/
npm run dev        # or run straight from source via tsx
```

### Claude Desktop / CLI (stdio)

```json
{
  "mcpServers": {
    "openpage": {
      "command": "node",
      "args": ["C:/laragon/www/ipixxel_realty/mcp-dev-template/dist/index.js"],
      "env": {
        "OP_SITE_FILE": "C:/path/to/site.json",
        "OP_API_BASE_URL": "http://127.0.0.1:3000",
        "OP_API_TOKEN": "<org-user-jwt>"
      }
    }
  }
}
```

### HTTP

```bash
OP_MCP_TRANSPORT=http OP_MCP_PORT=7801 node dist/index.js
# MCP endpoint: http://127.0.0.1:7801/mcp   health: /health
```

## Tools

### Design tokens (operate on the site JSON)

| Tool                      | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `get_design_tokens`       | Full token set: theme, typography (per breakpoint) and every block's style tokens.                  |
| `list_blocks`             | Every block (depth-first, incl. nested children) with id/type/variant — ids for the styling tools.  |
| `list_theme_presets`      | Built-in theme presets (id, name, accent, display font).                                            |
| `set_theme_tokens`        | Patch theme tokens (`bg0..bg5`, `text0..text3`, `accent`, `accentDim`, `ctaButtonColor`, borders, fonts, `radius`, `radiusLg`). |
| `set_typography_tokens`   | Patch H1–H6/P typography per breakpoint.                                                            |
| `apply_theme_preset`      | Apply a named preset's theme tokens (typography preserved).                                         |
| `set_block_style_tokens`  | Patch one block's style tokens (padding, backgroundColor, textAlign, …) and optional element styles.|

### AI (proxy the backend `/ai/*` endpoints)

| Tool                  | What it does                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `get_ai_status`       | Which AI design agent (provider + model) the backend uses and whether it is configured.       |
| `generate_ai_template`| AI-generate a complete, token-driven template; optionally save it to a site file.            |
| `improve_page_design` | Re-theme an existing document via the backend's **token-only** improve pass (copy untouched). |
| `regenerate_section`  | Rewrite/improve one block's copy and merge it back.                                           |

Every mutating tool accepts `siteFile` (defaults to `OP_SITE_FILE`) and `save`
(default `true`; pass `false` to preview the result without writing).

## Example agent flow

1. `generate_ai_template` — brief a new luxury landing page, save to `site.json`.
2. `get_design_tokens` — inspect the emitted theme + typography.
3. `apply_theme_preset` `{ "presetId": "ocean" }` — swap in a dark palette.
4. `set_typography_tokens` `{ "typography": { "h1": { "desktop": { "fontSize": 64 } } } }`.
5. `improve_page_design` `{ "instruction": "warmer palette, more breathing room" }`.
