# 🧠 Anki MCP

[![NPM Package anki-mcp](https://img.shields.io/npm/v/@arielbk/anki-mcp.svg)](https://npmjs.com/package/@arielbk/anki-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/arielbk/anki-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/arielbk/anki-mcp/actions/workflows/ci.yml)
[![anki-mcp MCP server](https://glama.ai/mcp/servers/arielbk/anki-mcp/badges/score.svg)](https://glama.ai/mcp/servers/arielbk/anki-mcp)
<br />
<a href="https://glama.ai/mcp/servers/arielbk/anki-mcp">
<img width="380" height="200" src="https://glama.ai/mcp/servers/arielbk/anki-mcp/badge" alt="Anki MCP server" />
</a>

Transform your Anki flashcard experience with AI! This [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server bridges your Anki flashcard collection with AI assistants like Claude, enabling natural conversations about your study materials.

## 🚀 What Can You Do?

Imagine having an AI tutor that knows your entire flashcard collection and can:

### 📚 **Interactive Learning**

- _"Quiz me on Japanese vocabulary I haven't seen in 3 days"_
- _"Test me on challenging cards from my medical deck"_
- _"Show me cards I've been struggling with recently"_

### ✨ **Smart Content Creation**

- _"Create flashcards about photosynthesis with diagrams"_
- _"Turn this PDF chapter into spaced repetition cards"_
- _"Generate cloze deletion cards from my lecture notes"_

### 🔍 **Powerful Analytics**

- _"Which topics am I struggling with most?"_
- _"Show me my study patterns for the last month"_
- _"What's my retention rate for different card types?"_

### 🎯 **Bulk Operations**

- _"Tag all my chemistry cards with 'exam-prep'"_
- _"Move cards with low retention to an intensive review deck"_
- _"Find and fix duplicate cards across my decks"_

## 🎯 Features

- **🎯 Smart Tool Design**: Intuitive, high-level tools designed specifically for AI agents
- **💬 Natural Conversations**: Talk to Claude about your flashcards like you would a study buddy
- **⚡ Lightning Fast**: Efficient operations that don't bog down your AI assistant
- **📦 Bulk Operations**: Update thousands of cards at once with simple commands
- **📊 Study Insights**: Deep analytics on your learning progress and patterns
- **🎨 Rich Media**: Full support for images, audio, and other media in your cards
- **🔍 Powerful Search**: Leverage Anki's advanced search syntax through natural language
- **🔒 Rock Solid**: Fully typed TypeScript with comprehensive error handling

## 🛠 Technical Stack

- **[Node.js](https://nodejs.org/)**: Runtime environment (20+ required)
- **[TypeScript](https://www.typescriptlang.org/)**: Type safety and developer experience
- **[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: Model Context Protocol implementation
- **[yanki-connect](https://www.npmjs.com/package/yanki-connect)**: 🙏 _Fully-typed, isomorphic AnkiConnect API client_
- **[tsup](https://github.com/egoist/tsup)**: Fast TypeScript bundler
- **[PNPM](https://pnpm.io/)**: Efficient package manager

_Special thanks to the [yanki-connect](https://github.com/kitschpatrol/yanki-connect) library for providing the robust AnkiConnect interface that powers this integration!_

## 📋 Prerequisites

### 1. Install Anki and Node.js

Download and install [Anki](https://apps.ankiweb.net/) if you haven't already, plus [Node.js](https://nodejs.org/) 20 or newer.

### 2. Install AnkiConnect Plugin

1. Open Anki
2. Go to **Tools** → **Add-ons**
3. Click **Get Add-ons...**
4. Enter code: `2055492159`
5. Restart Anki

> **📋 Version Requirements:** This server requires AnkiConnect version 25.2.25.0 or newer (released 2025-02-25) for full compatibility. Most features work with older versions, but we recommend updating for the best experience.

### 3. Configure AnkiConnect (Optional)

AnkiConnect works out of the box, but you can customize settings:

1. Go to **Tools** → **Add-ons**
2. Select **AnkiConnect** and click **Config**
3. Default settings should work fine for most users

## 🚀 Quick Start

### Option 1: Use with Claude Desktop (Recommended)

1. **Configure Claude Desktop**

   Edit your Claude Desktop configuration file:

   **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   Add this configuration (`npx` downloads and runs the latest release):

   ```json
   {
     "mcpServers": {
       "anki": {
         "command": "npx",
         "args": ["-y", "@arielbk/anki-mcp"]
       }
     }
   }
   ```

2. **Or install globally** if you prefer a fixed version on your machine:

   ```bash
   npm install -g @arielbk/anki-mcp
   ```

   and use `"command": "anki-mcp"` with `"args": []` in the config above.

3. **Restart Claude Desktop**

4. **Start using it!**
   - Make sure Anki is running with AnkiConnect enabled
   - Ask Claude: _"Show me my Anki decks"_ or _"Quiz me with 5 cards"_

> **💡 Pro Tip:** You can test your setup by asking Claude simple questions like _"How many Anki decks do I have?"_ or _"What's in my largest deck?"_

### Use with Claude Code

```bash
claude mcp add --scope user anki -- npx -y @arielbk/anki-mcp
```

The tools only appear in a **newly started** Claude Code session; `/clear` is not enough. Run `/mcp` to check that `anki` is connected.

### Option 2: Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/arielbk/anki-mcp.git
   cd anki-mcp
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build the project**

   ```bash
   pnpm build
   ```

4. **Test the server**
   ```bash
   # Use the MCP inspector to test functionality
   pnpm inspect
   ```

### Option 3: Use with Other MCP Clients

This server works with any MCP-compatible client. You can also use it with:

- **[MCP Inspector](https://github.com/modelcontextprotocol/inspector)**: Interactive debugging tool
- **[Cline](https://github.com/clinebot/cline)**: VS Code extension for AI coding
- **Custom MCP clients**: Build your own using the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)

For stdio transport, run:

```bash
node dist/index.js
```

For localhost HTTP (Streamable HTTP) transport, run:

```bash
node dist/index.js --http --host=127.0.0.1 --port=3000
# The MCP endpoint will be at http://127.0.0.1:3000/mcp
```

Clients that support Streamable HTTP can connect directly. Legacy SSE clients may still work via client-side fallback.

When bound to a loopback address (the default), the HTTP server rejects requests whose `Host` header is not `localhost`, `127.0.0.1` or `[::1]` (DNS rebinding protection). If you bind to another interface, set `ALLOWED_HOSTS` to a comma-separated list of hostnames to keep that check.

### Option 4: Container

The repository includes a `Dockerfile`. It works with any OCI-compatible container tool, such as Podman or Rancher Desktop with the `docker`/`nerdctl` CLI:

```bash
podman build -t anki-mcp .
podman run -i --rm anki-mcp
```

AnkiConnect must be reachable from inside the container for tool calls to work. Listing tools and resources works without it.

## 🎮 Usage Examples

Once configured with Claude Desktop, you can have natural conversations like:

### 📖 Study Sessions

```
You: "I have a Japanese exam tomorrow. Can you quiz me on Hiragana cards I haven't reviewed in a week?"

Claude: I'll find your Hiragana cards that need review and start a quiz session...
```

### 📝 Content Creation

```
You: "Create flashcards for the major battles of World War II with dates and significance"

Claude: I'll create comprehensive flashcards covering the key WWII battles...
```

### 📊 Study Analytics

```
You: "How am I doing with my medical terminology deck? Show me my weak areas."

Claude: Let me analyze your performance on the medical terminology deck...
```

### 🏷️ Organization

```
You: "Tag all cards about cardiovascular system with 'cardiology' and move them to my MCAT prep deck"

Claude: I'll help you organize those cards...
```

## 🔧 Available Tools

The server provides **8 high-level tools**. Each takes an `operation` parameter, so a handful of tools covers the whole AnkiConnect API:

### 📝 **Manage Flashcards** (`manage_flashcards`)

Create, update, delete, and search your flashcards. Perfect for content creation, bulk updates, and organization.

#### Batch creation (`create_batch`)

- **Defaults:** top-level `deckName`, `modelName` and `tags` apply to every note. A note's own `deckName`/`modelName` override the defaults; its `tags` are added to the default tags.
- **Chunking:** notes are sent one chunk at a time (`chunkSize`, default 10, max 50) with a short pause between chunks, so large imports don't overload Anki.
- **Per-note results:** every note is reported as `#n "first 40 chars of the first field"` with its new note ID or the reason it failed (duplicate, unknown note type, wrong field names, empty first field, ...).
- **Partial failure:** if Anki stops responding partway, the batch stops and reports which notes were saved, which chunk may or may not have been saved, and which notes to resend.
- **Duplicates:** `allowDuplicate: true` allows notes whose first field already exists; `duplicateScope: "deck"` checks for duplicates only in the target deck (default: whole collection).
- **Dry run:** `dryRun: true` validates every note (note type, field names, duplicates) without writing anything.

#### Import from a file

Instead of `notes`, pass `filePath` (absolute path) to a `.json`, `.csv` or `.tsv` file. An agent can draft cards to a file for you to review, then import them in one call without sending every card through the conversation.

- **JSON:** an array of notes, same shape as `notes`: `[{ "fields": { "Front": "...", "Back": "..." }, "tags": ["x"] }]`
- **CSV / TSV:** the header row holds the field names. Optional `tags` (space-separated), `deck` and `model` columns set those per row. Quoted fields may contain commas, tabs, newlines and `""` for a literal quote.

```csv
Front,Back,tags
"What does <code>Array.prototype.map</code> return?",A new array,js arrays
Capital of France,Paris,geography
```

```json
{
  "operation": "create_batch",
  "filePath": "/Users/me/cards.csv",
  "deckName": "Interview prep",
  "modelName": "Basic",
  "dryRun": true
}
```

### 🎯 **Study Sessions** (`study_session`)

Run interactive quiz sessions, manage card scheduling, and track which cards need review.

### 📚 **Manage Decks** (`manage_decks`)

Create and organize decks, move cards around, and configure deck settings.

#### Per-deck daily limits

Decks usually share an options preset (e.g. "Default"), so changing it changes every deck that uses it. To give one deck its own limits, use `create` with `newPerDay` / `reviewsPerDay`, or `set_limits` on an existing deck:

```json
{ "operation": "set_limits", "deckName": "Interview prep", "newPerDay": 15 }
```

If the deck uses a shared preset, it is cloned into a new preset named after the deck, assigned to that deck only, and then changed. Other decks are not affected.

### 📊 **Get Analytics** (`get_analytics`)

Dive into your study statistics, review history, and learning patterns.

### 🎨 **Manage Models** (`manage_models`)

Customize note types, add fields, modify templates, and style your cards. `list` shows each note type's field names, so agents don't have to guess `Front`/`Back`.

### 🔧 **Anki Operations** (`anki_operations`)

Handle sync, media files, imports/exports, and other utility operations.

### 🖼️ **Get Media File** (`get_media_file`)

Retrieve media files (images, audio, etc.) from your Anki collection. AI assistants can analyze images directly (though they won't display in the UI).

### 🖥️ **Anki GUI** (`anki_gui`)

Drive the Anki desktop app: open the Card Browser with a search, open pre-filled Add Cards or Edit dialogs, start a deck review and answer cards on screen, or read the current card and the browser selection. These operations change what is shown in Anki (and `exit_anki` quits it), so prefer the other tools for anything that doesn't need the UI.

> **Upgrading from 0.5.x:** the separate `gui_*` tools were merged into `anki_gui`. `gui_browse` is now `anki_gui` with `operation: "browse"`, and so on.

### 📚 Resources

The server also exposes read-only MCP resources under `anki:///` (deck names, note types, card and note details, review statistics) for clients that support resources.

## ✍️ Prompt: writing good flashcards

The server also provides an MCP prompt, `writing_good_flashcards` (optional `topic` argument), with guidelines for effective cards: the minimum information principle, one fact per card, no yes/no questions, several angles on one idea, one cloze per list item in a fixed order, and only making cards for material you already understand. It is based on Andy Matuschak's [How to write good prompts](https://andymatuschak.org/prompts/) and SuperMemo's [Twenty rules of formulating knowledge](https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge). In Claude Code it is available as a slash command (`/mcp__anki__writing_good_flashcards`).

> **💡 Pro Tip:** Many operations support pagination to prevent overwhelming your context window. Use `limit` and `offset` parameters when working with large result sets.

## 🛠 Development

```bash
# Run in development mode with auto-reloading
pnpm dev

# Type-check, lint and check formatting (what CI runs)
pnpm typecheck
pnpm lint
pnpm format:check

# Run unit tests (AnkiConnect is mocked; tests never touch your collection)
pnpm test

# Format the code
pnpm format

# Test with MCP inspector
pnpm inspect
```

## 🔧 Configuration

### AnkiConnect Settings

The server connects to AnkiConnect on `localhost:8765` by default. If you've customized your AnkiConnect configuration, you may need to adjust the connection settings.

**Important**: Make sure Anki is running and AnkiConnect is installed before using the MCP server. The server will fail to connect if AnkiConnect is not accessible.

> **💡 Note:** The underlying yanki-connect library supports auto-launching Anki on macOS, but this feature is not currently exposed in the MCP server configuration. You'll need to start Anki manually.

### Claude Desktop Advanced Configuration

For advanced users, you can pass additional parameters:

```json
{
  "mcpServers": {
    "anki": {
      "command": "anki-mcp",
      "args": ["--verbose"],
      "env": {
        "ANKI_CONNECT_HOST": "localhost",
        "ANKI_CONNECT_PORT": "8765"
      }
    }
  }
}
```

### Troubleshooting

**Common Issues:**

- **"Failed to connect to AnkiConnect"**: Ensure Anki is running and AnkiConnect plugin is installed
- **"Couldn't reach AnkiConnect at http://127.0.0.1:8765. Is Anki running?"**: Anki is not running or quit during the last operation. Restart it; if a `create_batch` was interrupted, its result lists which notes were saved and which to resend.
- **"No decks found"**: Make sure you have at least one deck in Anki
- **Claude doesn't respond**: Restart Claude Desktop after configuration changes
- **Permission errors**: Check that the global npm install worked correctly with `npm list -g @arielbk/anki-mcp`

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📜 License

MIT - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[yanki-connect](https://github.com/kitschpatrol/yanki-connect)** - Excellent TypeScript client for AnkiConnect
- **[AnkiConnect](https://github.com/FooSoft/anki-connect)** - The plugin that makes Anki automation possible
- **[Model Context Protocol](https://modelcontextprotocol.io)** - Enabling seamless AI integrations

---

_Transform your flashcard experience with AI-powered conversations! 🚀_
