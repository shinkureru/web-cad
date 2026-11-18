# WEB CAD — Drawing Studio

React + TypeScript + Vite 的瀏覽器 2D CAD 原型，目標是室內設計施工圖與外出行動編修共用的繪圖核心。

> **v0.7.0 技術原型**：尚未通過施工圖正式驗收；圖面不可直接用於現場放樣或施工定稿。

## 本機執行

```bash
npm install --no-audit --no-fund
npm run dev
npm test
npm run build
```

支援 Node.js 20.19+ 或 22.12+；首次進入可以點右側「載入示範平面圖」。

## 已支援

- 毫米模型空間、Canvas 畫布、滾輪游標中心縮放、中鍵平移、全圖縮放
- **W / WALL**：依中心線兩點與可設定牆厚（預設 120 mm）畫出單段封閉的雙線牆輪廓；尚無自動接角／門洞
- **O / OFFSET**：選取直線、圓、矩形或直線段聚合線，指定偏移毫米距離及側邊點；保留來源，可重複偏移。
- **TR / TRIM**：Shift 多選裁切邊界（線、圓、矩形、聚合線、基本圖塊），點擊要刪除的直線或開放聚合線區段；保留兩端與裁切邊界。
- `L` 直線、`PL` 聚合線、`REC` 矩形、`C` 圓
- **T / TEXT**：新增可編輯繁體中文文字圖元，設定字高、旋轉與圖層
- **DLI / DIMLINEAR**：水平／垂直投影尺寸；**DAL / DIMALIGNED**：兩點實際長度的斜向對齊尺寸
- **D / DIMSTYLE**：標準／細部樣式，可調整文字高度、箭頭、延伸線、精度與單位後綴
- 絕對 `3000,1500`、相對 `@3000,0`、極座標 `@2000<45`、方向距離 `1500` 輸入
- 物件鎖點：端點／中點／圓心及**交點**（支援有限直線段、矩形、聚合線、圓的相交）
- F3 鎖點、F8 正交，選取／刪除，Ctrl+Z／Ctrl+Y 復原／重做
- **選取單一物件後**使用 `M` 移動、`CO` 複製、`RO` 旋轉，並可使用命令列輸入座標／角度
- 圖層新增、改名、顏色、線粗、線型（Continuous/Dashed/Center）、顯示與鎖定
- **B / BLOCK**：Shift+點選多個基本圖元 → 命名 → 指定基準點，建立單層圖塊定義及參照
- **I / INSERT**：從圖塊庫插入參照，可平移、複製、旋轉並保持共用定義；**X / EXPLODE** 分解
- 室內設計圖塊庫：雙人床、三人沙發、餐桌、單開門、平面窗（示意尺寸，單位 mm）
- 選取物件後設定圖層、顏色、線粗、線型，支援 ByLayer 覆寫
- localStorage 自動儲存、匯入／匯出 `.webcad.json`、可編輯的示範平面圖
- **ASCII DXF 2000 (AC1015) 匯入／匯出**：基本 2D 圖元、圖層、文字、單層圖塊與基本線性／對齊標註；匯入不支援的物件會提示略過數量，使用者確認後才取代工作區
- **PLOT／Ctrl+P（macOS ⌘P）定比例出圖**：A3/A4、橫／直向、固定 1:20/50/100/200/500、SVG 向量下載、瀏覽器列印／另存 PDF；使用 mm 頁面單位與實體線粗；超出紙張有效區域時禁止裁斷輸出。

支援 Shift 多選以建立圖塊，但編修工具仍只操作最後選取的物件；**尚未支援** 完整 AutoCAD TRIM／OFFSET（弧線／封閉輪廓等）、關聯式尺寸標註、BEDIT、巢狀／動態圖塊、DWG、完整 DXF／圖紙空間、完整 Layout、多頁圖紙、CTB/STB 及經施工驗收的 PDF 出圖。螢幕線粗與線型不代表實體出圖規格；本批需在列印對話框設定 100%、無邊界。

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

### 常用編修指令（v0.7.0）

1. 選一條線 → `O` → `120` → 點擊上方 → 新增一條與原線相距 **120 mm** 的平行線；青色虛線預覽。
2. Shift 選兩條垂直的裁切邊界 → `TR` → 點擊橫線中央欲刪除部分，中心被修剪；金色虛線是裁切邊界。
3. 操作完成按 `Esc`，Ctrl+Z／Ctrl+Y 可逐步復原與重做；不支援的複雜輪廓會提示，不會強制產生錯誤圖元。
4. 詳細支援／限制：[精準編修與 OFFSET/TRIM 驗收文件](docs/PRECISION_EDITING.md)。

### DXF 交換注意事項

1. 先使用右上角「備份 JSON」保存原生 `.webcad.json` 主檔。
2. 點「匯出 DXF」可取得 ASCII DXF 2000；點「開啟」可選擇 JSON 或 ASCII DXF（10 MB 以下）。
3. 匯入不支援的 ARC、HATCH、SPLINE、MTEXT、bulge 弧線、縮放圖塊等圖元會跳過並提示，**請勿假設部分匯入的圖面完整**。
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

## Cota 獨立可行性測試

可以在 Actions 手動執行 `Cota upstream feasibility (manual)`，嘗試針對固定版號的上游 Cota 產生靜態站點；此流程獨立運作，不修改目前 WEB CAD 主程式，也不等於已完成 DWG/DXF 往返測試。

## 技術與授權

目前所有原型繪圖碼均為本 Repo 自行實作，未複製 Cota 原始碼。若日後引入 Cota，必須依法保留 Apache-2.0 LICENSE、NOTICE 與著作權資訊。正式製圖前應另行驗證尺寸精度、中文字型一致性及 DWG/DXF 往返。此版字型使用系統 fallback，未嵌入字型；尺寸標註是非關聯式圖元。