# WEB CAD — PROJECT HANDOFF

更新：2026-11-18 ｜ 最新開發批次：v1.3.0 ｜ Repo：`shinkureru/web-cad`

## v1.3.0 — 可鍵入的動態 HUD 與半徑、直徑、圓弧角度／弧長尺寸標註

### 版本與協作

- 2026-11-18 使用者要求繼續下一個批次，按前一批後續方向定義 v1.3.0：真正可鍵入的游標旁距離／角度、曲線尺寸標註，以及 JSON／DXF／SVG/PLOT 相容性與 E2E。
- 經 GitHub 核實 PR #12 已合併，最新 main SHA 15eba34121dd9a256f2180e17e81b1b9c77267fb；新分支 feat/v1.3.0-curve-dimensions-dynamic-hud，對應 PR #13。只在新分支實作，使用者自行驗收和 Merge，**嚴禁直接更新 main**。
- package.json 版本為 1.3.0；WEB CAD Native Document version:1、單位 mm、DXF AC1015 保持不變。但含新 curveDimension 的 JSON **不一定能被舊版 WEB CAD 認得**。

### 技術與功能

- src/cad/dynamicInput.ts、src/components/CadCanvas.tsx：第一繪圖點存在時，游標旁的 HUD 從 v1.2.0 只讀長度／角度擴充成兩個真正可輸入欄位。畫布按 Tab／F2 可以進入長度欄；長度支援 mm/cm/m 或預設單位，角度為度、可留空沿游標方向；按 Space／Enter（依 v1.1 使用者確認鍵設定）或「套用」後，交給既有 onPoint 繪製流程。Escape 返回畫布，不攔截原生系統快捷。
- src/cad/types.ts：新增 CurveMeasure = radius／diameter／angle／arcLength 及 CurveDimensionEntity(kind:curveDimension)；存圓心、半徑、標註文字位置、標註樣式 ID，以及弧角（如需）。這是一個**非關聯式的幾何快照**，來源圓弧編輯後不會自動更新；無依賴來源 ID。
- src/cad/curveDimensions.ts：純幾何 makeCurveDimension、curveDimensionPicture、curveDimensionExtents。R 和 Ø 有圓心、直徑線／引線、箭頭；DAN 以 arcSweep 正向逆時針跨度呈現度數；DAR 以半徑 × 弧度跨度呈現模型 mm 弧長，使用真弧線及箭頭。跨 0°（350→20）正確為 30°；文字依既有 DIMSTYLE 精度、字高、間距計算，角度顯示 °，其餘顯示 R／Ø／⌒。
- 命令列／UI：DRA/DIMRADIUS、DDI/DIMDIAMETER 允許 CIRCLE／ARC，DAN/DIMANGULAR 和 DAR/DIMARC 只允許單一 ARC。先選取來源再啟動命令或點右側物件資訊按鈕，然後點畫布或輸入絕對座標 X,Y 放置標註。可 Undo/Redo、選取、移動與旋轉。
- src/cad/document.ts：JSON schema 嚴格驗證新 curveDimension 的半徑、坐標、模式、角度與 styleID，不接受退化 ARC 或缺少樣式。標註維持獨立圖元，可於相同 CAD Undo history 內管理。
- src/cad/plot.ts、src/components/CadCanvas.tsx、src/cad/geometry.ts、src/cad/grips.ts、src/cad/editing.ts：完整渲染/選取/尺寸範圍/夾點移動、平移旋轉與 SVG 真向量 ARC/文字/箭頭。PLOT 真實紙張比例不變。
- src/cad/dxf.ts：匯出曲線尺寸時**拆分成 LINE、ARC、LWPOLYLINE、TEXT**，匯出警告「重新匯入後不再是原生標註」。未宣稱 AutoCAD 原生 DIMRADIUS、DIMANGULAR、DIMARC DXF 往返，也不默默遺失標註外觀。
- 22 個可編輯 CAD 簡碼新增 4 個，現在 **26 個**，既有 v1.1 Space／Enter、cm 設定和完整指令仍有效。
- src/styles.css 新增游標旁可鍵入表單及右側曲線尺寸操作小區塊；README、docs/CURVE_DIMENSIONS.md、docs/GEOMETRY_WORKFLOW.md、docs/KEYBOARD_AND_UNITS.md 更新。

