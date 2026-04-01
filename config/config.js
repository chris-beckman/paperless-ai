const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const currentDir = decodeURIComponent(process.cwd());
const envPath = path.join(currentDir, 'data', '.env');
console.log('Loading .env from:', envPath);
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  console.log('Optional data/.env not found; using process environment only.');
}

// Helper function to parse boolean-like env vars
const parseEnvBoolean = (value, defaultValue = 'yes') => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes' ? 'yes' : 'no';
};

/** @returns {boolean} */
function parseTruthyEnv(value, defaultTrue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultTrue;
  }
  const v = String(value).toLowerCase();
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') {
    return false;
  }
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') {
    return true;
  }
  return defaultTrue;
}

const enableTagging = parseTruthyEnv(process.env.ENABLE_TAGGING, true);
const ragServiceEnabled = parseTruthyEnv(process.env.RAG_SERVICE_ENABLED, true);

// Initialize limit functions with defaults
const limitFunctions = {
  activateTagging: parseEnvBoolean(process.env.ACTIVATE_TAGGING, 'yes'),
  activateCorrespondents: parseEnvBoolean(process.env.ACTIVATE_CORRESPONDENTS, 'yes'),
  activateDocumentType: parseEnvBoolean(process.env.ACTIVATE_DOCUMENT_TYPE, 'yes'),
  activateTitle: parseEnvBoolean(process.env.ACTIVATE_TITLE, 'yes'),
  activateCustomFields: parseEnvBoolean(process.env.ACTIVATE_CUSTOM_FIELDS, 'yes'),
};

// Initialize AI restrictions with defaults
const aiRestrictions = {
  restrictToExistingTags: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_TAGS, 'no'),
  restrictToExistingCorrespondents: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_CORRESPONDENTS, 'no'),
  restrictToExistingDocumentTypes: parseEnvBoolean(process.env.RESTRICT_TO_EXISTING_DOCUMENT_TYPES, 'no'),
};

console.log('Loaded restriction settings:', {
  RESTRICT_TO_EXISTING_TAGS: aiRestrictions.restrictToExistingTags,
  RESTRICT_TO_EXISTING_CORRESPONDENTS: aiRestrictions.restrictToExistingCorrespondents,
  RESTRICT_TO_EXISTING_DOCUMENT_TYPES: aiRestrictions.restrictToExistingDocumentTypes,
});

// Initialize external API configuration
const externalApiConfig = {
  enabled: parseEnvBoolean(process.env.EXTERNAL_API_ENABLED, 'no'),
  url: process.env.EXTERNAL_API_URL || '',
  method: process.env.EXTERNAL_API_METHOD || 'GET',
  headers: process.env.EXTERNAL_API_HEADERS || '{}',
  body: process.env.EXTERNAL_API_BODY || '{}',
  timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || '5000', 10),
  transformationTemplate: process.env.EXTERNAL_API_TRANSFORM || '',
};

console.log('Loaded environment variables:', {
  PAPERLESS_API_URL: process.env.PAPERLESS_API_URL,
  PAPERLESS_API_TOKEN: '******',
  LIMIT_FUNCTIONS: limitFunctions,
  AI_RESTRICTIONS: aiRestrictions,
  EXTERNAL_API: externalApiConfig.enabled === 'yes' ? 'enabled' : 'disabled',
  ENABLE_TAGGING: enableTagging,
  RAG_SERVICE_ENABLED: ragServiceEnabled,
});

const KNOWN_AI_PROVIDERS = new Set(['openai', 'ollama', 'custom', 'azure']);

