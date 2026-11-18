# WEB CAD — PROJECT HANDOFF

更新：2026-11-18 ｜ 最新開發批次：v0.7.0 ｜ Repo：`shinkureru/web-cad`

## v0.7.0 — OFFSET／TRIM 常用精準編修

- GitHub 分支 `feat/v0.7.0-offset-trim`、PR #7，從已 Merge 的 v0.6.0 main 開發；**PR 由使用者 Merge，不直接修改 main**。
- `src/cad/precisionEdit.ts`：OFFSET 直線、圓、矩形與直線段聚合線；以點擊位置決定偏移方向，產生新物件，保留來源與圖層屬性。聚合線採 miter 接合，拒絕零長線段、180° 折返、自交與超長尖角；矩形向內塌縮／反轉時拒絕。
- TRIM：使用預選單個或多個裁切邊界（LINE/CIRCLE/PL/RECT、單層 BLOCK），點擊欲移除的 LINE／開放 PL 區段，透過有限真實交點拆分剩餘幾何；不修改裁切邊界。
- 指令 `O/OFFSET`：選物件→輸入距離（mm）→點選偏移側；可重複偏移或修改距離，Esc 結束。指令 `TR/TRIM`：Shift 選邊界→點選要移除的區段，可連續修剪、Esc 結束。
- `src/components/CadCanvas.tsx`：偏移預覽為青色虛線；TRIM 選取的切割邊界以金色虛線區別，編輯點選使用未經 OSNAP 投影的模型坐標。
- `src/cad/precisionEdit.test.ts`：水平／斜向偏移、圓與矩形、聚合線轉角、TRIM 中段／端段、圓／圖塊 cutter、鎖定／隱藏、JSON 與 Undo/Redo。原生格式 version 1 不變，舊圖可開。
- **限制**：封閉聚合線、RECT、CIRCLE 目前不能作為 TRIM 的目標（只能作為切割邊界）；無 ARC／Spline 曲線修剪、TRIM 延伸模式、巢狀圖塊、真實 DWG、精準施工圖驗收。
- 詳細測試與使用方式：`docs/PRECISION_EDITING.md`。

### Merge 後驗收

1. `npm test`、`npm run build` 全通過，再 Merge。
2. LINE `0,0 → 3000,0`、`O`、`120` → 點上方，應得 `0,120 → 3000,120`，原 LINE 保留。
3. 圓半徑 500 → `O` 距離 100 點外／內，分別得到半徑 600／400。
4. 橫向 LINE `0,0 → 3000,0`，兩條垂直 LINE 在 x=1000、2000 穿越；Shift 預選兩邊界→TR→點中間，保留左右 1000 mm、刪除中央區段。
5. 測試圖層鎖定與隱藏、零距離、錯誤交點，應提示並保留圖面；Undo/Redo／JSON／DXF 交換測試。
6. 在手機／桌面瀏覽器實際操作滑鼠選取、Esc、工具列捲動，尤其 TRIM 需點擊要移除的段落而非邊界交點。

### 下一批

`v0.8.0` 可優先規劃 EXTEND、FILLET、CHAMFER、框選與多選編輯；再逐步拓展封閉多邊形、ARC 等曲線拓撲編修。所有新功能需自動測試與外部 CAD 人工驗收。

---

## v0.6.0 — A4/A3 定比例向量出圖與瀏覽器 PDF 列印

