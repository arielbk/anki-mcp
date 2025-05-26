import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all model-related resources with the MCP server
 */
export function registerModelResources(server: McpServer) {
  // Static resource: Get all model names
  server.resource('model_names', 'anki:///models/names', async (uri) => {
    try {
      const modelNames = await ankiClient.model.modelNames();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(modelNames, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get model names: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Static resource: Get all model names and IDs
  server.resource('model_names_and_ids', 'anki:///models/names-and-ids', async (uri) => {
    try {
      const modelNamesAndIds = await ankiClient.model.modelNamesAndIds();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(modelNamesAndIds, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get model names and IDs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Resource template: Get models by ID
  server.resource(
    'models_by_id',
    new ResourceTemplate('anki:///models/by-id/{modelIds}', { list: undefined }),
    async (uri, { modelIds }) => {
      const modelIdsString = Array.isArray(modelIds) ? modelIds[0] : modelIds;
      if (!modelIdsString) {
        throw new Error('Model IDs are required');
      }

      const modelIdArray = modelIdsString.split(',').map((id: string) => {
        const num = parseInt(id.trim(), 10);
        if (isNaN(num)) {
          throw new Error(`Invalid model ID: ${id}`);
        }
        return num;
      });

      if (modelIdArray.length === 0) {
        throw new Error('At least one model ID is required');
      }

      try {
        const models = await ankiClient.model.findModelsById({ modelIds: modelIdArray });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(models, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get models by ID "${modelIdArray.join(', ')}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get models by name
  server.resource(
    'models_by_name',
    new ResourceTemplate('anki:///models/by-name/{modelNames}', { list: undefined }),
    async (uri, { modelNames }) => {
      const modelNamesString = Array.isArray(modelNames) ? modelNames[0] : modelNames;
      if (!modelNamesString) {
        throw new Error('Model names are required');
      }

      const modelNamesArray = modelNamesString.split(',').map((name: string) => name.trim());
      if (modelNamesArray.length === 0) {
        throw new Error('At least one model name is required');
      }

      try {
        const models = await ankiClient.model.findModelsByName({ modelNames: modelNamesArray });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(models, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get models by name "${modelNamesArray.join(', ')}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get model field names
  server.resource(
    'model_field_names',
    new ResourceTemplate('anki:///models/{modelName}/fields/names', { list: undefined }),
    async (uri, { modelName }) => {
      const modelNameString = Array.isArray(modelName) ? modelName[0] : modelName;
      if (!modelNameString) {
        throw new Error('Model name is required');
      }

      try {
        const fieldNames = await ankiClient.model.modelFieldNames({ modelName: modelNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(fieldNames, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get field names for model "${modelNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get model field fonts
  server.resource(
    'model_field_fonts',
    new ResourceTemplate('anki:///models/{modelName}/fields/fonts', { list: undefined }),
    async (uri, { modelName }) => {
      const modelNameString = Array.isArray(modelName) ? modelName[0] : modelName;
      if (!modelNameString) {
        throw new Error('Model name is required');
      }

      try {
        const fieldFonts = await ankiClient.model.modelFieldFonts({ modelName: modelNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(fieldFonts, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get field fonts for model "${modelNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get model fields on templates
  server.resource(
    'model_fields_on_templates',
    new ResourceTemplate('anki:///models/{modelName}/fields/templates', { list: undefined }),
    async (uri, { modelName }) => {
      const modelNameString = Array.isArray(modelName) ? modelName[0] : modelName;
      if (!modelNameString) {
        throw new Error('Model name is required');
      }

      try {
        const fieldsOnTemplates = await ankiClient.model.modelFieldsOnTemplates({ modelName: modelNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(fieldsOnTemplates, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get fields on templates for model "${modelNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get model styling
  server.resource(
    'model_styling',
    new ResourceTemplate('anki:///models/{modelName}/styling', { list: undefined }),
    async (uri, { modelName }) => {
      const modelNameString = Array.isArray(modelName) ? modelName[0] : modelName;
      if (!modelNameString) {
        throw new Error('Model name is required');
      }

      try {
        const styling = await ankiClient.model.modelStyling({ modelName: modelNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(styling, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get styling for model "${modelNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get model templates
  server.resource(
    'model_templates',
    new ResourceTemplate('anki:///models/{modelName}/templates', { list: undefined }),
    async (uri, { modelName }) => {
      const modelNameString = Array.isArray(modelName) ? modelName[0] : modelName;
      if (!modelNameString) {
        throw new Error('Model name is required');
      }

      try {
        const templates = await ankiClient.model.modelTemplates({ modelName: modelNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(templates, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get templates for model "${modelNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
