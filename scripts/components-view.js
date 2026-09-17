const fs = require("fs/promises");
const path = require("path");
const sass = require("sass");

const ROOT_DIR = path.resolve(__dirname, "..");

const COMPONENT_LIBRARY_DIR = path.join(ROOT_DIR, "component-library");

const COMPONENT_PREVIEW_HTML_FILE = path.join(COMPONENT_LIBRARY_DIR, "index.html");
const COMPONENT_PREVIEW_CSS_FILE = path.join(COMPONENT_LIBRARY_DIR, "preview.css");
const COMPONENT_PREVIEW_JS_FILE = path.join(COMPONENT_LIBRARY_DIR, "main.js");

const COMPONENT_EXPANSION_MAX_DEPTH = 50;

const CONFIG = {
  componentFolder: path.join(ROOT_DIR, "component-library"),
  jsonFile: path.join(ROOT_DIR, "categories", "categories.json"),
  categoryJsFile: path.join(
    ROOT_DIR,
    "categories",
    "js",
    "categories.js"
  )
};

// ===== ファイル入出力 ==============================================================
// 【共通】
// 内容が変わった場合だけ書き込む
async function writeFileIfChanged(filePath, nextSource) {
  if (await fileExists(filePath)) {
    const currentSource = await readTextFile(filePath);

    if (currentSource === nextSource) {
      return false;
    }
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextSource);

  return true;
}

// ===== コンポーネント一覧・プレビュー用パス変換 ==============================================
// 【閲覧用】
// component-libraryからp0001形式のフォルダを一覧取得
async function getComponentIds() {
  let entries;

  try {
    entries = await fs.readdir(COMPONENT_LIBRARY_DIR, {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^p\d{4}$/.test(name))
    .sort();
}

// 【閲覧用】
// コンポーネントのmain.jsを取得
async function getComponentScript(componentId) {
  const scriptPath = path.join(COMPONENT_LIBRARY_DIR, componentId, "main.js");

  if (!(await fileExists(scriptPath))) {
    return null;
  }

  const source = await readTextFile(scriptPath);

  if (!source.trim()) {
    return null;
  }

  return {
    filePath: scriptPath,
    source,
  };
}

// 【閲覧用】
// JavaScriptへインデントを付ける
function indentJavaScriptSource(source) {
  return String(source)
    .trim()
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      return `  ${line}`;
    })
    .join("\n");
}

// 【閲覧用】
// コンポーネントJSを実行用ブロックにする
function createComponentScriptBlock(componentId, source) {
  const script = indentJavaScriptSource(source);

  if (!script) {
    return "";
  }

  return `const ${componentId} = function () {
${script}
};

${componentId}();`;
}

// 【閲覧用】
// 閲覧用main.jsを生成
async function buildComponentPreviewScript(componentIds) {
  const scriptParts = [];

  for (const componentId of componentIds) {
    const script = await getComponentScript(componentId);

    if (!script) continue;

    scriptParts.push(createComponentScriptBlock(componentId, script.source));
  }

  const source = scriptParts.join("\n\n");

  await writeFileIfChanged(COMPONENT_PREVIEW_JS_FILE, source);

  if (source) {
    console.log("Generated: component-library/main.js");
  }
}

