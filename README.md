# WEB CAD — Drawing Studio

React + TypeScript + Vite 的瀏覽器 2D CAD 原型，目標是室內設計施工圖與外出行動編修共用的繪圖核心。

> **v1.0.0 技術原型／Chromium 瀏覽器回歸里程碑**：尚未通過施工圖正式驗收；圖面不可直接用於現場放樣或施工定稿。

## 本機執行

```bash
npm install --no-audit --no-fund
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

支援 Node.js 20.19+ 或 22.12+；首次進入可以點右側「載入示範平面圖」。

## 已支援

- 毫米模型空間、Canvas 畫布、滾輪游標中心縮放、中鍵平移、全圖縮放
- **W / WALL**：依中心線兩點與可設定牆厚（預設 120 mm）畫出單段封閉的雙線牆輪廓；尚無自動接角／門洞
- **O / OFFSET**：選取直線、圓、圓弧、矩形或直線段聚合線，指定偏移毫米距離及側邊點；保留來源，可重複偏移。
- **TR / TRIM**：Shift 多選裁切邊界（線、圓、ARC、矩形、聚合線、基本圖塊），點擊要刪除的直線、開放聚合線、ARC 或 CIRCLE 區段；整圓將轉成仍可編輯的原生 ARC，保留真實半徑和角度。
- **EX / EXTEND**：先選有限邊界（線、圓、ARC、矩形、聚合線、單層圖塊），再點擊欲延伸 LINE 的端點附近，延伸至最近交點。
- **F / FILLET**：選恰好兩條 LINE，輸入 mm 半徑，修剪端點與產生**原生 ARC 圓角**（可修改半徑與角度，匯出 DXF ARC）。
- **CHA / CHAMFER**：選兩條 LINE，輸入如 `100,150` 的兩個毫米距離，自動修剪直線並建立倒角連接線。
- **框選與批次編輯**：拖曳左→右選完全包含、右→左選交叉；Shift 累積選取、Ctrl+A 選所有可編輯物件；M/CO/RO/DELETE 一次作用於整組。
- `L` 直線、`PL` 聚合線、`REC` 矩形、`C` 圓、**`A`／`ARC` 三點建立真正圓弧**（起點、經過點、終點）
- **T / TEXT**：新增可編輯繁體中文文字圖元，設定字高、旋轉與圖層
- **DLI / DIMLINEAR**：水平／垂直投影尺寸；**DAL / DIMALIGNED**：兩點實際長度的斜向對齊尺寸
- **D / DIMSTYLE**：標準／細部樣式，可調整文字高度、箭頭、延伸線、精度與單位後綴
- 絕對 `3000,1500`、相對 `@3000,0`、極座標 `@2000<45`、方向距離 `1500` 輸入
- 物件鎖點：端點／中點／圓心及**交點**（支援有限直線段、矩形、聚合線、圓與原生 ARC 的相交）
- F3 鎖點、F8 正交，選取／刪除，Ctrl+Z／Ctrl+Y 復原／重做
- **選取單一或多個物件後**使用 `M` 移動、`CO` 複製、`RO` 旋轉，並可使用命令列輸入座標／角度
- 圖層新增、改名、顏色、線粗、線型（Continuous/Dashed/Center）、顯示與鎖定
- **B / BLOCK**：Shift+點選多個基本圖元 → 命名 → 指定基準點，建立單層圖塊定義及參照
- **I / INSERT**：從圖塊庫插入參照，可平移、複製、旋轉並保持共用定義；**X / EXPLODE** 分解
- 室內設計圖塊庫：雙人床、三人沙發、餐桌、單開門、平面窗（示意尺寸，單位 mm）
- 選取物件後設定圖層、顏色、線粗、線型，支援 ByLayer 覆寫
- localStorage 自動儲存、匯入／匯出 `.webcad.json`、可編輯的示範平面圖
- **ASCII DXF 2000 (AC1015) 匯入／匯出**：基本 2D 圖元、圖層、文字、單層圖塊與基本線性／對齊標註；匯入不支援的物件會提示略過數量，使用者確認後才取代工作區
- **PLOT／Ctrl+P（macOS ⌘P）定比例出圖**：A3/A4、橫／直向、固定 1:20/50/100/200/500、SVG 向量下載、瀏覽器列印／另存 PDF；使用 mm 頁面單位與實體線粗；超出紙張有效區域時禁止裁斷輸出。

支援 Shift 多選、框選與批次編修；**尚未支援** 完整 AutoCAD TRIM／OFFSET（多個圓弧缺口、封閉多邊形與高階選取模式等）、關聯式尺寸標註、BEDIT、巢狀／動態圖塊、DWG、完整 DXF／圖紙空間、完整 Layout、多頁圖紙、CTB/STB 及經施工驗收的 PDF 出圖。螢幕線粗與線型不代表實體出圖規格；本批需在列印對話框設定 100%、無邊界。

### 操作範例

1. 載入示範平面圖，選取一條家具線或矩形。
2. 指令列輸入 `M` → Enter，再輸入 `0,0` → Enter，`@300,0` → Enter，即可移動 300 mm。
3. 選取物件後輸入 `CO` → `0,0` → `@0,400` 可複製；輸入 `RO` → `0,0` → `90` 可旋轉 90°（逆時針）。
4. 選取物件後於右方物件屬性面板更改圖層、顏色覆寫、線粗和線型，檢查 ByLayer。
5. 用兩條交叉線驗證交點鎖點；按 F3 切換鎖點。
6. 輸入 `W`，設牆厚 `120 mm`，指定 `0,0` 與 `3000,0`，驗證牆身寬 120 mm。
7. Shift+點選兩個基本圖元 → B → 輸入名稱 → 指定基準點；輸入 I 插入新參照、X 分解選定參照。
8. 從右側預設圖塊庫插入家具或門窗，確認旋轉與圖層、原生 JSON 匯出／匯入後仍保留。
9. `T` → `廚房` → `1000,1500`，檢查繁中顯示與文字高度；`DLI` → `0,0` → `3000,0` → `1500,500`，應標註 `3000`。
10. `DAL` → `0,0` → `3000,4000` → `0,3500`，應標註 `5000`；`D` 可調整標註樣式。

### 進階編修指令（v0.8.0）

- `EX`：先 Shift／框選切割邊界 → 點擊待延伸 LINE 靠近目標端點的部分。
- `F`：先選兩條 LINE → 輸入 `100`，建立 **原生 ARC R100 圓角**；R0 接合為尖角。
- `CHA`：先選兩條 LINE → 輸入 `100,150`，保留兩個距離的斜角切除。
- 框選「左到右」僅納入完整包含的物件；「右到左」碰到即可納入。批次選取後可 MOVE／COPY／ROTATE／DELETE。詳細驗收請見 [`docs/ADVANCED_EDITING.md`](docs/ADVANCED_EDITING.md)，原生圓弧新增功能見 [`docs/ARC_NATIVE.md`](docs/ARC_NATIVE.md)。

### 常用編修指令（v0.7.0）

1. 選一條線 → `O` → `120` → 點擊上方 → 新增一條與原線相距 **120 mm** 的平行線；青色虛線預覽。
2. Shift 選兩條垂直的裁切邊界 → `TR` → 點擊橫線中央欲刪除部分，中心被修剪；金色虛線是裁切邊界。
3. 操作完成按 `Esc`，Ctrl+Z／Ctrl+Y 可逐步復原與重做；不支援的複雜輪廓會提示，不會強制產生錯誤圖元。
4. 詳細支援／限制：[精準編修與 OFFSET/TRIM 驗收文件](docs/PRECISION_EDITING.md)。

### v1.0.0 瀏覽器 E2E 與完整 CIRCLE 修剪

- **整圓 CIRCLE → ARC**：先 Shift 選擇跨越整圓的切割邊界（至少兩個真實有限交點），輸入 `TR`，點擊圓周上要刪除的區段。整圓自動轉成一條仍保留原中心、半徑、圖層和外觀的真實 ARC。相切或不交會時保持原圖。
- **Playwright Chromium E2E**：真實畫布滑鼠拖曳框選、Shift 選擇修剪邊界、指令列 LINE/ARC、批次 MOVE、Undo/Redo、JSON/DXF 下載與重新匯入；PR 的 GitHub Actions 自動執行。若需在本機執行，先安裝 Chromium 瀏覽器套件，再執行 `npm run test:e2e`。
- 此版本是第一個具備真實 Chromium 自動回歸的里程碑，**不表示 Safari／觸控／實體印表或 AutoCAD GUI 已驗證**。詳細測試與操作：[docs/BROWSER_E2E.md](docs/BROWSER_E2E.md)。

### 原生 ARC／DXF 圓弧（v0.9.0）

1. `A` → 點起點 `100,0` → 弧經過點 `0,100` → 終點 `-100,0`，得到圓心原點、R100 的上半圓（真正 ARC）。
2. 選兩條直角 LINE → `F` → `100`，新增原生 ARC，不再是折線近似；舊版已有的近似聚合線不會自動轉換。
3. Shift 選取裁切線／ARC 邊界 → `TR` → 點擊 ARC 的待刪除區段，剩餘兩側仍為 ARC。
4. DXF AC1015 的 ARC 群組 10／20（圓心）、40（半徑）、50／51（起止角）會雙向保存；跨越 0° 的圓弧如 350°→20° 也可正確處理。
5. 詳細規格與人工驗收：[原生 ARC 圓弧說明](docs/ARC_NATIVE.md)。

### DXF 交換注意事項

1. 先使用右上角「備份 JSON」保存原生 `.webcad.json` 主檔。
2. 點「匯出 DXF」可取得 ASCII DXF 2000；點「開啟」可選擇 JSON 或 ASCII DXF（10 MB 以下）。
3. 匯入不支援的 HATCH、SPLINE、MTEXT、bulge 聚合線弧段、縮放圖塊等圖元會跳過並提示，**請勿假設部分匯入的圖面完整**。
4. DXF 多行文字匯出後會拆成數個 TEXT，矩形會轉成封閉 LWPOLYLINE；圖塊保留 BLOCK/INSERT、線性尺寸使用 DIMENSION，但尚未在商用 AutoCAD 完成實際往返驗收。
5. 具體支援矩陣、單位換算與外部 CAD 驗收清單請讀 [`docs/DXF_INTERCHANGE.md`](docs/DXF_INTERCHANGE.md)。
6. CI 已包含獨立 `ezdxf` 解析器的雙向 DXF smoke test；這不是商用 AutoCAD 的正式互通性驗證。

### 定比例列印（v0.7.0）

- 右上點「比例出圖」，或輸入 `PLOT`／按 `Ctrl+P`；選 A3/A4、方向、比例（例如 1:50）、黑白／彩色。
- 產生以 mm 定義的向量 SVG；選「列印／儲存 PDF」將開新視窗，**必須由使用者在瀏覽器列印對話框選「儲存為 PDF」**，並設定 100%／無邊界／關閉頁首與頁尾。
- 超出畫幅的固定比例不會自動縮放或截斷，而會禁止下載／列印；請改比例或紙張。匯出前建議保留原生 JSON。
- 自動測試驗證 6000 mm 在 1:50 為紙上 120 mm；外部 CairoSVG + pypdf 驗證 A3 PDF 頁面 420×297 mm，但**仍需人工用瀏覽器列印及印表機量測確認**。
- 詳細操作與限制：[出圖及比例驗收說明](docs/PLOT_PRINTING.md)。

### GitHub Pages

1. Repository **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. Merge PR 到 `main` 後由 `.github/workflows/pages.yml` 執行單元測試、TS 建置、部署 `dist`。
3. 預期網址：<https://shinkureru.github.io/web-cad/>。

## 文件

- [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md) — 交接、測試、限制及接續版本
- [`docs/CAD_ENGINE_EVALUATION.md`](docs/CAD_ENGINE_EVALUATION.md) — Cota 評估與自製核心維護決策
- [`docs/DXF_INTERCHANGE.md`](docs/DXF_INTERCHANGE.md) — DXF 2000 交換子集、限制與驗收
- [`docs/PLOT_PRINTING.md`](docs/PLOT_PRINTING.md) — A3/A4、實體 mm 比例、SVG 與瀏覽器 PDF 出圖驗收
- [`docs/PRECISION_EDITING.md`](docs/PRECISION_EDITING.md) — OFFSET／TRIM 精準編修、快捷指令與限制
- [`docs/ADVANCED_EDITING.md`](docs/ADVANCED_EDITING.md) — EXTEND／FILLET／CHAMFER、框選與多物件操作
- [`docs/ARC_NATIVE.md`](docs/ARC_NATIVE.md) — v0.9.0 原生 ARC、三點定弧、DXF ARC、修剪及驗收
- [`docs/BROWSER_E2E.md`](docs/BROWSER_E2E.md) — v1.0.0 Chromium E2E、CIRCLE→ARC 修剪及人工驗收

## Cota 獨立可行性測試

可以在 Actions 手動執行 `Cota upstream feasibility (manual)`，嘗試針對固定版號的上游 Cota 產生靜態站點；此流程獨立運作，不修改目前 WEB CAD 主程式，也不等於已完成 DWG/DXF 往返測試。

## 技術與授權

目前所有原型繪圖碼均為本 Repo 自行實作，未複製 Cota 原始碼。若日後引入 Cota，必須依法保留 Apache-2.0 LICENSE、NOTICE 與著作權資訊。正式製圖前應另行驗證尺寸精度、中文字型一致性及 DWG/DXF 往返。此版字型使用系統 fallback，未嵌入字型；尺寸標註是非關聯式圖元。