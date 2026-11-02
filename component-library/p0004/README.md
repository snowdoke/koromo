# p0004 — Gridレイアウト

親の幅に応じて列数を自動調整する、CSS Gridのレイアウトです。JavaScriptや共通SCSSへの依存はありません。

## 基本の使い方

ページに `{{ p0004 }}` を記述し、front matterの `pageCss` を指定して `npm run expand` を実行します。展開後はサンプルの内容を置き換えてください。

`.p0004-layout` の直下の要素が項目になります。タグや項目数は自由で、項目用のクラスは必須ではありません。

```html
<div class="p0004-layout">
  <div>コンテンツ A</div>
  <div>コンテンツ B</div>
  <div>コンテンツ C</div>
  <div class="p0004-layout__full">全列をまたぐコンテンツ</div>
</div>
```

標準は最小列幅 `16rem`、余白 `24px` の均等配置です。親が最小列幅より狭い場合も1列で収まります。表示順・読み上げ順はHTMLの順序を保ちます。全幅要素を置くと、内容のない列もその要素が占有するため、残りの項目が少なくても列は維持されます。

## 調整できるCSS変数

| 変数                | 初期値                                                             | 用途                                             |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| `--p0004-min-width` | `16rem`                                                            | 自動配置時の最小列幅                             |
| `--p0004-gap`       | `24px`                                                             | 行・列の余白。`16px 32px` のように別々に指定可能 |
| `--p0004-columns`   | `repeat(auto-fit, minmax(min(100%, var(--p0004-min-width)), 1fr))` | 列数・幅・比率の指定                             |

HTMLの `style` 属性、またはコンポーネントのCSSより後に書く追加クラスで上書きします。

```html
<div class="p0004-layout" style="--p0004-min-width: 12rem; --p0004-gap: 16px 24px;">
  <div>コンテンツ A</div>
  <div>コンテンツ B</div>
</div>
```

### 列数や比率を指定する

`--p0004-columns` を指定すると、自動列数の代わりにその列構成を使います。固定列数を使う場合は、必要な幅で1列に戻す設定も用意します。

```html
<div class="p0004-layout content-layout">
  <div>メインコンテンツ</div>
  <aside>補足コンテンツ</aside>
</div>
```

```css
/* p0004のCSSより後に追加 */
.content-layout {
  --p0004-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 769px) {
  .content-layout {
    --p0004-columns: minmax(0, 2fr) minmax(0, 1fr);
    /* 均等な3列にする場合：repeat(3, minmax(0, 1fr)) */
  }
}
```

ブレイクポイントは配置先に合わせて変更してください。狭いサイドバーなどにも配置する場合は、標準の自動列数が使えます。

### 入れ子にする

```html
<div class="p0004-layout" style="--p0004-min-width: 24rem; --p0004-gap: 32px;">
  <div>コンテンツ A</div>
  <div class="p0004-layout" style="--p0004-min-width: 10rem; --p0004-gap: 12px;">
    <div>コンテンツ B</div>
    <div>コンテンツ C</div>
  </div>
</div>
```

各 `.p0004-layout` で変数の初期値を設定するため、親の列幅・余白・列構成は入れ子のレイアウトへ引き継がれません。

## 内容と装飾

`.p0004-demo` はサンプル用の装飾です。実際のコンテンツに置き換えるときは、HTMLのクラスとSCSSの該当ブロックを削除できます。背景色や余白、画像サイズなどは、配置するコンテンツ側で定義してください。画像には `max-width: 100%; height: auto;`、横長の表などには必要に応じてスクロール用のラッパーを指定します。
