import { dbService } from './db.js';

// ── Language config ───────────────────────────────────────────────────────────
const LANGS = {
  py:   { name:'Python', icon:'🐍', color:'#3fb950', mode:'python',        note:'Pyodide 瀏覽器執行',          label:'Python' },
  cpp:  { name:'C++',    icon:'⚡', color:'#79c0ff', mode:'text/x-c++src', note:'線上 g++ (Judge0)',           label:'C++' },
  c:    { name:'C',      icon:'🔧', color:'#ffa657', mode:'text/x-csrc',   note:'線上 gcc (Judge0)',           label:'C' },
  java: { name:'Java',   icon:'☕', color:'#d2a8ff', mode:'text/x-java',   note:'Judge0 CE（需網路，約3秒）',  label:'Java' }
};

// ── State ─────────────────────────────────────────────────────────────────────
let CATEGORIES = [];
let PROBLEMS = [];
let currentLang = null;
let currentProblem = null;
let editor = null;
let pyodide = null;
let pyodideLoading = false;
let scores = {}; // { 'py_b964': {passed,total}, 'cpp_b964': ... }
let openGroups = new Set(); // store section.diff for open groups

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    mode: 'python', theme: 'dracula', lineNumbers: true,
    indentUnit: 4, tabSize: 4, indentWithTabs: false,
    extraKeys: { 
      'Tab': cm => cm.execCommand('indentMore'), 
      'Ctrl-Enter': runCode, 
      'Cmd-Enter': runCode,
      'Ctrl-Space': 'autocomplete'
    },
    styleActiveLine: true,
    autoCloseBrackets: true,
    matchBrackets: true
  });
  
  // 當輸入英文字母時，自動顯示提示下拉選單
  editor.on("inputRead", function(cm, change) {
    if (change.text && change.text.length > 0) {
      const c = change.text[0];
      if (c.match(/[a-zA-Z]/)) {
        cm.showHint({ completeSingle: false });
      }
    }
  });
  
  // 程式碼快取機制 (Debounced，避免阻塞自動補全)
  let saveTimeout = null;
  editor.on('change', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (currentProblem && currentLang) {
        localStorage.setItem('code_' + currentLang + '_' + currentProblem.id, editor.getValue());
      }
    }, 2000);
  });
  
  // 載入 Firebase 資料
  const meta = await dbService.getMeta(true);
  CATEGORIES = meta.categories || [];
  PROBLEMS = meta.problemsList || [];
  
  updateProblemTotals();
  switchLang('py');
  
  // 將切換分頁等 UI 事件綁定拉進來或直接在 HTML 裡面處理
  // 由於改為 module，html 裡的 onclick 會找不到 global function。
  // 我們需要將函式綁定到 window 上。
  window.switchLang = switchLang;
  window.runCode = runCode;
  window.toggleGroup = toggleGroup;
  window.toggleSidebar = toggleSidebar;
  window.selectProblem = selectProblem;
  window.loadSample = loadSample;
  window.clearEditor = clearEditor;
  window.copyCode = copyCode;
  window.showHint = showHint;
  window.hideHint = hideHint;
  window.zoomDesc = zoomDesc;
  window.zoomCode = zoomCode;
  window.toggleResults = toggleResults;

  // 預設設定字體大小
  zoomDesc(0);
  zoomCode(0);

  // 嘗試從網址 Hash 或快取中恢復上次的題目
  const hashId = window.location.hash.slice(1);
  const lastId = hashId || localStorage.getItem('last_problem_id');
  if (lastId) {
    const idx = PROBLEMS.findIndex(p => p.id === lastId);
    if (idx >= 0) selectProblem(idx);
  }
});

// ── UI 控制 ────────────────────────────────────────────────────────
function toggleResults() {
  document.getElementById('results-panel').classList.toggle('collapsed');
}

