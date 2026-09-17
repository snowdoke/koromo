const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const projectDir = path.resolve(__dirname, "..");

async function buildFixture(t, { bundlePageCss, pageCss }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "koromo-page-css-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts"));
  const source = await fs.readFile(path.join(projectDir, "scripts/build.js"), "utf8");
  await fs.writeFile(
    path.join(root, "scripts/build.js"),
    source.replace("bundlePageCss: true", `bundlePageCss: ${bundlePageCss}`)
  );
  await fs.symlink(path.join(projectDir, "node_modules"), path.join(root, "node_modules"), "junction");
  for (const dir of ["src/html/common", "src/html/news", "src/scss/pages"]) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
  }
  await fs.writeFile(path.join(root, "src/layout.html"),
    '<!doctype html><html><head>{{ pageCssTags }}</head><body>{{ content }}</body></html>');
  await fs.writeFile(path.join(root, "src/html/common/header.html"), "");
  await fs.writeFile(path.join(root, "src/html/common/footer.html"), "");
  await fs.writeFile(path.join(root, "src/scss/pages/detail.scss"), ".detail { color: red; }");
  await fs.writeFile(path.join(root, "src/scss/pages/plain.css"), ".plain { color: blue; }");
  const page = `---\npageCss: ${JSON.stringify(pageCss)}\n---\n<main>Fixture</main>`;
  await fs.writeFile(path.join(root, "src/html/index.html"), page);
  await fs.writeFile(path.join(root, "src/html/news/detail.html"), page);
  const result = spawnSync(process.execPath, [path.join(root, "scripts/build.js")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return root;
}

for (const value of [
  "pages/detail", "pages/detail.css", "pages/detail.scss",
  "@css/pages/detail.scss", "css/pages/detail", "/css/pages/detail.css",
  "./css/pages/detail.css", "../../css/pages/detail.css",
  "@css/pages/detail.scss?v=1&theme=dark#main",
]) {
  test(`unbundled pageCss resolves ${value} to the generated CSS`, async (t) => {
    const root = await buildFixture(t, { bundlePageCss: false, pageCss: [value] });
    const suffix = value.includes("?") ? "?v=1&amp;theme=dark#main" : "";
    for (const [page, prefix] of [["index.html", "./"], ["news/detail/index.html", "../../"]]) {
      const html = await fs.readFile(path.join(root, "dist", page), "utf8");
      assert.ok(html.includes(`href="${prefix}css/pages/detail.css${suffix}"`), html);
    }
    assert.match(await fs.readFile(path.join(root, "dist/css/pages/detail.css"), "utf8"), /color: red/);
  });
}

test("unbundled CSS preserves external URLs and stylesheet order", async (t) => {
  const root = await buildFixture(t, { bundlePageCss: false, pageCss: [
    "@css/pages/detail.css", "https://example.com/theme.css?v=1&x=2",
    "//example.com/fonts.css", "pages/plain.css",
  ] });
  const html = await fs.readFile(path.join(root, "dist/news/detail/index.html"), "utf8");
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), [
    "../../css/pages/detail.css", "https://example.com/theme.css?v=1&amp;x=2",
    "//example.com/fonts.css", "../../css/pages/plain.css",
  ]);
  assert.match(await fs.readFile(path.join(root, "dist/css/pages/plain.css"), "utf8"), /color: blue/);
});

test("bundled CSS still deduplicates local styles and emits working links", async (t) => {
  const root = await buildFixture(t, { bundlePageCss: true,
    pageCss: ["pages/detail", "@css/pages/detail.scss", "pages/plain.css"] });
  const html = await fs.readFile(path.join(root, "dist/news/detail/index.html"), "utf8");
  assert.match(html, /href="\.\.\/\.\.\/css\/bundle_news_detail.css"/);
  const css = await fs.readFile(path.join(root, "dist/css/bundle_news_detail.css"), "utf8");
  assert.equal((css.match(/color: red/g) || []).length, 1);
  assert.match(css, /color: blue/);
});

test("empty pageCss emits no stylesheet link", async (t) => {
  const root = await buildFixture(t, { bundlePageCss: false, pageCss: [] });
  const html = await fs.readFile(path.join(root, "dist/index.html"), "utf8");
  assert.doesNotMatch(html, /rel="stylesheet"/);
});