### 自動測試與 CI

- 新增 src/cad/curveDimensions.test.ts **12 項**，總計 **161／161 Vitest 測試成功**：精確長度角度、無效輸入拒絕、R/Ø、弧長、CCW 弧角跨 0°、來源快照不變、JSON schema、PLOT SVG、DXF 顯示/警告、變換、夾點及 Undo/Redo。
- e2e/cad.spec.ts 新增三條 Chromium 實際操作：可在游標 HUD 鍵入 350cm／90° 直接出線；真實畫布選 CIRCLE，DRA 建原生曲線尺寸並 Undo；選 ARC 分別 DAR/DAN 建弧長和角度尺寸。總共 **14／14 Playwright E2E 通過**。
- GitHub Actions 針對 PR #13 的 Build/test/TS/Vite、Chromium E2E、獨立 Python ezdxf 雙向互通、向量 PLOT/PDF 實際頁面尺寸四個 workflow 均需在**最新 HEAD** 再度確認 success。先前程式提交均已綠燈，文件追加 commit 需重新核對。
- 檔案說明：docs/CURVE_DIMENSIONS.md 詳列操作、模型語意、不能自動連動的重要限制和手動測試。

### Merge 後人工驗收

1. L → 0,0 → 畫布 Tab/F2 進 HUD → 長度 350cm、角度 45° → Space／Enter 或「套用」，終點約 (2474.874,2474.874) mm；Ctrl+Z 一次復原。
2. CIRCLE 圓心 (2400,1500)、R500：單選圓 → DRA 點 (2950,2100) 得 R500；DDI 得 Ø1000。
3. ARC 中心 (2400,1500)、R500、0°→180°：DAR 得 ⌒1571、DAN 得 180°。35° 跨 0° 圓弧應以 CCW 真實跨度計算。
4. 對來源圖形改動半徑，舊標註不會自動變更；應人工重新量測。測試選取標註、拖曳文字位置夾點、MOVE/ROTATE、Undo/Redo。
5. 備份 JSON 再讀回，新 curveDimension 完整保留；DXF 匯出時必須明確顯示拆分警告，重新匯入只能剩普通 2D 圖元。使用外部 CAD GUI 檢查 R/Ø/弧線文字，以及中文字型。
6. PLOT A3/1:50 SVG／PDF 要檢查裁切、字型與量測結果，不能只憑 CI 宣稱施工認證。
7. 回歸舊版 LINE/PL/ARC、F3 OSNAP、F8 正交、Space/Enter、cm/mm、既有線性尺寸 DLI/DAL；Safari/Firefox/行動觸控/繁中 IME 未完整實機驗證。

### v1.4.0 可依需求接續

優先：關聯式尺寸標註與來源引用（含變更追蹤），兩條 LINE 的一般 DIMANGULAR，更多 DXF 原生 DIMENSION 轉換，LWPOLYLINE bulge／橢圓與 DXF 相容性，最後補充多瀏覽器 Playwright 回歸。保持「一批 → PR → 使用者 Merge → 下一批」。

---

## v1.2.0 — 動態距離／角度、夾點編輯、精準屬性與 OSNAP

### 版本協作與來源

- 2026-11-18 使用者確認繼續 v1.2.0，沿用前一批規劃：動態尺寸輸入、可拖曳物件夾點、精確幾何屬性、強化 OSNAP，並補充真實 Chromium 操作回歸。
- 確認 PR #11 已合併，main SHA 4d0200d7089978dbe02d0ed8fb06ed167944bcd1；從 main 建立 feat/v1.2.0-dynamic-input-grips-precision，建立 PR #12。所有修改仍留在分支，**由使用者自行驗收 Merge；禁止直接修改 main**。
- package.json version 更新為 1.2.0。CAD document version:1、模型 mm、DXF AC1015、圖層／圖塊資料格式不改變；v1.1.0 cm/mm 輸入偏好及 Space/Enter 確認維持相容。

### 完成內容

