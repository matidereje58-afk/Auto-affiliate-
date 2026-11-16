const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store for API keys (user handles auth)
const sessions = new Map();

// Set / get API key for a session
app.post('/api/auth', (req, res) => {
  const { sessionId, apiKey, provider } = req.body;
  if (!sessionId || !apiKey) {
    return res.status(400).json({ error: 'sessionId and apiKey required' });
  }
  sessions.set(sessionId, { apiKey, provider: provider || 'openai', updatedAt: Date.now() });
  res.json({ ok: true });
});

app.get('/api/auth/status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const s = sessions.get(sessionId);
  res.json({ authenticated: !!s, provider: s ? s.provider : null });
});

// Chat endpoint - proxies to the user's AI provider using their API key
app.post('/api/chat', async (req, res) => {
  const { sessionId, messages, model } = req.body;
  const s = sessions.get(sessionId);
  if (!s) {
    return res.status(401).json({ error: 'Not authenticated. Please enter your API key.' });
  }

  try {
    let result;
    if (s.provider === 'anthropic') {
      result = await callAnthropic(s.apiKey, messages, model || 'claude-3-haiku-20240307');
    } else {
      result = await callOpenAI(s.apiKey, messages, model || 'gpt-3.5-turbo');
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upstream AI error' });
  }
});

async function callOpenAI(apiKey, messages, model) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function callAnthropic(apiKey, messages, model) {
  // Convert messages to Anthropic format
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: system || 'You are a helpful coding assistant.',
      messages: chatMessages
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Linux keypress simulation endpoint (informational; client handles actual keys)
app.post('/api/key', (req, res) => {
  const { key, sessionId } = req.body;
  console.log(`Linux key pressed: ${key} (session: ${sessionId})`);
  res.json({ ok: true, key });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Cline web UI listening on http://0.0.0.0:${PORT}`);
});
