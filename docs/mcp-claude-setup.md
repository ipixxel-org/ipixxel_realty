# Connecting OpenPage MCP to Claude

This guide covers connecting **Claude Desktop** to the OpenPage MCP server from
the Super Admin console, then using it to generate and edit OpenPage templates
with Claude.

Everything is configured in the console — there are no `MCP_*` variables to add
to the backend `.env`. The backend stores the connection settings in the
runtime-created `identity.mcp_settings` table and mints a normal access JWT for
the signed-in Super Admin.

---

## What you get

Claude gets tools that talk to the same `/ai/*` endpoints the builder uses:

- Generate a complete, token-driven page template from a prompt.
- Read and update the saved design document.
- List templates, sections, blocks and design tokens.
- Apply theme presets and brand kits.
- Regenerate copy for a single section.
- Improve an existing page design without changing copy.
- Update page SEO.

Generated designs are saved to the configured **design file** so Claude can keep
editing the same document across prompts.

---

## Before you start

1. The backend API is running and reachable at the URL shown in the console
   (default `http://127.0.0.1:3000`).
2. An AI design provider is configured under **Super Admin → AI settings**. Run
   `get_ai_status` from Claude later to confirm.
3. You are signed in as a user with the **`super_admin`** role. Other platform
   roles cannot load the connection.
4. Claude Desktop is installed.

---

## 1. Open the MCP page

Go to **Super Admin → Integrations → MCP for Claude**
(`/admin-console/integrations/mcp`).

The page has two cards:

- **Connection settings** — editable paths, API URL and token lifetime.
- **OpenPage MCP server** — the generated config, token and setup steps.

---

## 2. Review the connection settings (optional)

The settings card is prefilled with auto-detected defaults. Blank a field to
fall back to its default, then choose **Save settings**.

| Setting | Default | Notes |
| --- | --- | --- |
| Backend API URL | `http://127.0.0.1:3000` | Where the MCP server calls `/ai/*`. |
| Token lifetime | `90d` | Include a unit: `90d`, `12h`, `30m`, etc. |
| Node command | `node` | Change only for a custom runtime. |
| TSX runner path | `<backend>/node_modules/tsx/dist/cli.mjs` | Absolute path. |
| MCP server entry | `<backend>/mcp-dev-template/src/index.ts` | Absolute path. |
| Design file | `<backend>/mcp-dev-template/site.json` | Created on first save, git-ignored. |
| Brand kits directory | `<backend>/mcp-dev-template/brand-kits` | Created on first save, git-ignored. |
| Claude config file | `%APPDATA%/Claude/claude_desktop_config.json` on Windows; `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS; `~/.config/Claude/claude_desktop_config.json` on Linux | Shown in the setup steps. |

**Reset to defaults** clears every override. Saving settings also refreshes the
connection card below, so the generated config immediately uses the new values.

> The backend root is detected from the process working directory. If the API
> was started from the repo root, the service falls back to `<cwd>/backend`.

---

## 3. Copy the generated config

In the **OpenPage MCP server** card:

1. Check the token expiry and the paths under **Server paths**.
2. Click **Copy JSON** (or **Download**).
3. Optionally click **Copy path** to copy the Claude config file location.

The JSON looks like this (paths depend on the settings above):

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
        "OP_API_BASE_URL": "http://127.0.0.1:3000",
        "OP_API_TOKEN": "<minted JWT>",
        "OP_SITE_FILE": "C:/laragon/www/ipixxel_realty/backend/mcp-dev-template/site.json",
        "OP_BRAND_KIT_DIR": "C:/laragon/www/ipixxel_realty/backend/mcp-dev-template/brand-kits"
      }
    }
  }
}
```

---

## 4. Add it to Claude Desktop

Open the Claude Desktop config file for your OS:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

If the file does not exist, create it. Merge the `mcpServers.openpage` entry into
any existing `mcpServers` object — do not replace other servers you already have.

---

## 5. Restart Claude and verify

1. Fully quit and reopen Claude Desktop.
2. Start a new chat and ask: **“List the OpenPage design tools.”**
3. Claude should show tools such as `generate_ai_template`, `get_site`,
   `list_sections` and `improve_page_design`.
4. Confirm the AI provider with: **“Run get_ai_status.”**