- src/cad/commands.ts：在原本 @距離<角度 的相對極座標之外新增 350cm<45、350cm<90 等無 @ 的「基準點後指定距離＋角度」語法。保留 @、mm/cm/m、方向標量和世界座標 0.001 mm 精度；沒有基準點時不能使用極座標。
- src/components/CadCanvas.tsx：移動滑鼠時，當已有繪圖上一點、尺寸標註基準點或 MOVE/COPY 基準點，在游標附近浮動顯示模型長度及角度 HUD，依所選 cm/mm 偏好顯示。它**是畫布讀數提示，不是游標旁可直接編輯的多輸入欄**，真正數字仍由命令列輸入。
- src/cad/grips.ts：新增純幾何 entityGrips/moveGrip/commitGrip；支援 LINE 起/終點及中點平移、POLYLINE 頂點（封閉首尾同步）、RECT 四角、CIRCLE 圓心/半徑、ARC 圓心/半徑/弧起終角、TEXT/INSERT 插入點及 DIMENSION 控制點。保護鎖定/隱藏圖層、退化半徑、零長度與重合頂點；一次滑鼠放開只提交一次 Undo。
- src/components/CadCanvas.tsx：選取單件可編輯圖元時繪製藍色方形夾點；按下並拖曳時，先以青色虛線預覽更新後的幾何，放開才存入模型。TRIM/EXTEND/OFFSET/多選等模式暫停夾點互動，避免衝突；保留中鍵平移、左右框選與原有點擊選取。
- src/cad/grips.ts editGeometry/commitGeometry 與 src/components/GeometryProperties.tsx：右側精確編輯 LINE 的起終 X/Y、長度及角度；RECT 的對角位置、寬高；CIRCLE/ARC 圓心半徑；TEXT/INSERT 插入點。輸入 mm/cm/m 或當前預設單位，按 Enter 或失焦才提交，單次 Undo；LINE 改長度維持起點及方向，改角度維持起點及長度。
- src/cad/geometry.ts 與 types.ts：OSNAP 新增 CIRCLE/ARC 真實象限點（只有實際弧角跨度的象限才可吸附）和相對目前繪圖基準點在有限 LINE/PL/RECT 上的垂足。其他端點、中點、圓心、交點繼續支援；F3 控制開關。
- README、docs/GEOMETRY_WORKFLOW.md 補充詳細指令、模型安全條件、夾點拖曳、右側數值設定和人工測試步驟。

### 自動驗證

- 新增 src/cad/grips.test.ts 共 15 項：距離角度 mm/cm、夾點編修、LINE/RECT/CIRCLE/ARC/POLYLINE、鎖層、幾何退化、Undo/Redo、JSON/DXF 及新 OSNAP；原生 Vitest 總計 **149/149**。
- e2e/cad.spec.ts 新增 3 組 Chromium Playwright：350cm<90、右側精確 LINE 長度 350cm 後 Undo，以及真正從畫布拖曳 LINE 終點／Undo；全套 E2E 總計 **11/11**。
- 已有 TypeScript/Vite 正式建置成功；相關綠燈工作流程可於 PR #12 檢查。正式 Merge 前仍需確認最新 HEAD 對應的 build + Chromium E2E 都成功（不是舊 commit 的 CI 結果）。

### Merge 後人工驗收

1. L → 0,0 → 350cm<45，終點應約 (2474.874,2474.874) mm；畫圖滑鼠移動需顯示長度、角度提示。
2. 選 LINE 0,0→3000,0，應顯示起點／終點／中點藍色夾點；拖曳終點至 3500,0，Ctrl+Z 一次還原；中點應平移整線。
3. 選 LINE，右側輸入 350cm 長度，原起點/角度不變，終點改為 3500,0；改角度 45°，長度保持不變。
4. 選 CIRCLE R500，拖動半徑夾點及在右側輸入 60cm，應得到 R600；鎖層不可拖曳。
5. POLYLINE 封閉首尾、RECT 四角、ARC 半徑／端角，以及 TEXT/INSERT 插入點應可改，不能出現零長線或寬高塌縮。
6. F3 開 OSNAP，畫線接近圓/弧的 0°／90°／180°／270° 象限與線段垂足，應正確吸附、不能吸附隱藏／不存在曲線。
7. 複查 v1.1.0 Space/Enter、cm 輸入／自訂快捷／繁中 IME；JSON、DXF、PLOT 出圖不要因新幾何操作受損。

### 尚未完成

