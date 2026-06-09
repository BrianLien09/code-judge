/**
 * APCS Judge — 教師後台本地伺服器
 *
 * 為何需要這個伺服器：
 *   瀏覽器安全限制不允許 JS 直接寫入本地磁碟，
 *   因此用 Express 做一層薄薄的橋接，讓 admin.html 可以
 *   透過 API 直接寫入 data/problems.js 與 data/solutions.js。
 *
 * 使用方式：
 *   node server.js
 *   然後開啟 http://localhost:3000/admin.html
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3000;
const ROOT = __dirname; // 專案根目錄

// ── Middleware ────────────────────────────────────────────────────────────────

// 解析 JSON body（接收前端傳來的資料）
app.use(express.json({ limit: '50mb' }));

// 靜態檔案服務（index.html、admin.html、css/、data/、js/）
app.use(express.static(ROOT));

// ── API Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/data
 * 讀取現有的 problems.js 與 solutions.js，
 * 回傳 { problems: [...], solutions: {...} } 的 JSON。
 *
 * 為何用 eval 而非 JSON.parse：
 *   原始 JS 檔案使用 template literal（反引號）儲存程式碼，
 *   不是合法 JSON，需要先在 Node.js VM 中執行才能取得物件。
 */
app.get('/api/data', (req, res) => {
  try {
    const problemsPath  = path.join(ROOT, 'data', 'problems.js');
    const solutionsPath = path.join(ROOT, 'data', 'solutions.js');
    const categoriesPath = path.join(ROOT, 'data', 'categories.js');

    const problemsCode  = fs.readFileSync(problemsPath,  'utf8');
    const solutionsCode = fs.readFileSync(solutionsPath, 'utf8');
    
    // 如果 categories.js 尚未建立，回傳預設空陣列
    let categoriesCode = '';
    if (fs.existsSync(categoriesPath)) {
      categoriesCode = fs.readFileSync(categoriesPath, 'utf8');
    }

    let PROBLEMS, SOLUTIONS, CATEGORIES = [];

    Function('PROBLEMS_CB', problemsCode  + '; PROBLEMS_CB(PROBLEMS);')((p) => { PROBLEMS = p; });
    Function('SOLUTIONS_CB', solutionsCode + '; SOLUTIONS_CB(SOLUTIONS);')((s) => { SOLUTIONS = s; });
    if (categoriesCode) {
      Function('CATEGORIES_CB', categoriesCode + '; CATEGORIES_CB(CATEGORIES);')((c) => { CATEGORIES = c; });
    } else {
      CATEGORIES = [
        { id: 'cat_easy', name: '初級練習', parentId: null, order: 1 },
        { id: 'cat_medium', name: '中級練習', parentId: null, order: 2 },
        { id: 'cat_midhigh', name: '中高級練習', parentId: null, order: 3 },
        { id: 'cat_hard', name: '高級練習', parentId: null, order: 4 }
      ];
    }

    res.json({ problems: PROBLEMS, solutions: SOLUTIONS, categories: CATEGORIES });
  } catch (err) {
    console.error('[GET /api/data]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/save/problems
 * 接收題目陣列，序列化成 problems.js 後寫入磁碟。
 * Body: { problems: Array<ProblemObject> }
 */
app.post('/api/save/problems', (req, res) => {
  try {
    const { problems } = req.body;
    if (!Array.isArray(problems)) {
      return res.status(400).json({ error: 'problems 必須是陣列' });
    }

    const js = generateProblemsJS(problems);
    const dest = path.join(ROOT, 'data', 'problems.js');
    fs.writeFileSync(dest, js, 'utf8');

    console.log(`[SAVE] problems.js 已更新（${problems.length} 道題目）`);
    res.json({ ok: true, count: problems.length });
  } catch (err) {
    console.error('[POST /api/save/problems]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/save/solutions
 * 接收解答物件，序列化成 solutions.js 後寫入磁碟。
 * Body: { solutions: { py: {...}, cpp: {...}, c: {...}, java: {...} } }
 */
app.post('/api/save/solutions', (req, res) => {
  try {
    const { solutions } = req.body;
    if (!solutions || typeof solutions !== 'object') {
      return res.status(400).json({ error: 'solutions 格式錯誤' });
    }

    const js = generateSolutionsJS(solutions);
    const dest = path.join(ROOT, 'data', 'solutions.js');
    fs.writeFileSync(dest, js, 'utf8');

    console.log('[SAVE] solutions.js 已更新');
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/save/solutions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/save/categories
 * 接收分類陣列，序列化成 categories.js 後寫入磁碟。
 * Body: { categories: Array<CategoryObject> }
 */
app.post('/api/save/categories', (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories 必須是陣列' });
    }

    const js = `// ── 分類資料 ──────────────────────────────────────────────────────────────────\n` +
               `const CATEGORIES = ${JSON.stringify(categories, null, 2)};\n`;
    const dest = path.join(ROOT, 'data', 'categories.js');
    fs.writeFileSync(dest, js, 'utf8');

    console.log(`[SAVE] categories.js 已更新（${categories.length} 個分類）`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/save/categories]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── JS 序列化工具 ─────────────────────────────────────────────────────────────

/**
 * 將題目陣列序列化為 problems.js 的格式。
 *
 * 為何不用 JSON.stringify：
 *   原始格式是緊湊的 JS 物件語法（key 不加引號），
 *   保持接近原始格式以減少 git diff 雜訊。
 *   samples 陣列、字串欄位等做適當轉義。
 */
function generateProblemsJS(problems) {
  const rows = problems.map((p) => {
    const samples = p.samples.map((s) => {
      // 用 JSON.stringify 處理字串中的特殊字元（換行、引號等）
      return `{input:${JSON.stringify(s.input)},output:${JSON.stringify(s.output)}}`;
    }).join(',');

    // 各欄位序列化（選填欄位若為空則省略）
    const parts = [
      `id:${JSON.stringify(p.id)}`,
      `title:${JSON.stringify(p.title)}`,
      `topic:${JSON.stringify(p.topic || '')}`,
      `date:${JSON.stringify(p.date || '')}`,
      `diff:${JSON.stringify(p.diff || 'easy')}`,
      `categoryId:${JSON.stringify(p.categoryId || '')}`
    ];
    if (p.source) parts.push(`source:${JSON.stringify(p.source)}`);
    if (p.url)    parts.push(`url:${JSON.stringify(p.url)}`);
    parts.push(`desc:${JSON.stringify(p.desc || '')}`);
    parts.push(`input_desc:${JSON.stringify(p.input_desc || '')}`);
    parts.push(`output_desc:${JSON.stringify(p.output_desc || '')}`);
    parts.push(`samples:[${samples}]`);
    if (p.hint)   parts.push(`hint:${JSON.stringify(p.hint)}`);

    return `{${parts.join(',\n')}}`;
  });

  return `// ── 題目資料（語言無關）─────────────────────────────────────────────────────\n` +
         `const PROBLEMS=[\n${rows.join(',\n')}\n];\n`;
}

/**
 * 將解答物件序列化為 solutions.js 的格式。
 * 程式碼使用 template literal（反引號）儲存，保留換行。
 */
function generateSolutionsJS(solutions) {
  const langs = ['py', 'cpp', 'c', 'java'];
  const langBlocks = langs.map((lang) => {
    const langSols = solutions[lang] || {};
    const entries = Object.entries(langSols).map(([id, code]) => {
      // 反引號內的反引號需要轉義
      const safeCode = String(code).replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      return `${id}:\`${safeCode}\``;
    });
    return `${lang}:{\n${entries.join(',\n')}\n}`;
  });

  return `// ── 各語言參考解答 ───────────────────────────────────────────────────────────\n` +
         `const SOLUTIONS = {\n${langBlocks.join(',\n')}\n};\n`;
}

// ── 啟動 ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅  APCS Judge 教師後台已啟動`);
  console.log(`   主系統：http://localhost:${PORT}/index.html`);
  console.log(`   後台管理：http://localhost:${PORT}/admin.html\n`);
});