If the tools are missing, see [Troubleshooting](#troubleshooting).

---

## Using it

Example prompts:

| Goal | Prompt |
| --- | --- |
| Generate a page | “Generate a modern 3BHK villa landing page with a warm coastal theme.” |
| Inspect the result | “Read the saved site and summarise the sections.” |
| Change the look | “Apply the Ocean theme preset and a serif heading font.” |
| Rewrite one section | “Regenerate the hero section copy to be shorter and more premium.” |
| Tune the design only | “Improve the page design with more spacing and softer corners, keep the copy.” |
| Update SEO | “Set the page title and meta description for this villa landing page.” |
| Save a reusable style | “Save the current theme and typography as a brand kit called coastal.” |

By default, mutating tools save to the configured design file. Pass
`save: false` in a tool call to preview without writing.

### Tool reference

| Tool | Purpose |
| --- | --- |
| `generate_ai_template` | AI-generate a full template; returns and saves the site. |
| `get_site` | Read the full saved design document. |
| `get_ai_status` | Show the configured AI provider/model and whether it is ready. |
| `improve_page_design` | Re-theme an existing document without changing copy. |
| `generate_ai_section` | Generate one section with AI and insert it. |
| `regenerate_section` | Rewrite/improve one block’s copy and merge it back. |
| `edit_ai_component` | Edit a single component with AI. |
| `list_template_presets` / `create_template` | List and create starter templates. |
| `list_sections` / `get_section` / `add_section` | Inspect and add section presets. |
| `list_blocks` / `add_block` / `remove_block` / `move_block` | Manage page blocks. |
| `list_block_types` | Show available block types. |
| `get_design_tokens` / `set_theme_tokens` / `set_typography_tokens` | Read and write design tokens. |
| `apply_theme_preset` | Apply a built-in theme preset. |
| `list_brand_kits` / `get_brand_kit` / `save_brand_kit` / `apply_brand_kit` | Manage reusable theme/typography bundles. |
| `set_block_style_tokens` | Set per-block style tokens. |
| `get_page_seo` / `set_page_seo` | Read and update page SEO. |

---

## Where files live

- **Design file** — the default `backend/mcp-dev-template/site.json`. It is
  git-ignored and created automatically on first save.
- **Brand kits** — the default `backend/mcp-dev-template/brand-kits/`. Also
  git-ignored.
- Change either location in **Connection settings**; the paths are written into
  the generated config.

---

## Security and tokens

- The token is a normal OpenPage access JWT for your Super Admin account.
- Treat it like a password: anyone with it can edit designs as you.
- Default lifetime is 90 days; change it under **Connection settings**.
- **Regenerate token** mints a fresh token. Previously issued tokens remain
  valid until they expire; they are not revoked.
- If you rotate `JWT_SECRET`, all existing MCP tokens stop working — regenerate
  the config.

`JWT_SECRET` is the only MCP-related value still read from the backend `.env`;
it is required to sign access tokens.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Claude shows no OpenPage tools | Confirm the JSON is valid, the entry is nested under `mcpServers`, and Claude was fully restarted. |
| `node` not found | Install Node.js or set **Node command** to the absolute `node` executable. |
| `Cannot find module .../tsx/dist/cli.mjs` | Re-run `npm install` in `backend/`, or correct **TSX runner path**. |
| `Cannot find module .../src/index.ts` | Correct **MCP server entry** in the settings. |
| `401` / “Authentication is not configured” | `JWT_SECRET` is missing in the backend `.env`; restart the backend. |
| Token expired | Regenerate the connection and update the config. |
| AI tools fail | Configure a provider in **Super Admin → AI settings**, then run `get_ai_status`. |
| Backend unreachable | Start the API or fix **Backend API URL**. |
| Design not saved | Check **Design file** is writable; the directory is created automatically. |

To see the server’s own errors, run it manually from the backend:

```bash
npm run mcp
```

Claude Desktop normally captures MCP logs in its own log directory.

---

## Optional: run the MCP server over HTTP

For debugging without Claude, the same server can run over HTTP:

```bash
# from backend/
OP_MCP_TRANSPORT=http OP_MCP_PORT=7801 npm run mcp
# MCP endpoint: http://127.0.0.1:7801/mcp   health: http://127.0.0.1:7801/health
```

Set `OP_API_BASE_URL` and `OP_API_TOKEN` in the environment for AI tools. The
console connection uses stdio and does not need these.

---

## For developers

Endpoints (Super Admin only):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/admin/integrations/mcp/connection` | Mint a token and return the Claude config. |
| `GET` | `/admin/integrations/mcp/settings` | Effective settings plus their source. |
| `PUT` | `/admin/integrations/mcp/settings` | Save overrides; blank fields reset to defaults. |
| `POST` | `/admin/integrations/mcp/settings/reset` | Delete overrides and use defaults. |

Storage: single row in `identity.mcp_settings`, created at runtime (no Prisma
migration). Implementation:

- `backend/src/modules/mcp/mcp-settings.service.ts`
- `backend/src/modules/mcp/mcp.service.ts`
- `backend/src/modules/mcp/admin-mcp.controller.ts`
- `backend/mcp-dev-template/src/` (the MCP server and tools)
- `frontend/components/superadmin/mcp-connection.tsx`
- `frontend/components/superadmin/mcp-settings-form.tsx`

Useful checks:

```bash
# backend
npm run build
npm run mcp:typecheck

# frontend
npx tsc --noEmit -p tsconfig.json
npx vitest run components/superadmin/integrations
```