- 游標旁可以直接鍵入長度與角度的真正多欄動態輸入面板、Grip 進階選單、多點幾何約束；弧長/角度/半徑尺寸標註（DIMENSION schema 尚未擴增）、曲線切點 OSNAP、完整 AutoCAD 插件快捷與 DWG。
- Chromium 自動測試和 TS/Vite 通過不等於 Safari、Firefox、觸控、實際 AutoCAD GUI 或施工圖尺寸驗證已完成。
- 後續批次可依使用者實測回饋優先加入真正動態可鍵入的 HUD、弧長/角度標註及更完整 OSNAP，協作維持使用者 Merge 一批後才繼續下一批。

---

## v1.1.0 — 可編輯快捷指令、Space 確認與 mm／cm 精準輸入

### 來源與協作規範

- 使用者於 2026-11-18 回報：習慣用 Space 確認而非 Enter、網頁版 CAD 會和瀏覽器及 OS 快捷鍵衝突、輸入公分數沒有反應。要求下一批 v1.1.0 直接實作。
- PR #10 已合併；由最新 main SHA 903baf5396c69d5d41ba6a8895ea69a16bced71f 開獨立 feat/v1.1.0-keyboard-cm-input-settings，對應 PR #11。使用者完成測試後自行 Merge；**未直接修改 main**。
- package.json 更新至 1.1.0；原生 JSON version 1、DXF mm 和圖元原座標／幾何完全不變。本批的偏好只存在瀏覽器 localStorage（web-cad:v1:preferences），不寫入模型檔。

### 實作內容

- src/cad/commands.ts：新增 InputUnit、parseLengthInput、unitToMm。原本只接受純數字 mm；現在可輸入 mm/cm/m 或 毫米/公分/公尺 的明確長度。12.34cm=123.4mm、1.23456cm=12.346mm（0.001mm 精度）。支援混合座標 300cm,150mm、相對 @30cm,10cm、極座標 @30cm<45 與沿滑鼠方向的單一長度。沒有單位後綴時使用使用者選定的輸入預設 mm 或 cm（預設 mm 避免舊圖和舊指令意外放大）；世界模型永遠 mm。
- 命令解析接線：LINE、PL、REC、WALL、CIRCLE、ARC 與尺寸標註點位、BLOCK 插入點、MOVE/COPY／絕對或相對座標，都使用新 parsePointInput；OFFSET 距離與 FILLET 半徑、CHAMFER 兩側距離改用 parseLengthInput；旋轉角度仍是度，不改變長度精度。
- 可見數值：工具列 WALL 牆厚與新增 TEXT 高度能依 mm／cm 設定顯示並以 mm 儲存；狀態列顯示輸入單位、模型 mm，游標座標會依所選單位顯示；其他既有標註樣式／物件屬性目前仍使用 mm（不變更物件模型）。
- src/cad/preferences.ts：預設 both（Space 與 Enter 都可確認）、mm，22 項常見 CAD 指令主要短碼可重新命名、保留英文全名；自訂別名替換該指令原本主要短碼，並拒絕和其他 CAD 指令／預設 alias、保留鍵、重複代碼衝突。偏好存本機，支援異常設定安全回退；不實作任意 Ctrl／Alt／Meta 系統組合鍵映射。
- src/components/CadSettingsDialog.tsx、src/styles.css：新增上方「設定」按鈕、可儲存的深色高對比設定面板，確認鍵兩者/空白/Enter、單位 mm/cm、22 項自訂簡碼與衝突警告、恢復預設。手機版設定面板單欄捲動。
- src/App.tsx：改為對 command input、焦點在 CAD Canvas 和 body 區域處理 Space/Enter 確認；文字及圖塊名稱階段保留 Space 並使用 Enter 完成、IME composing/229 不誤送出；TEXT 不裁除尾端合法空白。
- 衝突策略：不再攔截 Ctrl／Command+P（瀏覽器原生列印）；PLOT 仍可使用指令或上方比例出圖按鈕。Ctrl／Command+L/T/W/R/S/F 等由瀏覽器處理；CAD Ctrl／Command+A/Z/Y 限 Canvas/body 焦點，輸入框中仍為原生文字操作。F3/F8 僅在 Canvas 有焦點時切換，canvas tabIndex=0 並於點擊時取得焦點。設定對話框與 PLOT/HELP 模態視窗不攔截一般 CAD 鍵；普通按鈕保持原生 Space 操作。
- src/cad/preferences.test.ts：新增 10 項單元測試；src/cad 舊測試保持 124/124，現在總計 **134/134**（含公分換算精度、極座標、輸入法／網頁按鍵排除與設定驗證）。
- e2e/cad.spec.ts：原有 4 組 Chromium 端對端回歸，新增 4 組：Space 真的確認 CAD 指令、明確 cm 精確座標；設定自訂 Q→LINE 並設 cm 後重載；衝突警告與繁中 TEXT 空格（含尾端空格）保留；瀏覽器 Ctrl 组合不攔截、普通輸入框正常。共 **8 組真瀏覽器 E2E**。
- README、docs/KEYBOARD_AND_UNITS.md 與 docs/PLOT_PRINTING.md 已同步修正原來 Ctrl+P=CAD PLOT 的過時說明。

