# CAD 核心候選評估（2026-11-16）

## Cota

- 上游：<https://github.com/mxchristian17/cota>；現有文件自述 Apache-2.0 授權、React/TypeScript/Vite/Three.js/Zustand、240+ CAD 指令、圖塊、圖層、標註與 DXF/DWG。
- 開發方式：上游 README 指示 `services/web` 內執行 `npm install && npm run dev`，而非 repo 根目錄。
- 既有好處：成熟的指令系統、施工圖功能與部分格式處理，比從零開發全部 AutoCAD 功能風險低。
- 風險：專案仍持續快速變動；施工圖相容性、字型、動態圖塊、標註關聯、大檔性能、DWG 往返與授權 NOTICE 均需驗證。
- 本批結論：**候選保留，不直接匯入上游原始碼**。須先以實際室內施工圖與功能測試驗證，才能評估 Fork / upstream sync / 取代原型核心；不可用宣傳功能表代替實測。

## 本批自主原型

- 核心：Canvas 2D + 純 TypeScript 幾何工具，使用 JSON 圖元作為唯一資料來源。
- 好處：原始碼少、座標與 UI 分離、方便先驗證毫米精度、快捷指令和 GitHub Pages 流程。
- 限制：目前只是技術原型；若最終希望達到專業 AutoCAD 2D 規模，不能直接假定持續自行擴充最划算。

## v0.2 進入核心整合前的決策門檻

1. Cota 能否在自己的 GitHub Pages base path 下穩定建置？
2. 實際 DXF/DWG 的兩次往返是否仍保留 LINE/LWPOLYLINE/INSERT/DIMENSION 與圖層／字型？
3. 改用 Cota 時 UI、指令別名、室內設計圖塊庫和本機檔案資料是否能合理擴充？
4. 引入 Apache-2.0 依賴後的 LICENSE / NOTICE / 原作者標示是否完整？
5. 比較 Fork Cota 與維持獨立引擎的維護成本後，再提出架構 PR。

## 參考資料

- Cota：<https://github.com/mxchristian17/cota>
- Cota 上游使用說明：<https://github.com/mxchristian17/cota/blob/main/README.md>
- Apache 2.0 原始授權：<https://github.com/mxchristian17/cota/blob/main/LICENSE>
