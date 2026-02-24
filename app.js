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
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y" or "It's not merely X, rather, it's Y". Be direct.
Do NOT restructure sentences. Do NOT change anything else. If already clean, return unchanged.`,

        clean: `You are an anti-slop text editor. Return ONLY the cleaned text with no explanation, no meta-commentary.

First, assess the register of the text:
- If it contains citations, formal academic language, methodology, statistics, or experimental results, treat it as ACADEMIC TEXT.
- Otherwise treat it as GENERAL PROSE.

Apply these rules to all text:
- Remove sycophantic openers and filler affirmations
- Remove verbose hedging and filler transitions
- Tighten wordy constructions
- **Refine Punctuation**: Break up complex, comma-heavy sentences into simpler, punchier ones. Use periods instead of em-dashes where it improves clarity.
- **Sentence Structure**: Feel free to merge or split sentences to improve logical flow. Prioritize readability over original sentence boundaries.
- Preserve all factual content. Do not add anything new.
- **Avoid metalinguistic negation**: Do not use "not X, but Y" patterns.
- If already tight, return unchanged.

For GENERAL PROSE also apply:
- Remove AI-typical rhythm padding
- Preserve the author's voice and tone.

For ACADEMIC TEXT apply these additional constraints:
- Preserve ALL citations, references, DOIs, and URLs exactly as written
- Preserve ALL technical terminology and measurements
- Preserve the formal academic register — do not casualise the language
- Improve sentence flow: break down dense academic jargon into clearer structures without losing precision.`,

        deep: `You are an expert editor performing a deep polish pass. Return ONLY the final text with no commentary.

First, assess the register of the text:
- If it contains citations, formal academic language, methodology, statistics, or experimental results, treat it as ACADEMIC TEXT.
- Otherwise treat it as GENERAL PROSE.

Apply these rules to all text:
- Remove sycophantic openers, filler affirmations, and verbose hedging.
- **Masterful Punctuation**: Aggressively break down complex sentences. Use variety in sentence length (short for impact, long for flow). Avoid the "comma splice" or em-dash traps typical of LLMs.
- **Flow & Cohesion**: Reorder clauses or sentences if it improves the argument's logic.
- Preserve all factual content. Do not add anything new.
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y" or "It's not merely X, rather, its Y".

For GENERAL PROSE also apply:
- Eliminate redundant adjectives and adverbs.
- Replace weak verbs with strong, active ones.
- Compress wordy paragraphs: target 25-35% reduction without losing nuance.

For ACADEMIC TEXT apply these additional constraints:
- Preserve ALL citations, references, and technical data exactly.
- Improve logical transitions: break long, winding sentences into multiple precise statements.
- Ensure the register remains formal but the structure becomes crystal clear.`
    },

    code: {
        lint: `You are a minimal code linter. Return ONLY the cleaned code with no explanation, no markdown fences.

Apply ONLY these safe fixes:
- Remove obvious narrative comments ("// Now we...", "// This function...", "// Let's...")
- Remove debug logging statements (console.log, print, logger.debug) clearly added for debugging only
- Fix smart quotes to straight quotes
- Remove placeholder TODO/FIXME comments with no actionable content
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y".
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
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y". Be direct.
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
- Never change visible behaviour or external API surface.
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y".`
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
    if (harnessAuthor) types.push('author-year citations such as (Smith, 2021), (van den Berg et al., 2020), (Smith, Jones & Brown, 2019), (Smith, 2018; Jones, 2020); also narrative citations like Smith (2021), van den Berg et al. (2020)');
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
- Return ONLY a valid JSON array, e.g. ["(Smith, 2021)", "Smith (2021)", "[1,2]", "10.1000/xyz"]
- Include narrative citations where the author's name is outside the parentheses, e.g., "Smith (2021)"
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

    // Deduplicate and sort by length DESC (crucial so that [10] is replaced before [1])
    const seen = new Set();
    const unique = citations
        .filter(c => typeof c === 'string' && c.length > 0 && !seen.has(c) && seen.add(c))
        .sort((a, b) => b.length - a.length);

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

