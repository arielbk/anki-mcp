# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). When releasing, bump the version in
both `package.json` and `server.json` (CI checks that they match), then publish a GitHub
release for the `vX.Y.Z` tag: the Publish workflow ships it to npm and the MCP registry.

## [Unreleased]

### Changed

- Lint warnings fixed; ESLint and Vitest ignore local worktrees.
- The Publish workflow waits for a new version to appear on npm before registering it
  with the MCP registry.

## [0.6.0] - 2026-11-27

### Changed

- **Breaking:** the 18 `gui_*` tools are merged into a single `anki_gui` tool with an
  `operation` parameter (e.g. `gui_browse` becomes `anki_gui` with `operation: "browse"`).
  It has a full description, per-parameter docs and tool annotations.
- Resources are registered with titles, descriptions and MIME types. URIs are unchanged.
- The server reports the version from `package.json` instead of a hardcoded `0.4.2`.
- HTTP mode validates the `Host` header when bound to loopback (DNS rebinding protection);
  `ALLOWED_HOSTS` configures it for other binds.
- `server.json` moved to the 2025-12-11 MCP registry schema.
- Dependencies updated (MCP SDK 1.32, zod 4.6, express 5.3, eslint 10, tsup 9, TypeScript 6).

### Fixed

- Large `create_batch` calls could crash Anki and lose the whole batch. Notes are now sent
  in chunks (`chunkSize`, default 10), and a failure partway reports which notes were saved,
  which are unknown and which to resend.
- "fetch failed" is replaced by "Couldn't reach AnkiConnect at <url>. Is Anki running?";
  after a failed write the server checks whether Anki is down or rejected the request.
- `ANKI_CONNECT_HOST` / `ANKI_CONNECT_PORT` are now honoured.
- `manage_decks delete` with `deleteCards: false` now fails clearly (AnkiConnect always
  deletes the cards).
- HTTP mode rejected every `initialize` request with "Failed to initialize session".

### Added

- `create_batch`: per-note results with the reason each failed note was rejected
  (duplicate, unknown field, empty first field, ...), top-level `deckName`/`modelName`/`tags`
  defaults, `allowDuplicate`/`duplicateScope`, `dryRun`, and duplicate detection within the batch.
  Field names match case-insensitively.
- Import notes from a file: `create_batch` with an absolute `filePath` to JSON, CSV, TSV or an
  Anki `.txt` export.
- Per-deck daily limits: `manage_decks set_limits` and `newPerDay`/`reviewsPerDay` on `create`.
  A preset shared with other decks is cloned first, so other decks are unchanged.
- `writing_good_flashcards` MCP prompt.
- `manage_models list` shows each note type's field names.
- All tools have titles and annotations (read-only, destructive, idempotent, open-world).
- Unit and integration tests (vitest).
- GitHub Actions CI (typecheck, lint, format, build, stdio smoke test) on Node 20/22/24.
- `Dockerfile` for container builds and MCP directory introspection.

### Removed

- Unused legacy per-endpoint tool modules (they were no longer registered).
- The unused `days` parameter of `study_session`.

## [0.5.0] - 2026-05-23

### Added

- Register the GUI tools (`gui_*`) on the server.
- Glama server metadata (`glama.json`) and fuller tool descriptions.

### Changed

- MCP SDK ^1.29, zod ^4, express ^5, MCP Inspector ^0.21. Node 20 or newer is required.

## [0.4.2] - 2025-10-23

### Added

- Pagination for large result sets and a richer media response format.

## [0.4.1] - 2025-10-23

### Added

- `get_media_file` tool to retrieve media as base64 (images are returned as image content).

## [0.4.0] - 2025-10-23

### Changed

- Consolidated the per-endpoint tools into a small set of high-level tools.
- Streamable HTTP transport (`--http`).
- MCP registry `server.json` and license added.

## [0.3.1] - 2025-07-08

- Expanded server functionality and development tooling.

[Unreleased]: https://github.com/arielbk/anki-mcp/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/arielbk/anki-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/arielbk/anki-mcp/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/arielbk/anki-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/arielbk/anki-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/arielbk/anki-mcp/releases/tag/v0.4.0
[0.3.1]: https://www.npmjs.com/package/@arielbk/anki-mcp/v/0.3.1
