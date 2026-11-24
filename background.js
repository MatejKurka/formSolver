const isBrowserNamespace = typeof browser !== 'undefined';
const ext = isBrowserNamespace ? browser : chrome;

const DEFAULT_API_KEY = '';
const PRIMARY_MODEL = 'gemini-3.5-flash-lite';
const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite'
];

const RATE_LIMIT = {
  MAX_RPM: 15,
  WINDOW_MS: 60 * 1000,
  MIN_INTERVAL_MS: 4000
};

let requestTimestamps = [];
let requestQueue = [];
let isProcessingQueue = false;
let resolvedFallbackModel = null;

async function loadTimestamps() {
  try {
    const data = await ext.storage.local.get(['requestTimestamps']);
    const now = Date.now();
    if (Array.isArray(data.requestTimestamps)) {
      requestTimestamps = data.requestTimestamps.filter(
        (ts) => now - ts < RATE_LIMIT.WINDOW_MS
      );
    }
  } catch (_) {}
}

async function saveTimestamps() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(
    (ts) => now - ts < RATE_LIMIT.WINDOW_MS
  );
  try {
    await ext.storage.local.set({ requestTimestamps });
  } catch (_) {}
}

function getWaitTimeMs() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(
    (ts) => now - ts < RATE_LIMIT.WINDOW_MS
  );

  let waitMs = 0;

  if (requestTimestamps.length >= RATE_LIMIT.MAX_RPM) {
    const oldestInWindow = requestTimestamps[0];
    const windowWait = oldestInWindow + RATE_LIMIT.WINDOW_MS - now + 100;
    waitMs = Math.max(waitMs, windowWait);
  }

  if (requestTimestamps.length > 0) {
    const mostRecent = requestTimestamps[requestTimestamps.length - 1];
    const intervalWait = mostRecent + RATE_LIMIT.MIN_INTERVAL_MS - now;
    waitMs = Math.max(waitMs, intervalWait);
  }

  return Math.max(0, waitMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueTask(taskFn, meta = {}) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ taskFn, resolve, reject, meta });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  await loadTimestamps();

  while (requestQueue.length > 0) {
    const item = requestQueue[0];
    const waitMs = getWaitTimeMs();

    if (waitMs > 0) {
      if (item.meta.tabId) {
        ext.tabs.sendMessage(item.meta.tabId, {
          type: 'RATE_LIMIT_WAIT',
          waitMs,
          queueLength: requestQueue.length,
          questionId: item.meta.questionId
        }).catch(() => {});
      }
      await sleep(waitMs);
    }

    const recheckWait = getWaitTimeMs();
    if (recheckWait > 0) {
      await sleep(recheckWait);
    }

    requestQueue.shift();
    requestTimestamps.push(Date.now());
    await saveTimestamps();

    try {
      const result = await item.taskFn();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  isProcessingQueue = false;
}

function buildPrompt(formContext, targetQuestion) {
  const contextLines = [];
  contextLines.push(`Form Title: ${formContext.formTitle || 'Untitled Form'}`);
  if (formContext.formDescription) {
    contextLines.push(`Form Description: ${formContext.formDescription}`);
  }
  contextLines.push('');
  contextLines.push('=== FULL FORM CONTEXT (ALL QUESTIONS ON THIS FORM) ===');

  for (const q of formContext.questions || []) {
    const marker = q.id === targetQuestion.id ? ' [TARGET QUESTION TO SOLVE]' : '';
    contextLines.push(`Question #${q.index + 1}${marker}: ${q.title}`);
    if (q.description) {
      contextLines.push(`  Note/Description: ${q.description}`);
    }
    contextLines.push(`  Type: ${q.type}`);
    if (Array.isArray(q.options) && q.options.length > 0) {
      contextLines.push(
        `  Options:\n${q.options.map((opt, idx) => `    [${idx}] ${opt}`).join('\n')}`
      );
    }
    if (Array.isArray(q.gridRows) && q.gridRows.length > 0) {
      contextLines.push(
        `  Grid Rows:\n${q.gridRows.map((r, idx) => `    Row [${idx}]: ${r}`).join('\n')}`
      );
      contextLines.push(
        `  Grid Columns:\n${(q.gridColumns || []).map((c, idx) => `    Col [${idx}]: ${c}`).join('\n')}`
      );
    }
    if (q.resolvedAnswer) {
      contextLines.push(`  Already Determined Answer: ${JSON.stringify(q.resolvedAnswer)}`);
    } else if (q.currentAnswer) {
      contextLines.push(`  Current User Input: ${JSON.stringify(q.currentAnswer)}`);
    }
    contextLines.push('');
  }

  contextLines.push('=== TARGET QUESTION TO ANSWER NOW ===');
  contextLines.push(`Question #${targetQuestion.index + 1}: ${targetQuestion.title}`);
  if (targetQuestion.description) {
    contextLines.push(`Description: ${targetQuestion.description}`);
  }
  contextLines.push(`Question Type: ${targetQuestion.type}`);

  if (Array.isArray(targetQuestion.options) && targetQuestion.options.length > 0) {
    contextLines.push('Available Options (with 0-based index):');
    targetQuestion.options.forEach((opt, idx) => {
      contextLines.push(`  [${idx}] ${opt}`);
    });
  }

  if (Array.isArray(targetQuestion.gridRows) && targetQuestion.gridRows.length > 0) {
    contextLines.push('Grid Rows (with 0-based index):');
    targetQuestion.gridRows.forEach((r, idx) => {
      contextLines.push(`  Row [${idx}]: ${r}`);
    });
    contextLines.push('Grid Columns (with 0-based index):');
    (targetQuestion.gridColumns || []).forEach((c, idx) => {
      contextLines.push(`  Col [${idx}]: ${c}`);
    });
  }

  contextLines.push('');
  contextLines.push(
    'INSTRUCTIONS:\n' +
    '1. Use the full form context above (in case questions reference each other or share context/theme) to determine the accurate answer for the TARGET QUESTION ONLY.\n' +
    '2. Respond strictly with a valid JSON object matching this schema:\n' +
    '{\n' +
    '  "selectedIndices": [number],\n' +
    '  "selectedOptions": [string],\n' +
    '  "textAnswer": string,\n' +
    '  "gridAnswers": {\n' +
    '    "0": [0]\n' +
    '  }\n' +
    '}\n' +
    'Schema rules:\n' +
    '- For radio, dropdown, scale: put the 0-based option index in selectedIndices (exactly 1 index) and its exact text in selectedOptions.\n' +
    '- For checkbox: put all correct 0-based option indices in selectedIndices and their exact texts in selectedOptions.\n' +
    '- For text, paragraph, date, time: put the concise answer in textAnswer (no prefixes like "Answer:"). For date use YYYY-MM-DD, for time use HH:MM.\n' +
    '- For grid_radio or grid_checkbox: populate gridAnswers mapping each row index string ("0", "1", ...) to an array of selected column 0-based indices (e.g. [0] for grid_radio, or [0, 2] for grid_checkbox).'
  );

  return contextLines.join('\n');
}

function parseModelJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response from Gemini model.');
  }
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    return {
      selectedIndices: [],
      selectedOptions: [cleaned],
      textAnswer: cleaned
    };
  }
}