// ── Language switching ────────────────────────────────────────────────────────
function switchLang(lang) {
  currentLang = lang;
  const cfg = LANGS[lang];

  // Update CSS variable for accent color
  document.documentElement.style.setProperty('--lang-color', cfg.color);

  // Update tabs
  Object.keys(LANGS).forEach(k => {
    document.getElementById('tab-'+k).className = 'lang-tab' + (k===lang ? ' active-'+k : '');
  });

  // Update header logo color, label, note
  document.getElementById('logo').textContent = `Code Judge`;
  document.getElementById('lang-label').textContent = cfg.label;
  document.getElementById('lang-note').textContent = cfg.note;

  // Update editor mode
  editor.setOption('mode', cfg.mode);

  // Update run button color (via CSS var, already done above)
  // Update status
  updateStatus(lang);

  // Re-render problem list with new scores
  renderProblemList();

  // If a problem is open, reload its state
  if (currentProblem) {
    renderProblemContent();
    const key = lang + '_' + currentProblem.id;
    document.getElementById('results-body').innerHTML = '<div class="no-results">已切換語言，重新撰寫或載入解答後點擊執行</div>';
    document.getElementById('results-summary').textContent = '';
  }

  // Trigger Pyodide load when Python selected
  if (lang === 'py' && !pyodide && !pyodideLoading) {
    loadPyodide();
  }
}

function updateStatus(lang) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (lang === 'py') {
    if (pyodide) { dot.className = 'status-dot ready'; txt.textContent = 'Python 就緒'; }
    else { dot.className = 'status-dot'; txt.textContent = '載入 Python 中...'; }
  } else if (lang === 'java') {
    dot.className = 'status-dot ready';
    txt.textContent = 'Java 就緒（需網路）';
  } else {
    dot.className = 'status-dot ready';
    txt.textContent = LANGS[lang].name + ' 就緒';
  }
  // Enable/disable run button
  const canRun = lang !== 'py' || !!pyodide;
  document.getElementById('run-btn').disabled = !canRun || !currentProblem;
}

// ── Pyodide ───────────────────────────────────────────────────────────────────
async function loadPyodide() {
  pyodideLoading = true;
  updateStatus('py');
  try {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
    document.head.appendChild(script);
    await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
    pyodide = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
    pyodideLoading = false;
    if (currentLang === 'py') {
      updateStatus('py');
      if (currentProblem) document.getElementById('run-btn').disabled = false;
    }
  } catch(e) {
    pyodideLoading = false;
    document.getElementById('status-dot').className = 'status-dot'; // keep yellow
    document.getElementById('status-text').textContent = 'Python 載入失敗';
  }
}

// ── Problem list ──────────────────────────────────────────────────────────────
const DIFFICULTY = {
  easy:    { stars:'⭐',       label:'初級',   color:'#3fb950', bg:'rgba(63,185,80,.15)',   border:'rgba(63,185,80,.3)' },
  medium:  { stars:'⭐⭐',     label:'中級',   color:'#d29922', bg:'rgba(210,153,34,.15)',  border:'rgba(210,153,34,.3)' },
  midhigh: { stars:'⭐⭐⭐',   label:'中高級', color:'#bc8cff', bg:'rgba(188,140,255,.14)', border:'rgba(188,140,255,.32)' },
  hard:    { stars:'⭐⭐⭐⭐', label:'高級',   color:'#f85149', bg:'rgba(248,81,73,.15)',   border:'rgba(248,81,73,.3)' }
};

// LEVEL_SECTIONS removed, replaced by dynamic CATEGORIES

function difficultyInfo(diff) {
  return DIFFICULTY[diff] || DIFFICULTY.easy;
}

function difficultyStars(diff) {
  const d = difficultyInfo(diff);
  return `<span style="font-size:9px;color:${d.color};">${d.stars}</span>`;
}

function difficultyBadge(diff) {
  const d = difficultyInfo(diff);
  return `<span class="badge" style="color:${d.color};background:${d.bg};border-color:${d.border};">${d.stars} ${d.label}</span>`;
}

