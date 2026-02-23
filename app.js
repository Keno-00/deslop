'use strict';

// ── System prompts: [mode][tier] ──────────────────────────────────────────────

const PROMPTS = {
    text: {
        lint: `You are a minimal text linter. Return ONLY the corrected text with no explanation.

Apply ONLY these safe, low-risk fixes:
- Remove sycophantic openers ("Certainly!", "Great question!", "Of course!", "Absolutely!", "Sure!")
- Remove verbose hedging phrases ("It's worth noting that", "It's important to mention", "Please note that", "It should be noted")
- Remove filler transitions at sentence start ("In conclusion,", "To summarize,", "In essence,", "Needless to say,")
- Remove empty caveats ("as always", "as you know", "of course")
- Fix smart quotes to straight quotes and em-dashes to double-hyphens or commas
- Preserve ALL citations, references, numbers, measurements, and statistics exactly as written.
Do NOT restructure sentences. Do NOT change anything else. If already clean, return unchanged.`,

        clean: `You are an anti-slop text editor. Return ONLY the cleaned text with no explanation, no meta-commentary.

First, assess the register of the text:
- If it contains citations, formal academic language, methodology, statistics, or experimental results, treat it as ACADEMIC TEXT.
- Otherwise treat it as GENERAL PROSE.

Apply these rules to all text:
- Remove sycophantic openers and filler affirmations
- Remove verbose hedging ("It's worth noting that", "It's important to mention")
- Remove filler transitions ("In conclusion,", "To summarize,", "In essence,")
- Remove redundant caveats that add no information
- Tighten wordy constructions: "due to the fact that" → "because"; "in order to" → "to"; "at this point in time" → "now"
- Break up em-dash overuse; use periods or commas where natural
- Preserve all factual content. Do not add anything new.
- If already tight, return unchanged.

For GENERAL PROSE also apply:
- Remove AI-typical rhythm padding (sentence pairs restating the same idea twice)
- Preserve the author's voice and tone.

For ACADEMIC TEXT apply these additional constraints:
- Preserve ALL citations, references, DOIs, and URLs exactly as written
- Preserve ALL technical terminology, methodology, results, and measurements
- Preserve the formal academic register — do not casualise the language
- Do NOT introduce new claims, reorder arguments, or change scientific meaning in any way`,

        deep: `You are an expert editor performing a deep polish pass. Return ONLY the final text with no commentary.

First, assess the register of the text:
- If it contains citations, formal academic language, methodology, statistics, or experimental results, treat it as ACADEMIC TEXT.
- Otherwise treat it as GENERAL PROSE.

Apply these rules to all text:
- Remove sycophantic openers and filler affirmations
- Remove verbose hedging ("It's worth noting that", "It's important to mention")
- Remove filler transitions ("In conclusion,", "To summarize,", "In essence,")
- Remove redundant caveats that add no information
- Tighten wordy constructions: "due to the fact that" → "because"; "in order to" → "to"; "at this point in time" → "now"
- Break up em-dash overuse; use periods or commas where natural
- Preserve all factual content. Do not add anything new.

For GENERAL PROSE also apply:
- Remove AI-typical rhythm padding (sentence pairs restating the same idea twice)
- Merge adjacent sentences that express the same idea into a single tighter sentence (remove the weaker restatement)
- Restructure awkward or passive-voice sentences for clarity and flow
- Vary sentence openings if over-reliant on "The", "This", or "It"
- Replace weak verbs (e.g. "is used to", "can be seen") with strong, active ones
- Eliminate redundant adjectives and adverbs that don't carry meaning
- Compress wordy paragraphs: target 20–30% reduction while preserving all meaning
- Ensure logical paragraph flow and clear topic sentences
- Preserve the author's voice and tone.

For ACADEMIC TEXT apply these additional constraints:
- Preserve ALL citations, references, DOIs, and URLs exactly as written
- Preserve ALL technical terminology, methodology, results, and measurements
- Preserve the formal academic register — do not casualise the language
- Do NOT introduce new claims, reorder arguments, or change scientific meaning
- Improve paragraph cohesion: ensure each paragraph has a clear topic sentence
- Replace weak passive constructions with active voice only where it improves clarity (keep passive where conventional in the discipline)
- Eliminate redundant adjectives and adverbs not carrying scientific meaning
- Ensure smooth logical transitions between ideas
- Compress verbose sentences by 15–25% while preserving all scientific content
- NEVER alter citations, statistics, measurements, experimental details, or conclusions`
    },

    code: {
        lint: `You are a minimal code linter. Return ONLY the cleaned code with no explanation, no markdown fences.

Apply ONLY these safe fixes:
- Remove obvious narrative comments ("// Now we...", "// This function...", "// Let's...")
- Remove debug logging statements (console.log, print, logger.debug) clearly added for debugging only
- Fix smart quotes to straight quotes
- Remove placeholder TODO/FIXME comments with no actionable content
Do NOT refactor logic. Do NOT rename anything. If already clean, return unchanged.`,

        clean: `You are an anti-slop code cleaner. Return ONLY the cleaned code with no explanation, no markdown fences.

Apply these rules:
- Remove ALL narrative comments — keep only terse, non-obvious clarifications
- Remove redundant defensive checks that can never trigger
- Remove noisy logging statements added for debugging
- Remove placeholder TODOs/FIXMEs unless they carry essential meaning
- Fix Unicode hazards: smart quotes → straight quotes; em-dashes → --
- Inline single-use variables where it improves clarity
- Remove boilerplate docstrings that just restate the function signature
- Keep all functional logic intact. Minimize the diff. Never change behaviour.
- If already clean, return unchanged.`,

        deep: `You are a senior code reviewer performing a deep cleanup. Return ONLY the final code with no explanation, no markdown fences.

Apply these rules:
- Remove ALL narrative comments — keep only terse, non-obvious clarifications
- Remove redundant defensive checks that can never trigger
- Remove noisy logging statements added for debugging
- Remove placeholder TODOs/FIXMEs unless they carry essential meaning
- Fix Unicode hazards: smart quotes → straight quotes; em-dashes → --
- Inline single-use variables where it improves clarity
- Remove boilerplate docstrings that just restate the function signature
- Keep all functional logic intact. Minimize the diff. Never change behaviour.

Additionally apply these deep cleanup rules:
- Collapse overly granular single-use helper functions inline where sensible
- Remove over-engineered abstractions that add indirection without benefit
- Extract magic numbers/strings into named constants where meaning is unclear
- Simplify nested conditionals where possible (early returns, guard clauses)
- Ensure consistent naming conventions within the snippet
- Remove dead code paths and unreachable branches
- Never change visible behaviour or external API surface.`
    },
};