### PR #11 Merge 驗收清單

1. 兩個 GitHub workflow 對應 PR 最新 SHA：Build, test and deploy 跑 npm test 134/134、npm run build TypeScript/Vite；Chromium browser E2E smoke 跑 8/8 Playwright。**確認兩項皆 success 才 Merge**。
2. 預設 both：在 CAD 指令列輸入 L + 空白、0,0 + 空白、300cm,0 + 空白，應得到 3000 mm 直線。
3. 切換偏好預設 cm：在沒有後綴時打 300,0，應也是 3000,0 mm；偏好改回 mm 就變成 300,0 mm。切換不能修改已存圖面座標。
4. OFFSET 12.5cm 應偏移 125 mm；FILLET 10cm 應建立 R100 mm 真圓弧；CHAMFER 10cm,15cm 則兩端偏移分別 100/150 mm。
5. 自訂 LINE 主要簡碼 L→Q、TR→TT，儲存與重載後 Q/TT 生效；LINE/TRIM 英文全名仍可執行；改成其他指令既有代碼或系統保留鍵應顯示衝突。
6. 輸入繁體中文 TEXT「客廳 A B」時可用空白、沒有誤送出；文字輸入完用 Enter、再輸入座標用 Space 完成。中文 IME 選字／組字時需人工補測。
7. 檢查在 Canvas 內 F3/F8、Ctrl/Command+Z/Y/A 確實作用；點一般文字欄使用 Ctrl/Command+Z、A 不會操作 CAD；Ctrl+P 為瀏覽器原生列印，而 CAD PLOT 仍由工具列按鈕／PLOT 命令開啟。
8. Chrome 通過仍不代表 Safari／Firefox／行動觸控／所有輸入法及真實 AutoCAD／施工圖精度已驗證。

### 待續

v1.2.0 可先依使用者手動測試修正鍵盤操作細節，再考慮弧長／半徑／角度標註、端點夾點、Polyline bulge 與進一步跨瀏覽器鍵盤回歸。Web CAD 仍是可測試的 2D 原型，不能直接當施工定稿。

---

## v1.0.0 — Chromium 瀏覽器 E2E 與 CIRCLE→ARC 修剪里程碑