const FOLDER_COLORS = ['#3fb950', '#d29922', '#bc8cff', '#f85149', '#58a6ff', '#e34c26'];
function hexToRgba(hex, alpha) {
  if (!hex.startsWith('#')) return hex;
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderProblemList() {
  const list = document.getElementById('problem-list');
  const indexedProblems = PROBLEMS.map((p, i) => ({ p, i }));
  
  const roots = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).filter(c => !c.parentId).sort((a,b) => a.order - b.order);

  list.innerHTML = roots.map((root, idx) => {
    const color = FOLDER_COLORS[idx % FOLDER_COLORS.length];
    const bg = hexToRgba(color, 0.15);
    const border = hexToRgba(color, 0.3);

    const isCollapsed = openGroups.has(root.id) ? '' : ' collapsed-group';
    const isHidden = openGroups.has(root.id) ? '' : ' group-hidden';

    const getCategoryId = (p) => {
      if (p.categoryId) return p.categoryId;
      return 'cat_' + (p.diff || 'easy');
    };

    const children = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).filter(c => c.parentId === root.id).sort((a,b) => a.order - b.order);
    const rootItems = indexedProblems.filter(({ p }) => getCategoryId(p) === root.id);
    let totalItemsCount = rootItems.length;

    let childrenHtml = children.map(child => {
      const childItems = indexedProblems.filter(({ p }) => getCategoryId(p) === child.id);
      totalItemsCount += childItems.length;
      
      return `<div class="sub-category">
        <div class="sub-category-title">└ ${escH(child.name)} <span style="font-weight:normal;color:var(--text-muted);font-size:10px;">(${childItems.length} 題)</span></div>
        ${childItems.map(({ p, i }) => renderProblemItem(p, i, {color})).join('')}
      </div>`;
    }).join('');

    const itemsHtml = rootItems.map(({ p, i }) => renderProblemItem(p, i, {color})).join('');

    return `<div class="problem-group">
      <div class="level-header${isCollapsed}" style="--level-color:${color};--level-bg:${bg};--level-border:${border};" onclick="toggleGroup('${root.id}')">
        <div class="level-title-row">
          <span>📁</span>
          <span>${escH(root.name)}</span>
          <span class="folder-chevron">▼</span>
          <span class="count">${totalItemsCount} 題</span>
        </div>
      </div>
      <div class="group-items${isHidden}">
        ${itemsHtml}
        ${childrenHtml}
      </div>
    </div>`;
  }).join('');

  // Solved count for current language
  const solved = PROBLEMS.filter(p => {
    const s = scores[currentLang + '_' + p.id];
    return s && s.passed === s.total;
  }).length;
  document.getElementById('solved-count').textContent = `${solved} / ${PROBLEMS.length}`;
}

function updateProblemTotals() {
  document.getElementById('problem-total').textContent = PROBLEMS.length;
  document.getElementById('problem-list-total').textContent = PROBLEMS.length;
}

function renderProblemItem(p, i, d) {
    const key = currentLang + '_' + p.id;
    const s = scores[key];
    let sh = '';
    if (s) {
      if (s.passed === s.total) sh = '<span class="pstatus pass">AC</span>';
      else if (s.passed > 0) sh = `<span class="pstatus partial">${s.passed}/${s.total}</span>`;
      else sh = '<span class="pstatus fail">WA</span>';
    }
    const active = currentProblem?.id === p.id ? ' active' : '';
    return `<div class="problem-item${active}" style="--level-color:${d.color};" onclick="selectProblem(${i})">
      <div class="pmeta">第 ${String(i+1).padStart(2,'0')} 題 · ${escH(p.topic || p.date)}</div>
      <div class="problem-row">
        <span class="ptitle">${escH(p.title)}</span>
        <span class="pmarks">${difficultyStars(p.diff)}${sh}</span>
      </div>
    </div>`;
}