const TIER_LABELS = { lint: 'Lint', clean: 'Clean', deep: 'Deep' };

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
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch {
        copyBtn.textContent = 'Failed';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
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
    const model = modelInput.value.trim() || 'GLM-4.5-Air';
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
        setStatus('Identifying citations...', 'warn');
        setLoading(true);
        outputArea.classList.remove('fade-in');

        const result = await extractCitationsWithAI(rawText, apiKey, model);
        textToSend = result.tokenized;
        citationMap = result.map;
        citCount = result.count;

        if (citCount > 0) {
            setStatus(`${citCount} citation${citCount > 1 ? 's' : ''} protected. Cleaning...`, 'warn');
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
                max_tokens: 2048,
                stream: true
            })
        });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try { const e = await response.json(); errMsg = e?.error?.message || errMsg; } catch { }
            throw new Error(errMsg);
        }

        // ── Streaming response ──
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = '';

        outputArea.value = ''; // Clear for streaming
        outputArea.classList.add('fade-in');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataLine = line.slice(6).trim();
                    if (dataLine === '[DONE]') break;

                    try {
                        const json = JSON.parse(dataLine);
                        const content = json.choices[0]?.delta?.content || '';
                        result += content;
                        outputArea.value = result;
                        // Auto-scroll output
                        outputArea.scrollTop = outputArea.scrollHeight;
                        updateCounts();
                    } catch (e) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }

        // ── Restore citations and finalize ──
        const cleaned = citCount > 0 ? restoreCitations(result, citationMap).trim() : result.trim();

        // Store originals for diff
        lastOriginal = rawText;
        lastCleaned = cleaned;

        outputArea.value = cleaned;
        updateCounts();

        if (citCount > 0) {
            outputCitCount.textContent = citCount;
            outputCitBadge.style.display = 'inline-flex';
        } else {
            outputCitBadge.style.display = 'none';
        }

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
    const savedModel = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.5-Air';
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

// ── Voice Editor Prompts ──────────────────────────────────────────────────

const VOICE_DIRECT_PROMPT = `You are a linguistic "humanizer" and anti-slop editor. 
Your goal is to convert robotic, formal, or AI-generated English into plain, natural, and warm conversational English.

Rules:
- AVOID AI rhythm, corporate jargon, and over-engineered academic phrasing.
- Speak like an intelligent human in a direct, punchy, and rhythmic way.
- Vary sentence length and structure to feel organic.
- Preserve the core meaning but remove all "slop".
- **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y" or "It's not merely X, rather, it's Y". Be direct.
 
Return ONLY the final English rewrite. No quotes, no explanations.`;

const VOICE_BATCH_DUAL_PROMPT = `You are a linguistic humanizer. Convert robotic or formal phrases in their native tongue back into plain, natural, and warm English.
TASK:
1. Kill the Slop: Avoid AI rhythm and bureaucratic words.
2. Conversational English: Use common, punchy English. 
3. **Punctuation Liberty**: Break long, winding sentences into simpler ones. Use periods or commas where they improve the "human" rhythm. 
4. No Monotony: Vary sentence length.
5. Preserve the "Soul": Capture the original human intent from the native tongue.
6. **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y" or "It's not merely X, rather, its Y". Be direct.
 
Return ONLY a JSON array of strings in the exact same order. No markdown, no explanations.`;

const VOICE_BATCH_DIRECT_PROMPT = `You are a linguistic humanizer. Convert these stilted English segments into natural, conversational English.
TASK:
1. Kill the Slop: Avoid AI rhythm and corporate jargon.
2. Use active verbs and simple, direct structure.
3. **Punctuation Variety**: Don't be afraid to break up complex punctuation. Use variety in sentence length to improve readability.
4. Vary sentence rhythms to avoid the robotic 12-15 word constant length.
5. **Avoid metalinguistic negation**: Do not use narrative patterns like "It's not X, but Y" or "It's not merely X, rather, its Y". Be direct.
 
Return ONLY a JSON array of strings in the exact same order. No markdown, no explanations.`;

// Voice DOM elements
const voiceTabBtn = document.getElementById('voiceTabBtn');
const voicePanel = document.getElementById('voicePanel');
const mainPanelContainer = document.querySelector('.main');
const sendToVoiceBtn = document.getElementById('sendToVoiceBtn');
const voiceManualFlagBtn = document.getElementById('voiceManualFlagBtn');

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