// ── Citation harness: AI-assisted extraction ─────────────────────────────────

// Hint text sent to the AI so it knows what citation styles to look for.
// The actual detection is done by the model, not regex.
function buildCitationHint() {
    const harnessNumeric = document.getElementById('harnessNumeric').checked;
    const harnessAuthor = document.getElementById('harnessAuthor').checked;
    const harnessDoi = document.getElementById('harnessDoi').checked;
    const harnessFootnote = document.getElementById('harnessFootnote').checked;

    const types = [];
    if (harnessNumeric) types.push('numeric references such as [1], [1,2], [1-3]');
    if (harnessAuthor) types.push('author-year citations such as (Smith, 2021), (van den Berg et al., 2020), (Smith, Jones & Brown, 2019), (Smith, 2018; Jones, 2020)');
    if (harnessDoi) types.push('DOIs (10.xxxx/...) and URLs (http/https)');
    if (harnessFootnote) types.push('superscript footnote markers such as ¹²³');

    return types.length ? types.join('; ') : null;
}

async function extractCitationsWithAI(text, apiKey, model) {
    const hint = buildCitationHint();
    if (!hint) return { tokenized: text, map: {}, count: 0 };

    const extractPrompt = `You are a citation extractor. Your only job is to find every citation in the text and return them as a JSON array of exact strings.

Look for: ${hint}.

Rules:
- Return ONLY a valid JSON array, e.g. ["(Smith, 2021)", "[1,2]", "10.1000/xyz"]
- Each element must be the EXACT substring as it appears in the text — character for character
- Do NOT paraphrase, normalise, or merge citations
- If no citations are found, return []
- Return NOTHING other than the JSON array`;

    const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: extractPrompt },
                { role: 'user', content: text }
            ],
            temperature: 0,
            max_tokens: 1024
        })
    });

    if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try { const e = await response.json(); errMsg = e?.error?.message || errMsg; } catch { }
        throw new Error(`Citation extraction failed: ${errMsg}`);
    }

    const data = await response.json();
    let raw = data?.choices?.[0]?.message?.content ?? '[]';

    // Strip markdown fences if the model wrapped the JSON
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let citations;
    try {
        citations = JSON.parse(raw);
        if (!Array.isArray(citations)) citations = [];
    } catch {
        citations = [];
    }

    // Deduplicate while preserving order
    const seen = new Set();
    const unique = citations.filter(c => typeof c === 'string' && c.length > 0 && !seen.has(c) && seen.add(c));

    // Tokenize: replace each citation string with a stable token (all occurrences)
    const map = {};
    let counter = 1;
    let tokenized = text;

    for (const cite of unique) {
        const token = `\u27E6CIT:${String(counter).padStart(3, '0')}\u27E7`;
        // Escape for use in regex
        const escaped = cite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        tokenized = tokenized.replace(new RegExp(escaped, 'g'), token);
        map[token] = cite;
        counter++;
    }

    return { tokenized, map, count: counter - 1 };
}

function restoreCitations(text, map) {
    let restored = text;
    for (const [token, original] of Object.entries(map)) {
        // Escape token for regex
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        restored = restored.replace(new RegExp(escaped, 'g'), original);
    }
    return restored;
}

