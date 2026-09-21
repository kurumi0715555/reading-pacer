export {};

const SAMPLE_TEXT = 'I usually get up at seven. I eat breakfast with my family. Then I go to school by bike.';

type DisplayMode = 'highlight' | 'fade' | 'vanish';

interface SharedPayload {
  v: 1;
  text: string;
  speed?: number;
  mode?: string;
  lead?: number;
  pause?: boolean;
}

interface InputElements {
  textInput: HTMLTextAreaElement;
  speedSlider: HTMLInputElement;
  speedInput: HTMLInputElement;
  leadInput: HTMLSelectElement;
  pausePunctuation: HTMLInputElement;
  prepareBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  fullscreenBtn: HTMLButtonElement;
  makeShareBtn: HTMLButtonElement;
  copyShareBtn: HTMLButtonElement;
  nativeShareBtn: HTMLButtonElement;
  shareUrlInput: HTMLInputElement;
  shareHint: HTMLElement;
  message: HTMLElement;
  pacerStage: HTMLElement;
  pacerState: HTMLElement;
  pacerSubstate: HTMLElement;
  wordCount: HTMLElement;
  timeEstimate: HTMLElement;
  progressBar: HTMLElement;
  readingText: HTMLElement;
  stageBackBtn: HTMLButtonElement;
  stageStartBtn: HTMLButtonElement;
  stageForwardBtn: HTMLButtonElement;
  modeInputs: NodeListOf<HTMLInputElement>;
  pacePresetBtns: NodeListOf<HTMLButtonElement>;
}

function assertElement<T extends HTMLElement>(element: Element | null, selector: string): asserts element is T {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Required element was not found: ${selector}`);
  }
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  assertElement<T>(element, `#${id}`);
  return element;
}

function isDisplayMode(value: string | undefined): value is DisplayMode {
  return value === 'highlight' || value === 'fade' || value === 'vanish';
}

function isSharedPayload(value: unknown): value is SharedPayload {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return record.v === 1 && typeof record.text === 'string';
}

const elements: InputElements = {
  textInput: getElement<HTMLTextAreaElement>('textInput'),
  speedSlider: getElement<HTMLInputElement>('speedSlider'),
  speedInput: getElement<HTMLInputElement>('speedInput'),
  leadInput: getElement<HTMLSelectElement>('leadInput'),
  pausePunctuation: getElement<HTMLInputElement>('pausePunctuation'),
  prepareBtn: getElement<HTMLButtonElement>('prepareBtn'),
  startBtn: getElement<HTMLButtonElement>('startBtn'),
  pauseBtn: getElement<HTMLButtonElement>('pauseBtn'),
  resetBtn: getElement<HTMLButtonElement>('resetBtn'),
  fullscreenBtn: getElement<HTMLButtonElement>('fullscreenBtn'),
  makeShareBtn: getElement<HTMLButtonElement>('makeShareBtn'),
  copyShareBtn: getElement<HTMLButtonElement>('copyShareBtn'),
  nativeShareBtn: getElement<HTMLButtonElement>('nativeShareBtn'),
  shareUrlInput: getElement<HTMLInputElement>('shareUrlInput'),
  shareHint: getElement<HTMLElement>('shareHint'),
  message: getElement<HTMLElement>('message'),
  pacerStage: getElement<HTMLElement>('pacerStage'),
  pacerState: getElement<HTMLElement>('pacerState'),
  pacerSubstate: getElement<HTMLElement>('pacerSubstate'),
  wordCount: getElement<HTMLElement>('wordCount'),
  timeEstimate: getElement<HTMLElement>('timeEstimate'),
  progressBar: getElement<HTMLElement>('progressBar'),
  readingText: getElement<HTMLElement>('readingText'),
  stageBackBtn: getElement<HTMLButtonElement>('stageBackBtn'),
  stageStartBtn: getElement<HTMLButtonElement>('stageStartBtn'),
  stageForwardBtn: getElement<HTMLButtonElement>('stageForwardBtn'),
  modeInputs: document.querySelectorAll<HTMLInputElement>('input[name="displayMode"]'),
  pacePresetBtns: document.querySelectorAll<HTMLButtonElement>('.pace-preset'),
};