// Run Remote Analysis call (Detection + Native Translation)
voiceAnalyseBtn.addEventListener('click', async () => {
    if (isLoading) return;
    const text = voiceInput.style.display !== 'none' ? voiceInput.value.trim() : getVoiceCurrentText();
    if (!text) {
        voiceStatus.textContent = 'Paste some text to analyse.';
        return;
    }

    const nativeLanguage = localStorage.getItem('Z_NATIVE_LANG') || 'English';
    const remoteModel = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.5-Air';
    const apiKey = localStorage.getItem(STORAGE_KEY);

    if (!apiKey) {
        voiceStatus.textContent = 'API key required for remote rewrite (set in Settings).';
        // Open modal automatically
        toggleSettingsModal(true);
        return;
    }

    setLoading(true);
    voiceStatus.textContent = 'Starting remote ML detection...';
    voiceAnalyseBtn.disabled = true;

    const SYSTEM_PROMPT_PASS_1 = `You are a linguistic AI editor. Analyse the given text for two categories:
1. **Slop**: Segments that sound robotic, generic, overly formal, OR segments with high lexical complexity/jargon that a non-native English speaker might struggle to comprehend.
2. **Excellence**: Segments that sound remarkably human, clear, punchy, or naturally rhythmic.

Output ONLY a JSON array with this exact structure, nothing else:
[
  {
    "type": "<robotic|repetition|over-formal|ai-rhythm|cohesion|natural>",
    "text": "<the EXACT verbatim English text span from the source, INCLUDING all punctuation and spaces>",
    "reason": "<short reason why it sounds like AI/complex OR why it sounds natural/human>",
    "translation": "<if slop: natural translation of this span into Native Language; if natural: leave empty string>",
    "suggestion": "<a natural, humanized English rewrite of this segment>"
  }
]

CRITICAL: The "text" field MUST be an exact string-for-string match of the original text. Do not rewrite, improve, or fix the text in the "text" field.

Definitions:
- "cohesion": Phrasing that is grammatically correct but dense, jargon-heavy, or complex logic.
- "natural": High-quality human-sounding text. Identify these to confirm the text is working well.

Analyze the entire text. Do not limit your findings; identify all segments that are remarkably good or significantly problematic.
Do not wrap in markdown or explain your reasoning.
 
SPECIAL RULE: Specifically flag and fix any metalinguistic negation patterns (e.g., "It's not merely X, it's Y").`;

    const promptPass1 = `Target Native Language: ${nativeLanguage}\n\nText to analyze:\n"""\n${text}\n"""`;

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: remoteModel,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT_PASS_1 },
                    { role: 'user', content: promptPass1 }
                ],
                temperature: 0.1,
                max_tokens: 1024
            })
        });

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try { const e = await response.json(); errMsg = e?.error?.message || errMsg; } catch { }
            throw new Error(errMsg);
        }

        const data = await response.json();
        const msg = data?.choices?.[0]?.message;
        const rawResponse = msg?.content || msg?.reasoning_content || '[]';

        // Robust JSON extraction: look for the first [ and last ]
        let cleanedResponse = rawResponse.trim();
        const startIdx = cleanedResponse.indexOf('[');
        const endIdx = cleanedResponse.lastIndexOf(']');

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            cleanedResponse = cleanedResponse.substring(startIdx, endIdx + 1);
        } else {
            cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }

        let annotations = [];
        try {
            annotations = JSON.parse(cleanedResponse);
            if (!Array.isArray(annotations)) annotations = [];
        } catch (err) {
            console.warn('Failed to parse JSON from Pass 1 remote model. Raw:', rawResponse);
            // Fallback: try one more attempt with a more aggressive regex if simple index fails
            const jsonMatch = rawResponse.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
                try { annotations = JSON.parse(jsonMatch[0]); } catch (e) { annotations = []; }
            } else {
                annotations = [];
            }
        }

        voiceStatus.textContent = 'Detection complete. Triggering native rewrite passes...';

        // Generate IDs for mapping and render the sugestions immediately (Pass 2 removed as it is now integrated into Pass 1)
        currentAnnotations = annotations.map((ann, idx) => ({
            ...ann,
            type: ann.type || 'flagged',
            id: `ann_${idx}`,
            suggestion: ann.suggestion || ''
        }));

        renderVoiceEditor(text, currentAnnotations, 'direct');

        setLoading(false);
        voiceAnalyseBtn.disabled = false;
        // Status is now handled by renderVoiceEditor

    } catch (error) {
        voiceStatus.textContent = `Remote ML Error: ${error.message}`;
        setLoading(false);
        voiceAnalyseBtn.disabled = false;
    }
});

