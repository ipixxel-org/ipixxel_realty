# OpenPage MCP server

For the full Super Admin → Claude Desktop walkthrough, see
[`docs/mcp-claude-setup.md`](../../docs/mcp-claude-setup.md).

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

The Super Admin console owns the connection config. Open **Super Admin →
Integrations → MCP for Claude** and edit the paths, API URL and token lifetime
there; the backend serves them from `identity.mcp_settings` and injects them
into the generated Claude Desktop config. No `MCP_*` variables are read from the
backend `.env`.

The MCP process itself still takes these variables, which the generated config
supplies:

| Variable           | Default                  | Purpose                                                         |
| ------------------ | ------------------------ | -------------------------------------------------------------- |
| `OP_SITE_FILE`     | `./site.json`            | Default path to the OpenPage site JSON the tools operate on.    |
| `OP_API_BASE_URL`  | `http://127.0.0.1:3000`  | Backend base URL (used by the `*_ai_*` / `*_page_design` tools).|
| `OP_API_TOKEN`     | —                        | Bearer JWT for an org user. Required for the AI tools.          |
| `OP_MCP_TRANSPORT` | `stdio`                  | `stdio` or `http`.                                              |
| `OP_MCP_PORT`      | `7801`                   | Port when `OP_MCP_TRANSPORT=http` (`POST /mcp`, `GET /health`). |
| `OP_BRAND_KIT_DIR` | `./.openpage/brand-kits` | Where `save_brand_kit` writes reusable theme/typography bundles.|

For manual runs, copy `backend/.env.example` to `backend/.env` only if you need
to override the values the UI normally supplies.

## Build & run

Dependencies are installed once in `backend/node_modules` (single tree). From
the `backend/` folder:

```bash
npm install
npm run mcp:generate   # refresh the section catalogue from the frontend (optional)
npm run mcp            # run over stdio (default)
```

The server runs directly from TypeScript source via `tsx` (no build/`dist`
needed). For HTTP, set `OP_MCP_TRANSPORT=http` and `OP_MCP_PORT=7801`, then run
`npm run mcp`.

The section catalogue is a **snapshot** of the frontend's
`frontend/lib/openpage/section-presets.ts`, generated into
`src/section-presets.generated.ts` by `npm run mcp:generate`. Re-run it after
changing the frontend catalogue.

### Claude Desktop / CLI (stdio)

Super Admins can generate this JSON — with a real token and resolved paths —
from **Super Admin → Integrations → MCP for Claude**
(`GET /admin/integrations/mcp/connection`). The same page edits every connection
setting (`GET/PUT /admin/integrations/mcp/settings`,
`POST /admin/integrations/mcp/settings/reset`) and stores it in
`identity.mcp_settings`; nothing is read from the backend `.env`. The snippet
below is the manual form.

```json
{
  "mcpServers": {
    "openpage": {
      "command": "node",
      "args": [
        "C:/laragon/www/ipixxel_realty/backend/node_modules/tsx/dist/cli.mjs",
        "C:/laragon/www/ipixxel_realty/backend/mcp-dev-template/src/index.ts"
      ],
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
# from backend/
OP_MCP_TRANSPORT=http OP_MCP_PORT=7801 npm run mcp
# MCP endpoint: http://127.0.0.1:7801/mcp   health: /health
```

## Tools

### Design tokens (operate on the site JSON)

| Tool                      | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `get_site`                | Full site document (theme, design system, blocks, pages, SEO) — inspect a generated template.        |
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
| `generate_ai_template`| AI-generate a complete, token-driven template. Returns the full site document and saves it to `siteFile` / `OP_SITE_FILE` (pass `save: false` to skip). |
| `improve_page_design` | Re-theme an existing document via the backend's **token-only** improve pass (copy untouched). |
| `regenerate_section`  | Rewrite/improve one block's copy and merge it back.                                           |

### Starter templates

| Tool                     | What it does                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `list_template_presets`  | Curated full-page starters (id, name, theme, ordered section ids).                               |
| `create_template`        | Scaffold a new document from a starter id **or** an explicit `sectionIds` list, then save it.    |

### Section library

| Tool            | What it does                                                                         |
| --------------- | ------------------------------------------------------------------------------------ |
| `list_sections` | The ready-made section catalogue (same as the builder); filter by `category`/`type`. |
| `get_section`   | Full definition (type, variant, props) of one section preset.                        |
| `add_section`   | Insert a section preset at an optional `index` (optionally patching its `style`).    |
| `remove_block`  | Delete a section / nested block by id.                                               |
| `move_block`    | Reorder a top-level section to a new index.                                          |

### Block / widget catalogue

Compose pages beyond the ready-made sections using the low-level block types the
builder ships (40+ types across `Core` and `Real Estate`).

| Tool               | What it does                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `list_block_types` | Every supported block type (category, variants, default prop keys); filter by `category`.            |
| `add_block`        | Insert any block `type` with your own `props`/`variant`/`style` (incl. `responsive`)/`elementStyles`. |

### Brand kits

| Tool              | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `list_brand_kits` | Saved theme + typography bundles and their directory.                                 |
| `save_brand_kit`  | Capture a document's theme + typography as a reusable kit.                            |
| `get_brand_kit`   | Full tokens of one kit.                                                               |
| `apply_brand_kit` | Apply a kit's theme + typography to a document (copy untouched).                      |

Every mutating tool accepts `siteFile` (defaults to `OP_SITE_FILE`) and `save`
(default `true`; pass `false` to preview the result without writing).

## Example agent flow

### Generate a template with AI

1. `get_ai_status` — confirm a provider is configured.
2. `generate_ai_template` `{ "prompt": "Modern 3BHK villa landing page with a private beach theme" }`
   — returns the full site and saves it to `OP_SITE_FILE`.
3. `get_site` / `list_blocks` / `get_design_tokens` — inspect what the agent produced.
4. `improve_page_design` `{ "instruction": "warmer palette, bigger headings" }`.

### Assemble from the library

1. `list_template_presets` — pick `estate-luxury`.
2. `create_template` `{ "templateId": "estate-luxury", "siteFile": "site.json" }`.
3. `list_sections` `{ "category": "Gallery" }` → `add_section` `{ "presetId": "gallery-masonry" }`.
4. `get_design_tokens` — inspect the emitted theme + typography.
5. `apply_theme_preset` `{ "presetId": "ocean" }` — swap in a dark palette.
6. `set_typography_tokens` `{ "typography": { "h1": { "desktop": { "fontSize": 64 } } } }`.
7. `save_brand_kit` `{ "name": "Ocean House" }` → reuse later with `apply_brand_kit`.
8. `improve_page_design` `{ "instruction": "warmer palette, more breathing room" }`.
