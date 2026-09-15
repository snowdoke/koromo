// ===== 依存モジュール・パス・設定 =======================================================

const fs = require("fs/promises");
const path = require("path");
const sass = require("sass");
const yaml = require("js-yaml");

const SRC_DIR = path.join(__dirname, "src");
const DIST_DIR = path.join(__dirname, "dist");

const HTML_DIR = path.join(SRC_DIR, "html");
const COMMON_DIR = path.join(HTML_DIR, "common");

const LAYOUT_FILE = path.join(SRC_DIR, "layout.html");
const HEADER_FILE = path.join(COMMON_DIR, "header.html");
const FOOTER_FILE = path.join(COMMON_DIR, "footer.html");

const SCSS_DIR = path.join(SRC_DIR, "scss");
const JS_DIR = path.join(SRC_DIR, "js");
const IMG_DIR = path.join(SRC_DIR, "img");
const PHP_DIR = path.join(SRC_DIR, "php");

const BUILD_CONFIG = {
    lowerPageUrlType: "directory",

    // pageCss をページごとに bundle_xxx.css としてまとめる
    bundlePageCss: true,
    pageCssBundlePrefix: "bundle_",
};

const SITE_CONFIG = {
    // 本番URLを入れると、og:url や snsImage が絶対URLになる
    // 例: "https://example.com"
    siteUrl: "",

    // faviconは共通設定
    favicon: "@img/favicon.ico",
    appleTouchIcon: "@img/apple-touch-icon.png",

    // SNS系の固定設定
    ogType: "website",
    twitterCard: "summary_large_image",
};

// ===== 基本ユーティリティ・テンプレート処理 ==================================================
// ファイルをUTF-8で読み込む
async function readFile(filePath) {
    return fs.readFile(filePath, "utf8");
}

// パスの区切り文字をスラッシュに統一する
function toPosixPath(filePath) {
    return filePath.replace(/\\/g, "/");
}

// HTMLのFront Matterを解析し、設定データと本文を分離する
function parseFrontMatter(source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
        return {
            data: {},
            content: source,
            contentStartIndex: 0,
        };
    }

    const rawData = match[1];
    const content = match[2];

    const rawDataStartIndex = match[0].indexOf(rawData);
    const contentStartIndex =
        rawDataStartIndex +
        rawData.length +
        match[0].slice(rawDataStartIndex + rawData.length).indexOf(content);

    const cleanedData = removeHtmlComments(rawData);
    const data = yaml.load(cleanedData) || {};

    return {
        data,
        content,
        contentStartIndex,
    };
}

// テンプレート内の変数を指定された値に置換する
function render(template, values) {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
        return values[key] ?? "";
    });
}