let words: string[] = [];
let currentIndex = -1;
let isRunning = false;
let timerId: number | null = null;
let countdownId: number | null = null;

function clampSpeed(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(180, Math.max(60, Math.trunc(parsed)));
}

function syncSpeed(value: string | number): void {
  const speed = clampSpeed(value);
  elements.speedSlider.value = String(speed);
  elements.speedInput.value = String(speed);
  updateEstimate();
  updatePacePresets();
}

function getMode(): DisplayMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="displayMode"]:checked');
  return isDisplayMode(checked?.value) ? checked.value : 'highlight';
}

function applyMode(): void {
  elements.modeInputs.forEach((input) => {
    const option = input.closest('.mode-option');
    if (option instanceof HTMLElement) option.classList.toggle('is-selected', input.checked);
  });
  elements.readingText.classList.remove('mode-highlight', 'mode-fade', 'mode-vanish');
  elements.readingText.classList.add(`mode-${getMode()}`);
}

function updatePacePresets(): void {
  const currentSpeed = clampSpeed(elements.speedInput.value);
  elements.pacePresetBtns.forEach((button) => {
    const speed = Number.parseInt(button.dataset.speed ?? '', 10);
    button.classList.toggle('is-selected', Number.isFinite(speed) && speed === currentSpeed);
  });
}

function showMessage(text: string): void {
  elements.message.textContent = text;
  elements.message.hidden = false;
}

function hideMessage(): void {
  elements.message.textContent = '';
  elements.message.hidden = true;
}

function stopTimers(): void {
  if (timerId !== null) window.clearTimeout(timerId);
  if (countdownId !== null) window.clearInterval(countdownId);
  timerId = null;
  countdownId = null;
}

function setButtons(running: boolean): void {
  elements.startBtn.hidden = running;
  elements.pauseBtn.hidden = !running;
  elements.stageStartBtn.innerHTML = running
    ? '<i class="fas fa-pause"></i><span>停止</span>'
    : '<i class="fas fa-play"></i><span>再生</span>';
  elements.stageStartBtn.setAttribute('aria-label', running ? '一時停止' : 'スタート');
}

function splitWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function renderText(text: string): void {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fragment = document.createDocumentFragment();
  let index = 0;

  lines.forEach((line) => {
    const lineElement = document.createElement('div');
    lineElement.className = 'reading-line';
    const lineWords = line.trim().split(/\s+/).filter(Boolean);

    if (lineWords.length === 0) lineElement.innerHTML = '&nbsp;';

    lineWords.forEach((word, wordIndex) => {
      const span = document.createElement('span');
      span.className = 'reading-word';
      span.dataset.index = String(index);
      span.textContent = word;
      span.addEventListener('click', () => {
        jumpToWord(Number.parseInt(span.dataset.index ?? '', 10));
      });
      lineElement.appendChild(span);

      if (wordIndex < lineWords.length - 1) lineElement.appendChild(document.createTextNode(' '));
      index += 1;
    });

    fragment.appendChild(lineElement);
  });

  elements.readingText.replaceChildren(fragment);
}

function wordWeight(index: number): number {
  const word = words[index] ?? '';

  if (!elements.pausePunctuation.checked) return 1;
  if (/[.!?]$/.test(word)) return 1.65;
  if (/[,;:]$/.test(word)) return 1.3;
  return 1;
}

function totalTargetMs(): number {
  const speed = clampSpeed(elements.speedInput.value);
  return words.length * 60000 / speed;
}

function wordDuration(index: number): number {
  if (words.length === 0) return 0;

  const totalWeight = words.reduce((sum, _word, wordIndex) => sum + wordWeight(wordIndex), 0);
  return totalTargetMs() * (wordWeight(index) / totalWeight);
}