// ── Select problem ────────────────────────────────────────────────────────────
async function selectProblem(idx) {
  const pMeta = PROBLEMS[idx];
  
  // 儲存狀態以供下次恢復
  localStorage.setItem('last_problem_id', pMeta.id);
  window.history.replaceState(null, null, '#' + pMeta.id);

  // 非同步載入題目詳情
  const details = await dbService.getProblemDetails(pMeta.id);
  currentProblem = { ...pMeta, ...(details || {}) };
  
  renderProblemList();
  renderProblemContent();
  document.getElementById('results-body').innerHTML = '<div class="no-results">撰寫程式後點擊「執行並評分」</div>';
  document.getElementById('results-summary').textContent = '';
  
  if (currentLang !== 'py' || pyodide)
    document.getElementById('run-btn').disabled = false;
    
  // 嘗試載入先前的作答記錄
  const savedCode = localStorage.getItem('code_' + currentLang + '_' + currentProblem.id);
  if (savedCode) {
    editor.setValue(savedCode);
  } else {
    editor.setValue('');
  }
}

function renderProblemContent() {
  const p = currentProblem;
  const cfg = LANGS[currentLang];
  document.getElementById('prob-badge').textContent = p.source ? `🌏 ${p.source}` : `ZeroJudge: ${p.id}`;
  const originalUrl = safeUrl(p.url);
  const samples = p.samples.map((s, i) => `
    <div class="sample-block">
      <div class="sample-block-hdr">範例 ${i+1}</div>
      <div class="sample-inner">
        <div class="sample-col"><div class="sample-col-label">輸入</div><pre>${escH(s.input)}</pre></div>
        <div class="sample-col"><div class="sample-col-label">輸出</div><pre>${escH(s.output)}</pre></div>
      </div>
    </div>`).join('');
  document.getElementById('problem-content').innerHTML = `
    <div class="problem-title-h">${escH(p.title)}</div>
    <div class="problem-meta">
      <span class="badge">${escH(p.date)}</span>
      ${p.source ? `<span class="badge" style="color:#79c0ff;background:rgba(121,192,255,.12);border-color:rgba(121,192,255,.35);">🌏 ${escH(p.source)}</span>` : `<span class="badge">${escH(p.id)}</span>`}
      ${originalUrl ? `<a class="badge" href="${escAttr(originalUrl)}" target="_blank" rel="noopener" style="color:#3fb950;background:rgba(63,185,80,.10);border-color:rgba(63,185,80,.35);text-decoration:none;">🔗 原題</a>` : ''}
      <span class="badge lang">${escH(cfg.icon)} ${escH(cfg.name)}</span>
      ${p.topic ? `<span class="badge topic">${escH(p.topic)}</span>` : ''}
      ${difficultyBadge(p.diff)}
    </div>
    <div class="section-label">題目說明</div><div class="desc-text">${safeMarkdown(p.desc)}</div>
    <div class="section-label">輸入說明</div><div class="desc-text">${safeMarkdown(p.input_desc)}</div>
    <div class="section-label">輸出說明</div><div class="desc-text">${safeMarkdown(p.output_desc)}</div>
    <div class="section-label">範例測資</div>${samples}`;
}

// ── Run ───────────────────────────────────────────────────────────────────────
let errorMarks = [];

function clearErrorMarks() {
  errorMarks.forEach(m => m.clear());
  errorMarks = [];
}

async function runCode() {
  if (!currentProblem || !currentLang) return;
  const code = editor.getValue().trim();
  if (!code) { alert('請先撰寫程式碼！'); return; }

  clearErrorMarks();

  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = currentLang === 'java' ? '⏳ 執行中（約3秒）...' : '⏳ 執行中...';

  const results = [];
  for (let i = 0; i < currentProblem.samples.length; i++) {
    const s = currentProblem.samples[i];
    const r = await runSingle(code, s.input, s.output);
    results.push({ ...r, idx: i + 1 });
  }

  btn.disabled = false;
  btn.textContent = '▶ 執行並評分';

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  scores[currentLang + '_' + currentProblem.id] = { passed, total };
  renderProblemList();
  renderResults(results, passed, total);

  // 如果有發生錯誤，找第一個有 parse 出行號的錯誤標上紅底線
  const firstErr = results.find(r => r.errorLine !== undefined && r.errorLine >= 0);
  if (firstErr) {
    const L = firstErr.errorLine;
    const mark = editor.markText({line: L, ch: 0}, {line: L, ch: 1000}, {className: 'syntax-error', title: '執行/編譯錯誤'});
    errorMarks.push(mark);
  }

  // 執行完畢後自動展開結果面板
  document.getElementById('results-panel').classList.remove('collapsed');
}

