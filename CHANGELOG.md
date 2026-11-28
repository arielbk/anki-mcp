# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). When releasing, bump the version in
both `package.json` and `server.json` (CI checks that they match), then publish a GitHub
release for the `vX.Y.Z` tag: the Publish workflow ships it to npm and the MCP registry.

## [Unreleased]

### Added

- `manage_flashcards` `find` takes `include` (`fields`, `tags`, `deck`, `model`, `cards`,
  `state`) to choose what each note carries, plus `maxFieldChars` (default 120) for field
  text, which now has its HTML stripped. `state` reports each card's queue, interval, due
  date, reps, lapses and ease.
- `find` `groupBy` (`tag`, `deck`, `model`, `state`) returns counts over all matches
  (notes, cards, new and seen per group) instead of a listing.
- `find` `format: "json"` returns single-line JSON.
- `manage_decks` `get_stats` accepts `deckNames` (an array) as well as `deckName`.
- `get_analytics` scope `deck_overview`: one call for a deck's counts (seen vs unseen), its
  preset's daily limits, the date the unseen cards run out at the new/day limit, recent
  retention and the top tags by Again count.
- `get_analytics` scope `trouble_cards`: cards answered Again in the last `days`, grouped by
  tag, with the worst cards listed.
- `reviews_by_day` takes `days` (default 30), `since` and `deckName`, and returns one
  `YYYY-MM-DD: n` line per day, zero days included, plus a total.

### Changed

- `find` output is compact by default: one line per note with truncated field text, instead
  of IDs only (`include: []`) or pretty-printed JSON (`includeDetails`). Every listing shows
  the total and the next offset. Output is capped at about 20k characters, with a hint to
  narrow the query. `includeDetails: true` still works and now means every `include` option.
- `get_stats` returns one line per deck instead of pretty-printed JSON.
- `collection_stats` returns structured JSON (studied today, card counts, correct % by card
  type, due forecast, intervals) instead of Anki's HTML report, and takes `deckName`
  instead of depending on the deck selected in Anki. `wholeCollection` is ignored.
- `card_reviews` prints one line per review and returns a summary with narrowing hints when
  there are more than `limit` (default 300) reviews. Other scopes return unindented JSON.
- Deck-scoped analytics reject unknown deck names with a "did you mean" hint before calling
  AnkiConnect, since `getDeckStats` and `cardReviews` silently create missing decks.
- `card_reviews` includes subdecks of `deckName`, like the other deck-scoped scopes.

### Fixed

- `get_stats` matches results by deck ID, so subdecks with the same leaf name
  (`Spanish::Verbs`, `French::Verbs`) no longer get each other's numbers.
- Deck-scoped analytics include reviews of the deck's cards that are currently in a
  filtered deck.
- `collection_stats` and `deck_overview` count buried learning cards as learning, so the
  totals no longer drop them.

- `get_stats` no longer creates a deck when given a name that doesn't exist. AnkiConnect's
  `getDeckStats` creates unknown decks, so names are now checked first and missing ones
  reported.

## [1.1.0] - 2026-11-27

### Changed

- First 1.x release; the code is the same as 0.7.0. The version skips 1.0.0 because the
  Glama MCP directory already holds an auto-generated 1.0.0 release for this server,
  which would otherwise rank above every 0.x release.

## [0.7.0] - 2026-11-27

### Added

- Support for the stateless MCP 2026-07-28 revision (`server/discover`, per-request
  `_meta` envelope) over both stdio and HTTP. 2025-era clients that use the `initialize`
  handshake keep working unchanged.

### Changed

- Migrated from `@modelcontextprotocol/sdk` 1.x to the v2 SDK packages
  (`@modelcontextprotocol/server`, `/node`, `/express`). Tool names, descriptions,
  annotations, resource URIs and prompt names are unchanged. Tool input schemas now
  declare JSON Schema draft 2020-12 (the MCP default) instead of draft-07, and tools no
  longer advertise `execution.taskSupport`.
- **Breaking-ish (HTTP mode only):** HTTP mode is now stateless. No `Mcp-Session-Id` is
  issued, each request is served by a fresh server instance, and `GET`/`DELETE /mcp`
  (2025 session operations) return `405`. Clients that follow the spec handle this; one
  that requires a session ID will need updating. stdio mode is unaffected.
- HTTP mode on loopback now also rejects a browser `Origin` header from a foreign host;
  requests without an `Origin` header are still accepted.
- Shutdown messages go to stderr instead of stdout.
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

[Unreleased]: https://github.com/arielbk/anki-mcp/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/arielbk/anki-mcp/compare/v0.7.0...v1.1.0
[0.7.0]: https://github.com/arielbk/anki-mcp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/arielbk/anki-mcp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/arielbk/anki-mcp/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/arielbk/anki-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/arielbk/anki-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/arielbk/anki-mcp/releases/tag/v0.4.0
[0.3.1]: https://www.npmjs.com/package/@arielbk/anki-mcp/v/0.3.1
