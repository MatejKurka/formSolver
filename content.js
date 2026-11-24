(() => {
  const isBrowserNamespace = typeof browser !== 'undefined';
  const ext = isBrowserNamespace ? browser : chrome;

  const solvedAnswers = new Map();
  const pendingQuestions = new Set();
  let isSolvingAll = false;
  let visibilityHidden = false;
  let configuredToggleKey = '`';

  function applyHintOpacity(opacityPercent) {
    const pct = Math.min(100, Math.max(1, Number(opacityPercent) || 16));
    const alpha = +(pct / 100).toFixed(3);
    const ghostAlpha = +Math.min(1, Math.max(0.04, (pct * 1.5) / 100)).toFixed(3);
    const shade = Math.round(255 * (1 - alpha));
    document.documentElement.style.setProperty('--gf-hint-opacity', String(alpha));
    document.documentElement.style.setProperty(
      '--gf-checkbox-bg',
      `rgb(${shade}, ${shade}, ${shade})`
    );
    document.documentElement.style.setProperty('--gf-ghost-opacity', String(ghostAlpha));
  }

  ext.storage.local
    .get(['toggleKey', 'startHidden', 'hintOpacity'])
    .then((data) => {
      if (data && data.toggleKey && typeof data.toggleKey === 'string') {
        configuredToggleKey = data.toggleKey;
      }
      if (data && data.startHidden === true) {
        setVisibilityHidden(true);
      }
      if (data && data.hintOpacity !== undefined) {
        applyHintOpacity(data.hintOpacity);
      } else {
        applyHintOpacity(16);
      }
    })
    .catch(() => {});

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.toggleKey?.newValue) {
        configuredToggleKey = changes.toggleKey.newValue;
      }
      if (changes.hintOpacity?.newValue !== undefined) {
        applyHintOpacity(changes.hintOpacity.newValue);
      }
    }
  });

  function setVisibilityHidden(hidden) {
    visibilityHidden = Boolean(hidden);
    if (visibilityHidden) {
      document.documentElement.classList.add('gf-stealth-hidden');
    } else {
      document.documentElement.classList.remove('gf-stealth-hidden');
    }
  }

  function toggleVisibility() {
    setVisibilityHidden(!visibilityHidden);
  }

  window.addEventListener(
    'keydown',
    (e) => {
      const active = document.activeElement;
      const isTyping =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        e.stopPropagation();
        toggleVisibility();
        return;
      }

      if (
        !isTyping &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === configuredToggleKey.toLowerCase()
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleVisibility();
      }
    },
    true
  );

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === 'TOGGLE_VISIBILITY') {
      toggleVisibility();
      const resp = { ok: true, visibilityHidden };
      if (isBrowserNamespace) return Promise.resolve(resp);
      sendResponse(resp);
      return false;
    }

    if (message.type === 'SET_OPACITY') {
      applyHintOpacity(message.hintOpacity);
      const resp = { ok: true };
      if (isBrowserNamespace) return Promise.resolve(resp);
      sendResponse(resp);
      return false;
    }

    if (message.type === 'FILL_ALL_FROM_POPUP') {
      showAllQuestionHints();
      const resp = { ok: true };
      if (isBrowserNamespace) return Promise.resolve(resp);
      sendResponse(resp);
      return false;
    }

    if (message.type === 'RATE_LIMIT_WAIT') {
      const secs = Math.ceil((message.waitMs || 0) / 1000);
      updateSneakyBottomButtonStatus(`· ${secs}s ·`);
      return false;
    }

    return false;
  });

  function getQuestionElements() {
    const candidates = Array.from(
      document.querySelectorAll('div[role="listitem"], .Qr7Oae')
    );

    return candidates.filter((el) => {
      const hasHeading = Boolean(el.querySelector('[role="heading"], .M7eMe'));
      const hasControl = Boolean(
        el.querySelector(
          '[role="radio"], [role="checkbox"], [role="listbox"], input:not([type="hidden"]), textarea'
        )
      );
      return hasHeading && hasControl;
    });
  }

  function getQuestionId(questionEl, fallbackIndex) {
    if (questionEl.dataset.gfQuestionId) {
      return questionEl.dataset.gfQuestionId;
    }

    const paramsEl = questionEl.querySelector('[data-params]') || questionEl;
    const rawParams = paramsEl.getAttribute('data-params') || '';
    const match = rawParams.match(/\[\s*(\d{4,})/);
    const id = match ? `q_${match[1]}` : `q_idx_${fallbackIndex}`;
    questionEl.dataset.gfQuestionId = id;
    return id;
  }

  function getOptionText(controlEl) {
    const dataVal =
      controlEl.getAttribute('data-value') ||
      controlEl.getAttribute('data-answer-value');
    if (dataVal && dataVal.trim()) {
      return dataVal.trim();
    }

    const ariaLabel = controlEl.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return ariaLabel.trim();
    }

    const container =
      controlEl.closest('.docssharedWizToggleLabeledContainer, .nWQGrd, .eBFwI, label') ||
      controlEl.parentElement;
    if (container) {
      const labelSpan = container.querySelector('.aDTYNe, span[dir="auto"]');
      if (labelSpan && labelSpan.innerText.trim()) {
        return labelSpan.innerText.trim();
      }
      if (container.innerText.trim()) {
        return container.innerText.trim();
      }
    }

    return '';
  }

  function getGridRowElements(questionEl, controlRole) {
    const candidates = Array.from(
      questionEl.querySelectorAll('.lLfZXe, .EzyPc, [role="radiogroup"], [role="group"]')
    );
    return candidates.filter(
      (rowEl) => rowEl.querySelectorAll(`[role="${controlRole}"]`).length > 1
    );
  }

  function parseQuestionElement(questionEl, index) {
    const id = getQuestionId(questionEl, index);

    const headingTextEl =
      questionEl.querySelector('[role="heading"] .M7eMe') ||
      questionEl.querySelector('.M7eMe') ||
      questionEl.querySelector('[role="heading"]');

    let title = '';
    if (headingTextEl) {
      title = headingTextEl.innerText.replace(/\*\s*$/, '').trim();
    }

    const descEl = questionEl.querySelector(
      '.gubaDc, .freebirdFormviewerComponentsQuestionBaseDescription'
    );
    const description = descEl ? descEl.innerText.trim() : '';

    const radios = Array.from(questionEl.querySelectorAll('[role="radio"]'));
    const checkboxes = Array.from(questionEl.querySelectorAll('[role="checkbox"]'));
    const listbox = questionEl.querySelector('[role="listbox"]');
    const textarea = questionEl.querySelector('textarea');
    const dateInput = questionEl.querySelector('input[type="date"]');
    const timeInput = questionEl.querySelector('input[type="time"]');
    const allTextInputs = Array.from(
      questionEl.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="number"], input[type="url"], input[type="tel"], input[type="date"], input[type="time"], input:not([type="hidden"])'
      )
    );
    const textInput = allTextInputs[0] || null;

    const radioGridRows = getGridRowElements(questionEl, 'radio');
    const checkboxGridRows = getGridRowElements(questionEl, 'checkbox');

    let type = 'text';
    let options = [];
    let gridRows = [];
    let gridColumns = [];
    let currentAnswer = null;

    if (radios.length > 0 && radioGridRows.length > 1) {
      type = 'grid_radio';
      gridRows = radioGridRows.map((rowEl, rIdx) => {
        const rowLabelEl = rowEl.querySelector('.V4d7Ke, .snByac, [role="presentation"]');
        return rowLabelEl ? rowLabelEl.innerText.trim() : `Row ${rIdx + 1}`;
      });
      const firstRowRadios = Array.from(radioGridRows[0].querySelectorAll('[role="radio"]'));
      gridColumns = firstRowRadios.map(
        (r, cIdx) =>
          r.getAttribute('data-value') || r.getAttribute('aria-label') || `Col ${cIdx + 1}`
      );
    } else if (checkboxes.length > 0 && checkboxGridRows.length > 1) {
      type = 'grid_checkbox';
      gridRows = checkboxGridRows.map((rowEl, rIdx) => {
        const rowLabelEl = rowEl.querySelector('.V4d7Ke, .snByac, [role="presentation"]');
        return rowLabelEl ? rowLabelEl.innerText.trim() : `Row ${rIdx + 1}`;
      });
      const firstRowCheckboxes = Array.from(
        checkboxGridRows[0].querySelectorAll('[role="checkbox"]')
      );
      const colHeaders = Array.from(questionEl.querySelectorAll('.ssX1Bd .V4d7Ke'));
      gridColumns = firstRowCheckboxes.map((c, cIdx) => {
        if (colHeaders[cIdx] && colHeaders[cIdx].innerText.trim()) {
          return colHeaders[cIdx].innerText.trim();
        }
        return (
          c.getAttribute('data-answer-value') ||
          c.getAttribute('data-value') ||
          c.getAttribute('aria-label') ||
          `Col ${cIdx + 1}`
        );
      });
    } else if (radios.length > 0) {
      const isScale = Boolean(questionEl.querySelector('.N9Qcwe, .T5pZmf'));
      type = isScale ? 'scale' : 'radio';
      options = radios.map((r, i) => getOptionText(r) || `Option ${i + 1}`);
      const checked = radios.find((r) => r.getAttribute('aria-checked') === 'true');
      if (checked) {
        currentAnswer = getOptionText(checked);
      }
    } else if (checkboxes.length > 0) {
      type = 'checkbox';
      options = checkboxes.map((c, i) => getOptionText(c) || `Option ${i + 1}`);
      const checkedList = checkboxes
        .filter((c) => c.getAttribute('aria-checked') === 'true')
        .map((c) => getOptionText(c));
      if (checkedList.length > 0) {
        currentAnswer = checkedList;
      }
    } else if (listbox) {
      type = 'dropdown';
      const optEls = Array.from(listbox.querySelectorAll('[role="option"]'));
      options = optEls
        .map((o) => (o.getAttribute('data-value') || o.innerText || '').trim())
        .filter((val) => val && val.toLowerCase() !== 'choose');
      const selectedOpt = optEls.find((o) => o.getAttribute('aria-selected') === 'true');
      if (selectedOpt) {
        const val = (selectedOpt.getAttribute('data-value') || selectedOpt.innerText || '').trim();
        if (val && val.toLowerCase() !== 'choose') {
          currentAnswer = val;
        }
      }
    } else if (textarea) {
      type = 'paragraph';
      if (textarea.value && textarea.value.trim()) {
        currentAnswer = textarea.value.trim();
      }
    } else if (dateInput) {
      type = 'date';
      if (dateInput.value && dateInput.value.trim()) {
        currentAnswer = dateInput.value.trim();
      }
    } else if (timeInput) {
      type = 'time';
      if (timeInput.value && timeInput.value.trim()) {
        currentAnswer = timeInput.value.trim();
      }
    } else if (textInput) {
      type = 'text';
      const filledVals = allTextInputs
        .map((inp) => (inp.value || '').trim())
        .filter(Boolean);
      if (filledVals.length > 0) {
        currentAnswer = filledVals.join(' / ');
      }
    }

    return {
      id,
      index,
      title,
      description,
      type,
      options,
      gridRows,
      gridColumns,
      currentAnswer,
      resolvedAnswer: solvedAnswers.get(id) || null
    };
  }

  function extractFullFormContext() {
    const titleEl =
      document.querySelector('.F9yp7e') ||
      document.querySelector('[role="heading"][aria-level="1"]');
    const descEl = document.querySelector('.cBGGJ');

    const formTitle = titleEl ? titleEl.innerText.trim() : document.title;
    const formDescription = descEl ? descEl.innerText.trim() : '';

    const questionEls = getQuestionElements();
    const questions = questionEls.map((el, idx) => parseQuestionElement(el, idx));

    return {
      formTitle,
      formDescription,
      questions
    };
  }

  function attachFirstWordTrigger(questionEl, index) {
    const qId = getQuestionId(questionEl, index);
    if (questionEl.querySelector('.gf-first-word-trigger')) {
      return;
    }

    const headingContainer =
      questionEl.querySelector('[role="heading"] .M7eMe') ||
      questionEl.querySelector('.M7eMe') ||
      questionEl.querySelector('[role="heading"]');

    if (!headingContainer) return;

    const walker = document.createTreeWalker(
      headingContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_SKIP;
          }
          if (node.parentElement && node.parentElement.classList.contains('vnumgf')) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const firstTextNode = walker.nextNode();
    if (!firstTextNode) return;

    const fullText = firstTextNode.nodeValue;
    const match = fullText.match(/^(\s*(?:(?:Q?\d+|[a-zA-Z])[.)\]:-]\s*)?(?:\S{1,3}\s+\S+|\S+))([\s\S]*)$/);
    if (!match) return;

    const firstWordPart = match[1];
    const remainderPart = match[2];

    const triggerSpan = document.createElement('span');
    triggerSpan.className = 'gf-first-word-trigger';
    triggerSpan.dataset.gfQuestionId = qId;
    triggerSpan.textContent = firstWordPart;

    triggerSpan.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (solvedAnswers.has(qId)) {
        renderSneakyHint(questionEl, solvedAnswers.get(qId));
        return;
      }

      await solveSingleQuestion(questionEl);
    });

    const parent = firstTextNode.parentNode;
    parent.insertBefore(triggerSpan, firstTextNode);
    firstTextNode.nodeValue = remainderPart;
  }

  function resolveMatchedOptionIndices(optionsList, answerObj) {
    const matched = new Set();
    if (!answerObj || !Array.isArray(optionsList) || optionsList.length === 0) {
      return [];
    }

    if (Array.isArray(answerObj.selectedIndices)) {
      for (const idx of answerObj.selectedIndices) {
        const num = Number(idx);
        if (Number.isInteger(num) && num >= 0 && num < optionsList.length) {
          matched.add(num);
        }
      }
    }

    const candidateTexts = [];
    if (Array.isArray(answerObj.selectedOptions)) {
      candidateTexts.push(...answerObj.selectedOptions);
    }
    if (
      matched.size === 0 &&
      typeof answerObj.textAnswer === 'string' &&
      answerObj.textAnswer.trim()
    ) {
      candidateTexts.push(answerObj.textAnswer.trim());
    }

    const norm = (str) =>
      String(str || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    for (const cand of candidateTexts) {
      const normCand = norm(cand);
      if (!normCand) continue;

      let exactMatched = false;
      optionsList.forEach((opt, idx) => {
        if (norm(opt) === normCand) {
          matched.add(idx);
          exactMatched = true;
        }
      });

      if (!exactMatched) {
        optionsList.forEach((opt, idx) => {
          const normOpt = norm(opt);
          if (normOpt && (normOpt.includes(normCand) || normCand.includes(normOpt))) {
            matched.add(idx);
          }
        });
      }
    }

    return Array.from(matched);
  }

  function renderSneakyHint(questionEl, answerObj) {
    if (!questionEl || !answerObj) return;

    const qIndex = getQuestionElements().indexOf(questionEl);
    const descriptor = parseQuestionElement(questionEl, qIndex >= 0 ? qIndex : 0);

    questionEl
      .querySelectorAll('.gf-hint-radio, .gf-hint-checkbox')
      .forEach((el) => {
        el.classList.remove('gf-hint-radio', 'gf-hint-checkbox');
      });
    questionEl.querySelectorAll('.gf-ghost-answer').forEach((el) => el.remove());

    if (descriptor.type === 'radio' || descriptor.type === 'scale') {
      const radios = Array.from(questionEl.querySelectorAll('[role="radio"]'));
      const indices = resolveMatchedOptionIndices(descriptor.options, answerObj);
      const targetIdx = indices[0];
      if (targetIdx !== undefined && radios[targetIdx]) {
        radios[targetIdx].classList.add('gf-hint-radio');
      }
    } else if (descriptor.type === 'checkbox') {
      const checkboxes = Array.from(questionEl.querySelectorAll('[role="checkbox"]'));
      const indices = resolveMatchedOptionIndices(descriptor.options, answerObj);
      for (const idx of indices) {
        if (checkboxes[idx]) {
          checkboxes[idx].classList.add('gf-hint-checkbox');
        }
      }
    } else if (descriptor.type === 'grid_radio') {
      const gridRowGroups = getGridRowElements(questionEl, 'radio');
      const gridMap = answerObj.gridAnswers || {};
      gridRowGroups.forEach((rowEl, rIdx) => {
        const rowRadios = Array.from(rowEl.querySelectorAll('[role="radio"]'));
        const cols = gridMap[String(rIdx)] || gridMap[rIdx] || [];
        const colIdx = Array.isArray(cols) ? Number(cols[0]) : Number(cols);
        if (Number.isInteger(colIdx) && rowRadios[colIdx]) {
          rowRadios[colIdx].classList.add('gf-hint-radio');
        }
      });
    } else if (descriptor.type === 'grid_checkbox') {
      const gridRowGroups = getGridRowElements(questionEl, 'checkbox');
      const gridMap = answerObj.gridAnswers || {};
      gridRowGroups.forEach((rowEl, rIdx) => {
        const rowCheckboxes = Array.from(rowEl.querySelectorAll('[role="checkbox"]'));
        const rawCols = gridMap[String(rIdx)] || gridMap[rIdx] || [];
        const colList = Array.isArray(rawCols) ? rawCols : [rawCols];
        for (const c of colList) {
          const colIdx = Number(c);
          if (Number.isInteger(colIdx) && rowCheckboxes[colIdx]) {
            rowCheckboxes[colIdx].classList.add('gf-hint-checkbox');
          }
        }
      });
    } else if (
      descriptor.type === 'text' ||
      descriptor.type === 'paragraph' ||
      descriptor.type === 'dropdown' ||
      descriptor.type === 'date' ||
      descriptor.type === 'time'
    ) {
      const displayAnswer =
        (typeof answerObj.textAnswer === 'string' && answerObj.textAnswer.trim()) ||
        (Array.isArray(answerObj.selectedOptions) && answerObj.selectedOptions[0]) ||
        '';

      if (!displayAnswer) return;

      const ghost = document.createElement('div');
      ghost.className = 'gf-ghost-answer';
      ghost.textContent = displayAnswer;

      const inputEls = Array.from(
        questionEl.querySelectorAll(
          'textarea, input[type="text"], input[type="email"], input[type="number"], input[type="url"], input[type="tel"], input[type="date"], input[type="time"], input:not([type="hidden"])'
        )
      );

      if (inputEls.length > 0) {
        const syncGhostVis = () => {
          const anyFilled = inputEls.some(
            (inp) => inp.value && inp.value.trim().length > 0
          );
          if (anyFilled) {
            ghost.classList.add('gf-ghost-filled');
          } else {
            ghost.classList.remove('gf-ghost-filled');
          }
        };
        syncGhostVis();
        for (const inp of inputEls) {
          inp.addEventListener('input', syncGhostVis);
          inp.addEventListener('change', syncGhostVis);
        }
      }

      if (descriptor.type === 'dropdown' && questionEl.querySelector('[role="listbox"]')) {
        const lb = questionEl.querySelector('[role="listbox"]');
        const syncDropdownVis = () => {
          const selectedOpt = lb.querySelector('[role="option"][aria-selected="true"]');
          const val = selectedOpt
            ? (selectedOpt.getAttribute('data-value') || selectedOpt.innerText || '').trim()
            : '';
          if (val && val.toLowerCase() !== 'choose') {
            ghost.classList.add('gf-ghost-filled');
          } else {
            ghost.classList.remove('gf-ghost-filled');
          }
        };
        syncDropdownVis();
        const lbObserver = new MutationObserver(syncDropdownVis);
        lbObserver.observe(lb, { attributes: true, subtree: true });
      }

      const targetContainer =
        questionEl.querySelector('.rFrNMe, .Pc9Gce, .jgvuAb, [role="listbox"]') ||
        inputEls[0]?.parentElement ||
        questionEl;

      if (targetContainer.parentElement) {
        targetContainer.parentElement.appendChild(ghost);
      } else {
        targetContainer.appendChild(ghost);
      }
    }
  }

  async function solveSingleQuestion(questionEl) {
    const questionEls = getQuestionElements();
    const qIndex = questionEls.indexOf(questionEl);
    if (qIndex === -1) return null;

    const qId = getQuestionId(questionEl, qIndex);
    if (pendingQuestions.has(qId)) return null;

    const triggerSpan = questionEl.querySelector('.gf-first-word-trigger');
    if (triggerSpan) {
      triggerSpan.classList.remove('gf-error');
      triggerSpan.classList.add('gf-loading');
    }
    pendingQuestions.add(qId);

    try {
      const formContext = extractFullFormContext();
      const targetQuestion = formContext.questions[qIndex];

      const response = await ext.runtime.sendMessage({
        type: 'SOLVE_QUESTION',
        formContext,
        targetQuestion
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || 'Failed to solve question.');
      }

      const answerObj = response.answer;
      solvedAnswers.set(qId, answerObj);

      renderSneakyHint(questionEl, answerObj);

      return answerObj;
    } catch (err) {
      if (triggerSpan) {
        triggerSpan.classList.add('gf-error');
        triggerSpan.title = err.message || 'API error';
      }
      return null;
    } finally {
      pendingQuestions.delete(qId);
      if (triggerSpan) {
        triggerSpan.classList.remove('gf-loading');
      }
    }
  }

  function updateSneakyBottomButtonStatus(text) {
    document.querySelectorAll('.gf-sneaky-fill-btn').forEach((btn) => {
      btn.textContent = text;
    });
  }

  async function showAllQuestionHints() {
    if (isSolvingAll) return;
    isSolvingAll = true;

    const questionEls = getQuestionElements();
    const total = questionEls.length;

    try {
      for (let i = 0; i < total; i++) {
        const qEl = questionEls[i];
        const qId = getQuestionId(qEl, i);
        updateSneakyBottomButtonStatus(`${i + 1}/${total}`);

        if (solvedAnswers.has(qId)) {
          renderSneakyHint(qEl, solvedAnswers.get(qId));
        } else {
          await solveSingleQuestion(qEl);
        }
      }
    } finally {
      isSolvingAll = false;
      updateSneakyBottomButtonStatus('· · ·');
    }
  }

  function attachSneakyBottomButton() {
    const questionEls = getQuestionElements();
    if (questionEls.length === 0) return;

    const lastQuestionCard = questionEls[questionEls.length - 1];
    const innerCard = lastQuestionCard.querySelector('.geS5n') || lastQuestionCard;

    if (!innerCard.querySelector('.gf-card-corner-wrap')) {
      document.querySelectorAll('.gf-card-corner-wrap').forEach((el) => el.remove());

      const cornerWrap = document.createElement('div');
      cornerWrap.className = 'gf-card-corner-wrap';

      const cardBtn = document.createElement('button');
      cardBtn.type = 'button';
      cardBtn.className = 'gf-sneaky-fill-btn';
      cardBtn.textContent = '· · ·';
      cardBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAllQuestionHints();
      });

      cornerWrap.appendChild(cardBtn);
      innerCard.appendChild(cornerWrap);
    }

    const submitBar = document.querySelector('.DE3NNc, .ThHDze, .lRwqcd');
    if (submitBar && !submitBar.querySelector('.gf-sneaky-fill-btn')) {
      const submitRowBtn = document.createElement('button');
      submitRowBtn.type = 'button';
      submitRowBtn.className = 'gf-sneaky-fill-btn';
      submitRowBtn.textContent = '· · ·';
      submitRowBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAllQuestionHints();
      });
      submitBar.appendChild(submitRowBtn);
    }

    const footerEls = document.querySelectorAll('.I3rNkc, .v1CNvb, .sId0Ce');
    footerEls.forEach((footerEl) => {
      if (!footerEl.dataset.gfHooked) {
        footerEl.dataset.gfHooked = 'true';
        footerEl.addEventListener(
          'click',
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            showAllQuestionHints();
          },
          true
        );
      }
    });
  }

  function initFormEnhancements() {
    const questionEls = getQuestionElements();
    questionEls.forEach((qEl, idx) => {
      attachFirstWordTrigger(qEl, idx);
    });
    if (questionEls.length > 0) {
      attachSneakyBottomButton();
    }
  }

  initFormEnhancements();

  const observer = new MutationObserver(() => {
    initFormEnhancements();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