async function runSingle(code, stdin, expectedRaw) {
  const expected = expectedRaw.replace(/\r\n/g, '\n').trimEnd();
  try {
    let output = '', error = null, errorLine = undefined;
    if (currentLang === 'py') {
      const lines = stdin.split('\n');
      pyodide.globals.set('_stdin_lines', lines);
      pyodide.globals.set('_stdin_text', stdin.endsWith('\n') ? stdin : stdin + '\n');
      output = await pyodide.runPythonAsync(`
import sys, io, builtins
_lines = _stdin_lines; _idx = [0]
def _inp(p=''):
    if _idx[0] < len(_lines): v=_lines[_idx[0]]; _idx[0]+=1; return v
    raise EOFError()
builtins.input = _inp
sys.stdin = io.StringIO(_stdin_text)
_old = sys.stdout; sys.stdout = io.StringIO()
try:
${code.split('\n').map(l => '    ' + l).join('\n')}
    _out = sys.stdout.getvalue()
except Exception as e:
    import traceback
    _out = 'ERROR:\\n' + traceback.format_exc()
finally:
    sys.stdout = _old
_out`);
      if (String(output).startsWith('ERROR:')) {
        error = String(output);
        output = '';
        const m = error.match(/line (\d+)/g);
        if (m && m.length > 0) {
          // 取出最後一個 line X（通常是最內層的使用者程式碼）
          const lastLineMatch = m[m.length - 1].match(/\d+/);
          if (lastLineMatch) {
             errorLine = parseInt(lastLineMatch[0]) - 10; // Python script wrapper 佔 9 行，加上 0-indexed = 10
          }
        }
      }
    } else {
      // C / C++ / Java 走 Judge0 CE（Piston 公開 API 自 2026/02/15 起白名單）
      const JUDGE0_LANG = { cpp: 54, c: 50, java: 62 };
      const res = await fetch('https://ce.judge0.com/submissions?base64_encoded=false&wait=true', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language_id: JUDGE0_LANG[currentLang],
          source_code: code,
          stdin: stdin || ''
        })
      });
      const data = await res.json();
      const stdout = data.stdout || '';
      const stderr = data.stderr || data.compile_output || '';
      if (stderr && !stdout) {
         error = stderr;
         const m = error.match(/[:\s](\d+):/); // 匹配 :15: 或 15:
         if (m) errorLine = parseInt(m[1]) - 1;
         return { pass: false, got: '', expected, error: error.split('\n').slice(0, 4).join('\n'), errorLine };
      }
      output = stdout;
    }
    const got = String(output).replace(/\r\n/g, '\n').trimEnd();
    return { pass: got === expected, got, expected, error, errorLine };
  } catch(e) {
    return { pass: false, got: '', expected, error: String(e.message || e).split('\n').slice(0, 3).join('\n') };
  }
}

function highlightLineDiff(expected, got) {
  const vis = (s) => escH(s).replace(/ /g, '<span style="opacity:0.4;font-weight:bold;">·</span>');
  
  let i = 0;
  while (i < expected.length && i < got.length && expected[i] === got[i]) { i++; }
  
  let j = 0;
  while (j < expected.length - i && j < got.length - i && expected[expected.length - 1 - j] === got[got.length - 1 - j]) { j++; }
  
  const gotPrefix = got.slice(0, i);
  const gotMid = got.slice(i, got.length - j);
  const gotSuffix = got.slice(got.length - j);
  
  let res = vis(gotPrefix);
  if (gotMid.length > 0) {
    res += `<span style="background:rgba(255,80,80,0.3);color:#ff6666;border-radius:2px;padding:0 1px;">${vis(gotMid)}</span>`;
  } else if (expected.length - i - j > 0) {
    res += `<span style="background:rgba(255,80,80,0.3);color:#ff6666;border-radius:2px;" title="缺少字元">_</span>`;
  }
  res += vis(gotSuffix);
  return res;
}

