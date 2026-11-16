const API = window.location.origin;
const SESSION_ID = 'cline-' + Math.random().toString(36).slice(2);

const apiKey = document.getElementById('apiKey');
const provider = document.getElementById('provider');
const btnAuth = document.getElementById('btnAuth');
const authStatus = document.getElementById('authStatus');
const sessionInfo = document.getElementById('sessionInfo');
const messages = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const input = document.getElementById('input');
const btnSend = document.getElementById('btnSend');

let authenticated = false;

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'status ' + kind;
}

async function checkAuth() {
  try {
    const r = await fetch(`${API}/api/auth/status?sessionId=${SESSION_ID}`);
    const j = await r.json();
    authenticated = !!j.authenticated;
    sessionInfo.textContent = j.authenticated ? `Connected (${j.provider})` : 'Not connected';
    sessionInfo.className = 'session-info ' + (j.authenticated ? 'ok' : 'err');
    btnAuth.textContent = j.authenticated ? 'Reconnect' : 'Connect';
  } catch (e) {
    sessionInfo.textContent = 'Auth check failed';
  }
}

btnAuth.addEventListener('click', async () => {
  const key = apiKey.value.trim();
  if (!key) {
    setStatus(authStatus, 'Enter your API key', 'err');
    return;
  }
  btnAuth.disabled = true;
  try {
    await fetch(`${API}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, apiKey: key, provider: provider.value })
    });
    authenticated = true;
    setStatus(authStatus, 'Connected', 'ok');
    sessionInfo.textContent = `Connected (${provider.value})`;
    sessionInfo.className = 'session-info ok';
    btnAuth.textContent = 'Reconnect';
  } catch (e) {
    setStatus(authStatus, 'Auth failed', 'err');
  } finally {
    btnAuth.disabled = false;
  }
});

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const content = document.createElement('div');
  content.textContent = text;
  div.appendChild(content);
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(meta);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setSending(s) {
  btnSend.disabled = s;
  input.disabled = s;
  btnSend.textContent = s ? 'Sending...' : 'Send';
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!authenticated) {
    setStatus(authStatus, 'Please connect your API key first', 'err');
    return;
  }
  addMessage(text, 'user');
  input.value = '';
  setSending(true);

  try {
    const r = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, messages: [{ role: 'user', content: text }], model: provider.value === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-3.5-turbo' })
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || 'Chat failed');
    }
    const j = await r.json();
    let reply = '';
    if (provider.value === 'anthropic') {
      reply = (j.content && j.content[0] && j.content[0].text) || '(no response)';
    } else {
      reply = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(no response)';
    }
    addMessage(reply, 'ai');
  } catch (err) {
    addMessage('Error: ' + err.message, 'ai');
    setStatus(authStatus, err.message, 'err');
  } finally {
    setSending(false);
  }
});

// Linux control buttons - fire keypress events + notify server
document.querySelectorAll('.key').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    // dispatch a keyboard event on the page so any focused element receives it
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.activeElement ? document.activeElement.dispatchEvent(ev) : document.body.dispatchEvent(ev);
    // notify server (informational)
    fetch(`${API}/api/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, key })
    }).catch(() => {});
  });
});

checkAuth();