// ── Diff engine ───────────────────────────────────────────────────────────────

function wordDiff(original, cleaned) {
    const originalWords = tokenizeWords(original);
    const cleanedWords = tokenizeWords(cleaned);

    // Myers-like LCS-based diff (simplified word-level)
    const lcs = computeLCS(originalWords, cleanedWords);
    const result = [];
    let oi = 0, ci = 0, li = 0;

    while (oi < originalWords.length || ci < cleanedWords.length) {
        if (li < lcs.length && oi < originalWords.length && ci < cleanedWords.length
            && originalWords[oi] === lcs[li] && cleanedWords[ci] === lcs[li]) {
            result.push({ type: 'eq', text: originalWords[oi] });
            oi++; ci++; li++;
        } else if (ci < cleanedWords.length && (li >= lcs.length || cleanedWords[ci] !== lcs[li])) {
            result.push({ type: 'ins', text: cleanedWords[ci] });
            ci++;
        } else if (oi < originalWords.length) {
            result.push({ type: 'del', text: originalWords[oi] });
            oi++;
        }
    }

    return result;
}

function tokenizeWords(text) {
    // Split on whitespace but keep the whitespace tokens to preserve formatting
    return text.split(/(\s+)/);
}

function computeLCS(a, b) {
    const m = a.length, n = b.length;
    // For very large inputs, just return b (skip diff gracefully)
    if (m * n > 200000) return b.slice();

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) { lcs.unshift(a[i - 1]); i--; j--; }
        else if (dp[i - 1][j] > dp[i][j - 1]) i--;
        else j--;
    }
    return lcs;
}

function renderDiff(original, cleaned) {
    const ops = wordDiff(original, cleaned);
    const frag = document.createDocumentFragment();

    for (const op of ops) {
        if (op.type === 'eq') {
            frag.appendChild(document.createTextNode(op.text));
        } else if (op.type === 'del') {
            const span = document.createElement('span');
            span.className = 'diff-del';
            span.textContent = op.text;
            frag.appendChild(span);
        } else if (op.type === 'ins') {
            const span = document.createElement('span');
            span.className = 'diff-ins';
            span.textContent = op.text;
            frag.appendChild(span);
        }
    }
    diffArea.innerHTML = '';
    diffArea.appendChild(frag);
}

// ── State ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'deslop_api_key';
const STORAGE_MODEL = 'deslop_model';
const BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

let currentMode = 'text';        // 'text' | 'code'
let currentTier = 'clean';       // 'lint' | 'clean' | 'deep'
let isLoading = false;
let lastOriginal = '';
let lastCleaned = '';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const apiKeyInput = document.getElementById('apiKeyInput');
const modelInput = document.getElementById('modelInput');
const inputArea = document.getElementById('inputArea');
const outputArea = document.getElementById('outputArea');
const diffArea = document.getElementById('diffArea');
const runBtn = document.getElementById('runBtn');
const btnLabel = document.getElementById('btnLabel');
const spinner = document.getElementById('spinner');
const statusEl = document.getElementById('status');
const copyBtn = document.getElementById('copyBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const inputCount = document.getElementById('inputCount');
const outputCount = document.getElementById('outputCount');
const inputCitBadge = document.getElementById('inputCitBadge');
const inputCitCount = document.getElementById('inputCitCount');
const outputCitBadge = document.getElementById('outputCitBadge');
const outputCitCount = document.getElementById('outputCitCount');
const harnessToggle = document.getElementById('harnessToggle');
const harnessOptions = document.getElementById('harnessOptions');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const viewCleanBtn = document.getElementById('viewClean');
const viewDiffBtn = document.getElementById('viewDiff');
const customPrompt = document.getElementById('customPrompt');
const promptResetBtn = document.getElementById('promptResetBtn');
const tierIndicator = document.getElementById('tierIndicator');

// ── Sidebar toggle ────────────────────────────────────────────────────────────

let sidebarOpen = true;

function updateSidebar() {
    sidebar.classList.toggle('collapsed', !sidebarOpen);
    sidebarToggle.classList.toggle('open', sidebarOpen);
}

sidebarToggle.addEventListener('click', () => {
    sidebarOpen = !sidebarOpen;
    updateSidebar();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        sidebarOpen = !sidebarOpen;
        updateSidebar();
    }
});

// ── Mode selection ────────────────────────────────────────────────────────────

const modeBtns = document.querySelectorAll('.mode-btn');

function updateMode(mode) {
    currentMode = mode;
    document.body.setAttribute('data-mode', mode);
    modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    const placeholders = {
        text: 'Paste your text here (prose, academic, or research)…',
        code: 'Paste your code here…'
    };
    inputArea.placeholder = placeholders[mode] || placeholders.text;

    // Update custom prompt placeholder
    customPrompt.placeholder = `Leave blank to use built-in ${mode}/${currentTier} prompt…`;
    updateTierIndicator();
    scanCitations();
}

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => updateMode(btn.dataset.mode));
});