function estimatedSeconds(): number {
  if (words.length === 0) return 0;
  return Math.round(totalTargetMs() / 1000);
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `約${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `約${minutes}分` : `約${minutes}分${rest}秒`;
}

function updateEstimate(): void {
  elements.wordCount.textContent = `${words.length}語`;
  elements.timeEstimate.textContent = formatSeconds(estimatedSeconds());
}

function updateProgress(): void {
  const completed = currentIndex >= 0 ? Math.min(words.length, currentIndex + 1) : 0;
  const percent = words.length === 0 ? 0 : (completed / words.length) * 100;
  elements.progressBar.style.width = `${percent}%`;
}

function updateWordClasses(): void {
  const spans = elements.readingText.querySelectorAll<HTMLSpanElement>('.reading-word');
  spans.forEach((span) => {
    const index = Number.parseInt(span.dataset.index ?? '', 10);
    span.classList.toggle('is-read', Number.isFinite(index) && index < currentIndex);
    span.classList.toggle('is-current', Number.isFinite(index) && index === currentIndex);
  });
  updateProgress();

  const current = elements.readingText.querySelector<HTMLElement>('.reading-word.is-current');
  if (current && (document.fullscreenElement || isRunning)) {
    current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

function setReadyState(): void {
  elements.pacerState.textContent = '準備完了';
  elements.pacerSubstate.textContent = words.length > 0
    ? 'スタートを押すと、設定したWPMに合わせて単語が光ります。'
    : '英文を入力して「英文をセット」を押してください。';
}

function prepareText(): boolean {
  const text = elements.textInput.value.trim();
  syncSpeed(elements.speedInput.value);
  stopTimers();
  isRunning = false;
  setButtons(false);

  if (!text) {
    showMessage('英文を入力してください。');
    elements.textInput.focus();
    return false;
  }

  words = splitWords(text);
  currentIndex = -1;
  renderText(text);
  applyMode();
  hideMessage();
  updateEstimate();
  updateWordClasses();
  setReadyState();
  return true;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }

  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function getSharedPayload(): SharedPayload | null {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const encoded = params.get('pacer');
  if (!encoded) return null;

  try {
    const payload: unknown = JSON.parse(decodeBase64Url(encoded));
    return isSharedPayload(payload) ? payload : null;
  } catch (_error) {
    return null;
  }
}

function getLeadSeconds(): number {
  const lead = Number.parseInt(elements.leadInput.value, 10);
  return lead === 0 || lead === 3 || lead === 5 ? lead : 0;
}

function applySharedPayload(payload: SharedPayload): void {
  document.body.classList.add('student-practice-mode');

  elements.textInput.value = payload.text;
  syncSpeed(typeof payload.speed === 'number' ? payload.speed : 90);
  elements.leadInput.value = String(payload.lead === 3 || payload.lead === 5 ? payload.lead : 0);
  elements.pausePunctuation.checked = payload.pause !== false;

  const mode: DisplayMode = isDisplayMode(payload.mode) ? payload.mode : 'highlight';
  const modeInput = document.querySelector<HTMLInputElement>(`input[name="displayMode"][value="${mode}"]`);
  if (modeInput) modeInput.checked = true;

  const subtitle = document.querySelector<HTMLElement>('.subtitle');
  if (subtitle) subtitle.textContent = '自分のペースで英文を音読練習する';
}

function buildShareUrl(): string {
  const payload: SharedPayload = {
    v: 1,
    text: elements.textInput.value.trim(),
    speed: clampSpeed(elements.speedInput.value),
    mode: getMode(),
    lead: getLeadSeconds(),
    pause: elements.pausePunctuation.checked,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const url = new URL(window.location.href);

  url.search = '';
  url.hash = `pacer=${encoded}`;
  return url.href;
}

function setShareFeedback(text: string, tone: 'warning' | 'success'): void {
  elements.shareHint.textContent = text;
  elements.shareHint.classList.toggle('is-warning', tone === 'warning');
  elements.shareHint.classList.toggle('is-success', tone === 'success');
}

function makeShareUrl(): void {
  if (!prepareText()) return;

  const url = buildShareUrl();
  elements.shareUrlInput.value = url;
  elements.copyShareBtn.disabled = false;
  elements.nativeShareBtn.hidden = !(typeof navigator.share === 'function' && url.length < 1800);

  if (url.length > 2800) {
    setShareFeedback('URLがかなり長くなっています。QR化や一部端末での共有が不安定になるため、本文を短く区切るのがおすすめです。', 'warning');
  } else {
    setShareFeedback('このリンクを生徒に配布すると、同じ英文を自分のペースで練習できます。', 'success');
  }
}

function copyShareUrl(): void {
  const url = elements.shareUrlInput.value;
  if (!url) {
    makeShareUrl();
    return;
  }

  const showCopied = (): void => {
    const original = elements.copyShareBtn.innerHTML;
    elements.copyShareBtn.innerHTML = '<i class="fas fa-check"></i> コピー済';
    setShareFeedback('配布リンクをコピーしました。Classroomやロイロノートなどに貼り付けて配布できます。', 'success');
    window.setTimeout(() => {
      elements.copyShareBtn.innerHTML = original;
    }, 1800);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(showCopied).catch(() => {
      elements.shareUrlInput.select();
      document.execCommand('copy');
      showCopied();
    });
  } else {
    elements.shareUrlInput.select();
    document.execCommand('copy');
    showCopied();
  }
}

function shareWithDevice(): void {
  const url = elements.shareUrlInput.value || buildShareUrl();
  if (!navigator.share) return;

  navigator.share({
    title: '音読ペーサー 個人練習リンク',
    text: '自分のペースで英文を音読練習しましょう。',
    url,
  }).catch(() => {
    // 共有シートを閉じただけの場合もあるため、エラー表示は出さない。
  });
}

function loadSharedPayloadFromHash(): boolean {
  const sharedPayload = getSharedPayload();
  if (!sharedPayload) return false;

  stopTimers();
  isRunning = false;
  setButtons(false);
  applySharedPayload(sharedPayload);
  applyMode();
  prepareText();
  return true;
}

function finishReading(): void {
  stopTimers();
  isRunning = false;
  currentIndex = words.length;
  updateWordClasses();
  setButtons(false);
  elements.pacerState.textContent = '音読終了';
  elements.pacerSubstate.textContent = 'もう一度読むときは「最初に戻す」またはスタートを押してください。';
}

function scheduleNextWord(): void {
  if (!isRunning) return;

  if (currentIndex >= words.length) {
    finishReading();
    return;
  }

  currentIndex += 1;
  updateWordClasses();

  if (currentIndex >= words.length) {
    finishReading();
    return;
  }

  elements.pacerState.textContent = '音読中';
  elements.pacerSubstate.textContent = `${currentIndex + 1} / ${words.length}語目`;

  timerId = window.setTimeout(() => {
    if (currentIndex >= words.length - 1) finishReading();
    else scheduleNextWord();
  }, wordDuration(currentIndex));
}

function startCountdownThenRead(): void {
  let remaining = getLeadSeconds();
  if (currentIndex !== -1 || remaining <= 0) {
    scheduleNextWord();
    return;
  }

  elements.pacerState.textContent = `開始まで ${remaining}`;
  elements.pacerSubstate.textContent = '生徒の視線が英文に集まってから始めます。';

  countdownId = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      if (countdownId !== null) window.clearInterval(countdownId);
      countdownId = null;
      scheduleNextWord();
      return;
    }
    elements.pacerState.textContent = `開始まで ${remaining}`;
  }, 1000);
}

function startReading(): void {
  if (isRunning) return;

  if (words.length === 0 && !prepareText()) return;
  syncSpeed(elements.speedInput.value);
  if (currentIndex >= words.length) currentIndex = -1;

  hideMessage();
  isRunning = true;
  setButtons(true);
  startCountdownThenRead();
}

function pauseReading(): void {
  if (!isRunning) return;
  stopTimers();
  isRunning = false;
  setButtons(false);
  elements.pacerState.textContent = '一時停止中';
  elements.pacerSubstate.textContent = currentIndex >= 0
    ? `${currentIndex + 1}語目で止めています。スタートで再開します。`
    : '開始前に止めています。スタートで再開します。';
}

function resetReading(): void {
  stopTimers();
  isRunning = false;
  currentIndex = -1;
  setButtons(false);
  updateWordClasses();
  setReadyState();
}

function jumpToWord(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= words.length || words.length === 0) return;
  stopTimers();
  isRunning = false;
  currentIndex = index;
  setButtons(false);
  updateWordClasses();
  elements.pacerState.textContent = '位置を指定';
  elements.pacerSubstate.textContent = `${index + 1}語目から再開できます。`;
}

function moveWord(delta: number): void {
  if (words.length === 0) {
    prepareText();
    return;
  }
  stopTimers();
  isRunning = false;
  setButtons(false);
  currentIndex = Math.min(words.length - 1, Math.max(0, currentIndex + delta));
  updateWordClasses();
  elements.pacerState.textContent = '位置を調整';
  elements.pacerSubstate.textContent = `${currentIndex + 1} / ${words.length}語目`;
}

function toggleStagePlayback(): void {
  if (isRunning) pauseReading();
  else startReading();
}

function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    elements.pacerStage.requestFullscreen().catch(() => {
      showMessage('このブラウザでは全画面表示を開始できませんでした。');
    });
  } else {
    document.exitFullscreen();
  }
}

elements.speedSlider.addEventListener('input', () => {
  syncSpeed(elements.speedSlider.value);
});

elements.speedInput.addEventListener('input', () => {
  const rawValue = Number.parseInt(elements.speedInput.value, 10);
  if (!Number.isFinite(rawValue)) return;
  if (rawValue >= 60 && rawValue <= 180) elements.speedSlider.value = String(rawValue);
  updateEstimate();
  updatePacePresets();
});

elements.speedInput.addEventListener('change', () => {
  syncSpeed(elements.speedInput.value);
});

elements.pausePunctuation.addEventListener('change', updateEstimate);
elements.modeInputs.forEach((input) => input.addEventListener('change', applyMode));
elements.pacePresetBtns.forEach((button) => {
  button.addEventListener('click', () => {
    syncSpeed(button.dataset.speed ?? '100');
  });
});

elements.prepareBtn.addEventListener('click', prepareText);
elements.makeShareBtn.addEventListener('click', makeShareUrl);
elements.copyShareBtn.addEventListener('click', copyShareUrl);
elements.nativeShareBtn.addEventListener('click', shareWithDevice);
elements.startBtn.addEventListener('click', startReading);
elements.pauseBtn.addEventListener('click', pauseReading);
elements.resetBtn.addEventListener('click', resetReading);
elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
elements.stageStartBtn.addEventListener('click', toggleStagePlayback);
elements.stageBackBtn.addEventListener('click', () => moveWord(-1));
elements.stageForwardBtn.addEventListener('click', () => moveWord(1));

document.addEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

  if (event.code === 'Space') {
    event.preventDefault();
    toggleStagePlayback();
  } else if (event.code === 'ArrowLeft') {
    moveWord(-1);
  } else if (event.code === 'ArrowRight') {
    moveWord(1);
  }
});

document.addEventListener('fullscreenchange', () => {
  elements.fullscreenBtn.innerHTML = document.fullscreenElement
    ? '<i class="fas fa-compress"></i> 全画面解除'
    : '<i class="fas fa-expand"></i> 全画面表示';
});

window.addEventListener('hashchange', loadSharedPayloadFromHash);

if (!loadSharedPayloadFromHash()) {
  elements.textInput.value = SAMPLE_TEXT;
  syncSpeed(100);
  applyMode();
  prepareText();
}