/**
 * Structural configuration validation only (no HTTP or LLM calls).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(env = process.env) {
  const errors = [];

  const paperlessUrl = env.PAPERLESS_API_URL;
  const token = env.PAPERLESS_API_TOKEN;
  try {
    if (!paperlessUrl || !String(paperlessUrl).trim()) {
      errors.push('PAPERLESS_API_URL is required');
    } else {
      // eslint-disable-next-line no-new
      new URL(paperlessUrl);
    }
  } catch {
    errors.push('PAPERLESS_API_URL must be a valid URL');
  }

  if (!token || !String(token).trim()) {
    errors.push('PAPERLESS_API_TOKEN is required and must be non-empty');
  }

  if (parseTruthyEnv(env.ENABLE_TAGGING, true)) {
    const provider = (env.AI_PROVIDER || 'openai').toLowerCase();
    if (!KNOWN_AI_PROVIDERS.has(provider)) {
      errors.push(`AI_PROVIDER must be one of: ${[...KNOWN_AI_PROVIDERS].join(', ')}`);
    }
    if (!env.PAPERLESS_USERNAME || !String(env.PAPERLESS_USERNAME).trim()) {
      errors.push('PAPERLESS_USERNAME is required when ENABLE_TAGGING is true');
    }
    const scanInterval = env.SCAN_INTERVAL || '*/30 * * * *';
    if (!cron.validate(scanInterval)) {
      errors.push('SCAN_INTERVAL must be valid cron syntax');
    }
    if (provider === 'openai') {
      if (!env.OPENAI_API_KEY || !String(env.OPENAI_API_KEY).trim()) {
        errors.push('OPENAI_API_KEY is required when AI_PROVIDER=openai');
      }
    } else if (provider === 'ollama') {
      if (!env.OLLAMA_API_URL || !String(env.OLLAMA_API_URL).trim()) {
        errors.push('OLLAMA_API_URL is required when AI_PROVIDER=ollama');
      }
    } else if (provider === 'custom') {
      if (!env.CUSTOM_BASE_URL || !String(env.CUSTOM_BASE_URL).trim()) {
        errors.push('CUSTOM_BASE_URL is required when AI_PROVIDER=custom');
      }
      if (!env.CUSTOM_API_KEY || !String(env.CUSTOM_API_KEY).trim()) {
        errors.push('CUSTOM_API_KEY is required when AI_PROVIDER=custom');
      }
      if (!env.CUSTOM_MODEL || !String(env.CUSTOM_MODEL).trim()) {
        errors.push('CUSTOM_MODEL is required when AI_PROVIDER=custom');
      }
    } else if (provider === 'azure') {
      if (!env.AZURE_API_KEY || !String(env.AZURE_API_KEY).trim()) {
        errors.push('AZURE_API_KEY is required when AI_PROVIDER=azure');
      }
      if (!env.AZURE_ENDPOINT || !String(env.AZURE_ENDPOINT).trim()) {
        errors.push('AZURE_ENDPOINT is required when AI_PROVIDER=azure');
      }
      if (!env.AZURE_DEPLOYMENT_NAME || !String(env.AZURE_DEPLOYMENT_NAME).trim()) {
        errors.push('AZURE_DEPLOYMENT_NAME is required when AI_PROVIDER=azure');
      }
    }
  }

  const ragOn = parseTruthyEnv(env.RAG_SERVICE_ENABLED, true);
  if (ragOn) {
    const ragUrl = env.RAG_SERVICE_URL || 'http://localhost:8000';
    try {
      // eslint-disable-next-line no-new
      new URL(ragUrl);
    } catch {
      errors.push('RAG_SERVICE_URL must be a valid URL when RAG is enabled');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PAPERLESS_AI_VERSION: '3.0.9',
  enableTagging,
  ragServiceEnabled,
  validate,
  predefinedMode: process.env.PROCESS_PREDEFINED_DOCUMENTS,
  tokenLimit: process.env.TOKEN_LIMIT || 128000,
  responseTokens: process.env.RESPONSE_TOKENS || 1000,
  addAIProcessedTag: process.env.ADD_AI_PROCESSED_TAG || 'no',
  addAIProcessedTags: process.env.AI_PROCESSED_TAG_NAME || 'ai-processed',
  restrictToExistingTags: aiRestrictions.restrictToExistingTags,
  restrictToExistingCorrespondents: aiRestrictions.restrictToExistingCorrespondents,
  restrictToExistingDocumentTypes: aiRestrictions.restrictToExistingDocumentTypes,
  externalApiConfig,
  paperless: {
    apiUrl: process.env.PAPERLESS_API_URL,
    apiToken: process.env.PAPERLESS_API_TOKEN,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2',
  },
  custom: {
    apiUrl: process.env.CUSTOM_BASE_URL || '',
    apiKey: process.env.CUSTOM_API_KEY || '',
    model: process.env.CUSTOM_MODEL || '',
  },
  azure: {
    apiKey: process.env.AZURE_API_KEY || '',
    endpoint: process.env.AZURE_ENDPOINT || '',
    deploymentName: process.env.AZURE_DEPLOYMENT_NAME || '',
    apiVersion: process.env.AZURE_API_VERSION || '2023-05-15',
  },
  customFields: process.env.CUSTOM_FIELDS || '',
  aiProvider: process.env.AI_PROVIDER || 'openai',
  scanInterval: process.env.SCAN_INTERVAL || '*/30 * * * *',
  useExistingData: process.env.USE_EXISTING_DATA || 'no',
  limitFunctions: {
    activateTagging: limitFunctions.activateTagging,
    activateCorrespondents: limitFunctions.activateCorrespondents,
    activateDocumentType: limitFunctions.activateDocumentType,
    activateTitle: limitFunctions.activateTitle,
    activateCustomFields: limitFunctions.activateCustomFields,
  },
  specialPromptPreDefinedTags: `You are a document analysis AI. You will analyze the document. 
  You take the main information to associate tags with the document. 
  You will also find the correspondent of the document (Sender not receiver). Also you find a meaningful and short title for the document.
  You are given a list of tags: ${process.env.PROMPT_TAGS}
  Only use the tags from the list and try to find the best fitting tags.
  You do not ask for additional information, you only use the information given in the document.
  
  Return the result EXCLUSIVELY as a JSON object. The Tags and Title MUST be in the language that is used in the document.:
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/..."
  }`,
  mustHavePrompt: `  Return the result EXCLUSIVELY as a JSON object. The Tags, Title and Document_Type MUST be in the language that is used in the document.:
  IMPORTANT: The custom_fields are optional and can be left out if not needed, only try to fill out the values if you find a matching information in the document.
  Do not change the value of field_name, only fill out the values. If the field is about money only add the number without currency and always use a . for decimal places.
  {
    "title": "xxxxx",
    "correspondent": "xxxxxxxx",
    "tags": ["Tag1", "Tag2", "Tag3", "Tag4"],
    "document_type": "Invoice/Contract/...",
    "document_date": "YYYY-MM-DD",
    "language": "en/de/es/...",
    %CUSTOMFIELDS%
  }`,
};