// ── Tier selection ────────────────────────────────────────────────────────────

const tierBtns = document.querySelectorAll('.tier-btn');

const TIER_LABELS = { lint: '⚡ Lint', clean: '✦ Clean', deep: '🔬 Deep' };

function updateTier(tier) {
    currentTier = tier;
    tierBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tier === tier));
    updateTierIndicator();
}

function updateTierIndicator() {
    const labels = { lint: 'LINT', clean: 'CLEAN', deep: 'DEEP POLISH' };
    tierIndicator.textContent = labels[currentTier] || '';
}

tierBtns.forEach(btn => {
    btn.addEventListener('click', () => updateTier(btn.dataset.tier));
});

// ── Harness toggle ────────────────────────────────────────────────────────────

function updateHarness() {
    const on = harnessToggle.checked;
    harnessOptions.classList.toggle('enabled', on);
    if (on) scanCitations();
    else { inputCitBadge.style.display = 'none'; }
}

harnessToggle.addEventListener('change', updateHarness);

// ── Citation scanner (live feedback on input) ─────────────────────────────────

// scanCitations: lightweight regex-based approximation for live badge feedback only.
// The actual citation protection happens via AI pre-pass at run time.
function scanCitations() {
    if (!harnessToggle.checked) { inputCitBadge.style.display = 'none'; return; }
    const text = inputArea.value;
    // Quick combined pattern: numeric [1], author-year (Xx..., YYYY), DOIs/URLs, footnotes
    const approx = /\[\d[\d,\s\-–]*\]|\([A-Z][a-zA-Z\s\-'.,&]+\d{4}[a-z]?\)|https?:\/\/\S+|10\.\d{4,}\/\S+|[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g;
    const matches = text.match(approx) || [];
    if (matches.length > 0) {
        inputCitCount.textContent = matches.length;
        inputCitBadge.style.display = 'inline-flex';
    } else {
        inputCitBadge.style.display = 'none';
    }
}

inputArea.addEventListener('input', () => {
    updateCounts();
    scanCitations();
});

// ── Character counts ──────────────────────────────────────────────────────────

function updateCounts() {
    const ic = inputArea.value.length;
    const oc = outputArea.value.length;
    inputCount.textContent = ic > 0 ? `${ic.toLocaleString()} chars` : '';
    outputCount.textContent = oc > 0 ? `${oc.toLocaleString()} chars` : '';

    if (ic > 0 && oc > 0) {
        const saved = ic - oc;
        outputCount.className = saved > 0 ? 'char-count saved' : 'char-count';
        if (saved > 0) outputCount.textContent += ` (−${saved.toLocaleString()} saved)`;
    }
}

// ── Diff view toggle ──────────────────────────────────────────────────────────

let currentView = 'clean'; // 'clean' | 'diff'

function setView(view) {
    currentView = view;
    const showDiff = view === 'diff';
    outputArea.style.display = showDiff ? 'none' : '';
    diffArea.style.display = showDiff ? '' : 'none';
    viewCleanBtn.classList.toggle('active', !showDiff);
    viewDiffBtn.classList.toggle('active', showDiff);

    if (showDiff && lastOriginal && lastCleaned) {
        renderDiff(lastOriginal, lastCleaned);
    }
}

viewCleanBtn.addEventListener('click', () => setView('clean'));
viewDiffBtn.addEventListener('click', () => setView('diff'));

// ── Clear ─────────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
    inputArea.value = '';
    outputArea.value = '';
    diffArea.innerHTML = '';
    lastOriginal = '';
    lastCleaned = '';
    setStatus('');
    updateCounts();
    inputCitBadge.style.display = 'none';
    outputCitBadge.style.display = 'none';
    setView('clean');
});

// ── Copy ──────────────────────────────────────────────────────────────────────

