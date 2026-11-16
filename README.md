# WEB CAD — Drawing Studio

React + TypeScript + Vite 的瀏覽器 2D CAD 實驗專案，朝室內設計施工圖與行動編修雙模式發展。

> **v0.1.0 原型**。目前不是 AutoCAD 的正式替代品，不可直接以此版圖面進行施工放樣。

## 開發與測試

```bash
npm install --no-audit --no-fund
npm run dev
npm test
npm run build
```

支援 Node.js 20.19+ 或 22.12+。首次進入可點右側「載入示範平面圖」。

## 現有功能

- 2D Canvas、毫米世界座標、滾輪游標中心縮放、中鍵平移、全圖縮放
- 直線 `L`、聚合線 `PL`（Enter 完成）、矩形 `REC`、圓 `C`
- 絕對座標 `3000,1500`、相對座標 `@3000,0`、相對極座標 `@2000<45`、沿游標方向距離 `1500`
- 圖層顏色、線粗、鎖定與顯示切換；物件端點、中點、圓心鎖點（F3）；正交（F8）
- 選取物件、Delete / `E` 刪除、Ctrl+Z / Ctrl+Y 復原重做
- 瀏覽器 localStorage 自動儲存、匯入／匯出 `.webcad.json`、示範室內平面圖

**尚未實作：** DWG、DXF、圖塊、尺寸標註、列印與 PDF、進階幾何修改、雲端同步、多物件選取。請勿將介面上的基本繪圖視為完整 AutoCAD 相容。

### GitHub Pages

1. 在 Repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. Merge 經測試的 PR 到 `main`，`pages.yml` 會測試、建置並發布 `dist`。
3. 完成部署後的網址預期為 `https://shinkureru.github.io/web-cad/`。

## 專案文件

- [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)：目前架構、決策、限制、版本進度與後續工作
- [`docs/CAD_ENGINE_EVALUATION.md`](docs/CAD_ENGINE_EVALUATION.md)：Cota 與自主繪圖核心的評估

## 授權

目前新增的原型程式碼由本專案維護；尚未複製 Cota 的原始碼。若後續引入 Cota，必須保留 Apache-2.0 LICENSE、NOTICE 以及對應著作權聲明。
