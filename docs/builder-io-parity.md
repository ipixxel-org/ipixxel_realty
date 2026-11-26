# Builder.io parity study and OpenPage implementation notes

This document records the reverse-engineering study of Builder.io's publicly
documented visual editor and how each capability maps onto the existing
BigEstate / iPixxel Realty OpenPage builder.

Reference material used for the study:

- Builder.io public documentation and editor behaviour (visual editor, layers,
  responsive styles, data binding, symbols, publishing).
- Open-source reverse-engineering catalogues and community notes
  (`awesome-reverse-engineer-anything`, `rea`).
- The existing OpenPage source in `frontend/components/openpage`,
  `frontend/lib/openpage`, `backend/src/modules/ai`,
  `backend/src/modules/org-landing-pages` and `backend/mcp-dev-template`.

OpenPage is **not** replaced. Every change in this pass extends the existing
editor, stores, block registry, APIs and tenant-scoped persistence.

## Architecture map

| Builder.io concept | OpenPage implementation |
| --- | --- |
| Visual canvas + drag/drop | `editor/Canvas.tsx`, dnd-kit sortable blocks, `lib/openpage/drag-payload.ts` |
| Layers / component tree | `editor/LayersPanel.tsx`, `editor/NavigatorTree.tsx`, `lib/openpage/block-tree.ts` |
| Style panel | `editor/StylePanel.tsx`, `DesignPanel.tsx`, `TypographyPanel.tsx`, `ElementStylePanel.tsx`, `lib/openpage/block-style.ts` |
| Responsive editing | `DeviceProvider`, per-device style maps (`desktop`/`tablet`/`mobile`), `hideOn*` flags |
| Symbols / global sections | `GlobalWidget` in the config store + `AdvancedPanel` save/unlink |
| Content entries / data binding | `DynamicDataPicker`, `{{token}}` binding via `applyVarsDeep`, property defaults in `SiteRenderer` |
| Conditional rendering | `lib/openpage/conditional-render.ts` + Advanced panel rules |
| Templates / presets | `lib/openpage/section-presets.ts`, `page-templates.ts`, Super Admin template resource |
| Undo / redo | Config store history stacks, keyboard shortcuts, top bar controls |
| Autosave / version history | Debounced `saveTemplate`, local backup, `editor/VersionHistory.tsx`, page revisions API |
| SEO / preview / publish | `lib/openpage/seo.ts`, Page Settings, preview routes, publish/unpublish APIs |
| AI generation | `AiTemplateModal`, `GenerateSectionModal`, backend `ai` module |
| AI component editing | `SectionAiAssistant` (quick actions + natural-language instruction) |
| MCP for agents | `backend/mcp-dev-template` server (design tokens + AI tools + page SEO) |

## Feature status

### Already present before this pass

- Nested containers and columns with per-column width, mobile width, flex
  layout, backgrounds, padding and radius.
- Multi-select, duplicate, copy/paste style, block context menus, navigator,
  command palette, alignment grid and device preview.
- Theme/design tokens, typography sets, custom scoped CSS, entrance animations.
- Autosave with error surfacing, manual save, undo/redo, revision history and
  server-side page revisions for org landing pages.
- SEO settings, preview, publish/unpublish, activity feed.
- AI template generation and section regeneration.
- Tenant-scoped landing page persistence (`orgId` on every backend query).

### Added or completed in this pass

1. **AI section generation UI** – `GenerateSectionModal` is now reachable from
   the canvas toolbar and the AI tab. It calls `POST /ai/generate-section`,
   inserts the returned block through the normal `addBlock` history entry, and
   selects it.
2. **Natural-language component editing** – `SectionAiAssistant` now uses
   `POST /ai/edit-component`. When an element is deep-selected on the canvas,
   the instruction targets that element id; otherwise it edits the whole block.
   Quick actions still use the existing regenerate endpoint.
3. **MCP bridge discoverability** – `McpBridgeModal` is available from the
   canvas toolbar and the Help panel, documenting stdio and HTTP MCP setup plus
   the available tools.
4. **Nested conditional rendering** – conditions are now evaluated for blocks
   inside columns as well as top-level blocks through a renderer-only
   `ConditionalRenderProvider`. The editor canvas keeps rendering hidden blocks
   so they remain editable.
5. **Structured conditions take precedence** over the legacy `showIf` string,
   and editing a rule retires the old expression. Common property fields are
   offered as autocomplete suggestions.
6. **Properties and tests** – added unit coverage for token binding and
   conditional rules, and fixed pre-existing TypeScript errors in the admin
   leads and marketing pages that blocked a production typecheck.

## Security and tenant isolation

- AI endpoints remain behind `JwtAuthGuard`; page generation resolves projects
  with `{ id, orgId }` so one tenant cannot ask the AI to read another tenant's
  project.
- The editor and renderer only read the site document they are handed by the
  org landing page loader; no cross-org ids are introduced by the new UI.
- MCP uses an explicit bearer token (`OP_API_TOKEN`). It must be issued to the
  intended organisation/user; the server is a local developer bridge, not a
  public endpoint.
- Conditional rendering only hides presentation output. It is not an
  authorisation mechanism and must never gate private data.

## Known gaps / roadmap

- MCP page-management tools still operate on local `siteFile` JSON documents.
  A DB-backed MCP transport that lists/creates/publishes org landing pages
  through the REST API would remove the file copy step.
- AI generation is intentionally limited to Super Admin template scope to match
  the existing platform-owned AI provider configuration.
- Builder.io-style A/B tests and content entry scheduling are not implemented;
  the current publish/unpublish and revision model should be extended first.