// Remote Step 2: Mother Tongue -> Localised English (Batched for speed)
// mode: 'dual' | 'direct'
async function fetchRemoteSuggestions(annotations, nativeLanguage, model, apiKey, mode = 'dual') {
    const isDual = mode === 'dual';
    const toProcess = isDual ? annotations.filter(ann => ann.translation) : annotations;
    if (toProcess.length === 0) return;

    const systemPrompt = isDual ? VOICE_BATCH_DUAL_PROMPT : VOICE_BATCH_DIRECT_PROMPT;
    const userContent = JSON.stringify(isDual ? toProcess.map(ann => ann.translation) : toProcess.map(ann => ann.text));

    try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
                temperature: 0.3,
                max_tokens: 1024
            })
        });

        if (response.ok) {
            const data = await response.json();
            let rawResult = data?.choices?.[0]?.message?.content ?? '[]';

            // Clean up JSON if model wrapped it
            rawResult = rawResult.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

            let rewrites = [];
            try {
                rewrites = JSON.parse(rawResult);
            } catch (e) {
                console.error("Failed to parse batched rewrites:", e);
                // Fallback: stay on loading/error
            }

            if (Array.isArray(rewrites)) {
                rewrites.forEach((rewrite, i) => {
                    const ann = toProcess[i];
                    if (!ann) return;

                    const cleanedRewrite = rewrite.replace(/^"|"$/g, '').trim();

                    // Update state
                    const index = currentAnnotations.findIndex(a => a.id === ann.id);
                    if (index > -1) {
                        currentAnnotations[index].suggestion = cleanedRewrite;

                        // Live update DOM
                        const card = document.getElementById(`card_${ann.id}`);
                        if (card) {
                            const sugDiv = card.querySelector('.v-card-suggestion');
                            const editArea = card.querySelector(`#edit_${ann.id}`);
                            if (sugDiv) sugDiv.innerHTML = cleanedRewrite;
                            if (editArea && !editArea.value) editArea.value = cleanedRewrite;
                        }
                    }
                });
            }
        } else {
            throw new Error(`Batch API error: ${response.status}`);
        }
    } catch (e) {
        console.error(`Failed batched remote rewrite (${mode}):`, e);
        // Show error in UI for all pending
        toProcess.forEach(ann => {
            const card = document.getElementById(`card_${ann.id}`);
            if (card) {
                const sugDiv = card.querySelector('.v-card-suggestion');
                if (sugDiv) sugDiv.innerHTML = '<span style="color:var(--danger)">Failed to generate suggestion.</span>';
            }
        });
    }
}

