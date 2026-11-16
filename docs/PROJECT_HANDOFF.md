# WEB CAD — PROJECT HANDOFF

更新：2026-11-16　｜　版本：v0.1.0　｜　目標 Repo：`shinkureru/web-cad`

## 專案願景

同一份 CAD 圖面、同一個幾何核心，支援桌面專業室內設計 2D 施工製圖及手機／平板外出快速檢視編修。優先確保毫米精度、物件關聯、CAD 快捷指令與 DWG/DXF 往返相容，避免追求展示而犧牲施工正確性。

## v0.1.0 實作

- React 18 + TypeScript + Vite 6，Canvas 2D 模型空間；深色 CAD 桌面工作區與基本小螢幕版面。
- `src/cad/types.ts`：版本化 JSON 圖面、圖層、基本圖元、相機與編輯草稿的型別。
- `src/cad/geometry.ts`：毫米空間座標變換、滑鼠中心縮放、正交、端點／中點／圓心鎖點、選取命中測試。
- `src/cad/commands.ts`：命令別名及絕對／相對／極座標解析器。
- `src/cad/document.ts`：文件格式驗證、圖層預設值、最多 100 步歷史。
- `src/components/CadCanvas.tsx`：Canvas 渲染、游標預覽、格線、縮放與中鍵平移。
- `src/App.tsx`：CAD 操作流程、工具列、指令列、圖層面板、本機儲存與匯入／匯出。
- GitHub Actions：PR 進行測試＋建置；main 成功才部署 Pages。第一次 Pages 發布需要 Repo 管理者在 Settings → Pages 設定 GitHub Actions。

## 尚未通過的驗收項目

- 不是正式施工製圖工具；此版未支援文字、標註尺寸、圖塊、DXF、DWG、PDF、剪切／偏移／延伸。
- 原生 `.webcad.json` 僅限本原型使用；屬測試格式，不保證未來不經轉換即可使用。
- 鎖點目前僅端點、中點、圓心；線段交點、切線、垂足尚未實作。
- 本版按單點繪圖，手機觸控仍為基礎互動；專業多指操作尚未建置。
- 線粗目前僅為螢幕視覺效果，不代表 PDF 或印表機線粗輸出。
- 未有大型圖紙效能壓測；無法宣稱支援正式 DWG 往返。
- 無法以自動測試取代實際瀏覽器及施工圖驗收；合併後需人工操作確認。

## 測試清單

1. `npm install --no-audit --no-fund && npm test && npm run build` 應成功。
2. `L` → `0,0` → `3000,0`：畫出 3000 mm 直線。
3. `PL` → `0,0` → `@3000,0` → `@0,2000` → Enter：畫出連續聚合線。
4. `REC` → `0,0` → `@3000,2000`、`C` → `1000,1000` → `@500,0`。
5. F3 / F8；端點／中點鎖點；中鍵拖曳、滾輪游標縮放。
6. 隱藏或鎖定圖層、改變線粗／顏色、選取刪除、Undo / Redo。
7. 匯出 JSON，再載入並確認座標與圖層未改變；重新整理後 localStorage 保留圖面。
8. PR workflow 測試綠燈、合併 main 後 Pages 正常開啟（需先設定 Pages Source）。

## 里程碑

- `v0.1.0` **本 PR**：最小可操作、可部署及可測試的 CAD 技術原型；Cota 候選調查。
- `v0.2.0` 建議：確定是否採 Cota 核心、交點鎖點、編輯工具、物件屬性管理、圖層一致性。
- `v0.3.0`：圖塊／室內設計常用圖塊與牆面製圖。
- `v0.4.0`：正式標註樣式、文字、尺寸標註／樣式。
- `v0.5.0`：DXF/DWG 往返測試與 PDF 圖面比例列印。

## GitHub 協作規則

- 每批使用 `feat/vX.Y.Z-*` 分支並建立 PR；由使用者自行測試、Merge，再開發下一批。
- 合併前不直接修改 main，除了此專案原本空白所需的首次 bootstrap README commit。
- 不要假定 GitHub Pages 已啟用、原型已可施工、DWG 已相容。
- 接續任務先讀此文件、檢查 main/PR/Actions，再執行後續變更。