async function callGeminiEndpoint(apiKey, modelName, promptText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson?.error?.message || errorDetail;
    } catch (_) {}
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const nonThoughtParts = parts.filter((p) => !p.thought);
  const candidateText =
    (nonThoughtParts.length > 0 ? nonThoughtParts : parts)
      .map((p) => p.text || '')
      .join('') || '';
  return {
    parsed: parseModelJson(candidateText),
    modelUsed: modelName
  };
}

async function solveQuestionWithGemini(formContext, targetQuestion) {
  const settings = await ext.storage.local.get([
    'geminiApiKey',
    'geminiModel',
    'autoFallbackOn404'
  ]);

  const apiKey = (settings.geminiApiKey || DEFAULT_API_KEY).trim();
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Click the extension icon to add your key.');
  }

  let configuredModel = (settings.geminiModel || PRIMARY_MODEL).trim();
  if (configuredModel.startsWith('gemini-2.')) {
    configuredModel = PRIMARY_MODEL;
    ext.storage.local.set({ geminiModel: PRIMARY_MODEL }).catch(() => {});
  }

  const allowFallback = settings.autoFallbackOn404 !== false;
  const promptText = buildPrompt(formContext, targetQuestion);

  const modelsToTry = [configuredModel];
  if (allowFallback) {
    if (resolvedFallbackModel && !modelsToTry.includes(resolvedFallbackModel)) {
      modelsToTry.push(resolvedFallbackModel);
    }
    if (!modelsToTry.includes(PRIMARY_MODEL)) {
      modelsToTry.push(PRIMARY_MODEL);
    }
    for (const fb of FALLBACK_MODELS) {
      if (!modelsToTry.includes(fb)) {
        modelsToTry.push(fb);
      }
    }
  }

  let lastError = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    try {
      const result = await callGeminiEndpoint(apiKey, modelName, promptText);
      if (modelName !== configuredModel) {
        resolvedFallbackModel = modelName;
      }
      return result;
    } catch (err) {
      lastError = err;
      if ((err.status === 404 || err.status === 400) && allowFallback && i < modelsToTry.length - 1) {
        continue;
      }
      if (err.status === 429) {
        await sleep(4500);
        requestTimestamps.push(Date.now());
        await saveTimestamps();
        return await callGeminiEndpoint(apiKey, modelName, promptText);
      }
      throw err;
    }
  }

  throw lastError || new Error('Failed to get response from Gemini API.');
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'SOLVE_QUESTION') {
    const tabId = sender?.tab?.id;
    const { formContext, targetQuestion } = message;

    const p = enqueueTask(
      () => solveQuestionWithGemini(formContext, targetQuestion),
      { tabId, questionId: targetQuestion?.id }
    )
      .then((res) => ({
        ok: true,
        answer: res.parsed,
        modelUsed: res.modelUsed
      }))
      .catch((err) => ({
        ok: false,
        error: err.message || String(err)
      }));

    if (isBrowserNamespace) {
      return p;
    }
    p.then(sendResponse);
    return true;
  }

  if (message.type === 'GET_RATE_LIMIT_STATUS') {
    const p = loadTimestamps().then(() => {
      const now = Date.now();
      requestTimestamps = requestTimestamps.filter(
        (ts) => now - ts < RATE_LIMIT.WINDOW_MS
      );
      return {
        ok: true,
        usedInLastMinute: requestTimestamps.length,
        maxRpm: RATE_LIMIT.MAX_RPM,
        queueLength: requestQueue.length,
        nextAvailableMs: getWaitTimeMs(),
        primaryModel: PRIMARY_MODEL,
        resolvedFallbackModel
      };
    });

    if (isBrowserNamespace) {
      return p;
    }
    p.then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_QUEUE') {
    const cancelled = requestQueue.splice(0, requestQueue.length);
    for (const item of cancelled) {
      item.reject(new Error('Queue cleared by user.'));
    }
    const resp = { ok: true, clearedCount: cancelled.length };
    if (isBrowserNamespace) {
      return Promise.resolve(resp);
    }
    sendResponse(resp);
    return true;
  }

  return false;
});
