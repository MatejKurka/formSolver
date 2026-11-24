const ext = typeof browser !== 'undefined' ? browser : chrome;
const DEFAULT_API_KEY = '';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleKeyVisBtn = document.getElementById('toggleKeyVis');
  const modelNameInput = document.getElementById('modelName');
  const toggleKeyInput = document.getElementById('toggleKey');
  const hintOpacityInput = document.getElementById('hintOpacity');
  const opacityVal = document.getElementById('opacityVal');
  const autoFallbackCheckbox = document.getElementById('autoFallback');
  const saveBtn = document.getElementById('saveBtn');
  const solveAllBtn = document.getElementById('solveAllBtn');
  const statusMsg = document.getElementById('statusMsg');
  const rpmBadge = document.getElementById('rpmBadge');
  const kbdDisplay = document.getElementById('kbdDisplay');

  ext.storage.local
    .get(['geminiApiKey', 'geminiModel', 'toggleKey', 'hintOpacity', 'autoFallbackOn404'])
    .then((data) => {
      if (data && data.geminiApiKey) {
        apiKeyInput.value = data.geminiApiKey;
      } else {
        apiKeyInput.value = DEFAULT_API_KEY;
        ext.storage.local.set({ geminiApiKey: DEFAULT_API_KEY }).catch(() => {});
      }
      if (data && data.geminiModel && !data.geminiModel.startsWith('gemini-2.')) {
        modelNameInput.value = data.geminiModel;
      } else {
        modelNameInput.value = 'gemini-3.5-flash-lite';
        ext.storage.local.set({ geminiModel: 'gemini-3.5-flash-lite' }).catch(() => {});
      }
      if (data && data.toggleKey) {
        toggleKeyInput.value = data.toggleKey;
        kbdDisplay.textContent = data.toggleKey;
      }
      if (data && data.hintOpacity !== undefined) {
        const pct = Math.min(100, Math.max(2, Number(data.hintOpacity) || 16));
        hintOpacityInput.value = String(pct);
        opacityVal.textContent = `${pct}%`;
      }
      if (data) {
        autoFallbackCheckbox.checked = data.autoFallbackOn404 !== false;
      }
    })
    .catch(() => {});

  toggleKeyVisBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyVisBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyVisBtn.textContent = 'Show';
    }
  });

  toggleKeyInput.addEventListener('input', () => {
    const val = toggleKeyInput.value || '`';
    kbdDisplay.textContent = val;
  });

  hintOpacityInput.addEventListener('input', () => {
    const pct = Number(hintOpacityInput.value) || 16;
    opacityVal.textContent = `${pct}%`;
    ext.storage.local.set({ hintOpacity: pct }).catch(() => {});
    ext.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab && activeTab.id) {
          ext.tabs.sendMessage(activeTab.id, { type: 'SET_OPACITY', hintOpacity: pct }).catch(() => {});
        }
      })
      .catch(() => {});
  });

  saveBtn.addEventListener('click', () => {
    const geminiApiKey = apiKeyInput.value.trim() || DEFAULT_API_KEY;
    const geminiModel = modelNameInput.value.trim() || 'gemini-3.5-flash-lite';
    const toggleKey = toggleKeyInput.value || '`';
    const hintOpacity = Number(hintOpacityInput.value) || 16;
    const autoFallbackOn404 = autoFallbackCheckbox.checked;

    ext.storage.local
      .set({
        geminiApiKey,
        geminiModel,
        toggleKey,
        hintOpacity,
        autoFallbackOn404
      })
      .then(() => {
        statusMsg.classList.remove('error');
        statusMsg.textContent = 'Saved';
        setTimeout(() => {
          statusMsg.textContent = '';
        }, 2000);
      })
      .catch(() => {});
  });

  if (solveAllBtn) {
    solveAllBtn.addEventListener('click', () => {
      ext.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const activeTab = tabs && tabs[0];
          if (!activeTab || !activeTab.id) {
            statusMsg.textContent = 'Open a Google Form tab';
            return;
          }
          return ext.tabs.sendMessage(activeTab.id, { type: 'FILL_ALL_FROM_POPUP' });
        })
        .then(() => {
          statusMsg.textContent = 'Solving form...';
          setTimeout(() => {
            statusMsg.textContent = '';
          }, 2000);
        })
        .catch(() => {
          statusMsg.textContent = 'Reload the Google Form tab';
        });
    });
  }

  function refreshRateLimitStatus() {
    ext.runtime
      .sendMessage({ type: 'GET_RATE_LIMIT_STATUS' })
      .then((res) => {
        if (!res || !res.ok) return;
        const qSuffix = res.queueLength > 0 ? ` (${res.queueLength})` : '';
        rpmBadge.textContent = `${res.usedInLastMinute} / ${res.maxRpm} RPM${qSuffix}`;
      })
      .catch(() => {});
  }

  refreshRateLimitStatus();
  setInterval(refreshRateLimitStatus, 1500);
});
