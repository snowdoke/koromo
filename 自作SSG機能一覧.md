# 自作SSGでできること・便利になったこと

このSSGは、HTML制作を効率化するための静的サイト生成ツールです。
共通パーツの差し込み、SCSSコンパイル、画像・JSのコピー、ページごとのmeta情報設定などを自動化できます。

---

## 0. サイト制作で便利になったこと

このSSGによって、以下の作業が楽になります。

* header / footer を全ページにコピーしなくてよい
* 共通レイアウトを1箇所で管理できる
* ページごとのtitle / descriptionを整理できる
* OGP / Twitter Cardを自動出力できる
* SCSSを自動でCSSに変換できる
* JSや画像を自動でdistへコピーできる
* トップページと下層ページの相対パスを自動調整できる
* 画像・CSS・JSのパスを短く書ける
* ページ個別CSS / JSをfront matterで指定できる
* 外部CSS / JSをページごとに追加できる
* HTML / CSS / JSを整形した状態で出力できる
* 保存時に自動ビルドできる
* チームで共通の制作ルールを作れる

---

## 1. header / footer の共通化

`src/html/common/header.html` と `src/html/common/footer.html` を用意しておくと、各ページに自動で差し込まれます。

```txt
src/
  html/
    common/
      header.html
      footer.html
    index.html
    about.html
```

これにより、全ページのヘッダー・フッターを個別に編集する必要がなくなります。

---

## 2. ページごとに独自の header / footer を使える

ページ本文内に `<header>` がある場合は、共通の `header.html` を差し込みません。

ページ本文内に `<footer>` がある場合は、共通の `footer.html` を差し込みません。

そのため、通常ページでは共通パーツを使い、LPなど一部のページだけ専用ヘッダー・専用フッターにできます。

---

## 3. layout.html による共通レイアウト

`src/layout.html` にHTML全体の共通構造を書けます。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>{{ title }}</title>
</head>
<body>
  {{ header }}
  {{ content }}
  {{ footer }}
</body>
</html>
```

各ページの本文は `{{ content }}` に差し込まれます。

---

## 4. front matter によるページ情報管理

各ページの先頭にfront matterを書いて、ページごとの情報を設定できます。

```html
---
title: About
description: 私たちについてのページです。
snsImage: @img/ogp.jpg
pageCss: @css/about.css
pageJs: @js/about.js
---

<main>
  <h1>About</h1>
</main>
```

ページタイトル、説明文、SNS画像、個別CSS、個別JSなどをHTMLごとに管理できます。

---

## 5. title / description の自動出力

front matter の `title` と `description` が、`layout.html` に自動で反映されます。

```html
<title>{{ title }}</title>
<meta name="description" content="{{ description }}">
```

ページごとに適切なタイトル・説明文を設定できます。

---

## 6. favicon の共通設定

faviconは `build.js` 側の共通設定で管理できます。

全ページに同じfaviconタグを自動で出力します。

```html
<link rel="icon" href="./img/favicon.ico">
<link rel="apple-touch-icon" href="./img/apple-touch-icon.png">
```

ページごとにfaviconタグを書く必要がありません。

---

## 7. OGP対応

front matter の情報をもとに、OGPタグを自動生成できます。

```html
<meta property="og:title" content="About">
<meta property="og:description" content="私たちについてのページです。">
<meta property="og:type" content="website">
<meta property="og:url" content="/about/">
<meta property="og:image" content="/img/ogp.jpg">
```

`og:type` は `website` 固定です。

---

## 8. Twitter Card対応

Twitter Card用のmetaタグも自動生成できます。

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="About">
<meta name="twitter:description" content="私たちについてのページです。">
<meta name="twitter:image" content="/img/ogp.jpg">
```

`twitter:card` は `summary_large_image` 固定です。

---

## 9. SNS画像を共通指定できる

front matter では、OGP画像とTwitter画像を別々に書かず、`snsImage` だけ指定します。