- **GitHub 協作**：PR #9 已於 main 合併；從 main SHA 359680765da7da963eb56f57ebaa964be58cbe17 建立獨立分支 feat/v1.0.0-browser-e2e-circle-trim → PR #10。只透過 PR 提交，使用者自行驗收／Merge；**不直接修改 main**。
- **定位**：版本名稱 v1.0.0 代表首個涵蓋 Chromium 真實瀏覽器操作的回歸里程碑，**不表示達到 AutoCAD 商用軟體或正式施工圖認證**。原生 .webcad.json 的版本欄位仍為 1；既有圖紙向下支援。
- **幾何**：src/cad/arcs.ts 新增 circlePrimitiveIntersections 和 trimCircle；求完整 CIRCLE 與有限 LINE、POLYLINE、RECT、CIRCLE、ARC 相交的解析式交點，依點擊位置刪除圓周上相鄰兩交點間的區段，剩餘轉成**一條真正 ARC**。來源 ID、圓心、半徑、圖層、顏色／線粗／線型保存。
- **保護**：至少兩個不同有效交點；切線單一交點、共圓重合、無限線延伸卻實際不交會、圓心誤點、圖層隱藏／鎖定一律拒絕，不破壞原圖；每筆 TRIM 是一個 Undo 步驟。
- **核心對接**：src/cad/precisionEdit.ts 的 trimDocument 現在接受 CIRCLE 目標；其餘 ARC、LINE、開放 POLYLINE TRIM 維持既有行為。新 ARC 沿用 v0.9.0 的 DXF AC1015 ARC 與 SVG/PLOT 出圖能力。
- **單元測試**：src/cad/circleTrim.test.ts 新增 11 項完整圓解析式裁切、有限交點、兩圓相交、單一相切拒絕、圖層保護、JSON/DXF 與 Undo/Redo 測試。總單元數為 **124 項**。
- **真瀏覽器 E2E**：新增 @playwright/test、playwright.config.ts、e2e/cad.spec.ts；4 條真 Chromium 流程：實際指令列 LINE/ARC、Undo/Redo、JSON 下載與 GUI 匯入、畫布 window/crossing 拖曳、多選 MOVE、Shift 選 TRIM 邊界點擊整圓轉 ARC、DXF 匯出並由 GUI 重新匯入、PLOT 對話框。
- **GitHub Actions**：.github/workflows/browser-e2e.yml：PR/main 觸發，安裝 headless Chromium、跑 npm run test:e2e，失敗時保留 trace／截圖／HTML。修正 Vite 6 與 Vitest 2 的型別版本衝突：vite.config.ts 保留 Vite 設定，另新增 vitest.config.ts 限定只跑 src/**/*.test.ts。
- **版本及文件**：package.json 設為 1.0.0；README、docs/ARC_NATIVE.md、docs/PRECISION_EDITING.md 更新，新增 docs/BROWSER_E2E.md 說明完整流程／注意事項，.gitignore 忽略 Playwright 報告。
- **驗證記錄**：在 PR #10 分支已確認 124/124 Vitest 單元測試、TypeScript/Vite 正式建置與 4/4 Chromium E2E 真瀏覽器流程成功。舊 DXF ezdxf 與 A3 PDF 物理單位流程未因本批變更格式，但仍應以該 workflow 重新跑或人工比對關鍵圖紙。

### v1.0.0 Merge 前後驗收

1. 檢查最新 HEAD 對應 GitHub Actions 的 Build, test and deploy 與 Chromium browser E2E smoke 兩個 workflow **均為 success**，不只看舊版綠燈；本批保持 PR #10 開啟等待使用者 Merge。
2. 模型空間 CIRCLE 圓心 (2400,1500)、R500，兩條 x=2150 / x=2650 的垂直裁切線：Shift 選線 → TR → 點頂端 (2400,2000)，原 CIRCLE 應變單一 ARC，起角 120°、終角 60°（300° 大弧）；兩條邊界保留。
3. 嘗試只有一個切點的切線、未與圓相交的短線及鎖定／隱藏圖層，必須拒絕且不改圖。測試 Undo 一次回到 CIRCLE，再 Redo 回 ARC。
4. 桌面真實 Chromium 框選：左→右需完整包含、右→左交叉即選；多選 2–3 個物件移動後一次 Undo 還原；Escape 可離開 TRIM。
5. 從真實介面下載／匯入 JSON 主檔及 DXF 2000；在 Autodesk AutoCAD／LibreCAD/QCAD **人工**開啟，確認 CIRCLE 剩餘是可編輯的 ARC，半徑、角度、圖層與印出比例不變。
6. Safari、Firefox、行動觸控、繁體中文字型替代、實際印表機和工程圖 DWG 仍未通過自動化，不可當作施工定稿工具。

### v1.1.0 建議

優先依使用者 v1.0.0 合併測試回饋修正指令列／畫布 UX，再實作弧長／角度／半徑標註、曲線端點夾點編輯與 LWPOLYLINE bulge；評估增加跨瀏覽器 E2E。維持「完成一批 → 使用者 Merge → 再開下一批」原則。

---

## v0.9.0 — 原生 ARC、DXF ARC 與三點圓弧修剪

