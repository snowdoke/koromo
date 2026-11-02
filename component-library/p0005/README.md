# p0005 — Flexレイアウト

親の幅に応じて折り返す、CSS Flexboxのレイアウトです。JavaScriptや共通SCSSへの依存はありません。

## 基本の使い方

ページに `{{ p0005 }}` を記述し、front matterの `pageCss` を指定して `npm run expand` を実行します。展開後はサンプルの内容を置き換えてください。

`.p0005-layout` の直下の要素が項目になります。タグや項目数は自由で、項目用のクラスは必須ではありません。

```html
<div class="p0005-layout">
  <div>コンテンツ A</div>
  <div>コンテンツ B</div>
  <div>コンテンツ C</div>
  <div class="p0005-layout__full">1行全体を使うコンテンツ</div>
</div>
```

標準は基準幅 `16rem`、余白 `24px` の横並びです。基準幅は折り返しの目安で、親がそれより狭い場合は項目も縮みます。各行の項目が余った幅を分け合うため、最後の行に1項目だけ残った場合も全幅に広がります。行をまたいで列幅を揃える場合は [p0004（Grid）](../p0004/README.md) が使えます。

`.p0005-layout__full` は標準の横並びで1行全体を使うクラスです。表示順・読み上げ順はHTMLの順序を保ちます。

## 余白を変更する

`--p0005-gap` は初期値 `24px` です。`16px 32px` のように行・列の余白を別々に指定できます。

```html
<div class="p0005-layout" style="--p0005-gap: 16px 32px;">
  <div>コンテンツ A</div>
  <div>コンテンツ B</div>
</div>
```

## 幅や揃え方を変更する

追加クラスを付け、コンポーネントのCSSより後に標準のFlexプロパティを書きます。項目の指定は `> *` や専用クラスで直下に限定すると、入れ子の中身に影響しません。

### 基準幅と伸び方

```html
<div class="p0005-layout card-layout">
  <div class="card-layout__featured">メインコンテンツ</div>
  <div>コンテンツ B</div>
  <div>コンテンツ C</div>
</div>
```

```css
/* p0005のCSSより後に追加 */
.card-layout > * {
  flex-basis: 12rem;
}

.card-layout > .card-layout__featured {
  flex-grow: 2;
}
```

`flex-grow: 2` は、その行の余った幅の取り分を2倍にします。項目全体の幅が必ず2倍になる指定ではありません。`.p0005-layout__full` を併用すると、その項目は全幅になります。

### 内容に合わせた幅で右揃えにする

```html
<div class="p0005-layout action-layout">
  <button type="button">戻る</button>
  <button type="button">保存する</button>
</div>
```

```css
.action-layout {
  --p0005-gap: 12px;
  align-items: center;
  justify-content: flex-end;
}

.action-layout > * {
  flex: 0 1 auto;
}
```

項目を伸ばさない設定にすると、`justify-content` で余白の配置を調整できます。長いラベルは折り返し、項目が収まらない場合は次の行に移ります。

### 縦並びにする

```css
.stack-layout {
  flex-direction: column;
  flex-wrap: nowrap;
}

.stack-layout > * {
  flex: 0 1 auto;
}
```

`.p0005-layout` に `.stack-layout` を追加します。縦並びでは `flex-basis` が高さに作用するため、`flex` も変更します。この例では全幅用の `.p0005-layout__full` は付けず、標準の `align-items: stretch` で横幅を揃えます。

## 入れ子にする

```html
<div class="p0005-layout" style="--p0005-gap: 32px;">
  <div>コンテンツ A</div>
  <div class="p0005-layout" style="--p0005-gap: 12px;">
    <div>コンテンツ B</div>
    <div>コンテンツ C</div>
  </div>
</div>
```

各 `.p0005-layout` で余白を初期化し、項目の幅は直下の要素だけに指定しています。外側の項目と内側の項目はそれぞれ調整できます。

## 内容と装飾

`.p0005-demo` はサンプル用の装飾です。実際のコンテンツに置き換えるときは、HTMLのクラスとSCSSの該当ブロックを削除できます。背景色や余白、画像サイズなどは、配置するコンテンツ側で定義してください。画像には `max-width: 100%; height: auto;`、横長の表などには必要に応じてスクロール用のラッパーを指定します。