copyBtn.addEventListener('click', async () => {
    if (!outputArea.value) return;
    try {
        await navigator.clipboard.writeText(outputArea.value);
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = '⎘ Copy';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch {
        copyBtn.textContent = 'Failed';
        setTimeout(() => { copyBtn.textContent = '⎘ Copy'; }, 2000);
    }
});

// ── Export ────────────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
    if (!outputArea.value) return;
    const blob = new Blob([outputArea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deslop-${currentMode}-${currentTier}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// ── Custom prompt reset ───────────────────────────────────────────────────────

promptResetBtn.addEventListener('click', () => {
    customPrompt.value = '';
    customPrompt.placeholder = `Leave blank to use built-in ${currentMode}/${currentTier} prompt…`;
});

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type ? `status ${type}` : 'status';
}

function setLoading(on) {
    isLoading = on;
    runBtn.disabled = on;
    spinner.classList.toggle('visible', on);
    btnLabel.textContent = on ? 'Running…' : 'Run';
}

// ── Main API call ─────────────────────────────────────────────────────────────

async function runDeslop() {
    if (isLoading) return;

    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim() || 'glm-4-flash';
    const rawText = inputArea.value.trim();

    if (!apiKey) { setStatus('Enter your Z AI API key in the sidebar.', 'error'); return; }
    if (!rawText) { setStatus('Paste some text to clean.', 'error'); return; }

    localStorage.setItem(STORAGE_KEY, apiKey);
    localStorage.setItem(STORAGE_MODEL, model);

    // ── Citation harness (AI-assisted) ──
    let textToSend = rawText;
    let citationMap = {};
    let citCount = 0;

    if (harnessToggle.checked) {
        setStatus('🔍 Identifying citations…', 'warn');
        setLoading(true);
        outputArea.classList.remove('fade-in');

        const result = await extractCitationsWithAI(rawText, apiKey, model);
        textToSend = result.tokenized;
        citationMap = result.map;
        citCount = result.count;

        if (citCount > 0) {
            setStatus(`🔒 ${citCount} citation${citCount > 1 ? 's' : ''} protected. Cleaning…`, 'warn');
        } else {
            setStatus('No citations found. Cleaning…');
        }
    } else {
        setStatus('Calling Z AI…');
        setLoading(true);
        outputArea.classList.remove('fade-in');
    }

    const systemPrompt = customPrompt.value.trim() || PROMPTS[currentMode]?.[currentTier] || PROMPTS.text.clean;

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: textToSend }
                ],
                temperature: 0.1,
                max_tokens: 8192
            })
        });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try { const e = await response.json(); errMsg = e?.error?.message || errMsg; } catch { }
            throw new Error(errMsg);
        }

        const data = await response.json();
        let result = data?.choices?.[0]?.message?.content ?? '';
        if (!result) throw new Error('Empty response from API');

        // ── Restore citations ──
        if (citCount > 0) {
            result = restoreCitations(result, citationMap);
            outputCitCount.textContent = citCount;
            outputCitBadge.style.display = 'inline-flex';
        } else {
            outputCitBadge.style.display = 'none';
        }

        const cleaned = result.trim();

        // Store originals for diff
        lastOriginal = rawText;
        lastCleaned = cleaned;

        outputArea.value = cleaned;
        outputArea.classList.add('fade-in');
        updateCounts();

        // Re-render diff if diff view is active
        if (currentView === 'diff') renderDiff(lastOriginal, lastCleaned);

        const tierName = { lint: 'Lint', clean: 'Clean', deep: 'Deep Polish' }[currentTier] || '';
        setStatus(`${tierName} pass complete.`, 'ok');

    } catch (err) {
        setStatus(`Error: ${err.message}`, 'error');
        console.error('[Deslop]', err);
    } finally {
        setLoading(false);
    }
}

runBtn.addEventListener('click', runDeslop);
inputArea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') runDeslop();
});

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
    const savedKey = localStorage.getItem(STORAGE_KEY) || '';
    const savedModel = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.7';
    const savedNative = localStorage.getItem('Z_NATIVE_LANG') || 'English';

    apiKeyInput.value = savedKey;
    modelInput.value = savedModel;
    document.getElementById('nativeLangInput').value = savedNative;

    updateMode('text');
    updateTier('clean');
    updateCounts();
    updateHarness();
    updateTierIndicator();
}

init();

// ── Settings Modal ────────────────────────────────────────────────────────────

const sidebarAccountBtn = document.getElementById('sidebarAccountBtn');
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const nativeLangInput = document.getElementById('nativeLangInput');

function toggleSettingsModal(show) {
    if (show) {
        settingsModalOverlay.style.display = 'flex';
        apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';
        modelInput.value = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.7';
        nativeLangInput.value = localStorage.getItem('Z_NATIVE_LANG') || 'English';
    } else {
        settingsModalOverlay.style.display = 'none';
        // Save on close
        localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
        localStorage.setItem(STORAGE_MODEL, modelInput.value.trim());
        localStorage.setItem('Z_NATIVE_LANG', nativeLangInput.value.trim());
    }
}

sidebarAccountBtn.addEventListener('click', () => toggleSettingsModal(true));
settingsCloseBtn.addEventListener('click', () => toggleSettingsModal(false));
settingsModalOverlay.addEventListener('click', (e) => {
    // Close if clicking outside the modal
    if (e.target === settingsModalOverlay) toggleSettingsModal(false);
});

// Toggle password visibility in modal
const toggleKeyBtn = document.getElementById('toggleKeyBtn');
const eyeIconOpen = document.getElementById('eyeIconOpen');
const eyeIconClosed = document.getElementById('eyeIconClosed');

if (toggleKeyBtn && eyeIconOpen && eyeIconClosed) {
    toggleKeyBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            eyeIconOpen.style.display = 'none';
            eyeIconClosed.style.display = 'block';
        } else {
            apiKeyInput.type = 'password';
            eyeIconOpen.style.display = 'block';
            eyeIconClosed.style.display = 'none';
        }
    });
}

