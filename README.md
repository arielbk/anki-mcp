# Anki MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server designed to integrate with Anki flashcard application.

## Project Overview

This project is an MCP server that will integrate with the Anki flashcard application via the AnkiConnect API. The purpose is to enable users to interact with their Anki flashcards through AI in a conversational manner.

## Features (Planned)

- Quiz yourself with flashcards
- Create new flashcards through conversation
- Perform bulk operations (tagging, organizing)
- Get insights from your flashcard collection

## Technical Stack

- **[Node.js](https://nodejs.org/)**: Base runtime environment
- **[TypeScript](https://www.typescriptlang.org/)**: For type safety and better developer experience
- **[ES Modules](https://nodejs.org/api/esm.html)**: Modern JavaScript module system
- **[tsup](https://github.com/egoist/tsup)**: For bundling the application
- **[MCP SDK](https://github.com/Model-Inference-And-Reasoning/ModelContextProtocol-TypeScript)**: TypeScript SDK for implementing Model Context Protocol
- **[Prettier](https://prettier.io/) & [ESLint](https://eslint.org/)**: Code formatting and linting
- **[PNPM](https://pnpm.io/)**: Package manager

## Setup and Installation

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/anki-mcp.git
   cd anki-mcp
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Build the project

   ```bash
   pnpm build
   ```

4. Start the server
   ```bash
   pnpm start
   ```

## Development

```bash
# Run in development mode with auto-reloading
pnpm dev

# Lint the code
pnpm lint

# Format the code
pnpm format
```

## License

MIT
