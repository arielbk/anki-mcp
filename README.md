# 🧠 Anki MCP

[![NPM Package anki-mcp](https://img.shields.io/npm/v/@arielbk/anki-mcp.svg)](https://npmjs.com/package/@arielbk/anki-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
<br />
<a href="https://glama.ai/mcp/servers/@arielbk/anki-mcp">
<img width="380" height="200" src="https://glama.ai/mcp/servers/@arielbk/anki-mcp/badge" alt="Anki MCP server" />
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

- **🎯 Domain-Aware Tools**: 6 high-level tools designed for AI agents (vs. 100+ low-level endpoints)
- **💬 Conversational Interface**: Natural language commands through your AI assistant
- **⚡ Context-Efficient**: Minimal prompt clutter while maintaining full functionality
- **📦 Bulk Operations**: Efficiently manage thousands of cards at once
- **📊 Real-time Statistics**: Get insights into your learning progress
- **🎨 Media Support**: Handle images, audio, and other media in your cards
- **🔍 Advanced Querying**: Find cards using Anki's powerful search syntax
- **🔒 Type Safety**: Fully typed API with comprehensive error handling
- **✨ MCP Best Practices**: Follows 2025 Model Context Protocol design guidelines

## 🛠 Technical Stack

- **[Node.js](https://nodejs.org/)**: Runtime environment (18+ required)
- **[TypeScript](https://www.typescriptlang.org/)**: Type safety and developer experience
- **[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: Model Context Protocol implementation
- **[yanki-connect](https://www.npmjs.com/package/yanki-connect)**: 🙏 _Fully-typed, isomorphic AnkiConnect API client_
- **[tsup](https://github.com/egoist/tsup)**: Fast TypeScript bundler
- **[PNPM](https://pnpm.io/)**: Efficient package manager

_Special thanks to the [yanki-connect](https://github.com/kitschpatrol/yanki-connect) library for providing the robust AnkiConnect interface that powers this integration!_

## 📋 Prerequisites

### 1. Install Anki

Download and install [Anki](https://apps.ankiweb.net/) if you haven't already.

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

1. **Install the package**

   ```bash
   npm install -g @arielbk/anki-mcp
   ```

2. **Configure Claude Desktop**

   Edit your Claude Desktop configuration file:

   **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   Add this configuration:

   ```json
   {
     "mcpServers": {
       "anki": {
         "command": "anki-mcp",
         "args": []
       }
     }
   }
   ```

3. **Restart Claude Desktop**

4. **Start using it!**
   - Make sure Anki is running with AnkiConnect enabled
   - Ask Claude: _"Show me my Anki decks"_ or _"Quiz me with 5 cards"_

> **💡 Pro Tip:** You can test your setup by asking Claude simple questions like _"How many Anki decks do I have?"_ or _"What's in my largest deck?"_

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

This MCP server provides **6 powerful, domain-aware tools** designed following MCP best practices for optimal AI agent interaction:

### 1. 📝 **`manage_flashcards`**
Create, update, delete, and search flashcards (notes and cards)
- **Operations**: `create`, `create_batch`, `update`, `delete`, `find`, `get_info`, `add_tags`, `remove_tags`, `clear_empty`
- **Use cases**: Content creation, bulk updates, tag management, searching

### 2. 🎯 **`study_session`**
Interactive quiz and review operations
- **Operations**: `find_due`, `answer`, `suspend`, `unsuspend`, `check_status`, `forget`, `relearn`
- **Use cases**: Quiz sessions, card scheduling, review management

### 3. 📚 **`manage_decks`**
Deck creation, configuration, and organization
- **Operations**: `create`, `delete`, `list`, `get_stats`, `move_cards`, `get_config`, `set_config`
- **Use cases**: Deck management, card organization, configuration

### 4. 📊 **`get_analytics`**
Statistics and learning insights
- **Operations**: `deck_stats`, `collection_stats`, `reviews_by_day`, `reviews_today`, `card_reviews`, `card_details`
- **Use cases**: Progress tracking, performance analysis, study insights

### 5. 🎨 **`manage_models`**
Note type (model) configuration
- **Operations**: `list`, `create`, `add_field`, `remove_field`, `rename_field`, `add_template`, `remove_template`, `update_styling`
- **Use cases**: Template customization, note type design

### 6. 🔧 **`anki_operations`**
Utility operations (sync, media, export/import)
- **Operations**: `sync`, `version`, `export_deck`, `import_package`, `store_media`, `retrieve_media`, `delete_media`, `list_media`, `get_profiles`
- **Use cases**: Syncing, media management, backups

### 🌟 **Why 6 Tools Instead of 100+?**

Following MCP best practices, we've consolidated 102+ low-level API endpoints into 6 high-level, domain-aware tools that are:
- **Easier for AI agents to understand and use**
- **More context-efficient** (less clutter in prompts)
- **Better organized by use case** rather than API structure
- **Fully backward compatible** via the underlying yanki-connect library

## 🛠 Development

```bash
# Run in development mode with auto-reloading
pnpm dev

# Lint the code
pnpm lint

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
