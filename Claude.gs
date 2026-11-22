/**
 * Claude API helper — shared pattern across demos (copy per project).
 * Requires Script Property ANTHROPIC_API_KEY.
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2026-10-21';
const AI_LOG_MAX_CHARS = 45000;

/**
 * Calls Claude and returns parsed JSON from the reply.
 * When opts.schema is given, the API's structured outputs guarantee the reply matches it.
 * @param {string} system  System prompt
 * @param {string|Array} content  User content (string or content blocks)
 * @param {{maxTokens?: number, itemId?: string, model?: string, schema?: Object, effort?: string,
 *          fallbacks?: boolean}} opts
 */
function callClaudeJson_(system, content, opts) {
  opts = opts || {};
  const text = callClaude_(system, content, opts);
  return parseJsonLoose_(text);
}

function callClaude_(system, content, opts) {
  opts = opts || {};
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Missing Script Property ANTHROPIC_API_KEY');

  const payload = {
    model: opts.model || CONFIG.MODEL,
    max_tokens: opts.maxTokens || 4000,
    system: system,
    messages: [{ role: 'user', content: content }],
  };
  const outputConfig = {};
  if (opts.effort) outputConfig.effort = opts.effort;
  if (opts.schema) outputConfig.format = { type: 'json_schema', schema: opts.schema };
  if (Object.keys(outputConfig).length) payload.output_config = outputConfig;

  const headers = { 'x-api-key': apiKey, 'anthropic-version': CLAUDE_API_VERSION };
  if (opts.fallbacks) {
    // Server-side refusal fallback: if a safety classifier declines, the API re-runs on a fallback model.
    payload.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  const params = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = UrlFetchApp.fetch(CLAUDE_API_URL, params);
    } catch (netErr) {
      // Network-level failure (DNS, timeout): retry like a 5xx.
      lastErr = netErr;
      Utilities.sleep(1000 * Math.pow(2, attempt + 1));
      continue;
    }
    const code = res.getResponseCode();
    if (code === 200) {
      const body = JSON.parse(res.getContentText());
      const text = body.content.filter(b => b.type === 'text').map(b => b.text).join('');
      logAi_(opts.itemId, body.model || payload.model, body.usage, text || JSON.stringify(body));
      if (body.stop_reason === 'refusal') throw new Error('Claude declined this item (refusal)');
      if (body.stop_reason === 'max_tokens') throw new Error('Claude reply hit max_tokens; raise maxTokens');
      return text;
    }
    lastErr = new Error(`Claude API ${code}: ${res.getContentText().slice(0, 300)}`);
    if (code === 429 || code === 529 || code >= 500) {
      Utilities.sleep(1000 * Math.pow(2, attempt + 1));
      continue;
    }
    throw lastErr;
  }
  logAi_(opts.itemId, payload.model, null, 'ERROR: ' + lastErr);
  throw lastErr;
}

/** Extracts the first JSON object from a model reply (tolerates ```json fences). */
function parseJsonLoose_(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in model reply: ' + text.slice(0, 200));
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Appends one row to the AI Log tab: Timestamp · Item ID · Model · Input tokens · Output tokens · Raw JSON. */
function logAi_(itemId, model, usage, rawText) {
  try {
    const sheet = getSheet_(TABS.AI_LOG);
    sheet.appendRow([
      new Date(),
      itemId || '',
      model || '',
      usage ? usage.input_tokens : '',
      usage ? usage.output_tokens : '',
      String(rawText || '').slice(0, AI_LOG_MAX_CHARS),
    ]);
  } catch (err) {
    console.error('AI Log write failed: ' + err);
  }
}