```html
---
snsImage: @img/ogp.jpg
---
```

これが以下の両方に使われます。

```html
<meta property="og:image" content="/img/ogp.jpg">
<meta name="twitter:image" content="/img/ogp.jpg">
```

---

## 10. 下層ページの出力形式を切り替えられる

`build.js` の設定で、下層ページの出力形式を切り替えられます。

```js
const BUILD_CONFIG = {
  lowerPageUrlType: "directory",
};
```

`directory` の場合：

```txt
src/html/about.html
↓
dist/about/index.html
```

URLは以下のようになります。

```txt
/about/
```

`file` の場合：

```txt
src/html/about.html
↓
dist/about.html
```

URLは以下のようになります。

```txt
/about.html
```

---

## 11. 相対パスを自動調整できる

トップページと下層ページで、CSS・JS・画像へのパスを自動で調整できます。

トップページでは、

```html
./css/style.css
```

下層ページでは、

```html
../css/style.css
```

のように、出力先の階層に合わせて変換されます。

---

## 12. `@img/` で画像パスを短く書ける

HTML内では画像パスを短く書けます。

```html
<img src="@img/logo.png" alt="ロゴ">
```

ビルド後は、ページ階層に合わせて自動変換されます。

トップページ：

```html
<img src="./img/logo.png" alt="ロゴ">
```

下層ページ：

```html
<img src="../img/logo.png" alt="ロゴ">
```

---

## 13. `@css/` でCSSパスを短く書ける

CSSへのパスも短く書けます。

```html
<link rel="stylesheet" href="@css/style.css">
```

ビルド後は、階層に応じて自動変換されます。

---

## 14. `@js/` でJSパスを短く書ける

JSへのパスも短く書けます。

```html
<script src="@js/main.js" defer></script>
```

ビルド後は、階層に応じて自動変換されます。

---

## 15. `@root` でトップページへのリンクを書ける

トップページへのリンクは `@root` で書けます。

```html
<a href="@root">Home</a>
```

トップページでも下層ページでも、正しい相対パスに変換されます。

---

## 16. `@page/` で下層ページへのリンクを書ける

下層ページへのリンクは `@page/ページ名` で書けます。

```html
<a href="@page/about">About</a>
<a href="@page/contact">Contact</a>
```

`lowerPageUrlType` の設定に合わせて、以下のどちらかに変換されます。

```html
<a href="./about/">About</a>
```

または、

```html
<a href="./about.html">About</a>
```

---

## 17. ページ個別CSSを読み込める

front matter に `pageCss` を指定すると、そのページだけCSSを追加できます。

```html
---
pageCss: @css/about.css
---
```

出力例：

```html
<link rel="stylesheet" href="../css/about.css">
```

指定がないページには追加されません。

---

## 18. ページ個別JSを読み込める

front matter に `pageJs` を指定すると、そのページだけJSを追加できます。

```html
---
pageJs: @js/about.js
---
```

出力例：

```html
<script src="../js/about.js" defer></script>
```

ページ個別JSにも `defer` が付きます。

---

## 19. 外部CSSをページごとに読み込める

front matter に `externalCss` を指定すると、そのページだけ外部CSSを読み込めます。

```html
---
externalCss: https://cdn.example.com/library.css
---
```

出力例：

```html
<link rel="stylesheet" href="https://cdn.example.com/library.css">
```

CDNなどをページ単位で追加できます。

---

## 20. 外部JSをページごとに読み込める

front matter に `externalJs` を指定すると、そのページだけ外部JSを読み込めます。

```html
---
externalJs: https://cdn.example.com/library.js
---
```

出力例：

```html
<script src="https://cdn.example.com/library.js" defer></script>
```

外部JSにも自動で `defer` が付きます。

---

## 21. SCSSをCSSに変換できる

`src/scss/` に `.scss` ファイルを置くと、ビルド時にCSSへ変換されます。

```txt
src/
  scss/
    style.scss
    about.scss
```

出力：