// ── Voice Editor ──────────────────────────────────────────────────────────────

const VOICE_PROMPT = `You are a fast AI-writing detector and humanising editor. Analyse the text and flag segments that sound artificial.

Return ONLY a flat list of flagged segments using exactly this 4-line format per flag, separated by "---":
[type]
[exact text from source]
[short reason]
[suggested rewrite, or empty if delete]
---
[type]
...

Type definitions:
- repetition: two adjacent sentences making the same point (flag the weaker one)
- robotic: stilted, unnatural phrasing
- over-logical: excessive transition signposting ("Furthermore,", "It is evident that")
- ai-rhythm: predictable alternating short/long sentence patterns
- over-formal: unnecessarily formal phrasing

Rules:
- [exact text from source] MUST exactly match a substring in the provided text.
- Return NOTHING else. No markdown, no JSON, no intro text.
- If the text is completely natural, return exactly: NONE`;

// Voice DOM elements
const voiceTabBtn = document.getElementById('voiceTabBtn');
const voicePanel = document.getElementById('voicePanel');
const mainPanelContainer = document.querySelector('.main');
const sendToVoiceBtn = document.getElementById('sendToVoiceBtn');

const voiceAnalyseBtn = document.getElementById('voiceAnalyseBtn');
const voiceCopyBtn = document.getElementById('voiceCopyBtn');
const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceInput = document.getElementById('voiceInput');
const voiceEditor = document.getElementById('voiceEditor');
const voiceStatus = document.getElementById('voiceStatus');
const voiceFlagCount = document.getElementById('voiceFlagCount');

let voiceModeActive = false;
let currentAnnotations = [];
let annotatedTextSegments = [];

// Panel toggling
function toggleVoiceView(activate) {
    voiceModeActive = activate;
    if (activate) {
        voiceTabBtn.classList.add('active');
        mainPanelContainer.style.display = 'none';
        voicePanel.style.display = 'flex';
        // Auto-focus input if empty
        if (!voiceInput.value.trim()) {
            voiceInput.focus();
        }
    } else {
        voiceTabBtn.classList.remove('active');
        voicePanel.style.display = 'none';
        mainPanelContainer.style.display = 'flex';
    }
}

voiceTabBtn.addEventListener('click', () => toggleVoiceView(true));
voiceBackBtn.addEventListener('click', () => toggleVoiceView(false));
sendToVoiceBtn.addEventListener('click', () => {
    // Copy output text into voice input
    const text = outputArea.value.trim();
    if (text) {
        voiceInput.value = text;
        // switch to edit mode (hide editor, show textarea)
        voiceEditor.style.display = 'none';
        voiceInput.style.display = 'block';
        voiceFlagCount.style.display = 'none';
        voiceStatus.textContent = 'Text loaded. Click Analyse.';
    }
    toggleVoiceView(true);
});

// Run Local Analysis call (Detection + Native Translation)
voiceAnalyseBtn.addEventListener('click', () => {
    if (isLoading) return;
    const text = voiceInput.style.display !== 'none' ? voiceInput.value.trim() : getVoiceCurrentText();
    if (!text) {
        voiceStatus.textContent = 'Paste some text to analyse.';
        return;
    }

    const nativeLanguage = localStorage.getItem('Z_NATIVE_LANG') || 'English';
    const remoteModel = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.7';
    const apiKey = localStorage.getItem(STORAGE_KEY);

    if (!apiKey) {
        voiceStatus.textContent = 'API key required for remote rewrite (set in ⚙️ Settings).';
        // Open modal automatically
        toggleSettingsModal(true);
        return;
    }

    setLoading(true);
    voiceStatus.textContent = 'Starting local ML detection...';
    voiceAnalyseBtn.disabled = true;

    // Use Web Worker for Transformers.js inference
    const worker = new Worker('worker.js', { type: 'module' });

    worker.postMessage({ type: 'analyze', text, nativeLanguage });

    worker.onmessage = async (e) => {
        const { status, message, annotations, error } = e.data;

        if (status === 'loading' || status === 'analyzing') {
            voiceStatus.textContent = message;
        } else if (status === 'error') {
            voiceStatus.textContent = `Local ML Error: ${error}`;
            setLoading(false);
            voiceAnalyseBtn.disabled = false;
            worker.terminate();
        } else if (status === 'complete') {
            voiceStatus.textContent = 'Local scan complete. Triggering remote rewrite...';

            // Generate IDs for mapping and render the blank suggestions immediately
            currentAnnotations = (annotations || []).map((ann, idx) => ({
                ...ann,
                id: `ann_${idx}`,
                suggestion: '' // Will stream in
            }));

            renderVoiceEditor(text, currentAnnotations);

            // Kick off the remote API to translate the Mother Tongue back to human English
            await fetchRemoteSuggestions(currentAnnotations, nativeLanguage, remoteModel, apiKey);

            setLoading(false);
            voiceAnalyseBtn.disabled = false;
            voiceStatus.textContent = 'Suggestions generated. Edit flagged segments below.';
            worker.terminate();
        }
    };
});