- PR #8 已合併；從最新 main `0df995c3d483d9ee23ab807e9ba6c2a6bba0c2f3` 建立 `feat/v0.9.0-native-arc-dxf-trim`，對應 PR #9。**需使用者自行 Merge，禁止直接改 main。**
- `src/cad/types.ts` 新增原生 `ArcEntity`（`kind:'arc'`、世界座標 mm 圓心、半徑、起始角／結束角）。角度採 CCW、0–360°，支援跨 0°（350°→20°＝30°），不允許零角跨度／零半徑。原生 JSON `version:1` **保持不變**；舊版本程式不一定能讀含 ARC 的新檔。
- `src/cad/arcs.ts`：三點解析式定弧、端點／中點／圓心、真實弧線外接極值、弧線距離命中、線段／圓／ARC 間有限交點、以被點擊弧段切割保留一到兩段原生 ARC。
- `src/App.tsx`、`src/components/CadCanvas.tsx`：`A / ARC` 三點（起點→弧經過點→終點）建立真實弧、Canvas 圓弧預覽與渲染、右側半徑和起訖角度編輯。ARC 可 MOVE/COPY/ROTATE、全圖／框選、OSNAP、圖層及圖塊。
- `src/cad/advancedEditing.ts`：`F / FILLET` 由高密度 POLYLINE 改為**真正 ARC**；保留兩條 LINE 的切點及 R 半徑，DXF 產生 ARC。支援 ARC 作為 EX 的有限邊界與 window/crossing 選取。
- `src/cad/precisionEdit.ts`：ARC 徑向偏移；TRIM 可修剪 LINE／開放 PL／原生 ARC；ARC 亦能作為裁切邊界；仍不支援完整 CIRCLE 直接修剪成 ARC。
- `src/cad/dxf.ts`：ASCII DXF 2000 AC1015 的 `ARC` 雙向讀寫（`AcDbCircle`+`AcDbArc`，群組 10/20/40/50/51）、英制／公制轉 mm、BLOCK／INSERT 內 ARC。畫布保留世界座標逆時針角度；異常法線／非 2D 繼續拒絕。
- `src/cad/plot.ts`：SVG `<path d="... A ...">` 精確向量圓弧、正確大小弧標記、只使用實際弧度的邊界計算，兼容既有 PLOT 比例輸出。
- `src/cad/arcs.test.ts`：18 項原生 ARC 單元測試；先前 v0.8.0 FILLET 期待值改為原生 ARC，DXF 舊「不支援 ARC」測試已改成正常匯入。
- `src/cad/dxf.test.ts`、`scripts/validate_dxf.py`：獨立 Python `ezdxf` 真正 ARC 的雙向結構稽核（包含 350°→45°／35° 跨 0° 角度），不是只有內部匯出與匯入互測。
- `docs/ARC_NATIVE.md` 為最新操作、格式、限制及人工驗收；README、DXF／編修文件同步更正舊版已過時的 ARC 限制。版本號 `package.json=0.9.0`。

### 本批 Merge 前驗收

1. ✅ GitHub Actions `npm test` **113/113**、`npm run build`（TypeScript/Vite）成功。
2. ✅ 獨立 `ezdxf` 解析 WEB CAD 輸出的 ARC，`ezdxf` 自建 ARC 再由 WEB CAD 解析；PLOT PDF 物理尺寸的獨立回歸亦成功。
3. 尚需使用者於實際瀏覽器驗收：A→三點畫 R100 上半圓及下半圓；FILLET R100 生成單個真實 ARC；點右側角度欄測 350°→20°。
4. TRIM 用 X=±50 的兩條線裁剪 R100 上半圓頂部，確認保留 0°→60° 與 120°→180° ARC，Ctrl+Z 可還原。
5. 匯出 DXF → 真正 AutoCAD／QCAD／LibreCAD 開啟，以 ARC 實體選取、修改半徑、另存 DXF → 回 WEB CAD 再匯入；需核對 0° 跨越、中文與圖塊旋轉。
6. PLOT 1:50 的 ARC SVG 檢查使用 <path> 真向量圓弧，且紙張比例與實體半徑正確。不能只依賴單元測試認定施工圖精準。

### 尚未完成

- CIRCLE 修剪為 ARC、LWPOLYLINE bulge 弧段／橢圓／Spline、ARC 長度與角度標註、動態端點夾點編輯、全 AutoCAD ARC 互動建構選項、完整 DWG／非 XY 平面。
- v0.8.0 已存的 FILLET 折線近似**不自動轉成 ARC**；新作 FILLET 才是原生 ARC。
- 未實際完成 AutoCAD GUI／Safari 等桌面與手機瀏覽器 E2E／實體印表機驗收。此專案仍是可測試的 2D 原型，不可直接作為施工定稿。

