import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const FLASHCARD_PROMPT_NAME = 'writing_good_flashcards';

export const FLASHCARD_GUIDELINES = `# Writing good flashcards

Sources: Andy Matuschak, "How to write good prompts: using spaced repetition to create understanding" (https://andymatuschak.org/prompts/) and Piotr Wozniak / SuperMemo, "Effective learning: Twenty rules of formulating knowledge" (https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge).

## Rules
1. **Understand before you memorize.** Only make cards for material the learner already understands. If the source is unclear, explain it first instead of turning confusion into cards.
2. **Minimum information principle.** Each card asks for one small, precise fact. Split anything that needs a paragraph to answer into several cards.
3. **One fact per card, one answer per question.** The answer should be the same every time; avoid "name some..." or "what are the features of...".
4. **No yes/no or true/false questions.** They can be guessed and teach little. Ask "what", "why", "how", "when" instead.
5. **Lists: one blank per item, in a fixed order.** For an enumeration, write one cloze per item and keep the list order constant so the context stays stable. Avoid sets that must be recalled whole.
6. **Several angles on one idea.** Write a few cards that approach an important idea differently: definition, example, cause and effect, contrast with a neighbour, application.
7. **Make retrieval effortful but focused.** The question should cue exactly one answer without giving it away.
8. **Use context cues and keep wording short.** Prefix with the topic when the question could be ambiguous ("CSS: ..."). Cut every word that doesn't help recall.
9. **Prefer cloze deletions for facts embedded in a sentence**, and Basic (front/back) cards for questions with a short answer.
10. **Personalise and add examples or images** where they make the memory more vivid; keep sources or links in a non-tested field.
11. **Avoid interference.** Similar cards should be made clearly distinguishable.

## Workflow with this server
- Check the note type's field names first: \`manage_models\` with \`operation: "list"\` shows each note type's fields.
- For more than a handful of cards, write them to a JSON/CSV/TSV file the user can review, then import with \`manage_flashcards\` \`create_batch\` + \`filePath\`, using top-level \`deckName\`/\`modelName\`/\`tags\` defaults. Run with \`dryRun: true\` first.
- To give a new deck its own daily limits, use \`manage_decks\` \`create\` (or \`set_limits\`) with \`newPerDay\`/\`reviewsPerDay\`.`;

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    FLASHCARD_PROMPT_NAME,
    {
      title: 'Writing good flashcards',
      description:
        'Guidelines for writing effective spaced-repetition cards (minimum information principle, one fact per card, no yes/no questions, multiple angles, only understood material), based on Matuschak and SuperMemo. Use before creating cards with manage_flashcards.',
      argsSchema: {
        topic: z
          .string()
          .optional()
          .describe('What the cards should cover, e.g. a topic, notes, or source text'),
      },
    },
    ({ topic }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: topic
              ? `${FLASHCARD_GUIDELINES}\n\n---\n\nFollowing these guidelines, propose flashcards for: ${topic}\n\nShow the cards for review before adding them to Anki.`
              : FLASHCARD_GUIDELINES,
          },
        },
      ],
    })
  );
}
