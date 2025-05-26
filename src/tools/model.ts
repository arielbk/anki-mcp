import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all model-related tools with the MCP server
 */
export function registerModelTools(server: McpServer) {
  // Tool: Create a new model
  server.tool(
    'create_model',
    {
      modelName: z.string().describe('Name of the model to create'),
      inOrderFields: z.array(z.string()).describe('Array of field names in order'),
      cardTemplates: z
        .array(
          z
            .object({
              Front: z.string().describe('Front template content'),
              Back: z.string().describe('Back template content'),
            })
            .and(z.record(z.string()))
        )
        .describe('Array of card templates with Front and Back content'),
      css: z.string().optional().describe('Custom CSS styling for the model'),
      isCloze: z.boolean().optional().describe('Whether the model should be a cloze type'),
    },
    async ({ modelName, inOrderFields, cardTemplates, css, isCloze }) => {
      try {
        const result = await ankiClient.model.createModel({
          modelName,
          inOrderFields,
          cardTemplates,
          css,
          isCloze,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully created model "${modelName}" with ID: ${result.id}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to create model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Find and replace in models
  server.tool(
    'find_and_replace_in_models',
    {
      modelName: z.string().describe('Name of the model to search in'),
      fieldText: z.string().describe('Text to find'),
      replaceText: z.string().describe('Text to replace with'),
      front: z.boolean().describe('Whether to search in front templates'),
      back: z.boolean().describe('Whether to search in back templates'),
      css: z.boolean().describe('Whether to search in CSS'),
    },
    async ({ modelName, fieldText, replaceText, front, back, css }) => {
      try {
        const count = await ankiClient.model.findAndReplaceInModels({
          model: {
            modelName,
            fieldText,
            replaceText,
            front,
            back,
            css,
          },
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully replaced ${count} occurrences of "${fieldText}" with "${replaceText}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to find and replace in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Add field to model
  server.tool(
    'model_field_add',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field to add'),
      index: z.number().describe('Position to insert the field (0-based)'),
    },
    async ({ modelName, fieldName, index }) => {
      try {
        await ankiClient.model.modelFieldAdd({
          modelName,
          fieldName,
          index,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully added field "${fieldName}" to model "${modelName}" at position ${index}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to add field "${fieldName}" to model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Remove field from model
  server.tool(
    'model_field_remove',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field to remove'),
    },
    async ({ modelName, fieldName }) => {
      try {
        await ankiClient.model.modelFieldRemove({
          modelName,
          fieldName,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed field "${fieldName}" from model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to remove field "${fieldName}" from model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Rename field in model
  server.tool(
    'model_field_rename',
    {
      modelName: z.string().describe('Name of the model'),
      oldFieldName: z.string().describe('Current name of the field'),
      newFieldName: z.string().describe('New name for the field'),
    },
    async ({ modelName, oldFieldName, newFieldName }) => {
      try {
        await ankiClient.model.modelFieldRename({
          modelName,
          oldFieldName,
          newFieldName,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to rename field in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Reposition field in model
  server.tool(
    'model_field_reposition',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field to reposition'),
      index: z.number().describe('New position for the field (0-based)'),
    },
    async ({ modelName, fieldName, index }) => {
      try {
        await ankiClient.model.modelFieldReposition({
          modelName,
          fieldName,
          index,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully repositioned field "${fieldName}" to position ${index} in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to reposition field "${fieldName}" in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Set field description
  server.tool(
    'model_field_set_description',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field'),
      index: z.number().describe('Index of the field'),
    },
    async ({ modelName, fieldName, index }) => {
      try {
        await ankiClient.model.modelFieldSetDescription({
          modelName,
          fieldName,
          index,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set description for field "${fieldName}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set description for field "${fieldName}" in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Set field font
  server.tool(
    'model_field_set_font',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field'),
      font: z.string().describe('Font name to set'),
    },
    async ({ modelName, fieldName, font }) => {
      try {
        await ankiClient.model.modelFieldSetFont({
          modelName,
          fieldName,
          font,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set font "${font}" for field "${fieldName}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set font for field "${fieldName}" in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Set field font size
  server.tool(
    'model_field_set_font_size',
    {
      modelName: z.string().describe('Name of the model'),
      fieldName: z.string().describe('Name of the field'),
      fontSize: z.number().describe('Font size to set'),
    },
    async ({ modelName, fieldName, fontSize }) => {
      try {
        await ankiClient.model.modelFieldSetFontSize({
          modelName,
          fieldName,
          fontSize,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set font size ${fontSize} for field "${fieldName}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set font size for field "${fieldName}" in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Add template to model
  server.tool(
    'model_template_add',
    {
      modelName: z.string().describe('Name of the model'),
      template: z
        .object({
          Front: z.string().describe('Front template content'),
          Back: z.string().describe('Back template content'),
        })
        .and(z.record(z.string()))
        .describe('Template object with Front and Back content'),
    },
    async ({ modelName, template }) => {
      try {
        await ankiClient.model.modelTemplateAdd({
          modelName,
          template,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully added template to model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to add template to model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Remove template from model
  server.tool(
    'model_template_remove',
    {
      modelName: z.string().describe('Name of the model'),
      templateName: z.string().describe('Name of the template to remove'),
    },
    async ({ modelName, templateName }) => {
      try {
        await ankiClient.model.modelTemplateRemove({
          modelName,
          templateName,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed template "${templateName}" from model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to remove template "${templateName}" from model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Rename template in model
  server.tool(
    'model_template_rename',
    {
      modelName: z.string().describe('Name of the model'),
      oldTemplateName: z.string().describe('Current name of the template'),
      newTemplateName: z.string().describe('New name for the template'),
    },
    async ({ modelName, oldTemplateName, newTemplateName }) => {
      try {
        await ankiClient.model.modelTemplateRename({
          modelName,
          oldTemplateName,
          newTemplateName,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully renamed template "${oldTemplateName}" to "${newTemplateName}" in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to rename template in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Reposition template in model
  server.tool(
    'model_template_reposition',
    {
      modelName: z.string().describe('Name of the model'),
      templateName: z.string().describe('Name of the template to reposition'),
      index: z.number().describe('New position for the template (0-based)'),
    },
    async ({ modelName, templateName, index }) => {
      try {
        await ankiClient.model.modelTemplateReposition({
          modelName,
          templateName,
          index,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully repositioned template "${templateName}" to position ${index} in model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to reposition template "${templateName}" in model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Update model styling
  server.tool(
    'update_model_styling',
    {
      modelName: z.string().describe('Name of the model'),
      css: z.string().describe('New CSS styling for the model'),
    },
    async ({ modelName, css }) => {
      try {
        await ankiClient.model.updateModelStyling({
          model: {
            name: modelName,
            css,
          },
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated styling for model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to update styling for model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Update model templates
  server.tool(
    'update_model_templates',
    {
      modelName: z.string().describe('Name of the model'),
      templates: z
        .record(
          z.object({
            Front: z.string().optional().describe('Front template content'),
            Back: z.string().optional().describe('Back template content'),
          })
        )
        .describe('Object mapping template names to their Front/Back content'),
    },
    async ({ modelName, templates }) => {
      try {
        await ankiClient.model.updateModelTemplates({
          model: {
            name: modelName,
            templates,
          },
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated templates for model "${modelName}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to update templates for model "${modelName}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
