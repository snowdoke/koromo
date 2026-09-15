const fs = require("fs/promises");
const path = require("path");
const sass = require("sass");
const yaml = require("js-yaml");

const ROOT_DIR = __dirname;

const SRC_DIR = path.join(ROOT_DIR, "src");
const HTML_DIR = path.join(SRC_DIR, "html");
const SCSS_DIR = path.join(SRC_DIR, "scss");

const SRC_IMG_DIR = path.join(SRC_DIR, "img");

const COMPONENT_LIBRARY_DIR = path.join(ROOT_DIR, "component-library");
const PREVIEW_IMG_DIR = path.join(COMPONENT_LIBRARY_DIR, "img");
const GENERATED_SCSS_DIR = path.join(SCSS_DIR, "generated-components");
const MAIN_SCSS_FILE = path.join(SCSS_DIR, "style.scss");

const COMPONENT_PREVIEW_HTML_FILE = path.join(COMPONENT_LIBRARY_DIR, "index.html");
const COMPONENT_PREVIEW_CSS_FILE = path.join(COMPONENT_LIBRARY_DIR, "preview.css");
const COMPONENT_PREVIEW_JS_FILE = path.join(COMPONENT_LIBRARY_DIR, "main.js");

const COMPONENT_EXPANSION_MAX_DEPTH = 50;

const COMPONENT_STYLE_START = "// component styles:start";
const COMPONENT_STYLE_END = "// component styles:end";

// ===== ファイル入出力 ==============================================================

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