// 【閲覧用】
// HTML内の短縮パスを閲覧用に変換
function resolvePreviewShortPaths(source) {
  return String(source)
    .replace(/@img\/([^\s"'<>),]+)/g, "./img/$1")
    .replace(/@js\/([^\s"'<>),]+)/g, "../src/js/$1")
    .replace(/@php\/([^\s"'<>),]+)/g, "../src/php/$1")
    .replace(/@css\/([^\s"'<>),]+)/g, "../src/scss/$1")
    .replace(/@page\/([^\s"'<>),]+)/g, "#")
    .replace(/@root([?#][^\s"'<>)]*)?/g, "#");
}

// 【閲覧用】
// CSS内の短縮パスを閲覧用に変換
function resolvePreviewCssShortPaths(source) {
  return String(source).replace(
    /url\(\s*(["']?)@(img|css|js|php)\/([^"')\s]+)\1\s*\)/g,
    (_, quote, type, filePath) => {
      const basePaths = {
        img: "./img",
        css: "../src/scss",
        js: "../src/js",
        php: "../src/php",
      };

      return `url("${basePaths[type]}/${filePath}")`;
    }
  );
}

// 【閲覧用】
// JSONをHTML内へ安全に埋め込む
function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// ===== コンポーネントプレビュー生成 =======================================================
// 【閲覧用】
// 閲覧用index.htmlを組み立てる
function createComponentPreviewHtml(componentItems) {
  const navItems = componentItems
    .map((item) => {
      return `
<li
  class="preview-nav__item"
  data-filter-target
  data-filter-category="${escapeHtmlAttribute(item.categoryText)}"
>
  <a href="#${escapeHtmlAttribute(item.id)}">${escapeHtml(item.id)}</a>
</li>`;
    })
    .join("\n");

  const sections = componentItems
    .map((item) => {
      // const cssButtonDisabled = item.copyCss ? "" : " disabled";

      return `
<section
  class="preview-component"
  id="${escapeHtmlAttribute(item.id)}"
  data-filter-target
  data-filter-category="${escapeHtmlAttribute(item.categoryText)}"
>
  <div class="preview-component__header">
    <div>
      <div class="preview-component__title-row">
        <h2>${escapeHtml(item.id)}</h2>
        ${createCategoryTagHtml(item.categoryText)}
      </div>
      ${item.description
          ? `<p class="preview-component__description">${escapeHtml(
            item.description
          )}</p>`
          : ""
        }
    </div>

    <div class="preview-component__actions">
        <button type="button" data-copy-type="copyHtml" data-component-id="${escapeHtmlAttribute(item.id)}">
            HTMLをコピー
        </button>
        <button type="button" data-copy-type="copyCss" data-component-id="${escapeHtmlAttribute(item.id)}">
            CSSをコピー
        </button>
        <button type="button" data-copy-type="copyJs" data-component-id="${escapeHtmlAttribute(item.id)}">
            JSをコピー
        </button>
    </div>
  </div>

  <div class="preview-component__body">
${item.html}
  </div>
</section>`;
    })
    .join("\n");

  const copyData = componentItems.map((item) => {
    return {
      id: item.id,
      copyHtml: item.copyHtml,
      copyCss: item.copyCss,
      copyJs: item.copyJs,
    };
  });

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Component Library Preview</title>
  <link rel="stylesheet" href="./preview.css">
</head>
<body>
  <div class="preview-sticky">
    <header class="preview-header">
      <div class="preview-header__content">
        <h1>Component Library Preview</h1>
        <p>component-library 内のコンポーネント一覧です。</p>
      </div>

      <div class="category_search">
        <div>
            <button id="openCategoryList" class="popup_category_dialog">カテゴリ一覧</button>
        </div>
        <div class="preview-filter">
            <div class="preview-filter__body">
            <input
                id="component-category-filter"
                class="preview-filter__input"
                type="search"
                placeholder="カテゴリで絞り込み"
            >
            </div>
            <p class="preview-filter__result">
                表示中：<span id="component-filter-count">${componentItems.length}</span>件
            </p>
        </div>
      </div>
    </header>

    <nav class="preview-nav">
      <ul>
${navItems}
      </ul>
    </nav>
  </div>

  <dialog id="categoryDialog" class="category_dialog">
    <div class="category_dialog_header">
        <h2>カテゴリ一覧</h2>
        <button id="closeCategoryList" class="category_dialog_close" type="button" aria-label="閉じる">
            ×
        </button>
    </div>
    <div id="categoryList" class="category_dialog_body"></div>
  </dialog>

  <main class="preview-main">
${sections}
  </main>

  <script type="application/json" id="component-copy-data">${escapeJsonForHtml(
    copyData
  )}</script>
  ${createComponentPreviewCopyScript()}
  ${createComponentPreviewFilterScript()}
  <script src="./main.js" defer></script>
  <script src="../categories/js/categories.js" defer></script>
  <script src="../categories/js/categoryDialog.js" defer></script>
</body>
</html>`;
}

// 【閲覧用】
// 閲覧ページ自体のCSSを生成
function createPreviewBaseCss() {
  return `
@charset "UTF-8";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: #222;
  background: #f5f5f5;
  font-family: system-ui, sans-serif;
}

.preview-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px;
  color: #fff;
  background: #222;
}

.preview-header__content {
  min-width: 0;
}

.preview-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.preview-header p {
  margin: 0;
}

.category_search{
    display: flex;
}

.preview-filter {
  width: min(500px, 48vw);
  padding: 10px 20px;
  color: #fff;
  background: #fff;
  border-bottom: 1px solid #ddd;
}

.preview-filter__body {
  display: flex;
  gap: 8px;
}

.preview-filter__input {
  width: min(500px, 100%);
  padding: 10px 12px;
  color: #222;
  font: inherit;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.preview-filter__result {
  margin: 8px 0 0;
  color: #666;
  font-size: 13px;
}

.preview-nav {
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #ddd;
}

.preview-nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.preview-nav a {
  display: inline-block;
  padding: 6px 12px;
  color: #222;
  text-decoration: none;
  border: 1px solid #ddd;
  border-radius: 999px;
}

.preview-main {
  padding: 32px;
}

.preview-component {
  margin-bottom: 40px;
  background: #fff;
  border: 1px solid #ddd;
}

.preview-component__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: #fafafa;
  border-bottom: 1px solid #ddd;
}

.preview-component__header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.preview-component__header p {
  margin: 0;
  color: #666;
  font-size: 13px;
}

.preview-component__body {
  padding: 24px;
}

.preview-component__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preview-component__actions button {
  appearance: none;
  padding: 8px 12px;
  color: #222;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  cursor: pointer;
}

.preview-component__actions button:hover {
  background: #f0f0f0;
}

.preview-component__actions button:disabled {
  color: #999;
  cursor: not-allowed;
  background: #eee;
}

.preview-component__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.preview-component__title-row h2 {
  margin: 0;
}

.preview-nav__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.preview-component__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.preview-component__category {
  appearance: none;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 10px;
  color: #0066cc;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  background: #f5f9ff;
  border: 1px solid #99c2ff;
  border-radius: 999px;
  cursor: pointer;
}

.preview-component__category:hover {
  background: #eaf3ff;
}

.preview-component__category:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

.preview-component__description {
  margin: 4px 0 0;
  color: #444;
  font-size: 13px;
}

/* ==============================
   ダイアログ出現用ボタン
============================== */
.popup_category_dialog{
  height: 48px;

  padding: 0 18px;
  margin-right: 6px;

  border: 1px solid #555;
  border-radius: 10px;

  background: #fff;
  color: #303030;

  font-size: 15px;
  font-weight: 600;

  cursor: pointer;

  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.2);

  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.2s;
}

/* ==============================
   ダイアログ本体
============================== */

.category_dialog {
    width: min(1000px, calc(100% - 10px));
    max-height: 80vh;

    padding: 0;

    border: 1px solid #ddd;
    border-radius: 20px;

    background: #fff;

    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.18);

    overflow: hidden;
}


/* 背景 */

.category_dialog::backdrop {
    background: rgba(20, 20, 30, 0.45);
    backdrop-filter: blur(3px);
}

/* ================================
   カテゴリ一覧：ソート
================================ */

.category_sort {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #ddd;
}

.category_sort_button {
    appearance: none;
    border: 1px solid #ccc;
    background: #fff;
    color: #333;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition:
        background-color 0.2s ease,
        color 0.2s ease,
        border-color 0.2s ease;
}

.category_sort_button:hover {
    background: #f5f5f5;
}

.category_sort_button.is-active {
    background: #333;
    border-color: #333;
    color: #fff;
}


/* ==============================
   ヘッダー
============================== */

.category_dialog_header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 20px 24px;

    border-bottom: 1px solid #eee;

    background: #fff;
}


.category_dialog_header h2 {
    margin: 0;

    font-size: 20px;
    font-weight: 700;
}


/* 閉じるボタン */

.category_dialog_close {
    display: grid;
    place-items: center;

    width: 38px;
    height: 38px;

    padding: 0;

    border: 1px solid #ddd;
    border-radius: 10px;

    background: #fff;

    font-size: 24px;
    line-height: 1;

    cursor: pointer;
}


.category_dialog_close:hover {
    background: #f5f5f5;
}


/* ==============================
   一覧部分
============================== */

.category_dialog_body {
    max-height: 60vh;

    padding: 16px 20px 24px;

    overflow-y: auto;

    background: #fafafa;
}


.category_list {
    display: grid;

    grid-template-columns:
        repeat(4, minmax(0, 1fr));

    gap: 10px;

    margin: 0;
    padding: 0;

    list-style: none;
}


/* 各カテゴリ */

.category_list_item {
    display: flex;
    align-items: center;
    justify-content: space-between;

    min-height: 52px;

    padding: 0 5px;

    border: 1px solid #ddd;
    border-radius: 12px;

    background: #fff;
}


.category_list_item:hover {
    border-color: #bbb;

    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.05);
}


/* カテゴリ名 */

.category_list_name {
    display: flex;
    align-items: baseline;

    gap: 8px;

    min-width: 0;
}


.category_list_en {
    font-size: 16px;
    font-weight: 600;
}


.category_list_ja {
    color: #888;

    font-size: 12px;
}


/* 件数 */

.category_list_count {
    margin-left: 12px;

    color: #777;

    font-size: 14px;
    font-weight: 600;
}

[hidden] {
  display: none !important;
}

@media screen and (max-width: 767px) {
  .preview-header {
    display: block;
  }

  .preview-filter {
    width: 100%;
    margin-top: 16px;
  }
}
`.trim();
}

// 【閲覧用】
// HTML・CSS・JSのコピー機能を生成
function createComponentPreviewCopyScript() {
  return `
<script>
(() => {
  const dataElement = document.getElementById("component-copy-data");

  if (!dataElement) return;

  const copyItems = JSON.parse(dataElement.textContent);
  const copyMap = new Map(copyItems.map((item) => [item.id, item]));

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  function setButtonStatus(button, message) {
    const defaultText = button.dataset.defaultText || button.textContent;

    button.dataset.defaultText = defaultText;
    button.textContent = message;
    button.disabled = true;

    window.setTimeout(() => {
      button.textContent = defaultText;
      button.disabled = false;
    }, 1200);
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-type]");

    if (!button) return;

    const componentId = button.dataset.componentId;
    const copyType = button.dataset.copyType;
    const item = copyMap.get(componentId);

    if (!item) return;

    const text = item[copyType];

    if (!text) {
      setButtonStatus(button, "コピー対象なし");
      return;
    }

    try {
      await copyText(text);
      setButtonStatus(button, "コピーしました");
    } catch (error) {
      console.error(error);
      setButtonStatus(button, "コピー失敗");
    }
  });
})();
</script>`.trim();
}

// 【閲覧用】
// カテゴリ検索機能を生成
function createComponentPreviewFilterScript() {
  return `
<script>
(() => {
  const input = document.getElementById("component-category-filter");
  const resetButton = document.getElementById("component-category-filter-reset");
  const countElement = document.getElementById("component-filter-count");

  if (!input) return;

  const targets = Array.from(
    document.querySelectorAll("[data-filter-target]")
  );

  const sections = Array.from(
    document.querySelectorAll(".preview-component[data-filter-target]")
  );

  function normalizeText(value) {
    return String(value)
      .toLowerCase()
      .replace(/[　\\s]+/g, " ")
      .trim();
  }

  function getKeywords(value) {
    return normalizeText(value).split(" ").filter(Boolean);
  }

  function matchesCategory(categoryText, keywords) {
    const normalizedCategory = normalizeText(categoryText);

    return keywords.every((keyword) => {
      return normalizedCategory.includes(keyword);
    });
  }

  function updateFilter() {
    const keywords = getKeywords(input.value);
    let visibleCount = 0;

    for (const target of targets) {
      const categoryText = target.dataset.filterCategory || "";
      const matched =
        keywords.length === 0 ||
        matchesCategory(categoryText, keywords);

      target.hidden = !matched;
    }

    for (const section of sections) {
      if (!section.hidden) {
        visibleCount += 1;
      }
    }

    if (countElement) {
      countElement.textContent = String(visibleCount);
    }
  }

  function addFilterKeyword(keyword) {
    const nextKeyword = normalizeText(keyword);

    if (!nextKeyword) return;

    const keywords = getKeywords(input.value);

    if (!keywords.includes(nextKeyword)) {
      keywords.push(nextKeyword);
    }

    input.value = keywords.join(" ");
    input.focus();

    updateFilter();
  }

  input.addEventListener("input", updateFilter);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-keyword]");

    if (!button) return;

    addFilterKeyword(button.dataset.categoryKeyword || "");
  });

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      input.value = "";
      input.focus();

      updateFilter();
    });
  }

  updateFilter();
})();
</script>`.trim();
}

// 【閲覧用】
// カテゴリボタンを生成
function createCategoryTagHtml(categoryText) {
  const categories = String(categoryText)
    .split(/[ \t　]+/)
    .map((category) => category.trim())
    .filter(Boolean);

  if (categories.length === 0) {
    return "";
  }

  return `
<div class="preview-component__categories">
  ${categories
      .map((category) => {
        return `<button class="preview-component__category" type="button" data-category-keyword="${escapeHtmlAttribute(
          category
        )}">${escapeHtml(category)}</button>`;
      })
      .join("\n  ")}
</div>`;
}

// ===== コンポーネント情報・スタイル取得 =====================================================
// 【閲覧用】
// 結合時に不要な@charsetを削除
function removeCssCharset(source) {
  return String(source).replace(
    /^\s*@charset\s+["']UTF-8["'];\s*/gi,
    ""
  );
}

// 【共通】
// コンポーネントのカテゴリ・説明・本体を分離
function parseComponentHeaderComments(source) {
  const lines = String(source).split(/\r?\n/);

  const firstLine = lines[0] || "";
  const secondLine = lines[1] || "";

  const categoryMatch = firstLine.match(
    /^\s*<!--\s*([\s\S]*?)\s*-->\s*$/
  );

  const descriptionMatch = secondLine.match(
    /^\s*<!--\s*([\s\S]*?)\s*-->\s*$/
  );

  const categoryText = categoryMatch
    ? categoryMatch[1].trim()
    : "";

  const description = descriptionMatch
    ? descriptionMatch[1].trim()
    : "";

  const removeLineCount = categoryMatch
    ? descriptionMatch
      ? 2
      : 1
    : 0;

  const body = lines
    .slice(removeLineCount)
    .join("\n")
    .trimStart();

  return {
    categoryText,
    categories: categoryText
      .split(/[ \t　]+/)
      .filter(Boolean),
    description,
    body,
  };
}

// 全コンポーネントのカテゴリを集計
async function collectCategories(componentIds) {
  const categoryCounts = {};

  for (const componentId of componentIds) {
    const indexPath = path.join(
      COMPONENT_LIBRARY_DIR,
      componentId,
      "index.html"
    );

    if (!(await fileExists(indexPath))) {
      continue;
    }

    const html = await readTextFile(indexPath);
    const meta = parseComponentHeaderComments(html);

    for (const category of meta.categories) {
      if (categoryCounts[category]) {
        categoryCounts[category]++;
      } else {
        categoryCounts[category] = 1;
      }
    }
  }

  return Object.entries(categoryCounts).map(
    ([name, count]) => ({
      name,
      count,
    })
  );
}

// 【閲覧用】
// SCSSを閲覧用CSSへコンパイル
async function compileComponentStyleForPreview(componentId) {
  const style = await getComponentStyle(componentId);

  if (!style) {
    return "";
  }

  if (style.filePath.endsWith(".scss")) {
    const result = await sass.compileAsync(style.filePath, {
      style: "expanded",
      loadPaths: [
        path.dirname(style.filePath),
        COMPONENT_LIBRARY_DIR,
      ],
    });

    return resolvePreviewCssShortPaths(
      removeCssCharset(result.css)
    ).trim();
  }

  return resolvePreviewCssShortPaths(
    removeCssCharset(style.source)
  ).trim();
}

// 【閲覧用】
// 閲覧ページ生成全体をまとめる
async function buildComponentPreview() {
  const componentIds = await getComponentIds();

  const categories = await collectCategories(componentIds);
  console.log("categories:", categories);

  await buildComponentPreviewScript(componentIds);
  await updateCategoryJson(categories);
  await generateCategoryJs();

  if (componentIds.length === 0) {
    return;
  }

  const componentItems = [];
  const cssParts = [createPreviewBaseCss()];

  for (const componentId of componentIds) {
    const componentHtmlPath = path.join(
      COMPONENT_LIBRARY_DIR,
      componentId,
      "index.html"
    );

    if (!(await fileExists(componentHtmlPath))) {
      console.warn(
        `[component preview warning] ${componentId}: index.html not found`
      );
      continue;
    }

    const htmlSource = await readTextFile(componentHtmlPath);
    const meta = parseComponentHeaderComments(htmlSource);

    const copyHtml = await getComponentHtml(componentId);
    const previewHtml = resolvePreviewShortPaths(copyHtml);
    const previewCss =
      await compileComponentStyleForPreview(componentId);
    const script = await getComponentScript(componentId);

    componentItems.push({
      id: componentId,
      categoryText: meta.categoryText,
      categories: meta.categories,
      description: meta.description,
      path: `component-library/${componentId}/index.html`,
      html: previewHtml,
      copyHtml,
      copyCss: previewCss,
      copyJs: script ? script.source.trim() : "",
    });

    if (previewCss) {
      cssParts.push(
        `/* ${componentId} */\n${previewCss}`
      );
    }
  }

  const html = createComponentPreviewHtml(componentItems);
  const css = removeCssCharset(
    cssParts.join("\n\n")
  );

  await writeFileIfChanged(
    COMPONENT_PREVIEW_HTML_FILE,
    html
  );

  await writeFileIfChanged(
    COMPONENT_PREVIEW_CSS_FILE,
    css
  );

  console.log(
    "Updated component preview: component-library/index.html"
  );
}


// カテゴリ一覧を生成 ===================================
// カテゴリJSONを更新
async function updateCategoryJson(categories) {
  let oldData = [];

  if (await fileExists(CONFIG.jsonFile)) {
    oldData = JSON.parse(
      await readTextFile(CONFIG.jsonFile)
    );
  }

  const newData = categories.map((category) => {
    const existing = oldData.find(
      (item) => item.name === category.name
    );

    return {
      name: category.name,
      japanese: existing
        ? existing.japanese
        : "",
      count: category.count,
    };
  });

  await writeFileIfChanged(
    CONFIG.jsonFile,
    JSON.stringify(newData, null, 2)
  );
}

// カテゴリ一覧用JSを生成
async function generateCategoryJs() {
  if (!(await fileExists(CONFIG.jsonFile))) {
    return;
  }

  const data = JSON.parse(
    await readTextFile(CONFIG.jsonFile)
  );

  const jsContent = `window.categoryData = ${JSON.stringify(
    data,
    null,
    2
  )};`;

  await writeFileIfChanged(
    CONFIG.categoryJsFile,
    jsContent
  );
}

// ===== 共通ユーティリティ =============================================================
// 【共通】
// Windowsパスの\を/へ変換
function toPosixPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

// 【共通】
// テキストファイルを読み込む
async function readTextFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

// 【共通】
// ファイルの存在を確認
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ===== コンポーネントHTML展開 ==========================================================
// 【共通】
// コンポーネントHTMLを取得・整形
async function getComponentHtml(componentId, options = {}) {
  const depth = options.depth || 0;
  const stack = options.stack || [];

  if (stack.includes(componentId)) {
    const route = [
      ...stack,
      componentId,
    ].join(" -> ");

    console.warn(
      `[component warning] コンポーネントの循環参照を検出しました: ${route}`
    );

    return createComponentExpansionStoppedComment(
      componentId,
      "circular reference",
      stack
    );
  }

  if (depth >= COMPONENT_EXPANSION_MAX_DEPTH) {
    const route = [
      ...stack,
      componentId,
    ].join(" -> ");

    console.warn(
      `[component warning] コンポーネントの再帰展開が ${COMPONENT_EXPANSION_MAX_DEPTH} 回を超えたため停止しました: ${route}`
    );

    return createComponentExpansionStoppedComment(
      componentId,
      "max depth exceeded",
      stack
    );
  }

  const componentHtmlPath = path.join(
    COMPONENT_LIBRARY_DIR,
    componentId,
    "index.html"
  );

  if (!(await fileExists(componentHtmlPath))) {
    throw new Error(
      `Component HTML not found: ${toPosixPath(
        componentHtmlPath
      )}`
    );
  }

  const htmlSource =
    await readTextFile(componentHtmlPath);

  const meta =
    parseComponentHeaderComments(htmlSource);

  const expandedHtml =
    await expandComponentHtmlTokens(
      meta.body,
      {
        fileLabel:
          `component-library/${componentId}/index.html`,
        depth: depth + 1,
        stack: [
          ...stack,
          componentId,
        ],
      }
    );

  return formatHtmlFragment(
    expandedHtml.source
  );
}

// コンポーネントの展開停止を示すHTMLコメントを生成
function createComponentExpansionStoppedComment(
  componentId,
  reason,
  stack
) {
  const route = [
    ...stack,
    componentId,
  ].join(" -> ");

  return `<!--
    Component expansion stopped
    Component: ${componentId}
    Reason: ${reason}
    Route: ${route}
-->`;
}

// 【閲覧用】
// HTML特殊文字を変換
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 【閲覧用】
// HTML属性用に特殊文字を変換
function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(
    /"/g,
    "&quot;"
  );
}

// 【共通】
// HTML内のコンポーネントIDを再帰的に展開
async function expandComponentHtmlTokens(
  source,
  options = {}
) {
  const fileLabel = options.fileLabel || "";
  const depth = options.depth || 0;
  const stack = options.stack || [];

  const usedComponentIds = new Set();

  const tokenRegex =
    /\{\{\s*(p\d{4})\s*\}\}/g;

  const result = await replaceAsync(
    source,
    tokenRegex,
    async (match) => {
      const componentId = match[1];

      try {
        const html =
          await getComponentHtml(
            componentId,
            {
              depth,
              stack,
            }
          );

        const indent = getLineIndent(
          source,
          match.index
        );

        usedComponentIds.add(
          componentId
        );

        return indentMultiline(
          html,
          indent
        );
      } catch (error) {
        console.warn(
          `[component warning] ${fileLabel}: ${error.message}`
        );

        return match[0];
      }
    }
  );

  return {
    source: result,
    usedComponentIds,
  };
}

// 【共通】
// コンポーネントのSCSSまたはCSSを取得
async function getComponentStyle(componentId) {
  const componentDir = path.join(
    COMPONENT_LIBRARY_DIR,
    componentId
  );

  const candidates = [
    path.join(componentDir, "style.scss"),
    path.join(componentDir, "index.scss"),
    path.join(
      componentDir,
      `${componentId}.scss`
    ),
    path.join(componentDir, "style.css"),
    path.join(componentDir, "index.css"),
    path.join(
      componentDir,
      `${componentId}.css`
    ),
  ];

  for (const filePath of candidates) {
    if (await fileExists(filePath)) {
      return {
        filePath,
        source:
          await readTextFile(filePath),
      };
    }
  }

  return null;
}

// 【共通】
// Prettierによる共通整形
async function formatWithPrettier(
  source,
  options
) {
  const prettier = await import(
    "prettier"
  );

  return prettier.format(
    source,
    options
  );
}

// 【共通】
// HTML断片を整形
async function formatHtmlFragment(source) {
  const formatted =
    await formatWithPrettier(
      source,
      {
        parser: "html",
        printWidth: 100,
        tabWidth: 2,
      }
    );

  return formatted.trim();
}

// ===== 文字列置換・インデント処理 ========================================================
// 【共通】
// IDが書かれていた行の字下げを取得
function getLineIndent(source, index) {
  const lineStartIndex =
    source.lastIndexOf(
      "\n",
      index
    ) + 1;

  const line = source.slice(
    lineStartIndex,
    index
  );

  const match = line.match(/^\s*/);

  return match ? match[0] : "";
}

// 【共通】
// 展開したHTMLへ字下げを適用
function indentMultiline(source, indent) {
  if (!indent) return source;

  return source
    .split("\n")
    .map((line, index) => {
      if (index === 0) {
        return line;
      }

      if (!line.trim()) {
        return line;
      }

      return `${indent}${line}`;
    })
    .join("\n");
}

// 【共通】
// 非同期処理を使った文字列置換
async function replaceAsync(
  source,
  regex,
  replacer
) {
  const matches = [];
  let match;

  while (
    (match = regex.exec(source)) !== null
  ) {
    matches.push(match);
  }

  if (matches.length === 0) {
    return source;
  }

  let result = "";
  let lastIndex = 0;

  for (const matchItem of matches) {
    result += source.slice(
      lastIndex,
      matchItem.index
    );

    result +=
      await replacer(matchItem);

    lastIndex =
      matchItem.index +
      matchItem[0].length;
  }

  result += source.slice(lastIndex);

  return result;
}

buildComponentPreview().catch((error) => {
  console.error(error);
  process.exit(1);
});