### 後續建議

`v1.0.0` 應先做瀏覽器互動 E2E 與回歸修正，再規劃 CIRCLE → ARC 修剪、LWPOLYLINE bulge 曲線和弧長／角度尺寸標註，另處理 DWG／Layout 工程級互通性。

---

## v0.8.0 — EXTEND、FILLET、CHAMFER 與拖曳框選

- 從已 Merge 的 PR #7／最新 main 建立分支 `feat/v0.8.0-extend-fillet-chamfer-selection` → PR #8。使用者自行驗收／Merge；禁止直接修改 main。
- `src/cad/advancedEditing.ts`：純幾何有限邊界 EX／EXTEND（LINE 端點延伸至最近的 LINE、RECT、PL、CIRCLE、單層 INSERT 交點）、F／FILLET（兩 LINE 真實幾何切點、近似圓弧用細分 POLYLINE）、CHA／CHAMFER（兩 LINE 指定兩個 mm 倒角距離、建立連線）。
- FILLET 是**弦高誤差目標 0.1 mm 的細分 POLYLINE**；半徑過大或精度不足時拒絕，不冒充原生 ARC、DXF ARC。原始 LINE 端點仍保留可編輯，JSON schema version 1 不變。
- `windowSelection()`：左至右完全包含、右至左交叉；涵蓋基本圖元、文字／尺寸近似外接、圖塊原子選取；隱藏或鎖定物件不可選。
- `src/components/CadCanvas.tsx`：真正 pointer drag 捕捉與 6px 啟動門檻、藍色實框與綠色交叉虛框、角隅編輯預覽、EX 金色邊界提示、批次 MOVE／COPY／ROTATE 預覽。
- `src/App.tsx`：EX/F/CHA 指令與左工具列；Shift 累積多選、Ctrl+A（macOS ⌘A）選可編輯全部、批次 M/CO/RO/Delete 為單一 Undo 步；指令切換重設互斥模式。
- `src/cad/advancedEditing.test.ts`：新增有限交點、角隅切點和半徑、四象限、圖塊與圓邊界、窗口／交叉矩形、多圖層保護、JSON、Undo/Redo 的回歸測試。
- 使用／人工驗收詳見 `docs/ADVANCED_EDITING.md`。

### PR #8 完成驗收

1. GitHub Actions `npm test`、TypeScript `tsc -b`、`vite build` 全通過才可 Merge。
2. 延伸：LINE `0,0 → 1000,0`，選 x=2000 的垂直 LINE 為邊界 → EX → 點水平線靠近 `1000,0` 端，終點必須到 `2000,0`。
3. 圓角：選兩條 1000 mm 直角 LINE → F → 半徑 100，切點 `100,0` 與 `0,100`，新增近似圓弧聚合線；R0 生成尖角。
4. 倒角：同一組直角 LINE → CHA → `100,150`，新增連接線 `100,0 → 0,150`。
5. 框選：左→右只選全包含、右→左選交叉；Shift 累積，Ctrl+A；框選 3 件物件後 MOVE／COPY／ROTATE／Delete 應作用於全部；鎖定／隱藏圖層不可編輯。
6. 使用新版 JSON／DXF 保存，FILLET 曲線應是 POLYLINE 而非 ARC；需與真實 AutoCAD 人工比對。瀏覽器 E2E／觸控仍未通過自動化驗收。

### 已知限制與建議後續

- EXTEND 目標限 LINE；FILLET／CHAMFER 需兩條 LINE，尚無原生 ARC、曲線真實參數、封閉聚合線圓角／倒角或全系列 AutoCAD 編修。
- 本批聚合線 FILLET 線段為近似；列印／DXF 可能可看到分段，**不得誤認為真正解析式圓弧**。
- 仍缺 DWG 原生格式、完整 CAD 引擎精確度及施工圖工具認證。建議 v0.9.0 優先原生 ARC 與完整 DXF ARC 互通、圓弧 TRIM／FILLET、或根據實際操作回饋優先修正互動 UX。

---

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