```txt
dist/
  css/
    style.css
    about.css
```

---

## 22. 複数のSCSSファイルに対応

`src/scss/` 内に複数のSCSSファイルがあれば、それぞれCSSとして出力されます。

```txt
src/scss/style.scss
src/scss/about.scss
src/scss/page/contact.scss
```

出力：

```txt
dist/css/style.css
dist/css/about.css
dist/css/page/contact.css
```

---

## 23. パーシャルSCSSは単独出力しない

`_variables.scss` のように `_` で始まるSCSSファイルは、単独のCSSとして出力されません。

```txt
src/scss/_variables.scss
```

これは `@use` などで読み込む部品ファイルとして扱えます。

---

## 24. JSファイルを自動コピーできる

`src/js/` の中身は、ビルド時に `dist/js/` へコピーされます。

```txt
src/js/main.js
↓
dist/js/main.js
```

---

## 25. 画像ファイルを自動コピーできる

`src/img/` の中身は、ビルド時に `dist/img/` へコピーされます。

```txt
src/img/logo.png
↓
dist/img/logo.png
```

---

## 26. distを毎回作り直せる

ビルド時に `dist/` を削除してから再生成します。

古いファイルが残りにくく、出力結果をクリーンに保てます。

---

## 27. HTML / CSS / JS を自動整形できる

ビルド後に `dist/` 内のHTML、CSS、JSをPrettierで整形できます。

```txt
dist/index.html
dist/css/style.css
dist/js/main.js
```

生成結果が読みやすくなります。

---

## 28. min.js は整形対象から除外できる

`vendor.min.js` のような圧縮済みJSは、Prettier整形の対象から除外できます。

```txt
dist/js/vendor.min.js
```

外部ライブラリの圧縮済みファイルを展開してしまうのを防げます。

---

## 29. watchで保存時に自動ビルドできる

`npm run watch` を起動しておくと、`src/` 配下の変更を検知して自動ビルドできます。

```bash
npm run watch
```

HTML、SCSS、JS、画像、共通パーツを編集したときに、手動で毎回ビルドする必要がありません。

---

## 30. Live Serverと組み合わせて確認できる

`dist/` をLive Serverの公開ルートにすることで、生成されたサイトをブラウザで確認できます。

```json
{
  "liveServer.settings.root": "/dist"
}
```

ローカル環境で実際の表示を確認しながら制作できます。

---

## 31. チーム制作で置き場所を統一できる

現在の構成では、ファイルの役割ごとに置き場所を分けています。

```txt
src/
  html/
    common/
      header.html
      footer.html
    index.html
    about.html
  scss/
  js/
  img/
  layout.html
```

これにより、チーム内で「どこに何を置くか」を統一できます。

---

## 32. 出力先がシンプル

出力先は `dist` 直下に `css`、`js`、`img` を作るシンプルな構成です。

```txt
dist/
  index.html
  about/
    index.html
  css/
  js/
  img/
```

`assets/` フォルダを挟まないため、パスが短くなります。

---

## 33. npm scriptsで操作できる

ビルドや監視はnpm scriptsで実行できます。

```bash
npm run build
npm run watch
```

チームメンバーも同じコマンドで操作できます。

---

## 34. node_modulesをGit管理しなくてよい

`node_modules/` は `.gitignore` で除外できます。

```gitignore
node_modules/
```

依存パッケージは `package.json` と `package-lock.json` から復元できます。

```bash
npm install
```

## まとめ

このSSGは、単なるHTML結合ツールではなく、Web制作でよく発生する作業を自動化できます。

特に以下の用途に向いています。

* 小〜中規模の静的サイト制作
* コーポレートサイト制作
* LP制作
* HTML/CSSコーディング案件
* チーム内の制作テンプレート
* header / footer など共通パーツの管理
* SCSSを使った静的サイト制作

手作業でページごとにコピーしていた処理をビルドで自動化できるため、修正漏れを減らし、制作効率を上げられます。