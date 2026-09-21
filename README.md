# koromo

HTML・SCSS・JavaScriptで静的サイトを制作するための、自作SSG（静的サイトジェネレーター）です。
共通レイアウトへのページ差し込み、ページ別のメタ情報、SCSSのコンパイル、コンポーネントの展開とプレビュー生成を行い、公開用ファイルを `dist/` に出力します。

デモページ：[https://gl.matrix.jp/koromo-intro/demo/](https://gl.matrix.jp/koromo-intro/demo/)

## はじめる

Node.js・npm・Gitを用意してください。ロックファイルのSassはNode.js 20.19.0以上を要求します。動作確認環境はNode.js 24.20.0です。

```sh
git clone https://github.com/snowdoke/koromo.git
cd koromo
npm ci
npm run build
```

ビルド後、`dist/index.html` を開いて確認します。VS CodeのLive Serverを使う場合は、同梱の `.vscode/settings.json` により `dist/` が公開ルートになります。下層ページは `/about/` などのURLで確認できます。

## 開発コマンド

リポジトリのルートで実行します。

| コマンド | 処理 |
| --- | --- |
| `npm ci` | ロックファイルに従って依存パッケージをインストール |
| `npm run build` | コンポーネント展開 → プレビュー生成 → サイト生成 |
| `npm run expand` | コンポーネント展開とプレビュー生成。`dist/` は更新しない |
| `npm run watch` | 初回ビルド後、`src/` と `scripts/` の変更を監視して再ビルド |
| `npm run watch -- --polling` | ファイル変更が検知されない環境向けのポーリング監視 |
| `npm test` | ページCSSのパス解決に関する回帰テスト |

`watch` はHTTPサーバーを起動しません。表示確認にはLive Serverなどを併用します。
`component-library/` は監視対象に含まれないため、コンポーネントを編集したら `npm run build` または `npm run expand` を実行してください。

## ディレクトリ構成

```text
koromo/
├── scripts/                    # Node.jsで実行する制作・ビルド用ツール
│   ├── build.js                 # サイト生成・SCSS処理・アセットコピー・整形
│   ├── components-conversion.js # コンポーネントHTML展開・SCSS追加
│   └── components-view.js       # コンポーネント一覧・プレビュー・カテゴリ生成
├── src/                        # サイトの編集元
│   ├── layout.html             # 共通レイアウト
│   ├── html/
│   │   ├── index.html
│   │   ├── about.html
│   │   └── common/             # 共通header/footer。単独ページとしては出力しない
│   ├── scss/                   # SCSS・CSS
│   └── js/                     # ブラウザで実行するJavaScript
├── component-library/          # コンポーネント原本と生成されたプレビュー
│   ├── p0001/                  # index.html、style.scss、任意のmain.js
│   └── index.html              # 生成されるプレビュー画面
├── categories/                 # カテゴリ情報とプレビュー用スクリプト
├── test/                       # 回帰テスト
├── dist/                       # 公開用の生成物
└── package.json
```

画像を使う場合は `src/img/`、PHPを配置する場合は `src/php/` を作成します。それぞれ `dist/img/`、`dist/php/` にコピーされます。PHPの実行には対応したサーバーが必要です。

`scripts/` と `src/js/` は用途が異なります。制作ツールは `scripts/`、サイト上で動かすコードは `src/js/` に置きます。

## ページを追加する

`src/html/` にHTMLを作成し、先頭のYAML front matterにページ情報を書きます。本文は `src/layout.html` の `{{ content }}` に差し込まれるため、ページ側に `html`・`head`・`body` は不要です。

`src/html/service.html` の例：

```html
---
title: "サービス"
description: "サービスの紹介ページです。"
pageCss:
  - "@css/service.css"
---

<main>
  <h1>サービス</h1>
  <a href="@page/about">私たちについて</a>
  <a href="@root">トップページへ</a>
</main>
```

対応する `src/scss/service.scss` を作成します。

```scss
@use "functions" as *;
@use "variables" as *;

main {
  padding: 2rem;
}
```

`npm run build` を実行すると、既定の設定では `dist/service/index.html` と `dist/css/bundle_service.css` が生成されます。

### ページごとに指定できる情報

| キー | 用途・例 |
| --- | --- |
| `title` | ページタイトル、OGP・Twitter Cardのタイトル |
| `description` | ページ説明、OGP・Twitter Cardの説明 |
| `snsImage` | SNS画像。例：`"@img/ogp.jpg"`（文字列） |
| `googleFonts` | フォント指定の配列。例：`["Noto Sans JP:wght@400;700"]` |
| `pageCss` | ページ用CSS。例：`["@css/service.css"]` |
| `pageJs` | ページ用JS。例：`["@js/service.js"]` |
| `externalCss` | 外部CSSのURL配列 |
| `externalJs` | 外部JavaScriptのURL配列 |

CSS・JS・画像を指定したら、対応するソースファイルも配置してください。JavaScriptの読み込みタグには `defer` が付きます。

### 短縮パス

HTMLでは以下のエイリアスが、出力先の階層に合わせた相対パスへ変換されます。

| 記法 | 対象 |
| --- | --- |
| `@img/photo.jpg` | `src/img/photo.jpg` からコピーされる画像 |
| `@css/common.css` | `dist/css/common.css` |
| `@js/main.js` | `src/js/main.js` からコピーされるJS |
| `@php/contact.php` | `src/php/contact.php` からコピーされるPHP |
| `@page/about` | ページURL。既定では `/about/` に対応 |
| `@root` | サイトのトップページ |

SCSS・CSS内の `url("@img/photo.jpg")` も変換できます。

## 共通レイアウトと設定

- `src/layout.html`：ページ全体の構造、共通CSS・JS、メタ情報の差し込み位置。
- `src/html/common/header.html` / `footer.html`：共通ヘッダー・フッター。ページ本文にそれぞれのタグがあれば、その共通パーツは差し込まれません。
- `scripts/build.js` の `BUILD_CONFIG`：下層ページのURL形式とCSSバンドル設定。
- `scripts/build.js` の `SITE_CONFIG`：本番URL、favicon、Apple Touch Icon、OGP・Twitter Cardの共通設定。

| 設定 | 既定値 | 動作 |
| --- | --- | --- |
| `lowerPageUrlType` | `"directory"` | `about.html` を `about/index.html` に出力。`"file"` なら `about.html` に出力 |
| `bundlePageCss` | `true` | `pageCss` をページ別のCSSにまとめる。`false` なら個別のCSSを読み込む |
| `pageCssBundlePrefix` | `"bundle_"` | ページ別CSSのファイル名の接頭辞 |
| `siteUrl` | `""` | 本番URLを指定するとOGPのURL・SNS画像URLに反映 |

`_variables.scss` など `_` で始まるSCSSは、単独のCSSとして出力されません。
バンドル対象のCSSは個別出力されないため、共通レイアウトから直接読む `common.css` などを `pageCss` にも指定しないでください。外部CSSは `externalCss` に指定します。

## コンポーネントを使う

コンポーネントは `component-library/p0001/` のように、`p` と4桁の数字からなるIDで管理します。

```text
component-library/p0001/
├── index.html   # HTML。先頭コメントにカテゴリ、次のコメントに説明
├── style.scss   # スタイル（style.cssも使用可能）
└── main.js      # 任意。プレビュー用JavaScript
```

ページ本文に `{{ p0001 }}` と書き、front matterに `pageCss` を指定してから `npm run expand` または `npm run build` を実行します。

```html
---
title: "コンポーネントの使用例"
pageCss: "@css/example.css"
---

<main>
  {{ p0001 }}
</main>
```

コンポーネントのHTMLがページのソースに展開され、SCSSが `src/scss/example.scss` に追加されます。`pageCss` が複数ある場合、追加先は最初のローカルCSSに対応するSCSSです。

**コンポーネント展開は `src/` 自体を書き換えます。** 展開後のHTMLはページ側で編集でき、コンポーネント原本の変更が自動で再反映される仕組みではありません。同じIDのスタイルが追加済みなら再追加されません。展開後はソースの差分を確認してください。

プレビューは `component-library/index.html` をブラウザで開きます。`dist/` の外にあるため、公開サイトとは別に確認します。カテゴリ・HTMLのコピー機能もこの画面で利用できます。

プレビューの `@img/` は `component-library/img/` を参照し、公開ページでは `src/img/` からコピーした画像を参照します。公開用の画像も配置してください。コンポーネントの `main.js` はプレビューにまとめられますが、公開ページへの自動組み込みは行われません。必要なコードは `src/js/` に用意し、共通レイアウトまたは `pageJs` で読み込みます。

## 出力と運用

ビルドは `dist/` を削除して再生成します。編集するのは `src/` やコンポーネント原本で、`dist/` に直接加えた変更は次のビルドで失われます。生成したHTML・CSS・JSはPrettierで整形されます（`.min.js` は対象外）。

静的ホスティングには `dist/` の中身を配置します。開発用の `scripts/` や `node_modules/` は公開物に含めません。

初期設定にはfavicon・サンプル画像への参照がありますが、対応する `src/img/` は同梱されていません。必要な画像を追加するか、設定・HTMLから不要な参照を外してください。

## 詳細ドキュメント

- [開発環境の準備と基本操作](開発環境の準備と基本操作.md)
- [PowerShellコマンド一覧](PowerShellコマンド一覧.md)
- [自作SSG機能一覧](自作SSG機能一覧.md)
- [レイアウト変数一覧](レイアウト変数一覧.md)
- [制作時の注意事項](制作時の注意事項.md)

## ライセンス

koromo は [MIT License](LICENSE) のもとで公開しています。