// Remote Step 2: Mother Tongue -> Localised English
async function fetchRemoteSuggestions(annotations, nativeLanguage, model, apiKey) {
    const fetchPromises = annotations.map(async (ann) => {
        // Skip if the local model didn't actually produce a translation output
        if (!ann.translation) return;

        const SYSTEM_REWRITE = `You are a translator tasked with converting native conversational text back into English. 
The user is a native ${nativeLanguage} speaker. They provided this phrase in their mother tongue:
"${ann.translation}"

TASK:
Translate this phrase into English, but structurally build the new English sentence mimicking the natural conversational flow, phrasing, and idiosyncratic logic of the ${nativeLanguage} original. Avoid typical "AI rhythm".
Return ONLY the final English rewrite. No markdown, no quotes, no explanations.`;

        try {
            const response = await fetch(`${BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'system', content: SYSTEM_REWRITE }],
                    temperature: 0.3,
                    max_tokens: 500
                })
            });

            if (response.ok) {
                const data = await response.json();
                let rewrite = data?.choices?.[0]?.message?.content ?? '';
                rewrite = rewrite.replace(/^"|"$/g, '').trim(); // Remove rogue quotes

                // Update the state array
                const index = currentAnnotations.findIndex(a => a.id === ann.id);
                if (index > -1) {
                    currentAnnotations[index].suggestion = rewrite;

                    // Live update the DOM card if it's already rendered
                    const card = document.getElementById(`card_${ann.id}`);
                    if (card) {
                        const sugDiv = card.querySelector('.v-card-suggestion');
                        const editArea = card.querySelector(`#edit_${ann.id}`);
                        if (sugDiv) sugDiv.innerHTML = rewrite;
                        if (editArea && !editArea.value) editArea.value = rewrite;
                    }
                }
            }
        } catch (e) {
            console.error(`Failed remote rewrite for segment ${ann.id}:`, e);
        }
    });

    // Wait for all the parallel API requests to finish
    await Promise.allSettled(fetchPromises);
}

// Render the interactive inline editor
function renderVoiceEditor(baseText, annotations) {
    if (annotations.length === 0) {
        voiceStatus.textContent = 'No AI patterns found. Text sounds natural! ✨';
        voiceFlagCount.style.display = 'none';
        voiceInput.style.display = 'block';
        voiceEditor.style.display = 'none';
        return;
    }

    voiceStatus.textContent = 'Analysis complete. Edit flagged segments below.';
    voiceFlagCount.textContent = `${annotations.length} flagged`;
    voiceFlagCount.style.display = 'inline-block';

    // Build an array of text + annotation segments by finding them in the baseText.
    // We do simple indexOf searching for now (assumes non-overlapping distinct spans, or first match wins)
    let annotatedSegments = [];
    let remainingText = baseText;

    // Sort annotations by their occurrence in the text to parse safely
    const locatedAnnotations = annotations.map(ann => ({
        ...ann,
        index: baseText.indexOf(ann.text)
    })).filter(a => a.index !== -1).sort((a, b) => a.index - b.index);

    let currentIndex = 0;
    locatedAnnotations.forEach(ann => {
        // If there's plain text before this annotation, push it
        if (ann.index > currentIndex) {
            annotatedSegments.push({ type: 'text', content: baseText.substring(currentIndex, ann.index) });
        }

        // Ensure we haven't overlapped (simplistic handling: if overlapped, skip or handle carefully. Here we assume distinct as asked of AI)
        if (ann.index >= currentIndex) {
            annotatedSegments.push({ type: 'annotation', data: ann });
            currentIndex = ann.index + ann.text.length;
        }
    });

    // Remainder text
    if (currentIndex < baseText.length) {
        annotatedSegments.push({ type: 'text', content: baseText.substring(currentIndex) });
    }

    // Build the DOM
    voiceEditor.innerHTML = '';

    annotatedSegments.forEach((seg, idx) => {
        if (seg.type === 'text') {
            const span = document.createElement('span');
            // Preserve newlines
            span.innerHTML = seg.content.replace(/\n/g, '<br/>');
            span.className = 'v-span clear-text';
            span.dataset.idx = idx;
            voiceEditor.appendChild(span);
        } else {
            const ann = seg.data;
            const container = document.createElement('span');
            container.className = 'v-span flagged';
            container.dataset.type = ann.type;
            container.dataset.id = ann.id;
            container.dataset.idx = idx;
            container.innerHTML = ann.text.replace(/\n/g, '<br/>');

            // The small inline chip
            const chip = document.createElement('span');
            chip.className = 'v-chip';
            chip.dataset.type = ann.type;
            chip.title = "Click to resolve";
            chip.innerHTML = `⚑ ${ann.type}`;

            // The expandable card (hidden initially, inserted right after if toggled)
            const card = document.createElement('div');
            card.className = 'v-card';
            card.dataset.type = ann.type;
            card.id = `card_${ann.id}`;
            card.style.display = 'none';
            card.innerHTML = `
                <div class="v-card-header">
                    <span class="v-card-type">${ann.type || 'flagged'}</span>
                    <span class="v-card-reason">${ann.reason || 'AI pattern detected.'}</span>
                </div>
                ${ann.translation ? `
                <div class="v-card-suggestion-label" style="opacity: 0.7; font-size: 0.7rem;">Native Translation detected: <i>"${ann.translation}"</i></div>
                ` : ''}
                <div class="v-card-suggestion-label" style="margin-top: 6px;">English Rewrite Suggestion</div>
                <div class="v-card-suggestion">
                    ${ann.suggestion ? ann.suggestion : '<span class="loading-pulse" style="opacity:0.5;">Generating native rewrite...</span>'}
                </div>
                <div class="v-card-own">
                    <span class="v-card-own-label">Your Edit</span>
                    <textarea id="edit_${ann.id}" placeholder="Type your own phrasing here...">${ann.suggestion || ''}</textarea>
                </div>
                <div class="v-card-actions">
                    <button class="v-btn accept" onclick="resolveVoiceAnnotation('${ann.id}', 'suggest')">Accept suggestion</button>
                    <button class="v-btn accept" onclick="resolveVoiceAnnotation('${ann.id}', 'delete')">Delete segment</button>
                    <button class="v-btn use-own" onclick="resolveVoiceAnnotation('${ann.id}', 'own')">Use my edit</button>
                    <button class="v-btn dismiss" onclick="resolveVoiceAnnotation('${ann.id}', 'dismiss')">Dismiss</button>
                </div>
            `;

            chip.addEventListener('click', () => {
                const isVis = card.style.display === 'block';
                // close all other cards
                document.querySelectorAll('.v-card').forEach(c => c.style.display = 'none');
                if (!isVis) {
                    card.style.display = 'block';
                    // Focus the textarea
                    setTimeout(() => document.getElementById(`edit_${ann.id}`)?.focus(), 50);
                }
            });

            container.appendChild(chip);
            voiceEditor.appendChild(container);
            // We append the block-level card right after the inline span so it drops below it naturally
            voiceEditor.appendChild(card);
        }
    });

    voiceInput.style.display = 'none';
    voiceEditor.style.display = 'block';
}

