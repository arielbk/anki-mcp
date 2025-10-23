# Testing Consolidated Tools (v0.4.0-rc.1)

## Summary of Changes
- **Reduced from 102 tools to 6 domain-aware tools**
- Following MCP best practices for 2025
- Organized by use case rather than API structure

## The 6 New Tools

### 1. ✅ `manage_flashcards`
**Purpose**: Create, update, delete, and search flashcards

**Test Cases to Try**:
```
# Create a single flashcard
{
  "operation": "create",
  "deckName": "Test Deck",
  "modelName": "Basic",
  "fields": {
    "Front": "What is MCP?",
    "Back": "Model Context Protocol"
  },
  "tags": ["mcp", "test"]
}

# Find flashcards
{
  "operation": "find",
  "query": "deck:\"Test Deck\"",
  "includeDetails": false
}
```

### 2. ✅ `study_session`
**Purpose**: Interactive quiz and review operations

**Test Cases to Try**:
```
# Find due cards
{
  "operation": "find_due",
  "query": "is:due"
}

# Check card status
{
  "operation": "check_status",
  "cardIds": [1234567890]
}
```

### 3. ✅ `manage_decks`
**Purpose**: Deck management and organization

**Test Cases to Try**:
```
# List all decks
{
  "operation": "list"
}

# Create a deck
{
  "operation": "create",
  "deckName": "MCP Testing"
}

# Get deck stats
{
  "operation": "get_stats",
  "deckName": "MCP Testing"
}
```

### 4. ✅ `get_analytics`
**Purpose**: Statistics and learning insights

**Test Cases to Try**:
```
# Get reviews today
{
  "scope": "reviews_today"
}

# Get deck statistics
{
  "scope": "deck_stats",
  "deckName": "MCP Testing"
}
```

### 5. ✅ `manage_models`
**Purpose**: Note type configuration

**Test Cases to Try**:
```
# List all models
{
  "operation": "list"
}
```

### 6. ✅ `anki_operations`
**Purpose**: Utility operations

**Test Cases to Try**:
```
# Get AnkiConnect version
{
  "operation": "version"
}

# Get profiles
{
  "operation": "get_profiles"
}

# Sync
{
  "operation": "sync"
}
```

## Benefits of This Consolidation

1. **Context Efficiency**: 94% reduction in tool count (102 → 6)
2. **Better Organization**: Tools grouped by user intent, not API structure
3. **Easier Discovery**: AI agents can understand 6 clear purposes vs 100+ methods
4. **Maintains Power**: All functionality still accessible via operation parameters
5. **MCP Best Practices**: Follows 2025 guidelines for domain-aware tool design

## Resources Still Available

The server still provides resources for additional context:
- Deck information
- Card details
- Note data
- Model schemas
- Statistics

These resources complement the tools and help AI agents make better decisions.