function resolvePreviewShortPaths(source) {
    return String(source)
        .replace(/@img\/([^\s"'<>),]+)/g, "./img/$1")
        .replace(/@js\/([^\s"'<>),]+)/g, "../src/js/$1")
        .replace(/@php\/([^\s"'<>),]+)/g, "../src/php/$1")
        .replace(/@css\/([^\s"'<>),]+)/g, "../src/scss/$1")
        .replace(/@page\/([^\s"'<>),]+)/g, "#")
        .replace(/@root([?#][^\s"'<>)]*)?/g, "#");
}

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

function escapeJsonForHtml(value) {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
}

// ===== コンポーネントプレビュー生成 =======================================================

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
            const cssButtonDisabled = item.copyCss ? "" : " disabled";

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
    </header>

    <nav class="preview-nav">
      <ul>
${navItems}
      </ul>
    </nav>
  </div>

  <main class="preview-main">
${sections}
  </main>

  <script type="application/json" id="component-copy-data">${escapeJsonForHtml(
        copyData
    )}</script>
  ${createComponentPreviewCopyScript()}
  ${createComponentPreviewFilterScript()}
  <script src="./main.js" defer></script>
</body>
</html>`;
}

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

function removeCssCharset(source) {
    return String(source).replace(
        /^\s*@charset\s+["']UTF-8["'];\s*/gi,
        ""
    );
}

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

async function buildComponentPreview() {
    const componentIds = await getComponentIds();

    await buildComponentPreviewScript(componentIds);

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

// ===== コンポーネントSCSS管理 ==========================================================

function hasComponentStyle(source, componentId) {
    const regex = new RegExp(
        `(^|\\n)\\s*//\\s*component:${escapeRegExp(
            componentId
        )}(\\s|$)`
    );

    return regex.test(source);
}

function createComponentStyleBlock(componentId, source) {
    return [
        `// component:${componentId}`,
        source.trim(),
    ].join("\n");
}

async function updateScssFileWithComponentStyles(
    scssFilePath,
    componentIds
) {
    let source = "";

    if (await fileExists(scssFilePath)) {
        source = await readTextFile(scssFilePath);
    }

    let nextSource = source.trimEnd();
    const appendBlocks = [];

    for (const componentId of [...componentIds].sort()) {
        if (hasComponentStyle(nextSource, componentId)) {
            console.log(
                `Skipped component style: ${componentId} already exists`
            );
            continue;
        }

        const style = await getComponentStyle(componentId);

        if (!style) {
            console.warn(
                `[component warning] ${componentId}: style.scss / style.css not found`
            );
            continue;
        }

        const formattedStyleSource =
            await formatScssSource(style.source);

        const block = createComponentStyleBlock(
            componentId,
            formattedStyleSource
        );

        appendBlocks.push(block);
    }

    if (appendBlocks.length === 0) {
        return;
    }

    if (nextSource) {
        nextSource =
            `${nextSource}\n\n${appendBlocks.join("\n\n")}`;
    } else {
        nextSource = appendBlocks.join("\n\n");
    }

    const changed = await writeFileIfChanged(
        scssFilePath,
        nextSource
    );

    if (changed) {
        console.log(
            `Added component styles: ${toPosixPath(
                path.relative(ROOT_DIR, scssFilePath)
            )}`
        );
    }
}

async function updatePageScssWithComponentStyles(
    componentIdsByScssFile
) {
    for (const [scssFilePath, componentIds] of componentIdsByScssFile) {
        await updateScssFileWithComponentStyles(
            scssFilePath,
            componentIds
        );
    }
}

// ===== 共通ユーティリティ =============================================================

function toPosixPath(filePath) {
    return filePath.replace(/\\/g, "/");
}

async function readTextFile(filePath) {
    return fs.readFile(filePath, "utf8");
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function findHtmlFiles(dir) {
    let entries;

    try {
        entries = await fs.readdir(dir, {
            withFileTypes: true,
        });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(
            dir,
            entry.name
        );

        if (entry.isDirectory()) {
            // common配下は必要なら対象外にする
            // header/footerにもコンポーネントを使いたい場合は、このifを削除
            if (entry.name === "common") {
                continue;
            }

            const childFiles =
                await findHtmlFiles(fullPath);

            files.push(...childFiles);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".html")) continue;

        files.push(fullPath);
    }

    return files;
}

// ===== コンポーネントHTML展開 ==========================================================

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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
    return escapeHtml(value).replace(
        /"/g,
        "&quot;"
    );
}

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

async function formatScssSource(source) {
    const formatted =
        await formatWithPrettier(
            source,
            {
                parser: "scss",
                printWidth: 100,
                tabWidth: 2,
            }
        );

    return formatted.trim();
}

// ===== Front Matter / pageCss ======================================================

function removeHtmlComments(source) {
    return String(source).replace(
        /<!--[\s\S]*?-->/g,
        ""
    );
}

function parseFrontMatter(source) {
    const match = source.match(
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
    );

    if (!match) {
        return {
            data: {},
            content: source,
        };
    }

    const rawData = match[1];
    const content = match[2];

    const cleanedData =
        removeHtmlComments(rawData);

    const data =
        yaml.load(cleanedData) || {};

    return {
        data,
        content,
    };
}

function parseList(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value
            .map((item) =>
                String(item).trim()
            )
            .filter(Boolean);
    }

    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizePageCssToScssPath(value) {
    let cleanPath =
        String(value).trim();

    if (!cleanPath) return null;

    // 外部CSSは対象外
    if (/^(https?:)?\/\//i.test(cleanPath)) {
        return null;
    }

    cleanPath = cleanPath
        .replace(/\\/g, "/")
        .replace(/^@css\//, "")
        .replace(/^\/+/, "")
        .replace(/^(?:\.\/)+/, "")
        .replace(/^(?:\.\.\/)+/, "")
        .replace(/^css\//, "");

    // query/hash を除外
    cleanPath = cleanPath.replace(
        /[?#].*$/,
        ""
    );

    if (!cleanPath) return null;

    if (cleanPath.endsWith(".scss")) {
        return cleanPath;
    }

    if (cleanPath.endsWith(".css")) {
        return cleanPath.replace(
            /\.css$/i,
            ".scss"
        );
    }

    return `${cleanPath}.scss`;
}

function getPageCssTargetScssFile(
    pageCss,
    fileLabel
) {
    const pageCssList =
        parseList(pageCss);

    if (pageCssList.length === 0) {
        return null;
    }

    const cssPath = pageCssList
        .map((item) =>
            normalizePageCssToScssPath(
                item
            )
        )
        .find(Boolean);

    if (!cssPath) {
        return null;
    }

    if (pageCssList.length > 1) {
        console.warn(
            `[component warning] ${fileLabel}: pageCss が複数あります。コンポーネントSCSSは最初のCSSに追加します。`
        );
    }

    return path.join(
        SCSS_DIR,
        cssPath
    );
}

// ===== 文字列置換・インデント処理 ========================================================

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

async function expandComponentHtml(
    source,
    fileLabel
) {
    return expandComponentHtmlTokens(
        source,
        {
            fileLabel,
            depth: 0,
            stack: [],
        }
    );
}

// ===== コンポーネントimportブロック関連 ====================================================

function escapeRegExp(value) {
    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ===== メイン処理 =================================================================

async function expandComponents() {
    const htmlFiles =
        await findHtmlFiles(HTML_DIR);

    const componentIdsByScssFile =
        new Map();

    for (const filePath of htmlFiles) {
        const source =
            await readTextFile(filePath);

        const fileLabel = toPosixPath(
            path.relative(
                ROOT_DIR,
                filePath
            )
        );

        const { data } =
            parseFrontMatter(source);

        const {
            source: nextSource,
            usedComponentIds,
        } = await expandComponentHtml(
            source,
            fileLabel
        );

        if (nextSource !== source) {
            await fs.writeFile(
                filePath,
                nextSource
            );

            console.log(
                `Expanded components: ${fileLabel}`
            );
        }

        if (usedComponentIds.size === 0) {
            continue;
        }

        const targetScssFile =
            getPageCssTargetScssFile(
                data.pageCss,
                fileLabel
            );

        if (!targetScssFile) {
            console.warn(
                `[component warning] ${fileLabel}: コンポーネントを使用していますが pageCss がないため、SCSSを追加できません。`
            );
            continue;
        }

        if (
            !componentIdsByScssFile.has(
                targetScssFile
            )
        ) {
            componentIdsByScssFile.set(
                targetScssFile,
                new Set()
            );
        }

        const ids =
            componentIdsByScssFile.get(
                targetScssFile
            );

        for (
            const componentId of usedComponentIds
        ) {
            ids.add(componentId);
        }
    }

    await updatePageScssWithComponentStyles(
        componentIdsByScssFile
    );

    await buildComponentPreview();

    console.log(
        "Component expansion complete."
    );
}

expandComponents().catch((error) => {
    console.error(error);
    process.exit(1);
});