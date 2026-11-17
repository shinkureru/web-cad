# WEB CAD — PROJECT HANDOFF

更新：2026-11-17 ｜ 最新開發批次：v0.5.0 ｜ Repo：`shinkureru/web-cad`

## v0.5.0 — DXF 2000 匯入／匯出交換子集

- 分支 `feat/v0.5.0-dxf-interchange` → PR #5；使用者驗收後 Merge，禁止直接改 main。
- 新增 `src/cad/dxf.ts`：ASCII DXF AC1015 導出與讀取，HEADER 中 `$INSUNITS=4`，常用英制／公制單位可轉換為 mm；無單位警告，未知單位中止。
- 支援 LINE / CIRCLE / LWPOLYLINE（矩形轉封閉聚合線）、TEXT、基本圖層資訊（顏色／線粗／線型／隱藏／鎖定）、單層 BLOCK / INSERT、線性與對齊 DIMENSION 及有限 DIMSTYLE 設定。
- 繁體中文經 DXF `\\U+XXXX` 編碼；字型仍取決於系統 fallback，沒有 SHX／嵌入字體。
- 不支援弧線 bulge、ARC、MTEXT、SPLINE、HATCH、巢狀／縮放 INSERT、3D、外部參照、完整非關聯尺寸交互；被略過物件與原因會彙整顯示。
- `src/App.tsx` 新增匯出 DXF 按鈕、DXF / JSON 開啟、部分匯入的風險確認、交換紀錄；**原生 JSON 是可靠主檔，匯入覆蓋前須另外備份**。
- `src/cad/dxf.test.ts` 新增 DXF 正反向、英吋換算、圖塊多份 INSERT、標註、中文字元、失敗／略過警告的單元測試。
- 詳細相容矩陣及第三方 CAD 驗收步驟：`docs/DXF_INTERCHANGE.md`。CI 通過不代表真正 AutoCAD 相容；仍需外部 CAD 實際開檔。

### 驗收流程

1. `npm test && npm run build`、PR CI 皆通過，之後再 Merge。
2. 載入室內示範平面圖，匯出 DXF → 外部 CAD 軟體開啟，量測 **6000 mm** 並確認圖層、中文字、尺寸線及圖塊。
3. 用外部 CAD 再另存 DXF，回 WEB CAD 匯入，核對單位、圖塊參照、尺寸標註、中文字及對齊方向。
4. 使用一張含 ARC、HATCH、SPLINE 或縮放 INSERT 的圖，確認導入前跳過警告；按取消不可改變現有畫布。
5. 匯出／匯入 JSON，檢查舊版 v0.1～v0.4 相容與原生圖元可復原。

### 尚未完成

- DWG 原生讀寫、完整 DXF 標準覆蓋、PDF 比例出圖、圖紙空間與標註關聯，仍屬後續批次。
- 自產 DXF 尚待真實 AutoCAD、LibreCAD／QCAD、繁體中文字型與工程檔往返驗證。
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
