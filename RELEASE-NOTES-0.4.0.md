# Release Notes: v0.4.0-rc.1

## 🎯 Major Architectural Improvement: Tool Consolidation

This release represents a significant redesign of the Anki MCP server's tool architecture, following **Model Context Protocol best practices for 2025**.

### The Problem

The previous version (0.3.x) exposed **102+ individual tools** - one for nearly every AnkiConnect API method. While this provided complete coverage, it created several issues:

1. **Context Bloat**: 102 tools cluttered AI agent prompts, consuming valuable context window space
2. **Poor Organization**: Tools were organized by API structure rather than user intent
3. **Discovery Challenges**: AI agents struggled to choose between dozens of similar-sounding tools
4. **Against MCP Best Practices**: The 2025 MCP specification recommends "domain-aware, intentional tool design" rather than mapping every API endpoint

### The Solution: 6 Domain-Aware Tools

We've consolidated 102 tools into **6 high-level, domain-aware tools** that are:

#### 1. 📝 `manage_flashcards`
**Purpose**: Create, update, delete, and search flashcards (notes and cards)

**Operations**: `create`, `create_batch`, `update`, `delete`, `find`, `get_info`, `add_tags`, `remove_tags`, `clear_empty`

**Replaces**: 14 previous tools (add_note, add_notes, update_note, delete_notes, find_notes, find_cards, add_tags_to_notes, remove_tags_from_notes, etc.)

#### 2. 🎯 `study_session`
**Purpose**: Interactive quiz and review operations

**Operations**: `find_due`, `answer`, `suspend`, `unsuspend`, `check_status`, `forget`, `relearn`

**Replaces**: 21 previous card operation tools (answer_cards, suspend_cards, unsuspend_cards, forget_cards, check_cards_due, etc.)

#### 3. 📚 `manage_decks`
**Purpose**: Deck creation, configuration, and organization

**Operations**: `create`, `delete`, `list`, `get_stats`, `move_cards`, `get_config`, `set_config`

**Replaces**: 7 previous deck tools (create_deck, delete_decks, change_deck, get_deck_stats, etc.)

#### 4. 📊 `get_analytics`
**Purpose**: Statistics and learning insights

**Operations**: `deck_stats`, `collection_stats`, `reviews_by_day`, `reviews_today`, `card_reviews`, `card_details`

**Replaces**: 7 previous statistic tools (card_reviews, get_collection_stats_html, get_num_cards_reviewed_by_day, etc.)

#### 5. 🎨 `manage_models`
**Purpose**: Note type (model) configuration

**Operations**: `list`, `create`, `add_field`, `remove_field`, `rename_field`, `add_template`, `remove_template`, `update_styling`

**Replaces**: 17 previous model tools (create_model, model_field_add, model_field_remove, model_template_add, etc.)

#### 6. 🔧 `anki_operations`
**Purpose**: Utility operations (sync, media, export/import)

**Operations**: `sync`, `version`, `export_deck`, `import_package`, `store_media`, `retrieve_media`, `delete_media`, `list_media`, `get_profiles`

**Replaces**: 16 previous miscellaneous, media, and graphical tools

## 📊 Impact

- **94% reduction in tool count**: 102 → 6 tools
- **Context efficiency**: Dramatically reduced prompt clutter for AI agents
- **Better discoverability**: Clear, intent-driven tool names
- **Maintained functionality**: All 102+ capabilities still accessible via operation parameters
- **MCP compliance**: Follows 2025 best practices for domain-aware tool design

## 🔄 Migration Guide

### Breaking Changes

**Old approach** (v0.3.x):
```typescript
// Creating a note required calling add_note directly
server.callTool('add_note', {
  deckName: "My Deck",
  modelName: "Basic",
  fields: { Front: "Q", Back: "A" },
  tags: ["test"]
});
```

**New approach** (v0.4.x):
```typescript
// Now use manage_flashcards with operation='create'
server.callTool('manage_flashcards', {
  operation: 'create',
  deckName: "My Deck",
  modelName: "Basic",
  fields: { Front: "Q", Back: "A" },
  tags: ["test"]
});
```

### For AI Agents

**Before**: AI had to choose between 102 tools like `add_note`, `add_notes`, `update_note`, `delete_notes`, `add_tags_to_notes`, etc.

**After**: AI chooses 1 tool (`manage_flashcards`) and specifies the operation, making intent clearer and reducing decision complexity.

### Backward Compatibility

The old tool registration code is preserved in the codebase but **not registered by default**. If you need the old behavior temporarily, you can modify `src/index.ts` to register the legacy tools.

## 🧪 Testing

A test guide has been included at `test-tools.md` with example calls for all 6 new tools.

To test the server:
```bash
npm install -g @arielbk/anki-mcp@rc
pnpm inspect
```

## 📚 Documentation Updates

- README updated with new tool descriptions
- Features section updated to highlight consolidation benefits
- Added "Why 6 Tools Instead of 100+?" section explaining the rationale

## 🙏 Acknowledgments

This redesign was inspired by:
- [MCP Best Practices 2025](https://modelcontextprotocol.info/docs/best-practices/)
- [7 MCP Server Best Practices for Scalable AI Integrations](https://www.marktechpost.com/2025/07/23/7-mcp-server-best-practices-for-scalable-ai-integrations-in-2025/)
- Community feedback on context efficiency

## 🔜 Next Steps

- Gather feedback on the new tool structure from the community
- Consider promoting to stable (v0.4.0) if testing goes well
- Potentially add a legacy mode flag for backward compatibility if needed

## 📦 Installation

```bash
# Install the release candidate
npm install -g @arielbk/anki-mcp@rc

# Or specify version explicitly
npm install -g @arielbk/anki-mcp@0.4.0-rc.1
```

## 🐛 Known Issues

- None reported yet - please file issues at https://github.com/arielbk/anki-mcp/issues

## 👥 Contributors

- @arielbk - Initial design and implementation

---

**Full Changelog**: v0.3.2...v0.4.0-rc.1
