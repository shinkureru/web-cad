# WEB CAD — Drawing Studio

React + TypeScript + Vite 的瀏覽器 2D CAD 原型，目標是室內設計施工圖與外出行動編修共用的繪圖核心。

> **v0.2.0 技術原型**：尚未通過施工圖正式驗收；圖面不可直接用於現場放樣或施工定稿。

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
- `L` 直線、`PL` 聚合線、`REC` 矩形、`C` 圓
- 絕對 `3000,1500`、相對 `@3000,0`、極座標 `@2000<45`、方向距離 `1500` 輸入
- 物件鎖點：端點／中點／圓心及**交點**（支援有限直線段、矩形、聚合線、圓的相交）
- F3 鎖點、F8 正交，選取／刪除，Ctrl+Z／Ctrl+Y 復原／重做
- **選取單一物件後**使用 `M` 移動、`CO` 複製、`RO` 旋轉，並可使用命令列輸入座標／角度
- 圖層新增、改名、顏色、線粗、線型（Continuous/Dashed/Center）、顯示與鎖定
- 選取物件後設定圖層、顏色、線粗、線型，支援 ByLayer 覆寫
- localStorage 自動儲存、匯入／匯出 `.webcad.json`、可編輯的示範平面圖

目前僅有單一物件選取與變換；**尚未支援**多選、TRIM、OFFSET、DIM、BLOCK、DWG／DXF、列印與 PDF 比例出圖。螢幕線粗與線型並非實體出圖規格。

### 操作範例

1. 載入示範平面圖，選取一條家具線或矩形。
2. 指令列輸入 `M` → Enter，再輸入 `0,0` → Enter，`@300,0` → Enter，即可移動 300 mm。
3. 選取物件後輸入 `CO` → `0,0` → `@0,400` 可複製；輸入 `RO` → `0,0` → `90` 可旋轉 90°（逆時針）。
4. 選取物件後於右方物件屬性面板更改圖層、顏色覆寫、線粗和線型，檢查 ByLayer。
5. 用兩條交叉線驗證交點鎖點；按 F3 切換鎖點。
6. 匯出圖面後重新匯入，檢查屬性值及座標是否保留。

### GitHub Pages

1. Repository **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. Merge PR 到 `main` 後由 `.github/workflows/pages.yml` 執行單元測試、TS 建置、部署 `dist`。
3. 預期網址：<https://shinkureru.github.io/web-cad/>。

## 文件

- [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md) — 交接、測試、限制及接續版本
- [`docs/CAD_ENGINE_EVALUATION.md`](docs/CAD_ENGINE_EVALUATION.md) — Cota 評估與自製核心維護決策

## 技術與授權

目前所有原型繪圖碼均為本 Repo 自行實作，未複製 Cota 原始碼。若日後引入 Cota，必須依法保留 Apache-2.0 LICENSE、NOTICE 與著作權資訊。正式製圖前應另行驗證尺寸精度、字型及 DWG/DXF 往返。