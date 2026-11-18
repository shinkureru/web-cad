# WEB CAD — DXF 2000 交換規格與驗收指引

> 初版 v0.5.0，最新更新至 **v0.9.0（增加原生 ARC）**；實作：`src/cad/dxf.ts`。原生 `.webcad.json` **仍是唯一可保證完整保存所有專案資訊的主檔**，DXF 為受限的跨軟體交換格式。

## 格式版本與界線

- 匯出 **ASCII DXF AutoCAD 2000 / AC1015**，包括 HEADER、CLASSES、TABLES、BLOCKS、ENTITIES、OBJECTS；模型空間以 mm 寫入 `$INSUNITS=4`。
- 單位讀取：支援 `$INSUNITS=4` mm、1 英吋、2 英尺、5 公分、6 公尺及 14 公寸；0 或未提供單位時**假設 mm 並顯示警告**；未支援的單位停止匯入，避免錯誤比例。
- 繁體中文以標準 `\U+XXXX` 字元轉義保存，匯入時還原；顯示仍依瀏覽器／作業系統字型。**並未嵌入字型，也未驗證 SHX／其他字體排版**。
- 本批沒有新增任何外部 JS 套件，DXF 子集讀寫位於可測試的純 TypeScript 模組。讀入檔案上限 10 MB；原檔於使用者確認前不會取代現有工作區。
- 已在 GitHub Actions 上新增獨立 `ezdxf` 雙向 smoke test：Python 讀取、稽核 WEB CAD 匯出 DXF，並以 Python 產生外部 DXF 由 WEB CAD 反向讀入。測試已成功，但**仍非 Autodesk AutoCAD 的 GUI 實際驗收**。
- DXF STYLE 將文字字型參照設為 `arial.ttf`，而非舊式 `txt.shx`；是否可顯示全部繁中字符仍取決於外部 CAD 的作業系統字型及字型替代。

## 支援的圖元

| 類型 | 匯出 | 匯入 | 注意事項 |
|---|---|---|---|
| LINE 直線 | LINE | LINE | 毫米座標、正負座標及相對尺寸可保存 |
| CIRCLE 圓 | CIRCLE | CIRCLE | 圓心與半徑 |
| **ARC 原生圓弧（v0.9.0）** | **ARC** | **ARC** | 模型 mm 圓心、半徑、起始角 50／結束角 51，世界 XY 逆時針；支援跨越 0°、BLOCK 內 ARC |
| PLINE 聚合線／矩形 | LWPOLYLINE | LWPOLYLINE | 矩形回讀成**封閉聚合線**，不再保有原矩形種類；不支援 bulge 弧段 |
| 圖層 | LAYER table | LAYER table | 名稱、可見／鎖定、RGB true color、線粗與連續／虛／中心線型 |
| TEXT | TEXT | TEXT | 文字內容、位置、字高與角度；多行文字匯出後拆為多個 TEXT，匯出前提醒 |
| BLOCK／INSERT | BLOCK + INSERT | BLOCK + INSERT | 支援單層圖塊與旋轉，維持多份參照；不支援縮放、陣列、巢狀與動態圖塊 |
| 線性尺寸 DLI | DIMENSION（rotated）＋圖形塊 | DIMENSION | 支援水平／垂直；來源圖檔中的斜角旋轉尺寸目前跳過 |
| 對齊尺寸 DAL | DIMENSION（aligned）＋圖形塊 | DIMENSION | 只讀定義點與基本樣式，非原生尺寸關聯 |
| 樣式 | DIMSTYLE table | DIMSTYLE table | 文字高度、箭頭、間距與小數位數的基本對應，不涵蓋 AutoCAD 所有樣式欄位 |

## 明確不支援