function getDiffHtml(expected, got) {
  if (expected === got) return escH(got);
  if (!got) return '<span style="color:var(--text-muted)">(無輸出)</span>';

  const eLines = expected.split('\n');
  const gLines = got.split('\n');
  let html = '';
  
  const len = Math.max(eLines.length, gLines.length);
  for (let i = 0; i < len; i++) {
    const eLine = eLines[i];
    const gLine = gLines[i];
    
    if (gLine === undefined) {
      html += '<span style="color:var(--red);">[缺少此行]</span>\n';
    } else if (eLine === undefined) {
      // 多出這行
      const visLine = escH(gLine).replace(/ /g, '<span style="opacity:0.4;font-weight:bold;">·</span>');
      html += `<span style="background:rgba(255,80,80,0.3);color:#ff6666;border-radius:2px;padding:0 1px;">${visLine || '&nbsp;'}</span>\n`;
    } else if (eLine !== gLine) {
      // 該行有差異，進行局部高亮
      html += highlightLineDiff(eLine, gLine) + '\n';
    } else {
      // 該行完全相同
      html += escH(gLine) + '\n';
    }
  }
  return html.replace(/\n$/, '');
}

function renderResults(results, passed, total) {
  const pct = Math.round(passed / total * 100);
  const sc = passed === total ? 'full' : passed > 0 ? 'partial' : 'zero';
  document.getElementById('results-summary').innerHTML =
    `<span style="color:var(--${passed===total?'green':passed>0?'yellow':'red'})">${passed}/${total} 通過</span>`;

  const rows = results.map(r => {
    let gotHtml = '';
    if (r.error) {
      gotHtml = escH(r.error);
    } else if (r.pass) {
      gotHtml = escH(r.got || '(無輸出)');
    } else {
      gotHtml = getDiffHtml(r.expected, r.got);
    }

    return `
    <div class="test-case">
      <div class="test-col"><div class="test-label">
        <div class="icon ${r.pass?'icon-pass':'icon-fail'}">${r.pass?'✓':'✗'}</div>
        <span style="color:var(--${r.pass?'green':'red'})">測資 ${r.idx} · ${r.pass?'AC':'WA'}</span>
      </div></div>
      <div class="test-col">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">預期輸出</div>
        <pre>${escH(r.expected)}</pre>
      </div>
      <div class="test-col">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">你的輸出</div>
        <pre class="${r.pass?'pre-right':'pre-wrong'}">${gotHtml}</pre>
      </div>
    </div>`;
  }).join('');

  document.getElementById('results-body').innerHTML = `
    <div class="score-summary">
      <span class="score-num ${sc}">${pct}%</span>
      <div>
        <div style="font-size:13px;font-weight:600">${passed===total?'🎉 全部通過！':passed>0?'⚠️ 部分通過':'❌ 未通過'}</div>
        <div style="font-size:11px;color:var(--text-muted)">通過 ${passed} / ${total} 筆測資</div>
      </div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    ${rows}`;
}

function clearEditor() { editor.setValue(''); editor.focus(); }

function copyCode() {
  const code = editor.getValue();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-btn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '📋 已複製';
      setTimeout(() => btn.innerHTML = originalText, 2000);
    }
  }).catch(err => {
    console.error('複製失敗:', err);
  });
}

async function loadSample() {
  if (!currentProblem || !currentLang) { alert('請先選擇語言和題目'); return; }
  const solData = await dbService.getSolutions(currentProblem.id);
  const sol = solData?.[currentLang] || '';
  if (!sol) { alert('此題目目前沒有參考解答'); return; }
  if (editor.getValue().trim() && !confirm('確定要載入參考解答？（會同時顯示解題思路）')) return;
  editor.setValue(sol);
  editor.focus();
  // Show hint panel if hint exists
  if (currentProblem.hint) showHint();
}