// ページパスからページCSSのバンドルファイル名を生成する
function getPageCssBundleFileName(pagePath) {
    const cleanPath = String(pagePath)
        .replace(/\\/g, "/")
        .replace(/\.html$/i, "")
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

    const slug =
        !cleanPath || cleanPath === "index"
            ? "index"
            : cleanPath.replace(/\/index$/i, "").replace(/\//g, "_");

    return `${BUILD_CONFIG.pageCssBundlePrefix}${slug}.css`;
}

// HTML属性値に使用できるよう特殊文字をエスケープする
function escapeAttribute(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// 指定された属性・名前・内容からmetaタグを生成する
function createMetaTag(attribute, name, content) {
    if (!content) return "";

    return `<meta ${attribute}="${escapeAttribute(name)}" content="${escapeAttribute(
        content
    )}">`;
}

// 値をカンマ区切りまたは配列として解析し、文字列の配列に変換する
function parseList(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

// ===== パス・URL解決 ============================================================
// 指定されたルートパス・種別・ファイルパスからアセットのパスを生成する
function createAssetPath(rootPath, type, filePath) {
    const cleanPath = String(filePath).replace(/^\/+/, "");

    return `${rootPath}${type}/${cleanPath}`;
}

// ページパスから設定に応じたページURLを生成する
function createPageLink(rootPath, pagePath) {
    const rawValue = String(pagePath).trim();

    const match = rawValue.match(/^([^?#]*)([?#].*)?$/);
    const pathname = match ? match[1] : rawValue;
    const suffix = match ? match[2] || "" : "";

    const cleanPath = pathname
        .replace(/^\/+/, "")
        .replace(/\/+$/, "")
        .replace(/\.html$/, "");

    if (!cleanPath || cleanPath === "index") {
        return `${rootPath}${suffix}`;
    }

    if (BUILD_CONFIG.lowerPageUrlType === "directory") {
        return `${rootPath}${cleanPath}/${suffix}`;
    }

    if (BUILD_CONFIG.lowerPageUrlType === "file") {
        return `${rootPath}${cleanPath}.html${suffix}`;
    }

    throw new Error(`Unknown lowerPageUrlType: ${BUILD_CONFIG.lowerPageUrlType}`);
}

// HTML内の@img/@css/@js/@php/@page/@root形式の短縮パスを実際のパスに変換する
function resolveShortPaths(source, rootPath) {
    return String(source)
        .replace(/@(img|css|js|php)\/([^\s"'<>),]+)/g, (_, type, filePath) => {
            return createAssetPath(rootPath, type, filePath);
        })
        .replace(/@page\/([^\s"'<>),]+)/g, (_, pagePath) => {
            return createPageLink(rootPath, pagePath);
        })
        .replace(/@root([?#][^\s"'<>)]*)?/g, (_, suffix = "") => {
            return `${rootPath}${suffix}`;
        });
}

// CSS内のアセット短縮パスを実際のパスに変換する
function resolveCssShortPaths(source, rootPath) {
    return String(source).replace(
        /url\(\s*(["']?)@(img|css|js|php)\/([^"')\s]+)\1\s*\)/g,
        (_, quote, type, filePath) => {
            const resolvedPath = createAssetPath(rootPath, type, filePath);

            return `url("${resolvedPath}")`;
        }
    );
}

// コンポーネント用のHTMLコメントを削除する
function removeComponentHtmlComments(source) {
    return String(source)
        .replace(/^[ \t]*<!--\s*component:p\d{4}\s+start\s*-->\s*\r?\n?/gm, "")
        .replace(/^[ \t]*<!--\s*component:p\d{4}\s+end\s*-->\s*\r?\n?/gm, "");
}

// ページで使用するアセットの指定値を実際の公開パスに変換する
function resolveAssetPathForPage(value, rootPath) {
    if (!value) return "";

    const rawValue = String(value).trim();

    if (/^https?:\/\//.test(rawValue) || rawValue.startsWith("//")) {
        return rawValue;
    }

    const aliasMatch = rawValue.match(/^@(img|css|js|php)\/(.+)$/);

    if (aliasMatch) {
        const [, type, filePath] = aliasMatch;
        return createAssetPath(rootPath, type, filePath);
    }

    const cleanValue = rawValue.replace(/^\/+/, "");

    if (
        cleanValue.startsWith("css/") ||
        cleanValue.startsWith("js/") ||
        cleanValue.startsWith("img/")
    ) {
        return `${rootPath}${cleanValue}`;
    }

    return rawValue;
}

// 公開用のパスを正規化する
function normalizePublicPath(value) {
    if (!value) return "";

    const rawValue = String(value).trim();

    if (/^https?:\/\//.test(rawValue) || rawValue.startsWith("//")) {
        return rawValue;
    }

    const aliasMatch = rawValue.match(/^@(img|css|js)\/(.+)$/);

    if (aliasMatch) {
        const [, type, filePath] = aliasMatch;
        return `/${type}/${filePath.replace(/^\/+/, "")}`;
    }

    if (rawValue.startsWith("/")) {
        return rawValue;
    }

    if (
        rawValue.startsWith("css/") ||
        rawValue.startsWith("js/") ||
        rawValue.startsWith("img/")
    ) {
        return `/${rawValue}`;
    }

    return rawValue;
}

// 公開パスにサイトURLを付加して絶対URLを生成する
function createAbsoluteUrl(value) {
    if (!value) return "";

    const publicPath = normalizePublicPath(value);

    if (/^https?:\/\//.test(publicPath) || publicPath.startsWith("//")) {
        return publicPath;
    }

    if (!SITE_CONFIG.siteUrl) {
        return publicPath;
    }

    const baseUrl = SITE_CONFIG.siteUrl.replace(/\/$/, "");
    const pathValue = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;

    return `${baseUrl}${pathValue}`;
}

// ===== head / ページアセット用タグ生成 =================================================
// faviconとApple Touch Iconのlinkタグを生成する
function createFaviconTags(rootPath) {
    return [
        SITE_CONFIG.favicon
            ? `<link rel="icon" href="${escapeAttribute(
                resolveAssetPathForPage(SITE_CONFIG.favicon, rootPath)
            )}">`
            : "",
        SITE_CONFIG.appleTouchIcon
            ? `<link rel="apple-touch-icon" href="${escapeAttribute(
                resolveAssetPathForPage(SITE_CONFIG.appleTouchIcon, rootPath)
            )}">`
            : "",
    ]
        .filter(Boolean)
        .join("\n");
}

// ページ情報からOGP用のmetaタグを生成する
function createOgTags(data, pagePath) {
    const title = data.title || "";
    const description = data.description || "";
    const snsImage = createAbsoluteUrl(data.snsImage);
    const pageUrl = createAbsoluteUrl(pagePath);

    return [
        createMetaTag("property", "og:title", title),
        createMetaTag("property", "og:description", description),
        createMetaTag("property", "og:type", SITE_CONFIG.ogType),
        createMetaTag("property", "og:url", pageUrl),
        createMetaTag("property", "og:image", snsImage),
    ]
        .filter(Boolean)
        .join("\n");
}

// ページ情報からTwitter Card用のmetaタグを生成する
function createTwitterCardTags(data) {
    const title = data.title || "";
    const description = data.description || "";
    const snsImage = createAbsoluteUrl(data.snsImage);

    return [
        createMetaTag("name", "twitter:card", SITE_CONFIG.twitterCard),
        createMetaTag("name", "twitter:title", title),
        createMetaTag("name", "twitter:description", description),
        createMetaTag("name", "twitter:image", snsImage),
    ]
        .filter(Boolean)
        .join("\n");
}

// 外部CSSのlinkタグを生成する
function createExternalCssTags(value) {
    const urls = parseList(value);

    return urls
        .map((url) => {
            return `<link rel="stylesheet" href="${escapeAttribute(url)}">`;
        })
        .join("\n");
}

// Google Fontsの指定からlinkタグを生成する
function createGoogleFontsTags(value) {
    const fonts = parseList(value);

    if (fonts.length === 0) {
        return "";
    }

    const families = fonts
        .map((font) => {
            const cleanFont = String(font).trim();

            if (!cleanFont) return null;

            // すでにGoogle FontsのURLで指定されている場合
            if (/^https:\/\/fonts\.googleapis\.com\/css2\?/i.test(cleanFont)) {
                const url = new URL(cleanFont);
                return url.searchParams.getAll("family");
            }

            return cleanFont;
        })
        .flat()
        .filter(Boolean);

    if (families.length === 0) {
        return "";
    }

    const familyQuery = families
        .map((family) => {
            return `family=${encodeGoogleFontFamily(family)}`;
        })
        .join("&");

    const href = `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`;

    return [
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        `<link href="${escapeAttribute(href)}" rel="stylesheet">`,
    ].join("\n");
}

// Google Fontsのファミリー名をURL用にエンコードする
function encodeGoogleFontFamily(value) {
    return String(value)
        .trim()
        .replace(/\s+/g, "+")
        .replace(/:/g, "%3A")
        .replace(/,/g, "%2C")
        .replace(/;/g, "%3B")
        .replace(/@/g, "%40");
}

// 外部JavaScriptのscriptタグを生成する
function createExternalJsTags(value) {
    const urls = parseList(value);

    return urls
        .map((url) => {
            return `<script src="${escapeAttribute(url)}" defer></script>`;
        })
        .join("\n");
}

// ページ用アセットのファイル指定から余分なパス部分を取り除いて正規化する
function normalizePageAssetFile(value, type) {
    let filePath = String(value).trim();

    filePath = filePath.replace(/^\/+/, "");
    filePath = filePath.replace(new RegExp(`^@${type}/`), "");
    filePath = filePath.replace(new RegExp(`^${type}/`), "");

    return filePath;
}

// ページで指定されたCSSからlinkタグを生成する
function createPageCssTags(value, rootPath, pagePath) {
    const files = parseList(value);

    if (files.length === 0) {
        return "";
    }

    if (BUILD_CONFIG.bundlePageCss) {
        const bundleFileName = getPageCssBundleFileName(pagePath);
        const href = createAssetPath(rootPath, "css", bundleFileName);

        return `<link rel="stylesheet" href="${escapeAttribute(href)}">`;
    }

    return files
        .map((file) => {
            const href = resolveAssetPathForPage(file, rootPath, "css", ".css");

            return `<link rel="stylesheet" href="${escapeAttribute(href)}">`;
        })
        .join("\n");
}

// ページで指定されたJavaScriptからscriptタグを生成する
function createPageJsTags(value, rootPath) {
    const files = parseList(value);

    return files
        .map((file) => {
            const filePath = normalizePageAssetFile(file, "js");
            const src = `${rootPath}js/${filePath}`;

            return `<script src="${escapeAttribute(src)}" defer></script>`;
        })
        .join("\n");
}

// ===== HTML内パスの検査・警告 =======================================================
// HTMLコメントを削除する
function removeHtmlComments(source) {
    return String(source).replace(/<!--[\s\S]*?-->/g, "");
}

const nonAliasPathWarnings = [];

// ソース内の位置から行番号と列番号を取得する
function getLineAndColumn(source, index) {
    const before = source.slice(0, index);
    const lines = before.split(/\r?\n/);

    return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
    };
}

// @形式のエイリアスを使用していないアセットパスの情報を取得する
function getNonAliasPathInfo(value) {
    const rawValue = String(value).trim();

    if (!rawValue) return null;
    if (rawValue.startsWith("@")) return null;

    // 外部URLや特殊URLは対象外
    if (/^(https?:)?\/\//i.test(rawValue)) return null;
    if (/^(mailto:|tel:|data:|javascript:|#)/i.test(rawValue)) return null;

    const match = rawValue.match(/^([^?#]*)([?#].*)?$/);
    const pathPart = (match ? match[1] : rawValue).replace(/\\/g, "/");
    const suffix = match ? match[2] || "" : "";

    const cleanPath = pathPart
        .replace(/^\/+/, "")
        .replace(/^(?:\.\/)+/, "")
        .replace(/^(?:\.\.\/)+/, "");

    const folderMatch = cleanPath.match(/^(img|css|js|php)\/(.+)$/);

    if (!folderMatch) return null;

    const [, type, filePath] = folderMatch;

    return {
        type,
        suggestion: `@${type}/${filePath}${suffix}`,
    };
}

// エイリアスを使用していないパスを警告一覧に追加する
function addNonAliasPathWarning(fileLabel, fullSource, absoluteIndex, attr, value) {
    const info = getNonAliasPathInfo(value);

    if (!info) return;

    const position = getLineAndColumn(fullSource, absoluteIndex);

    nonAliasPathWarnings.push({
        file: fileLabel,
        line: position.line,
        column: position.column,
        attr,
        value,
        suggestion: info.suggestion,
    });
}

// HTML内の各種属性やstyleからエイリアスを使用していないパスを検出する
function collectNonAliasPathWarnings(fileLabel, source, options = {}) {
    const html = String(source);
    const fullSource = options.fullSource || html;
    const baseIndex = options.baseIndex || 0;

    // src, href, action, poster をチェック
    const attrRegex = /\b(src|href|action|poster)\s*=\s*(["'])(.*?)\2/gi;

    let attrMatch;

    while ((attrMatch = attrRegex.exec(html))) {
        const attr = attrMatch[1];
        const value = attrMatch[3];
        const valueIndex = attrMatch.index + attrMatch[0].indexOf(value);

        addNonAliasPathWarning(
            fileLabel,
            fullSource,
            baseIndex + valueIndex,
            attr,
            value
        );
    }

    // srcset をチェック
    const srcsetRegex = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;

    let srcsetMatch;

    while ((srcsetMatch = srcsetRegex.exec(html))) {
        const value = srcsetMatch[2];
        const candidates = value.split(",");

        for (const candidate of candidates) {
            const url = candidate.trim().split(/\s+/)[0];

            addNonAliasPathWarning(
                fileLabel,
                fullSource,
                baseIndex + srcsetMatch.index,
                "srcset",
                url
            );
        }
    }

    // inline style の url(...) をチェック
    const styleRegex = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi;

    let styleMatch;

    while ((styleMatch = styleRegex.exec(html))) {
        const styleValue = styleMatch[2];
        const urlRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

        let urlMatch;

        while ((urlMatch = urlRegex.exec(styleValue))) {
            const value = urlMatch[1];

            addNonAliasPathWarning(
                fileLabel,
                fullSource,
                baseIndex + styleMatch.index,
                "style url()",
                value
            );
        }
    }
}

// 検出したパスに関する警告をコンソールに出力する
function printNonAliasPathWarnings() {
    if (nonAliasPathWarnings.length === 0) return;

    console.warn("");
    console.warn(`[注意] @ を使っていないパスが ${nonAliasPathWarnings.length} 件あります。`);
    console.warn("       @img/、@css/、@js/、@php/ の使用を検討してください。");

    const groupedWarnings = Map.groupBy
        ? Map.groupBy(nonAliasPathWarnings, (warning) => warning.file)
        : null;

    if (groupedWarnings) {
        for (const [file, warnings] of groupedWarnings) {
            console.warn("");
            console.warn(`${file} (${warnings.length}件)`);

            for (const warning of warnings) {
                console.warn(
                    `  ${warning.line}:${warning.column} ${warning.attr}="${warning.value}" → ${warning.suggestion}`
                );
            }
        }

        return;
    }

    for (const warning of nonAliasPathWarnings) {
        console.warn(
            `${warning.file}:${warning.line}:${warning.column} ${warning.attr}="${warning.value}" → ${warning.suggestion}`
        );
    }
}

// ===== ファイル探索・出力パス計算 =======================================================
// 指定ディレクトリ以下から指定された拡張子のファイルを再帰的に取得する
async function findFiles(dir, extensions) {
    let entries;

    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const childFiles = await findFiles(fullPath, extensions);
            files.push(...childFiles);
            continue;
        }

        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name);

        if (extensions.includes(ext)) {
            files.push(fullPath);
        }
    }

    return files;
}

// 指定ディレクトリ以下から出力対象のSCSSファイルを再帰的に取得する
async function findScssFiles(dir) {
    let entries;

    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const childFiles = await findScssFiles(fullPath);
            files.push(...childFiles);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".scss")) continue;

        // _variables.scss などは単独CSSとして出力しない
        if (entry.name.startsWith("_")) continue;

        files.push(fullPath);
    }

    return files;
}

// 指定ディレクトリ以下からCSSファイルを再帰的に取得する
async function findCssFiles(dir) {
    let entries;

    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const childFiles = await findCssFiles(fullPath);
            files.push(...childFiles);
            continue;
        }

        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".css")) continue;

        files.push(fullPath);
    }

    return files;
}

// ページURL形式に応じた拡張子または末尾の区切り文字を取得する
function getLowerPageSuffix() {
    if (BUILD_CONFIG.lowerPageUrlType === "directory") {
        return "/";
    }

    if (BUILD_CONFIG.lowerPageUrlType === "file") {
        return ".html";
    }

    throw new Error(`Unknown lowerPageUrlType: ${BUILD_CONFIG.lowerPageUrlType}`);
}

// HTMLの相対パスからdist内の出力先パスを生成する
function getOutputPath(relativePath) {
    const normalizedPath = toPosixPath(relativePath);

    if (normalizedPath === "index.html") {
        return path.join(DIST_DIR, "index.html");
    }

    const parsedPath = path.posix.parse(normalizedPath);

    if (BUILD_CONFIG.lowerPageUrlType === "directory") {
        if (parsedPath.ext === ".html" && parsedPath.name !== "index") {
            return path.join(
                DIST_DIR,
                parsedPath.dir,
                parsedPath.name,
                "index.html"
            );
        }

        return path.join(DIST_DIR, normalizedPath);
    }

    if (BUILD_CONFIG.lowerPageUrlType === "file") {
        return path.join(DIST_DIR, normalizedPath);
    }

    throw new Error(`Unknown lowerPageUrlType: ${BUILD_CONFIG.lowerPageUrlType}`);
}

// HTMLの相対パスから公開用のページURLを生成する
function getPagePath(relativePath) {
    const normalizedPath = toPosixPath(relativePath);

    if (normalizedPath === "index.html") {
        return "/";
    }

    const parsedPath = path.posix.parse(normalizedPath);

    if (BUILD_CONFIG.lowerPageUrlType === "directory") {
        if (parsedPath.ext === ".html" && parsedPath.name !== "index") {
            return `/${path.posix.join(parsedPath.dir, parsedPath.name)}/`;
        }

        if (parsedPath.name === "index") {
            return `/${parsedPath.dir}/`.replace("//", "/");
        }
    }

    if (BUILD_CONFIG.lowerPageUrlType === "file") {
        if (parsedPath.ext === ".html" && parsedPath.name !== "index") {
            return `/${path.posix.join(parsedPath.dir, parsedPath.base)}`;
        }

        if (parsedPath.name === "index") {
            return `/${parsedPath.dir}/`.replace("//", "/");
        }
    }

    return `/${normalizedPath}`;
}

// 出力ファイルからdistを基準とした相対パスを生成する
function getPathPrefix(outputPath) {
    const outputDir = path.dirname(outputPath);
    const relativePath = toPosixPath(path.relative(outputDir, DIST_DIR));

    if (!relativePath) {
        return "./";
    }

    return `${relativePath}/`;
}

// HTML内に指定されたタグが存在するか確認する
function hasHtmlTag(source, tagName) {
    const regex = new RegExp(`<${tagName}(\\s|>|/)`, "i");
    return regex.test(source);
}

// 指定されたファイルが存在するか確認する
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// HTMLファイルが実際にページとして出力する対象か判定する
function isHtmlPageFile(filePath) {
    const relativePath = toPosixPath(path.relative(HTML_DIR, filePath));

    return !relativePath.startsWith("common/");
}

// ===== ページCSSバンドル ==========================================================
// ページCSSの指定をCSSの相対パスに正規化する
function normalizePageCssToCssRelativePath(value) {
    let cleanPath = String(value).trim();

    if (!cleanPath) return null;

    // 外部CSSはbundle対象外
    if (/^(https?:)?\/\//i.test(cleanPath)) return null;

    cleanPath = cleanPath
        .replace(/\\/g, "/")
        .replace(/^@css\//, "")
        .replace(/^\/+/, "")
        .replace(/^(?:\.\/)+/, "")
        .replace(/^(?:\.\.\/)+/, "")
        .replace(/^css\//, "")
        .replace(/[?#].*$/, "");

    if (!cleanPath) return null;

    if (cleanPath.endsWith(".scss")) {
        return cleanPath.replace(/\.scss$/i, ".css");
    }

    if (cleanPath.endsWith(".css")) {
        return cleanPath;
    }

    return `${cleanPath}.css`;
}

// 各ページで使用するCSSを収集し、ページごとのCSSバンドル情報を作成する
async function collectPageCssBundles() {
    const htmlFiles = await findFiles(HTML_DIR, [".html"]);
    const bundles = [];

    htmlFiles.sort();

    for (const pageFile of htmlFiles) {
        if (!isHtmlPageFile(pageFile)) continue;

        const relativePath = toPosixPath(path.relative(HTML_DIR, pageFile));
        const pageSource = await readFile(pageFile);
        const { data } = parseFrontMatter(pageSource);
        const pageCssList = parseList(data.pageCss);

        if (pageCssList.length === 0) continue;

        const usedCssPaths = new Set();
        const items = [];

        for (const pageCss of pageCssList) {
            const cssRelativePath = normalizePageCssToCssRelativePath(pageCss);

            if (!cssRelativePath) continue;

            if (usedCssPaths.has(cssRelativePath)) {
                continue;
            }

            usedCssPaths.add(cssRelativePath);

            items.push({
                cssRelativePath,
                originalValue: pageCss,
            });
        }

        if (items.length === 0) continue;

        const pagePath = getPagePath(relativePath);
        const bundleFileName = getPageCssBundleFileName(pagePath);

        bundles.push({
            pagePath,
            bundleFileName,
            items,
        });
    }

    return bundles;
}

// CSSバンドル対象のSCSSまたはCSSファイルを検索する
async function resolveBundleSourceFile(cssRelativePath) {
    const scssRelativePath = cssRelativePath.replace(/\.css$/i, ".scss");

    const scssFilePath = path.join(SCSS_DIR, scssRelativePath);
    const cssFilePath = path.join(SCSS_DIR, cssRelativePath);

    if (await fileExists(scssFilePath)) {
        return {
            type: "scss",
            filePath: scssFilePath,
        };
    }

    if (await fileExists(cssFilePath)) {
        return {
            type: "css",
            filePath: cssFilePath,
        };
    }

    return null;
}

// CSS先頭のUTF-8 charset指定を削除する
function removeCssCharset(source) {
    return String(source).replace(/^\s*@charset\s+["']UTF-8["'];\s*/gi, "");
}

// バンドル対象のSCSSをコンパイルするかCSSを読み込む
async function compileBundleItem(item) {
    const sourceFile = await resolveBundleSourceFile(item.cssRelativePath);

    if (!sourceFile) {
        console.warn(
            `[bundle warning] src/scss/${item.cssRelativePath.replace(
                /\.css$/i,
                ".scss"
            )} または src/scss/${item.cssRelativePath} が見つかりません。`
        );

        return "";
    }

    if (sourceFile.type === "scss") {
        const result = await sass.compileAsync(sourceFile.filePath, {
            style: "expanded",
            loadPaths: [SCSS_DIR],
        });

        return removeCssCharset(result.css).trim();
    }

    const css = await readFile(sourceFile.filePath);

    return removeCssCharset(css).trim();
}

// ページごとにCSSをまとめてバンドルファイルとして出力する
async function buildPageCssBundles(bundles) {
    if (!BUILD_CONFIG.bundlePageCss) {
        return;
    }

    const distCssDir = path.join(DIST_DIR, "css");

    await fs.mkdir(distCssDir, { recursive: true });

    if (bundles.length === 0) {
        console.log("Skipped: no pageCss files for page bundles");
        return;
    }

    for (const bundle of bundles) {
        const cssParts = [];

        for (const item of bundle.items) {
            const css = await compileBundleItem(item);

            if (!css) continue;

            cssParts.push(css);
        }

        const bundleOutputPath = path.join(distCssDir, bundle.bundleFileName);
        const cssRootPath = getPathPrefix(bundleOutputPath);
        const bundleCss = resolveCssShortPaths(
            removeCssCharset(cssParts.join("\n\n")),
            cssRootPath
        ).trim();

        await fs.writeFile(bundleOutputPath, bundleCss);

        console.log(`Bundled CSS: css/${bundle.bundleFileName}`);
    }
}

// ===== ページ生成 ===============================================================
// HTMLページを読み込み、テンプレートと設定を適用してdistに生成する
async function buildPages() {
    const layout = await readFile(LAYOUT_FILE);
    const headerTemplate = await readFile(HEADER_FILE);
    const footerTemplate = await readFile(FOOTER_FILE);

    collectNonAliasPathWarnings("src/layout.html", layout);
    collectNonAliasPathWarnings("src/html/common/header.html", headerTemplate);
    collectNonAliasPathWarnings("src/html/common/footer.html", footerTemplate);

    const pageFiles = await findFiles(HTML_DIR, [".html"]);

    for (const pageFile of pageFiles) {
        const relativePath = toPosixPath(path.relative(HTML_DIR, pageFile));

        // src/html/common/ 配下はページとして出力しない
        if (relativePath.startsWith("common/")) {
            continue;
        }

        const pageSource = await readFile(pageFile);
        const { data, content, contentStartIndex } = parseFrontMatter(pageSource);

        collectNonAliasPathWarnings(`src/html/${relativePath}`, content, {
            fullSource: pageSource,
            baseIndex: contentStartIndex,
        });

        const outputPath = getOutputPath(relativePath);
        const pagePath = getPagePath(relativePath);
        const rootPath = getPathPrefix(outputPath);

        const commonValues = {
            rootPath,
            lowerPath: rootPath,
            lowerPageSuffix: getLowerPageSuffix(),
        };

        const renderedContent = render(content, commonValues);

        const hasPageHeader = hasHtmlTag(renderedContent, "header");
        const hasPageFooter = hasHtmlTag(renderedContent, "footer");

        const header = hasPageHeader ? "" : render(headerTemplate, commonValues);
        const footer = hasPageFooter ? "" : render(footerTemplate, commonValues);

        const rawHtml = render(layout, {
            title: data.title || "",
            description: data.description || "",
            header,
            content: renderedContent,
            footer,
            rootPath,
            lowerPath: rootPath,
            lowerPageSuffix: getLowerPageSuffix(),
            faviconTags: createFaviconTags(rootPath),
            ogTags: createOgTags(data, pagePath),
            twitterCardTags: createTwitterCardTags(data),
            googleFontsTags: createGoogleFontsTags(data.googleFonts),
            pageCssTags: createPageCssTags(data.pageCss, rootPath, pagePath),
            pageJsTags: createPageJsTags(data.pageJs, rootPath),
            externalCssTags: createExternalCssTags(data.externalCss),
            externalJsTags: createExternalJsTags(data.externalJs),
        });

        const html = removeComponentHtmlComments(resolveShortPaths(rawHtml, rootPath));

        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, html);

        console.log(`Built: ${pagePath}`);
    }
}

// ===== スタイル・静的ファイル・整形 ======================================================
// CSS/SCSSを処理し、必要なCSSファイルをdistに生成する
async function buildStyles() {
    const distCssDir = path.join(DIST_DIR, "css");

    await fs.mkdir(distCssDir, { recursive: true });

    const pageCssBundles = await collectPageCssBundles();

    const bundledCssPathSet = new Set(
        pageCssBundles.flatMap((bundle) => {
            return bundle.items.map((item) => item.cssRelativePath);
        })
    );

    const cssFiles = await findCssFiles(SCSS_DIR);
    const scssFiles = await findScssFiles(SCSS_DIR);

    const scssOutputPaths = new Set(
        scssFiles.map((scssFile) => {
            const relativePath = path.relative(SCSS_DIR, scssFile);
            const cssRelativePath = relativePath.replace(/\.scss$/i, ".css");

            return toPosixPath(cssRelativePath);
        })
    );

    for (const cssFile of cssFiles) {
        const relativePath = path.relative(SCSS_DIR, cssFile);
        const cssRelativePath = toPosixPath(relativePath);

        if (BUILD_CONFIG.bundlePageCss && bundledCssPathSet.has(cssRelativePath)) {
            console.log(`Skipped CSS because bundled: css/${cssRelativePath}`);
            continue;
        }

        if (scssOutputPaths.has(cssRelativePath)) {
            console.log(`Skipped CSS because SCSS exists: css/${cssRelativePath}`);
            continue;
        }

        const cssOutputPath = path.join(distCssDir, relativePath);

        const sourceCss = await readFile(cssFile);
        const cssRootPath = getPathPrefix(cssOutputPath);
        const css = resolveCssShortPaths(removeCssCharset(sourceCss), cssRootPath);

        await fs.mkdir(path.dirname(cssOutputPath), { recursive: true });
        await fs.writeFile(cssOutputPath, css);

        console.log(`Copied CSS: css/${cssRelativePath}`);
    }

    for (const scssFile of scssFiles) {
        const relativePath = path.relative(SCSS_DIR, scssFile);
        const cssRelativePath = toPosixPath(
            relativePath.replace(/\.scss$/i, ".css")
        );

        if (BUILD_CONFIG.bundlePageCss && bundledCssPathSet.has(cssRelativePath)) {
            console.log(`Skipped SCSS because bundled: css/${cssRelativePath}`);
            continue;
        }

        const cssOutputPath = path.join(distCssDir, cssRelativePath);

        const result = await sass.compileAsync(scssFile, {
            style: "expanded",
            loadPaths: [SCSS_DIR],
        });

        const cssRootPath = getPathPrefix(cssOutputPath);
        const css = resolveCssShortPaths(removeCssCharset(result.css), cssRootPath);

        await fs.mkdir(path.dirname(cssOutputPath), { recursive: true });
        await fs.writeFile(cssOutputPath, css);

        console.log(`Compiled SCSS: css/${cssRelativePath}`);
    }

    await buildPageCssBundles(pageCssBundles);
}

// JS・画像・PHPなどの静的ファイルをdistにコピーする
async function copyAssets() {
    const assets = [
        {
            name: "js",
            src: JS_DIR,
            dist: path.join(DIST_DIR, "js"),
        },
        {
            name: "img",
            src: IMG_DIR,
            dist: path.join(DIST_DIR, "img"),
        },
        {
            name: "php",
            src: PHP_DIR,
            dist: path.join(DIST_DIR, "php"),
        },
    ];

    for (const asset of assets) {
        try {
            await fs.cp(asset.src, asset.dist, {
                recursive: true,
                force: true,
            });

            console.log(`Copied: ${asset.name}/`);
        } catch (error) {
            if (error.code === "ENOENT") {
                console.log(`Skipped: src/${asset.name}/ does not exist`);
                continue;
            }

            throw error;
        }
    }
}

// dist内のHTML・CSS・JavaScriptをPrettierで整形する
async function formatDistFiles() {
    const prettier = await import("prettier");
    const targetFiles = await findFiles(DIST_DIR, [".html", ".css", ".js"]);

    for (const filePath of targetFiles) {
        // 圧縮済みJSは整形しない
        if (filePath.endsWith(".min.js")) continue;

        const source = await fs.readFile(filePath, "utf8");

        const formatted = await prettier.format(source, {
            filepath: filePath,
        });

        await fs.writeFile(filePath, formatted);

        const relativePath = toPosixPath(path.relative(DIST_DIR, filePath));
        console.log(`Formatted: ${relativePath}`);
    }
}

// ===== ビルド実行 ===============================================================
// distを初期化し、ページ生成・スタイル生成・アセットコピー・ファイル整形を順番に実行する
async function build() {
    await fs.rm(DIST_DIR, { recursive: true, force: true });
    await fs.mkdir(DIST_DIR, { recursive: true });

    await buildPages();
    await buildStyles();
    await copyAssets();
    await formatDistFiles();

    console.log("Build complete.");
    printNonAliasPathWarnings();
}

build().catch((error) => {
    console.error(error);
    process.exit(1);
});