// Render the interactive inline editor
function renderVoiceEditor(baseText, annotations, mode = 'direct') {
    if (annotations.length === 0) {
        voiceStatus.textContent = 'No AI patterns found. Text sounds natural.';
        voiceFlagCount.style.display = 'none';
        voiceInput.style.display = 'block';
        voiceEditor.style.display = 'none';
        return;
    }

    voiceStatus.textContent = 'Analysis complete. Edit flagged segments below.';
    voiceFlagCount.textContent = `${annotations.length} flagged`;
    voiceFlagCount.style.display = 'inline-block';

    // Build an array of text + annotation segments by finding them in the baseText.
    let annotatedSegments = [];

    function findRobustIndex(text, target, startSearchFrom) {
        // Normalise utility to handle "smart" characters
        const superNormalise = (s) => s.toLowerCase()
            .replace(/[\u201C\u201D]/g, '"') // smart quotes
            .replace(/[\u2018\u2019]/g, "'") // smart single quotes
            .replace(/[\u2013\u2014]/g, '-') // dashes
            .replace(/\s+/g, ' ')
            .trim();

        const normText = superNormalise(text);
        const normTarget = superNormalise(target);

        // 1. Exact match first (most common)
        const trimmedTarget = target.trim();
        const exact = text.indexOf(trimmedTarget, startSearchFrom);
        if (exact !== -1) return { index: exact, matchedText: trimmedTarget };

        // 2. Fuzzy match (ignore case, whitespace, and smart quotes)
        const escaped = trimmedTarget
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex
            .replace(/\s+/g, '[\\s\\r\\n]+')       // flexible whitespace
            .replace(/["\u201C\u201D]/g, '["\u201C\u201D]') // flexible double quotes
            .replace(/['\u2018\u2019]/g, "['\u2018\u2019]"); // flexible single quotes

        if (!escaped) return { index: -1 };

        try {
            const re = new RegExp(escaped, 'gi');
            re.lastIndex = startSearchFrom;
            const match = re.exec(text);
            if (match) return { index: match.index, matchedText: match[0] };
        } catch (e) {
            console.error("Fuzzy regex match failed:", e);
        }

        // 3. Ultra-fuzzy match (ignore punctuation and whitespace)
        const stripPunct = (s) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
        const targetStripped = stripPunct(target);
        if (targetStripped.length > 3) {
            // Search through the text for a segment that, when stripped, matches targetStripped
            // To keep it performant, we only check around the startSearchFrom area
            let windowSize = target.length * 1.5 + 20;
            let segmentToSearch = text.substring(startSearchFrom, startSearchFrom + windowSize);

            // This is still complex to map back perfectly, but let's try a simpler heuristic:
            // most AI variations are just missing a trailing comma or using a different quote.
            const genericEscaped = target.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .split(/\s+/).join('\\s*[^a-z0-9]*\\s*');
            try {
                const re2 = new RegExp(genericEscaped, 'gi');
                re2.lastIndex = startSearchFrom;
                const match2 = re2.exec(text);
                if (match2) return { index: match2.index, matchedText: match2[0] };
            } catch (e) { }
        }

        // 4. Final Fallback: Character-only search
        const alphaOnly = (s) => s.toLowerCase().replace(/[^a-z0-9]/gi, '');
        const targetAlpha = alphaOnly(target);
        if (targetAlpha.length > 3) {
            const textAlpha = alphaOnly(text.substring(startSearchFrom));
            const alphaIdx = textAlpha.indexOf(targetAlpha);
            if (alphaIdx !== -1) {
                // We found a match in alpha-only space. 
                // We need to map it back. This is an approximation.
                // We'll search for the first and last alpha chars of the target.
                let startChar = targetAlpha[0];
                let endChar = targetAlpha[targetAlpha.length - 1];
                let firstPos = text.toLowerCase().indexOf(startChar, startSearchFrom);
                if (firstPos !== -1) {
                    // Approximate the length
                    let approximateEnd = firstPos + target.length + 10;
                    return { index: firstPos, matchedText: text.substring(firstPos, Math.min(approximateEnd, text.length)) };
                }
            }
        }

        return { index: -1 };
    }

    // Sort and locate annotations
    const locatedAnnotations = [];
    let lastFoundIdx = 0;

    // Process each annotation
    annotations.forEach(ann => {
        const result = findRobustIndex(baseText, ann.text, lastFoundIdx);
        if (result.index !== -1) {
            locatedAnnotations.push({
                ...ann,
                index: result.index,
                text: result.matchedText // Use original text for rendering
            });
            // Update lastFoundIdx for the next search to handle duplicates in order
            lastFoundIdx = result.index + result.matchedText.length;
        } else {
            // Fallback: try from start if not found sequentially
            const retry = findRobustIndex(baseText, ann.text, 0);
            if (retry.index !== -1) {
                locatedAnnotations.push({
                    ...ann,
                    index: retry.index,
                    text: retry.matchedText
                });
            } else {
                console.warn("Could not locate annotation in source text:", ann.text);
            }
        }
    });

    locatedAnnotations.sort((a, b) => a.index - b.index);

    if (annotations.length > 0 && locatedAnnotations.length === 0) {
        voiceStatus.textContent = `Matching failed! Found ${annotations.length} patterns by AI, but couldn't pin them to text. (AI returned different text than source)`;
        voiceStatus.style.color = 'var(--danger)';
    } else if (annotations.length > 0) {
        voiceStatus.textContent = `Analysis complete. Matched ${locatedAnnotations.length} of ${annotations.length} flags.`;
        voiceStatus.style.color = '';
    }

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
            chip.innerHTML = ann.type;

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
                ${ann.type === 'natural' ? `
                <div class="v-card-suggestion-choice" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
                    <div class="v-pill active" style="background: var(--success); border-color: var(--success);">Natural Flow</div>
                </div>
                ` : `
                <div class="v-card-suggestion-choice" style="display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--surface2); padding-bottom: 12px;">
                    <button class="v-pill ${mode === 'direct' ? 'active' : ''}" onclick="reprocessVoiceAnnotation('${ann.id}', 'direct')">Humanize</button>
                    <button class="v-pill ${mode === 'dual' ? 'active' : ''}" ${!ann.translation ? 'disabled' : ''} onclick="reprocessVoiceAnnotation('${ann.id}', 'dual')">Mother Tongue</button>
                    ${!ann.translation && mode === 'dual' ? '<span style="font-size: 0.65rem; opacity: 0.5; align-self: center;">(No native translation found)</span>' : ''}
                </div>

                <div class="v-card-suggestion">
                    ${ann.suggestion ? ann.suggestion : '<span class="loading-pulse" style="opacity:0.5;">Generating suggestion...</span>'}
                </div>
                `}
                <div class="v-card-own">
                    <span class="v-card-own-label">Your Edit</span>
                    <textarea id="edit_${ann.id}" placeholder="Type your own phrasing here...">${ann.suggestion || ''}</textarea>
                </div>
                <div class="v-card-actions">
                    ${ann.type === 'natural' ? `
                    <button class="v-btn accept" onclick="resolveVoiceAnnotation('${ann.id}', 'accept')">Confirm Excellence</button>
                    ` : `
                    <button class="v-btn accept" onclick="resolveVoiceAnnotation('${ann.id}', 'accept')">Apply Suggestion</button>
                    <button class="v-btn use-own" onclick="resolveVoiceAnnotation('${ann.id}', 'own')">Use My Edit</button>
                    <button class="v-btn dismiss" onclick="resolveVoiceAnnotation('${ann.id}', 'dismiss')">Ignore</button>
                    `}
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

window.reprocessVoiceAnnotation = async function (id, mode) {
    const ann = currentAnnotations.find(a => a.id === id);
    if (!ann) return;

    const card = document.getElementById(`card_${id}`);
    if (card) {
        const sugDiv = card.querySelector('.v-card-suggestion');
        if (sugDiv) sugDiv.innerHTML = '<span class="loading-pulse" style="opacity:0.5;">Generating...</span>';

        // Update active pill
        card.querySelectorAll('.v-pill').forEach(p => p.classList.toggle('active', p.getAttribute('onclick').includes(`'${mode}'`)));
    }

    const apiKey = localStorage.getItem(STORAGE_KEY);
    const model = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.5-Air';
    const nativeLanguage = localStorage.getItem('Z_NATIVE_LANG') || 'English';

    if (!apiKey) {
        voiceStatus.textContent = 'API key required.';
        return;
    }

    try {
        await fetchRemoteSuggestions([ann], nativeLanguage, model, apiKey, mode);
    } catch (err) {
        console.error('Reprocess failed:', err);
    }
};

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
    } else if (action === 'accept') {
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
        voiceCopyBtn.textContent = 'Copied';
        voiceCopyBtn.classList.add('copied');
        setTimeout(() => {
            voiceCopyBtn.textContent = orig;
            voiceCopyBtn.classList.remove('copied');
        }, 2000);
    } catch (e) {
        console.error('Clipboard copy failed:', e);
    }
});