- 本批分支 `feat/v0.6.0-scale-plotting`、PR #6，從已合併的 v0.5.0 main 接續，不直接更動 main。使用者驗收後再 Merge。
- `src/cad/plot.ts`：純 TypeScript 定比例 SVG（紙張物理 mm）、一頁式 A3/A4 直／橫圖框、1:20/50/100/200/500 固定比例、模型座標／紙張 mm 轉換、圖層／物件線粗（mm）、顏色／虛線、圖塊展開、文字與尺寸、圖名及圖示比例尺。
- `src/components/PlotDialog.tsx`：PLOT／Ctrl+P 出圖面板與 SVG 預覽、下載、瀏覽器列印。PDF 須由瀏覽器選「儲存為 PDF」；本批沒有直接下載 PDF 的 JS 引擎。
- 自動置中可見物件；超出圖紙有效範圍時禁止匯出／列印，不自動改變固定比例或默默截圖裁斷。
- `src/cad/plot.test.ts`：毫米紙張及比例、不同圖層顏色／線粗、可見性、圖塊、文字、標註、SVG 安全跳脫、超出阻擋。
- `.github/workflows/plot-interop.yml`、`scripts/validate_plot_pdf.py`：獨立 CairoSVG + pypdf 轉出 PDF，驗證 A3 紙張為 420×297 mm、6000 mm 在 1:50 為 120 mm。此驗證不代表 Chrome、Safari、實體印表機等所有列印系統的比例都已通過。
- 詳細流程與出圖限制請見 `docs/PLOT_PRINTING.md`。

### Merge 後驗收

1. CI：`npm test`（本批合計 62 項）、`npm run build`，以及獨立 PDF 物理尺寸 workflow 都通過。
2. 載入示範圖→PLOT，A3 橫向 1:50，確認圖框、房名、DLI/DAL、線粗及比例尺。
3. SVG 在向量工具核對 6000 mm → 120 mm（1:50）；改 1:100 應為 60 mm。
4. 用 A4 直向 1:20 測試過大圖面，應提示不可輸出；改為 1:100 重新預覽。
5. 瀏覽器「列印 → 儲存為 PDF」，關閉頁首／頁尾，100%、無邊界，檢查 A3 實體尺寸並以尺量圖示比例尺。
6. 切換圖層隱藏、線粗和色彩，確認 SVG／PDF 輸出正確。繁體中文請在不同作業系統驗收字型替代。

### 仍未完成

- 真正完整 Layout／Paper Space、多頁／自訂圖框、WINDOW 選框出圖、CTB/STB、文字字型嵌入與實體列印保證。
- 完整 DXF/DWG 相容性與 DWG 原生讀寫、尺寸關聯、OFFSET／TRIM、牆體自動接角／開門洞。
- 上游 Cota manual POC 仍未執行；本 Repo 仍採自主 React/Canvas 2D 核心。
- 目前列印有字型替換、瀏覽器預設列印縮放、紙張頁邊與印表機硬體可列印邊界等風險，需人工印表驗證。不能視為施工定稿工具。

---

## v0.5.0 — DXF 2000 匯入／匯出交換子集

- 分支 `feat/v0.5.0-dxf-interchange` → PR #5；使用者驗收後 Merge，禁止直接改 main。
- 新增 `src/cad/dxf.ts`：ASCII DXF AC1015 導出與讀取，HEADER 中 `$INSUNITS=4`，常用英制／公制單位可轉換為 mm；無單位警告，未知單位中止。
- 支援 LINE / CIRCLE / LWPOLYLINE（矩形轉封閉聚合線）、TEXT、基本圖層資訊（顏色／線粗／線型／隱藏／鎖定）、單層 BLOCK / INSERT、線性與對齊 DIMENSION 及有限 DIMSTYLE 設定。
- 繁體中文經 DXF `\\U+XXXX` 編碼；字型仍取決於系統 fallback，沒有 SHX／嵌入字體。
- 不支援弧線 bulge、ARC、MTEXT、SPLINE、HATCH、巢狀／縮放 INSERT、3D、外部參照、完整非關聯尺寸交互；被略過物件與原因會彙整顯示。
- `src/App.tsx` 新增匯出 DXF 按鈕、DXF / JSON 開啟、部分匯入的風險確認、交換紀錄；**原生 JSON 是可靠主檔，匯入覆蓋前須另外備份**。
- `src/cad/dxf.test.ts` 新增 DXF 正反向、英吋換算、圖塊多份 INSERT、標註、中文字元、失敗／略過警告的單元測試。
- 新增 `.github/workflows/dxf-interop.yml` 與 `scripts/validate_dxf.py`：GitHub Actions 以獨立 Python `ezdxf` 稽核 WEB CAD 產出、生成外部 DXF 並回交 WEB CAD 讀取，已完成雙向 smoke test。
- DXF STYLE 預設使用 `arial.ttf` TrueType 字型參照，文字內容以 Unicode 轉義編碼；跨系統仍要確認字型安裝／替代與繁中顯示。
- 詳細相容矩陣及第三方 CAD 驗收步驟：`docs/DXF_INTERCHANGE.md`。CI 通過不代表真正 AutoCAD 相容；仍需外部 CAD 實際開檔。

