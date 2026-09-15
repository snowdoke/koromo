const fs = require("fs/promises");
const path = require("path");
const yaml = require("js-yaml");

const ROOT_DIR = path.resolve(__dirname, "..");

const SRC_DIR = path.join(ROOT_DIR, "src");
const HTML_DIR = path.join(SRC_DIR, "html");
const SCSS_DIR = path.join(SRC_DIR, "scss");

const COMPONENT_LIBRARY_DIR = path.join(ROOT_DIR, "component-library");

const COMPONENT_EXPANSION_MAX_DEPTH = 50;

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

// ===== コンポーネント情報・スタイル取得 =====================================================
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

// ===== コンポーネントSCSS管理 ==========================================================
// 【変換用】
// SCSSに対象スタイルが追加済みか確認
function hasComponentStyle(source, componentId) {
    const regex = new RegExp(
        `(^|\\n)\\s*//\\s*component:${escapeRegExp(
            componentId
        )}(\\s|$)`
    );

    return regex.test(source);
}

// 【変換用】
// コンポーネントSCSSのブロックを作る
function createComponentStyleBlock(componentId, source) {
    return [
        `// component:${componentId}`,
        source.trim(),
    ].join("\n");
}

// 【変換用】
// 対象SCSSへスタイルを追加
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

// 変換用：各ページのSCSSへコンポーネントのスタイルを追加
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

// 【変換用】
// src/html内のHTMLを再帰的に探す
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

// 【変換用】
// SCSSをPrettierで整形
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
// 【変換用】
// Front Matter内のHTMLコメントを除去
function removeHtmlComments(source) {
    return String(source).replace(
        /<!--[\s\S]*?-->/g,
        ""
    );
}

// 【変換用】
// HTML上部のYAML設定を解析
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

// 【変換用】
// 文字列または配列を配列形式へ統一
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

// 【変換用】
// pageCssをSCSSパスへ変換
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

// 【変換用】
// スタイル追加先のSCSSを決定
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

// 【変換用】
// HTML内のコンポーネントIDを展開
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
// 【変換用】
// 文字列を正規表現内で安全に使用
function escapeRegExp(value) {
    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// ===== メイン処理 =================================================================
// 処理全体の起点
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

    console.log(
        "Component expansion complete."
    );
}

expandComponents().catch((error) => {
    console.error(error);
    process.exit(1);
});