- 目前 **不支援 DWG**、二進位 DXF、外部參照、比例出圖 PDF、圖紙空間／LAYOUT、關聯式標註、動態圖塊、填充線 HATCH、SPLINE、ELLIPSE、MTEXT、LEADER、3D 物件及有 bulge 的曲線聚合線。
- 不支援的物件在匯入時略過並彙整警告及數量，**不是悄悄丟棄**。如果只匯入部分物件，畫布結果不得視為原始施工圖的完整呈現。
- 外部圖面非等比例或等比例縮放後的 INSERT，會略過該參照；擴充為獨立、可驗證的變換系統前不能任意忽略縮放。
- DXF 名稱依規範進行保留字元清理及重名消除；原本的內部 UUID、物件 ID、矩形種類及完整多行文字群組不保證跨格式維持。
- DXF 2000 自有生成測試與 TypeScript 編譯成功，不等於 AutoCAD 已實際驗證；請使用真實施工圖及至少兩種第三方 CAD 進行往返測試。

## 匯入流程防資料遺失

1. 在右上角 **備份 JSON**。
2. 選 **開啟** → 選擇 `.dxf`（只支援 ASCII）或 `.webcad.json`。
3. 解析完成後，系統會先預覽已讀取物件數、略過數及警告，確認後才取代目前圖面。
4. 右下角會保留本次交換紀錄；遇到略過項目務必回原 CAD 對照。
5. 交付施工前應核對圖層、比例、中文文字、圖塊和尺寸，對照外部 CAD 軟體開啟結果。

## 最小人工驗收清單

- 在 WEB CAD 新建長 3000 mm 直線，經 DXF 匯出 → AutoCAD／QCAD／LibreCAD 開檔 → 量測是否仍為 3000 mm。
- 建立一個含兩條直線的自訂圖塊，插入兩份且第二份旋轉 90°；在外部 CAD 檢查是 `BLOCK`／`INSERT`，非純視覺筆畫。
- 加入房間名稱「廚房設備」、水平 3000 mm、斜向 5000 mm 標註；確認外部 CAD 可正常顯示繁中與尺寸。
- 從外部 CAD 儲存另一份 DXF 再回 WEB CAD 匯入，核對正負座標、單位、角度、圖塊定義與標註樣式。
- 使用 **ARC** 圖檔測試，應能成功導入可編輯的原生圓弧；使用 HATCH、SPLINE、MTEXT 及縮放 INSERT 應出現略過警告；取消時原圖面不得被覆蓋。

## v0.9.0 ARC 相容性驗收

- DXF 寫入／讀取 ARC 用 `AcDbCircle` + `AcDbArc` subclass，群組碼 `10/20` 圓心、`40` 半徑、`50` 起始角、`51` 結束角；半徑以 `$INSUNITS` 換算。
- 例如 ARC 圓心 `0,0`、R100、350°→20° 應匯出與回讀為 **30° 的逆時針圓弧**，不應變成缺弧或大弧。
- 圓弧可存在於 BLOCK/INSERT 中，圖塊旋轉後仍是真圓弧；FILLET 新建的圓角亦為 ARC。
- DXF 含未支援的非 XY 平面／異常法線（OCS）仍會跳過及警告，不能假設任何 3D 圓弧都可轉換。
- GitHub Actions 使用獨立 `ezdxf` 稽核 WEB CAD 匯出的 ARC、並用 `ezdxf` 產生 ARC 檔再回測 WEB CAD 讀取；人工仍須在 AutoCAD／QCAD／LibreCAD 開啟、編輯和另存，詳見 `docs/ARC_NATIVE.md`。

## 主要規格參考

- Autodesk DXF group codes: <https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm>
- Autodesk INSERT: <https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm>
- Autodesk DIMENSION: <https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-EDD54EAC-A339-4EBA-AEA6-EC8066505E2B.htm>

## 下一步

- 外部 AutoCAD、LibreCAD、QCAD 或其他第三方解析器獨立驗證格式，修正不接受的結構。
- 評估 R2000 模型／圖紙空間結構與 DIMENSION 的樣式往返；繼續增加 MTEXT、HATCH、LWPOLYLINE bulge 弧段的解析器與明確支援矩陣。
- DWG 保持獨立技術驗證，不把 DXF 成功誤稱 DWG 相容。