function getVoiceCurrentText() {
    if (voiceInput.style.display !== 'none') return voiceInput.value;

    // Extract text from the DOM editor, removing chips and cards
    let fullText = '';
    Array.from(voiceEditor.childNodes).forEach(node => {
        if (node.classList?.contains('v-span')) {
            if (node.classList.contains('clear-text')) {
                // Br back to newline
                fullText += node.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            } else if (node.classList.contains('flagged')) {
                // Get only text nodes directly inside the flagged span (ignore the chip)
                let frag = '';
                node.childNodes.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) frag += child.textContent;
                    if (child.nodeName === 'BR') frag += '\n';
                });
                fullText += frag;
            }
        }
    });
    return fullText;
}

window.resolveVoiceAnnotation = function (id, action) {
    const span = document.querySelector(`.flagged[data-id="${id}"]`);
    const card = document.getElementById(`card_${id}`);
    if (!span || !card) return;

    let newText = '';

    if (action === 'dismiss') {
        // Keep original text, just unflag it
        let frag = '';
        span.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) frag += child.textContent;
            if (child.nodeName === 'BR') frag += '\n';
        });
        newText = frag;
    } else if (action === 'suggest') {
        const ann = currentAnnotations.find(a => a.id === id);
        newText = ann ? ann.suggestion : '';
    } else if (action === 'delete') {
        newText = '';
    } else if (action === 'own') {
        const ta = document.getElementById(`edit_${id}`);
        newText = ta ? ta.value : '';
    }

    // Replace span with standard text span
    const replacement = document.createElement('span');
    replacement.className = 'v-span clear-text';
    replacement.innerHTML = newText.replace(/\n/g, '<br/>');

    span.replaceWith(replacement);
    card.remove();

    // Update count
    const remaining = document.querySelectorAll('.v-span.flagged').length;
    if (remaining === 0) {
        voiceFlagCount.style.display = 'none';
        voiceStatus.textContent = 'All segments resolved.';
    } else {
        voiceFlagCount.textContent = `${remaining} flagged`;
    }
};

voiceCopyBtn.addEventListener('click', async () => {
    const text = getVoiceCurrentText();
    try {
        await navigator.clipboard.writeText(text);
        const orig = voiceCopyBtn.textContent;
        voiceCopyBtn.textContent = '✓ Copied';
        voiceCopyBtn.classList.add('copied');
        setTimeout(() => {
            voiceCopyBtn.textContent = orig;
            voiceCopyBtn.classList.remove('copied');
        }, 2000);
    } catch (e) {
        console.error('Clipboard copy failed:', e);
    }
});
