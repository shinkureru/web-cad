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

## v0.3.0 可重現的 Cota 靜態建置 POC

- 新增 `.github/workflows/cota-poc.yml`，以 `workflow_dispatch` 手動執行；固定上游提交 `f6731b3d55561269b912484ee7915606334b1924`，安裝 `services/web` 套件並使用 `VITE_CLOUD=off COTA_BASE=/web-cad/ npm run build`。
- 成功時上傳獨立的 `cota-pinned-static-build` artifact 供檢查；**不取代目前 Web CAD，也不會因一般 PR 自動觸發**。
- 工作流程目前只提供可重現的**靜態建置可行性**，未實際觸發 Cota 的 CI。即使此工作流程成功，仍未驗證施工用 DWG/DXF 往返、中文字型及尺寸標註。
- 若要決策採用 Cota，後續需取得合法的施工圖測試樣本，跑真實的雙向格式匯入匯出、佈署子路徑和視覺／數值比對，並遵守 Apache-2.0 LICENSE / NOTICE。

## v0.2.0 補充評估（2026-11-16）

查閱上游 `services/web/package.json`、`docs/architecture.md`、`docs/self-hosting.md`，確認以下資訊：

- Cota 的 web 專案位於 `services/web/`（目前 package 版本 2.46.0），使用 React 19、Zustand 5、Three.js；本 Repo 目前 React 18 + Canvas 2D。兩者文件模型、渲染及狀態管理不一致，不適合直接拼接元件。
- 上游的 `src/core`、`src/render`、`src/store`、`src/ui` 已分層，CommandEngine 與尺寸、圖塊、DWG/DXF 系統具有高參考價值；原生 `.cota` 格式也與本 Repo 的 `.webcad.json` 不同。
- 上游文件指出靜態部署可用 `VITE_CLOUD=off COTA_BASE=/web-cad/ npm run build`，且可使用 GitHub Pages；**這只是上游文件核對，沒有宣稱本 Repo 已通過 Cota 的建置或 E2E。**
- 上游 DWG 採 `@node-projects/acad-ts` 在瀏覽器讀寫；仍需正式施工圖往返及繁體中文字型驗證。

**決策**：v0.2.0 延續輕量自主 2D 原型以驗證幾何精度與指令互動，先不複製 Cota 原始碼。v0.3.0 前應做獨立 Fork／Pages 建置及真實 DXF/DWG 施工圖往返 POC，再決定是否遷移長期核心。若引入上游須保留 Apache-2.0 LICENSE、NOTICE 和作者標示。

上游參考：<https://github.com/mxchristian17/cota/blob/main/services/web/package.json>、<https://github.com/mxchristian17/cota/blob/main/docs/architecture.md>、<https://github.com/mxchristian17/cota/blob/main/docs/self-hosting.md>。
