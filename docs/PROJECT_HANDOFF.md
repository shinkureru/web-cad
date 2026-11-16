# WEB CAD — PROJECT HANDOFF

更新：2026-11-16　｜　版本：v0.3.0　｜　Repo：`shinkureru/web-cad`

## 專案目標與流程

同一 2D CAD 核心支援桌面室內設計製圖及行動編修。每批在 `feat/vX.Y.Z-*` 上提交 PR，使用者自行驗收與 Merge；不直接修改 main。接續前必須比對最新 main、PR、測試與本文件。

## v0.3.0：圖塊與室內設計圖塊庫

- `src/cad/types.ts`：新增 `BlockDefinition`（一層局部座標圖元）與 `InsertEntity`（位置、角度、所在圖層），原生檔案 `CadDocument.version=1`；`blocks?` 選填支援 v0.1/v0.2 舊檔。
- `src/cad/blocks.ts`：建立圖塊／局部座標轉換、參照展開、分解（保留圖塊定義）、床／沙發／餐桌／單開門／平面窗預設圖庫。
- `src/cad/walls.ts`：中心線兩點及設定牆厚形成單段等厚的封閉牆輪廓，搭配 `W/WALL`、畫布預覽和工具列牆厚數字欄位；預設 120 mm。
- `src/cad/document.ts`：JSON 結構驗證圖塊定義與參照、拒絕遺失定義與巢狀參照、檢查重複圖元與圖塊 ID。
- `src/cad/editing.ts`：圖塊參照支援平移／旋轉；複製保持共同定義。
- `src/components/CadCanvas.tsx`：圖塊作為單一物件選取，展開幾何供畫布顯示、交點／端點鎖點與命中測試；插入時虛線預覽。
- `src/App.tsx`：Shift+點擊多選、B/BLOCK 圖塊名稱與基準點輸入、I/INSERT 插入圖塊、X/EXPLODE 分解；右側圖塊庫包含 5 種室內設計圖塊及角度調整。
- 本版本不含 DXF/DWG/PDF、尺寸標註、巢狀圖塊、BEDIT 定義編輯及正式施工圖出圖；不得用於正式放樣。

## 使用與驗收

1. `npm install --no-audit --no-fund && npm test && npm run build`。
2. 以 `L` 畫線，Shift+點選兩條線後輸入 `B` → `TEST` → `0,0`，應成為單一圖塊；原始幾何位置不變。
3. 輸入 `I` → `5000,0`，應插入同一圖塊的新參照；兩個參照是不同實體且共用定義。
4. 點選第二個圖塊，輸入 `M`、`CO`、`RO` 檢查位置／角度；分解 `X` 後可獨立選取線段。
5. `W` → 牆厚 120 → `0,0` → `3000,0`，產生 3000 mm 長、120 mm 厚的單段牆輪廓。
6. 右側預設圖塊庫插入雙人床、沙發、餐桌、門、窗；旋轉角度及圖層可調整，圖塊端點鎖點正常。
7. 匯出 `.webcad.json` → 重新匯入 → 檢查圖塊名稱、角度、幾何與圖層；既有 v0.2 圖面仍可匯入。
8. 圖層鎖定／隱藏時，整個圖塊不可修改／不可選取；跨圖層合併時將不同圖層外觀保存為明確覆寫。
9. GitHub Actions 建置測試通過，Merge 後測試 GitHub Pages。

## 限制、風險與技術債

- 圖塊為 **single-level primitive definitions**。不支援巢狀 INSERT、非等比例縮放、動態屬性、弧形 ARC 及外部參照。
- 內部圖元在渲染時統一繼承 INSERT 的所在圖層；跨圖層建塊時保留當時的顏色／線粗等覆寫，不再隨原圖層變動。
- 牆工具僅支援單段封閉輪廓，尚無接角、牆洞、交會處自動修剪、曲牆或牆體智慧物件。
- 預設門片的開啟軌跡為聚合線近似示意，不是可編輯的 ARC。門洞、牆體開口及門扇實際施工尺寸需要另外建置。
- 目前 Shift+點選主要供建立圖塊；M/CO/RO 與屬性面板仍是針對最後一個選取物件編輯。
- 本機 localStorage 非完整工程檔版本管理，需定期匯出 JSON 備份；尚未完成 E2E、正式施工圖驗收與 DWG/DXF/PDF 格式相容。
- 圖塊內局部物件不直接受其原始圖層的顯示／鎖定控制，參照整體受插入圖層控制。

## Cota 評估

保留 Cota 當作大型正式 CAD 核心候選，本 PR 只建立原生單層圖塊與必要的幾何驗證；**沒有 Fork、嵌入或聲稱 Cota 上游已通過部署／格式往返測試**。若未來導入，先獨立驗證 Pages base、繁體中文標註、BLOCK/INSERT/DIMENSION 及 DXF/DWG 開啟與存檔，保留 Apache-2.0 LICENSE／NOTICE。詳細請見 `docs/CAD_ENGINE_EVALUATION.md`。

## 下一批

`v0.4.0` 文字、尺寸標註、標註樣式與繁體中文支援；另安排 Cota 靜態建置及 DXF/DWG 往返 POC 以決定是否採更完整引擎。