// ── Phrase Help Popup Logic ──────────────────────────────────────────────

const voicePhraseHelpBtn = document.getElementById('voicePhraseHelpBtn');

// Prevent focus shift to keep selection valid in textarea
voicePhraseHelpBtn.addEventListener('mousedown', (e) => {
    // Only prevent if selection exists
    if (voiceInput.selectionStart !== voiceInput.selectionEnd) {
        e.preventDefault();
    }
});

const phraseHelpModalOverlay = document.getElementById('phraseHelpModalOverlay');
const phraseHelpCloseBtn = document.getElementById('phraseHelpCloseBtn');
const phApplyBtn = document.getElementById('phApplyBtn');
const phCancelBtn = document.getElementById('phCancelBtn');
const phOriginal = document.getElementById('phOriginal');
const phTranslation = document.getElementById('phTranslation');
const phRewrite = document.getElementById('phRewrite');
const phNativeLang = document.getElementById('phNativeLang');

function togglePhraseHelpModal(show, selection = '', context = '') {
    if (show) {
        phraseHelpModalOverlay.style.display = 'flex';
        phOriginal.textContent = selection;
        phTranslation.innerHTML = '<span class="loading-pulse" style="opacity:0.5;">Analysing...</span>';
        phRewrite.innerHTML = '<span class="loading-pulse" style="opacity:0.5;">Refining...</span>';
        phApplyBtn.disabled = true;
        const native = localStorage.getItem('Z_NATIVE_LANG') || 'Native';
        phNativeLang.textContent = native + ' Interpretation';
        runPhraseHelp(selection, context);
    } else {
        phraseHelpModalOverlay.style.display = 'none';
    }
}