function showHint() {
  if (!currentProblem || !currentProblem.hint) return;
  const html = safeMarkdown(currentProblem.hint);
  document.getElementById('hint-content').innerHTML = html;
  document.getElementById('hint-overlay').style.display = 'flex';
}

function hideHint() {
  document.getElementById('hint-overlay').style.display = 'none';
}

function escH(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(s) {
  return escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url), window.location.href);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch (_) {
    return '';
  }
}

function safeMarkdown(text) {
  const escaped = escH(text).replace(/~/g, '&#126;');
  return marked.parse(escaped).replace(/&amp;(lt|gt|amp|#126);/g, '&$1;');
}

// ── UI 互動邏輯（側欄、資料夾、拖曳） ──────────────────────────────────────────

// 資料夾收合
function toggleGroup(diff) {
  if (openGroups.has(diff)) {
    openGroups.delete(diff);
  } else {
    openGroups.add(diff);
  }
  renderProblemList();
}

// 側欄收合
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
}

// 拖曳分隔線調整寬度
function initDrag() {
  const handleV = document.getElementById('drag-handle');
  const leftPanel = document.getElementById('problem-panel');
  const mainContainer = document.getElementById('main');
  let isDraggingV = false;

  if (handleV && leftPanel && mainContainer) {
    handleV.addEventListener('mousedown', (e) => {
      isDraggingV = true;
      handleV.classList.add('dragging');
      document.body.classList.add('resizing');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingV) return;
      const containerRect = mainContainer.getBoundingClientRect();
      let newWidth = e.clientX - containerRect.left;
      const minWidth = 200;
      const maxWidth = containerRect.width - 280;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      leftPanel.style.flex = `0 0 ${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingV) {
        isDraggingV = false;
        handleV.classList.remove('dragging');
        document.body.classList.remove('resizing');
        if (typeof editor !== 'undefined' && editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      }
    });
  }

  // 上下拖曳 (評測結果面板高度)
  const handleH = document.getElementById('drag-handle-h');
  const resultsPanel = document.getElementById('results-panel');
  const editorPanel = document.getElementById('editor-panel');
  let isDraggingH = false;

  if (handleH && resultsPanel && editorPanel) {
    handleH.addEventListener('mousedown', (e) => {
      isDraggingH = true;
      handleH.classList.add('dragging');
      document.body.classList.add('resizing-h');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingH) return;
      const containerRect = editorPanel.getBoundingClientRect();
      // 高度 = 容器底部 - 滑鼠Y座標
      let newHeight = containerRect.bottom - e.clientY;
      const minHeight = 50; // 最小高度
      const maxHeight = containerRect.height - 100; // 預留至少 100px 給編輯器
      
      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > maxHeight) newHeight = maxHeight;
      
      resultsPanel.style.height = `${newHeight}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDraggingH) {
        isDraggingH = false;
        handleH.classList.remove('dragging');
        document.body.classList.remove('resizing-h');
        if (typeof editor !== 'undefined' && editor) {
          setTimeout(() => editor.refresh(), 50);
        }
      }
    });
  }
}

// ── 字體縮放 ────────────────────────────────────────────────────────────────
let currentDescSize = 14;
let currentCodeSize = 14;

function zoomDesc(dir) {
  currentDescSize += dir * 2;
  if (currentDescSize < 10) currentDescSize = 10;
  if (currentDescSize > 30) currentDescSize = 30;
  document.documentElement.style.setProperty('--desc-size', `${currentDescSize}px`);
}

function zoomCode(dir) {
  currentCodeSize += dir * 2;
  if (currentCodeSize < 10) currentCodeSize = 10;
  if (currentCodeSize > 30) currentCodeSize = 30;
  document.documentElement.style.setProperty('--code-size', `${currentCodeSize}px`);
  if (typeof editor !== 'undefined' && editor) {
    setTimeout(() => editor.refresh(), 50);
  }
}

// 初始化拖曳
window.addEventListener('DOMContentLoaded', initDrag);
