/**
 * xuyueze.xyz — AI Chat UI
 * Floating chat button + streaming chat via POST /api/chat
 */

(function () {
  'use strict';

  // ── DOM refs ──
  const toggle = document.getElementById('chat-toggle');
  const drawer = document.getElementById('chat-drawer');
  const closeBtn = document.getElementById('chat-close');
  const messagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const inputEn = document.getElementById('chat-input-en');
  const sendBtn = document.getElementById('chat-send');

  // ── State ──
  const conversation = [];
  let isStreaming = false;

  // ── Active input: show the one matching current language ──
  function syncInputPlaceholder() {
    const isZh = document.body.classList.contains('lang-zh');
    input.style.display = isZh ? '' : 'none';
    inputEn.style.display = isZh ? 'none' : '';
    if (isZh) input.focus();
    else inputEn.focus();
  }

  function getActiveInput() {
    return document.body.classList.contains('lang-zh') ? input : inputEn;
  }

  function getActiveInputValue() {
    return getActiveInput().value.trim();
  }

  function setActiveInputValue(val) {
    getActiveInput().value = val;
  }

  // ── Toggle drawer ──
  toggle.addEventListener('click', () => {
    drawer.classList.toggle('open');
    if (drawer.classList.contains('open')) {
      syncInputPlaceholder();
    }
  });

  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
  });

  // ── Send button state ──
  function updateSendButton() {
    sendBtn.disabled = isStreaming || getActiveInputValue() === '';
  }

  getActiveInput().addEventListener('input', updateSendButton);
  // Listen on both inputs
  input.addEventListener('input', updateSendButton);
  inputEn.addEventListener('input', updateSendButton);

  // ── Add a message bubble ──
  function addMessage(role, content) {
    // Remove welcome message on first user message
    const welcome = messagesEl.querySelector('.welcome-msg');
    if (welcome && role === 'user') welcome.remove();

    const div = document.createElement('div');
    div.className = 'message ' + role;
    const inner = document.createElement('div');
    inner.className = 'content';
    inner.textContent = content;
    div.appendChild(inner);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  // ── Get or create loading message ──
  function getLoadingMsg() {
    let loading = messagesEl.querySelector('.message.assistant.loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.className = 'message assistant loading';
      const inner = document.createElement('div');
      inner.className = 'content';
      loading.appendChild(inner);
      messagesEl.appendChild(loading);
    }
    return loading;
  }

  function setLoadingContent(text) {
    const loading = getLoadingMsg();
    loading.querySelector('.content').textContent = text;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function finishLoading() {
    const loading = messagesEl.querySelector('.message.assistant.loading');
    if (loading) {
      loading.classList.remove('loading');
    }
  }

  function removeLoading() {
    const loading = messagesEl.querySelector('.message.assistant.loading');
    if (loading) loading.remove();
  }

  // ── Send message ──
  async function sendMessage() {
    const text = getActiveInputValue();
    if (!text || isStreaming) return;

    setActiveInputValue('');
    updateSendButton();

    // Add user message
    addMessage('user', text);
    conversation.push({ role: 'user', content: text });

    isStreaming = true;
    updateSendButton();

    // Show loading indicator
    getLoadingMsg();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversation,
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'HTTP ' + response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              setLoadingContent(fullReply);
            }
          } catch (_) {
            // Skip malformed JSON chunks
          }
        }
      }

      // Final flush
      if (buffer.startsWith('data: ')) {
        try {
          const chunk = JSON.parse(buffer.slice(6));
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) fullReply += delta;
        } catch (_) {}
      }

      // Strip think blocks for display
      const cleanReply = fullReply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      if (cleanReply) {
        finishLoading();
        // Update the content to cleaned version
        const loading = messagesEl.querySelector('.message.assistant:last-child');
        if (loading) {
          loading.querySelector('.content').textContent = cleanReply;
        }
        conversation.push({ role: 'assistant', content: fullReply });
      } else {
        removeLoading();
        addMessage('assistant', '(empty response)');
        conversation.push({ role: 'assistant', content: fullReply });
      }
    } catch (err) {
      removeLoading();
      addMessage('assistant', 'Error: ' + err.message);
    } finally {
      isStreaming = false;
      updateSendButton();
    }
  }

  // ── Enter to send ──
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  inputEn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // ── Listen for language toggle to switch input ──
  const origToggle = window.toggleLanguage;
  window.toggleLanguage = function () {
    origToggle();
    syncInputPlaceholder();
  };

  // Initial sync
  setTimeout(syncInputPlaceholder, 100);
})();