### 驗收流程

1. `npm test && npm run build`、PR CI 皆通過，之後再 Merge。
2. 載入室內示範平面圖，匯出 DXF → 外部 CAD 軟體開啟，量測 **6000 mm** 並確認圖層、中文字、尺寸線及圖塊。
3. 用外部 CAD 再另存 DXF，回 WEB CAD 匯入，核對單位、圖塊參照、尺寸標註、中文字及對齊方向。
4. 使用一張含 ARC、HATCH、SPLINE 或縮放 INSERT 的圖，確認導入前跳過警告；按取消不可改變現有畫布。
5. 匯出／匯入 JSON，檢查舊版 v0.1～v0.4 相容與原生圖元可復原。

### 尚未完成

- DWG 原生讀寫、完整 DXF 標準覆蓋、PDF 比例出圖、圖紙空間與標註關聯，仍屬後續批次。
- DXF 已通過獨立 `ezdxf` 雙向結構驗證；**仍待真實 AutoCAD、LibreCAD／QCAD、繁體中文字型、商用工程檔及完整尺寸樣式往返驗證**。
- Cota 上游手動構建 POC 尚未執行，不可宣稱已整合其 CAD 引擎。

---

## 專案方向與協作規則

同一 2D CAD 核心支援桌面室內設計施工圖與行動裝置檢視編修，最終目標是尺寸精確、CAD 快捷鍵相容、DWG/DXF 往返和可靠的施工圖出圖。

- 每批只在 `feat/vX.Y.Z-*` 開發，建立獨立 PR；使用者驗收／Merge，禁止直接修改 main。
- 新對話先核對 GitHub main/PR/Actions，再閱讀本交接文件、原始碼與測試。
- 目前仍屬 **2D 技術原型**，不得當作正式現場施工圖使用。
- 實際瀏覽器的字體繪製品質、幾何精度與出圖一致性需人工驗收；CI 單元測試不足以保證施工圖正確。

## 現有核心架構

- React 18、TypeScript、Vite 6、Canvas 2D；模型座標使用 mm。元件、圖層、文字、尺寸標註及尺寸樣式與畫布像素分離。
- `src/cad/types.ts`：`CadDocument.version=1`、幾何圖元、單層圖塊與參照、TextEntity、DimensionEntity、DimensionStyle。
- `src/cad/document.ts`：JSON 驗證、localStorage 格式、100 步還原；`dimensionStyles?` 與 `activeDimensionStyleId?` 為選填欄位，支援 v0.1–v0.3 圖面。
- `src/cad/annotations.ts`：線性／對齊標註純函式幾何；尺寸延伸線、箭頭、文字及精度／單位格式。
- `src/cad/geometry.ts`：座標轉換、鎖點、交點、選取；文字／尺寸具基本命中測試。
- `src/cad/editing.ts`：平移與旋轉文字／尺寸；任意角度旋轉水平／垂直尺寸時，轉換為對齊尺寸，避免誤算軸向投影。
- `src/cad/blocks.ts`：單層圖塊參照／分解及室內設計圖塊庫。**文字／尺寸尚不可加入圖塊定義**。
- `src/components/CadCanvas.tsx`：原生 Canvas 繪製文字、尺寸線、箭頭及預覽；文字使用本機／系統繁中字型 fallback。
- `src/App.tsx`：T、DLI、DAL、D 指令，文字與標註屬性、圖層與畫布、匯入匯出。
- `src/cad/walls.ts`：W/WALL 單段雙線牆輪廓，預設牆厚 120 mm；無自動接角與開洞。

