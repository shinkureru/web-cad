# WEB CAD v1.0.0 — Chromium 操作驗收與整圓修剪

此版本是第一個具備真實 Chromium 瀏覽器自動操作驗證的里程碑，不代表已達 AutoCAD 商用軟體或正式施工圖認證。

## 本機執行與 CI

~~~bash
npm install --no-audit --no-fund
npx playwright install chromium
npm test
npm run build
npm run test:e2e
~~~

- npm test：Vitest 單元／幾何測試，只執行 src/**/*.test.ts。
- npm run build：TypeScript 型別檢查與 Vite 正式產物。
- npm run test:e2e：Playwright 自動啟動 Vite，以真實 Chromium 瀏覽器模擬滑鼠、鍵盤、匯入與匯出。
- GitHub Actions：.github/workflows/browser-e2e.yml 對每個 PR 和 main push 執行；失敗保留 trace、截圖、HTML 報告。設定檔：playwright.config.ts。此測試使用 1440×900 桌面視口。

### 瀏覽器自動化範圍

1. LINE 指令建立（L→0,0→1000,0）、實際 Undo／Redo 按鈕、JSON 下載與重新上傳、確認視窗、重新整理後持久化。
2. Canvas 滑鼠拖曳左→右完整框選、右→左交叉框選，並用 MOVE 將整組物件向右移動 100 mm，再以 Undo 退回。
3. Shift 點選兩條裁切線、TR 點擊 CIRCLE 的頂端、轉換成真正 ARC。下載 DXF 後 Undo 還原整圓，再從實際檔案輸入框匯入 DXF，確認圓弧還原。
4. 三點 ARC 指令流程，以及 GUI PLOT 面板可以啟動。

Chrome E2E 無法取代 Safari、Firefox、觸控、中文字型替代、真正 Autodesk AutoCAD GUI、印表機、DWG 與施工圖完整驗收。

## CIRCLE → ARC 解析式修剪

1. 使用 C 繪製圓心 (2400,1500)、R500 的整圓。
2. 畫 x=2150 與 x=2650 兩條垂直線，跨越整個圓周。
3. Shift 點選兩條垂直線，執行 TR／TRIM。
4. 點擊圓頂部 (2400,2000)。四個交點角度為 60°、120°、240°、300°，頂部 60°–120° 的圓周會被移除；剩下的曲線為**一個原生 ARC**，起角 120°、終角 60°，逆時針跨度 300°。
5. 圓心、半徑、原物件 ID、圖層、顏色、線粗與線型皆保留；修剪結果可直接用原生 JSON、DXF ARC、SVG/PDF 出圖或 Undo／Redo。

### 防護與限制

- 使用真正有限 LINE／POLYLINE／RECTANGLE／CIRCLE／ARC 交點，而非假設邊界可無限延伸。支援基本單層圖塊展開的裁切邊界。
- 至少需要兩個不同有效交點；切線只碰一點、相切、共圓重疊或沒有交點的物件會拒絕，保護原圖。
- 滑鼠應點在圓周附近；中心或太遠的點不會任意刪圓。
- 一次修剪刪除一段相鄰交點區間，將剩下的連續圓周轉成一條原生 ARC；並非多段缺口或 AutoCAD 所有 TRIM 模式。
- 鎖定／隱藏圖層不可編修，編輯以一個 Undo 步驟保存。舊版 WEB CAD 程式未必支援帶新 ARC 的 JSON 檔案，應定期備份主檔。

## Merge 後人工驗收

- CI：Vitest、TypeScript／Vite、Chromium Playwright、獨立 Python ezdxf 雙向交換及 A3 PDF 尺寸檢查皆應為綠燈。
- 人工：整圓 TRIM 不同方向與大小弧，Undo／Redo、圖層鎖定、隱藏、繼續修剪與 ESC 模式清理。
- 使用真正的 AutoCAD／QCAD／LibreCAD 開啟導出 DXF，確認新曲線是可編輯 ARC，並核對半徑、角度及圖層。
- Safari／行動觸控、特定字型、實體 PDF 比例、完整 DWG/OCS 仍未認證。

未來可依使用者驗收回饋優先開發 ARC 弧長／角度標註、Polyline bulge、端點夾點、字型管理與更多跨瀏覽器 E2E。