async function runPhraseHelp(selection, context) {
    const apiKey = localStorage.getItem(STORAGE_KEY);
    const model = localStorage.getItem(STORAGE_MODEL) || 'GLM-4.7';
    const nativeLang = localStorage.getItem('Z_NATIVE_LANG') || 'English';

    if (!apiKey) {
        phTranslation.textContent = "API Key required.";
        phRewrite.textContent = "Please set it in settings.";
        return;
    }

    try {
        // Single Pass: English -> Native -> Natural English
        const combinedPrompt = `You are an expert copyeditor and anti-slop editor.
The user has selected a clunky or robotic phrase from a larger text that needs improvement.

Full Text Context:
"""
${context}
"""

Selected Phrase to improve: "${selection}"

Task:
1. Based on the context, figure out the actual intended meaning. Provide a natural, meaning-based translation into ${nativeLang}. The translation MUST be extremely simple, direct, and human, phrased so that a ${nativeLang} speaker with minimal English knowledge could perfectly understand the intent. DO NOT provide a literal, word-for-word translation.
2. Based on that ${nativeLang} translation, provide a punchy, conversational English rewrite of the phrase. Take into consideration the grammatical structures, syntax, and punctuation dispositions (or lack thereof) of the natural ${nativeLang} translation to create a meaningful, highly understandable, and humanized English version. DO NOT use "scholarly", high-falutin, or overly formal English. Keep it simple, direct, and human.
 
Constraint: Avoid metalinguistic negation (e.g., "It's not X, but Y"). Be direct.
 
Return ONLY a JSON object with two fields: "translation" and "rewrite". No markdown fences.`;

        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: combinedPrompt }],
                temperature: 0.3
            })
        });

        if (!response.ok) throw new Error("API request failed");

        const data = await response.json();
        let raw = data.choices[0].message.content.trim();
        // Remove markdown fences if present
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        const result = JSON.parse(raw);
        const translation = result.translation || "Translation unavailable";
        const rewrite = (result.rewrite || "Rewrite unavailable").replace(/^"|"$/g, '');

        phTranslation.textContent = translation;
        phRewrite.textContent = rewrite;
        phApplyBtn.disabled = false;

    } catch (err) {
        phTranslation.textContent = "Error: " + err.message;
        phRewrite.textContent = "Please try again.";
    }
}

voicePhraseHelpBtn.addEventListener('click', () => {
    let selection = "";

    // Case 1: Textarea is active (Initial state)
    if (voiceInput.style.display !== 'none') {
        const start = voiceInput.selectionStart;
        const end = voiceInput.selectionEnd;
        selection = voiceInput.value.substring(start, end).trim();
    }
    // Case 2: Rendered Editor is active (Post-analysis state)
    else {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            selection = sel.toString().trim();
        }
    }

    if (!selection) {
        voiceStatus.textContent = "Highlight a phrase first to get help.";
        return;
    }
    const fullText = getVoiceCurrentText();
    togglePhraseHelpModal(true, selection, fullText);
});

phApplyBtn.addEventListener('click', () => {
    const start = voiceInput.selectionStart;
    const end = voiceInput.selectionEnd;
    const rewrite = phRewrite.textContent;
    const val = voiceInput.value;
    voiceInput.value = val.substring(0, start) + rewrite + val.substring(end);
    togglePhraseHelpModal(false);
    voiceStatus.textContent = "Phrase updated.";
});

phCancelBtn.addEventListener('click', () => togglePhraseHelpModal(false));
phraseHelpCloseBtn.addEventListener('click', () => togglePhraseHelpModal(false));
phraseHelpModalOverlay.addEventListener('click', (e) => {
    if (e.target === phraseHelpModalOverlay) togglePhraseHelpModal(false);
});