## v0.4.0 新增

1. **T / TEXT / DT**：指令列先輸入文字，再指定放置點（滑鼠或 mm 座標）。文字是可編輯圖元，可設定高度、旋轉、圖層及顏色；使用繁中系統字型 fallback。
2. **DLI / DIMLINEAR**：依兩個標註點及第三個尺寸線位置建立水平／垂直投影標註。預設依兩點的主導軸判斷，可在選取物件後切換水平或垂直。
3. **DAL / DIMALIGNED**：兩點及第三個尺寸線位置，顯示兩點間真實斜向長度。
4. **D / DIMSTYLE**：內建「標準標註」「細部標註」兩種樣式；可改文字高度、箭頭大小、文字距離、延伸線間距／超出量、小數位數（0–3）及單位後綴。共用同樣式的尺寸會即時重新繪製。
5. 文字與尺寸支援 M/CO/RO、基本選取與屬性修改、Undo/Redo、原生 JSON 匯出／匯入；原圖層可鎖定／隱藏。
6. 載入室內示範圖面即有繁體中文字「客廳｜LIVING ROOM」、6000 mm 水平與 4200 mm 垂直尺寸。
7. `src/cad/annotations.test.ts` 增加幾何、格式、向下相容、物件變換、非法樣式驗證測試。

## v0.4.0 驗收順序

1. GitHub Actions: `npm test`、`npm run build` 全通過，再 Merge。
2. 新圖面：`T` → `廚房設備` → `1000,1500`；文字顯示、字高修改、移動與旋轉正常。
3. `DLI` → `0,0` → `3000,0` → `1500,500`，讀數 3000；若選「垂直」則變成 Y 投影量。
4. `DAL` → `0,0` → `3000,4000` → `0,3500`，讀數 5000。
5. `D` → 右側切換至「細部標註」、變更精度為 2、後綴為「 mm」；確認同樣式標註更新且幾何座標不變。
6. 載入示範圖：文字與兩處尺寸可見；全圖 Z、OSNAP、選取、鎖層及旋轉等操作正常。
7. 匯出 `.webcad.json` → 開啟同檔；樣式與文字內容皆保留；再匯入 v0.3 的檔案測試向下相容。
8. 在手機／平板與常見瀏覽器核對繁體中文字型 fallback（不同作業系統可能字體不同）。

## 已知限制與後續風險

- 目前尺寸是獨立非關聯式標註：修改被標示的牆線／家具，不會自動更新尺寸端點，需手動調整尺寸圖元。
- DLI 的方向預設來自兩點的主要軸；尚未支援 AutoCAD 完整互動提示、DIMCONTINUE、基線標註、角度、半徑、直徑、多重引線。
- 繪製中文字型依作業系統內建字型 fallback；沒有字型嵌入、字型管理、SHX 字體、文字精確出圖一致性或文字排版引擎。
- 文字命中與大小估計近似，未做逐字型測量、換行高階排版、文字樣式管理；仍需實測常用字型。
- 圖塊仍為單層、無動態／巢狀參照；文字和尺寸不可建成圖塊。
- 尚無 DXF/DWG 讀寫、PDF 比例出圖、圖紙空間；localStorage 非可靠工程檔資料庫，請定期手動匯出 JSON。
- `.github/workflows/cota-poc.yml` 只提供手動上游 Cota 靜態建置驗證流程，**未實際執行，更未驗證格式往返**。先測試後再決定採用 Cota。
- 負載測試與瀏覽器 E2E 尚未建置。CI 成功只保證既有單元測試與編譯通過，不代表全部互動驗收完成。

## 後續規劃

- `v0.5.0`：優先評估 DXF 匯入／匯出、樣式與標註圖元格式對應；再規劃 DWG、PDF 比例出圖。
- 視實際測試回饋追加：精準標註的軸向選取互動、參照式尺寸、字型管理／出圖、OFFSET/TRIM、牆體接角與門窗洞口。

詳細核心選型請見 `docs/CAD_ENGINE_EVALUATION.md`。
