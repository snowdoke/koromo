const openButton = document.querySelector("#openCategoryList");
const closeButton = document.querySelector("#closeCategoryList");
const dialog = document.querySelector("#categoryDialog");
const list = document.querySelector("#categoryList");

// 現在のソート方法
let currentSort = "count";

// カテゴリをソート
function sortCategories(categories) {
  const sorted = [...categories];

  switch (currentSort) {
    case "asc":
      return sorted.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

    case "desc":
      return sorted.sort((a, b) =>
        b.name.localeCompare(a.name)
      );

    case "count":
    default:
      return sorted.sort((a, b) =>
        b.count - a.count
      );
  }
}

// カテゴリ一覧を生成
function renderCategoryList() {
  const sortedCategories = sortCategories(
    window.categoryData
  );

  list.innerHTML = `
        <div class="category_sort">
            <button
                type="button"
                class="category_sort_button"
                data-sort="count"
            >
                カウント順
            </button>

            <button
                type="button"
                class="category_sort_button"
                data-sort="asc"
            >
                A → Z
            </button>

            <button
                type="button"
                class="category_sort_button"
                data-sort="desc"
            >
                Z → A
            </button>
        </div>

        <ul class="category_list">
    ${sortedCategories
      .map(category => `
            <button
                type="button"
                class="category_list_item"
                data-category-keyword="${category.name}"
            >
                <div
                    class="category_list_name"
                    data-category-keyword="${category.name}"
                >
                    <span class="category_list_en">
                        ${category.name}
                    </span>

                    ${category.japanese
          ? `<span class="category_list_ja">(${category.japanese})</span>`
          : ""
        }
                </div>

                <span class="category_list_count">
                    ${category.count}
                </span>
            </button>
        `)
      .join("")}
</ul>
    `;

  updateSortButtonState();
}

// ソートボタンの選択状態を更新
function updateSortButtonState() {
  const buttons = list.querySelectorAll(
    ".category_sort_button"
  );

  buttons.forEach(button => {
    button.classList.toggle(
      "is-active",
      button.dataset.sort === currentSort
    );
  });
}

// カテゴリ一覧を開く
openButton.addEventListener("click", () => {
  renderCategoryList();
  dialog.showModal();
});

// ソートボタン
list.addEventListener("click", event => {
  const button = event.target.closest(
    ".category_sort_button"
  );

  if (!button) {
    return;
  }

  currentSort = button.dataset.sort;

  renderCategoryList();
});

// ダイアログを閉じる
closeButton.addEventListener("click", () => {
  dialog.close();
});
