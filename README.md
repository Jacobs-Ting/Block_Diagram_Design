# STRATUM — System Architecture Planner

Phase 1 Engineering Graph MVP。直接以 Chrome / Edge 開啟 `index.html`，無需安裝、建置或網路連線。App 執行期沒有第三方依賴；`jsdom` 僅供開發測試。

## 獨立直線物件

- 按工具列 **Line 直線**，在畫布拖曳，或依序點擊起點與終點，即可新增。完成後回到 Select。
- 選取線段後拖曳可整體移動；拖曳兩端圓點調整長度與角度。
- 右側 **Arrow Direction** 可選無箭頭、指向起點、指向終點、雙向箭頭；另可設定 Label 與端點座標。
- Delete 刪除直線；Esc 取消繪製。支援格線吸附。
- 直線是獨立繪圖物件，不受 Port 限制，不會自動跟隨 Block，也不算作工程連線。資料存於 state.lines；重新整理仍會重載 Demo。

## 清除畫面

工具列 **清除畫面** 會先顯示確認。確認後移除全部 Block、Port、Connection、獨立直線、Placement 與 Zone，取消繪製預覽並清空選取。保留 Project、Board 與 Rule 設定；清除後可以繼續新增物件。此操作目前無法復原。

## 框選與複製貼上

- **Select 模式**：在空白處按住滑鼠拖曳，框住完整物件即可多選；旋轉方塊以旋轉後邊界判定。
- **Shift / Ctrl 點擊**：加入或移出選取；Shift 拖曳框選可累加選取。
- **Ctrl+A** 全選；**Ctrl+C** 複製；**Ctrl+V** 貼上，亦可使用工具列「複製／貼上」。Mac 對應 Command。
- 拖曳已選取的方塊或直線可整組移動；Delete 批次刪除。Esc 取消群組拖曳並清空選取。
- 複製方塊包含 Port 與選取方塊間的內部連線；貼上建立新 UUID，並每次錯開 40 單位。副本未做 PCB Placement。
- 明確選取的工程連線若有未複製的端點，仍參照原端點；原端點不存在或 Port 已滿時，會略過並顯示警告。
- 使用應用程式內剪貼簿，可在清除畫面後貼回；重新整理後不保留，也不提供跨視窗貼上。輸入欄位的文字複製貼上不受影響。

## 工作區大小與可視範圍

- 工具列 W / H 可設定 Architecture 工作區大小；寬度範圍 400–10000，高度範圍 300–10000，按「套用」生效。
- 滑鼠滾輪、＋／− 可縮放；Fit 顯示完整工作區。
- 按 Pan 後拖曳，或在任何模式按住 Space 拖曳，可自由移動目前可視範圍；Esc 回到 Select。
- 改變工作區、縮放與平移不會修改 Component、Connection 或 Line 的資料座標。縮小工作區時也不刪除範圍外物件，可再次放大工作區或平移尋找。

## 存檔、匯入與匯出

- **存檔**：將完整 Project State 儲存在目前瀏覽器的 LocalStorage；Ctrl+S 亦可存檔。
- **載入**：恢復最近一次本機存檔。資料只存在目前瀏覽器／來源，清除網站資料會移除存檔。
- **JSON**：下載可攜式專案檔；**匯入**選擇 JSON 檔案並取代目前工作區。匯入前會驗證 UUID、Component／Port 引用、尺寸、顏色、連線與直線格式，失敗時保留目前專案。
- **PNG**：輸出完整 Architecture 工作區，不受目前 Pan／Zoom 視角影響；選取框、Handle、Port 控制點與預覽線不會出現在圖片中。
- PNG 以工作區背景色輸出。工作區任一邊超過 8192 時會等比例縮小，以控制記憶體使用量。

## 方塊顏色

選取任一方塊後，可在右側 Properties 的 **Block Color** 使用色彩選擇器即時設定填滿色；「使用預設色」恢復 `#1c2938`。顏色會隨複製貼上、存檔、JSON 與 PNG 保留。

## 主題與文字

- 工具列的 **淺色／深色** 按鈕可切換整個編輯器；選擇會寫入專案，PNG 也會使用目前主題的工作區背景。
- 選取方塊後，可在 Properties 調整 **Font、Font Size、Text Color**，設定會立即套用並隨複製、存檔與匯出保留。
- 點選 **T 文字框** 後在畫布拖曳即可建立註解。文字框支援多行文字、自動換行、字型、字級、文字色、背景色、框線色、移動、八方向縮放、框選、複製貼上與刪除。

## 操作

- 左側提供 40 種元件。拖到 Architecture 畫布，或點擊加入。
- **Select**：點選 Block 後可拖曳移動。八個綠色方形 Handle 位於四角與四側，拖曳即可縮放。
- 右側 **Width / Height** 可直接輸入畫布單位；最小尺寸為 180 × 112。工程 Port 很多時，最小尺寸會增加以保留間距。關閉 Snap 即可不受 20 單位格線限制。
- **Rotation** 支援 0° / 90° / 180° / 270°；Port、連線與縮放座標會跟隨旋轉。
- **Connect**：從一個 Connection Point 拖到另一點或另一 Block；也可依序點擊來源點、目標點。連線完成後持續保持 Connect 模式。
- Select 模式中也可以直接拖曳連接點建立連線。
- **圓形點**代表四側 General Connection Point，沒有數量限制；**方形點**代表 Engineering Port。
- 點選 Block 後，右側 **Engineering Ports** 可新增／移除 Port，編輯 Name、Type、Side、Direction、Max Connections。空白上限表示不限數量。欄位離開焦點時套用。
- 超過任一端 Port 的上限會顯示 Warning 並拒絕新增連線。如果把既有 Port 上限降低至目前連線數以下，保留既有連線，並在 Port 與面板顯示警告。
- 同一對 Block 可重複建立多條連線；選取既有線後按右側 **＋ Add parallel connection**，即可在相同端點間再新增一條獨立連線。路徑自動分開，每條線可單獨命名、選取與刪除，仍遵守兩端 Port 上限。Straight 模式的重複線會在端點附近分開，中段保持直線。
- 點選連線可編輯 **Interface Type、Label、Description、Line Style**；支援預設 Orthogonal 與 Straight。
- Block 的 Properties 下方亦有 Connection 清單，可直接選取被其他 Block 遮住的線。
- **Delete** 刪除目前選取的 Block 或單一 Connection。刪除 Block／Port 會同步清除相關連線。輸入欄位中的 Delete 不會刪除圖形。
- **Esc** 取消連線預覽並返回 Select。切換頁籤也會取消尚未完成的連線。
- Tab 可聚焦 Block、Connection 與連接點，Enter / Space 選取或建立連線。

## Demo

預設 5G UAV Communication Platform：15 個 Block、12 個 Engineering Port、20 條 Connection。
CPU 同時連接 DDR、FPGA、SDR、Ethernet PHY、PMIC；Clock Generator 的同一 CLK_OUT Port 連接 FPGA、SDR、RF Transceiver；PMIC 展示不限數量的 Power 分支。
SDR 右側與 RF Transceiver 左側直接展示四條分開的線：IQ / Digital、SPI Control、REF Clock、GPIO Sync。已接線的連接點保持顯示，不必先選取 Block。
RF／PCIe 範例 Port 使用單線上限；一般連接點與工程 Port 同時存在。
示例料號用於展示，不代表相容性或選型驗證。

## 範圍與限制

本次 Phase 1 已包含 Resize、Graph、Port、Connection 與連線屬性編輯。資料共用於三頁，Placement 顯示未放置清單，Design Check 尚未執行規則。
Undo/Redo、Zoom/Pan 仍屬後續工作；PCB Placement、Zone／Design Check、Save／Load／Export 分別在 Phase 3–5。
目前資料只存在記憶體，重新整理會恢復 Demo。
直角線使用端點方向與分支間距做基本路徑計算，沒有障礙物避讓，也不是 PCB Routing。工程 Port 上多條線使用相同實際接點，再以不同彎折間距分支；一般連接點會沿邊界錯開起點。

## 模組

- `js/component-library.js`：元件分類、圖示與模板。
- `js/state.js`：Graph State、CRUD、Port 容量驗證、事件與 UUID。
- `js/demo.js`：Demo 元件、Port 與分支連線。
- `js/geometry.js`：八方向縮放、旋轉、Port 排列、錨點與路徑純計算。
- `js/connection.js`：SVG Edge 增量更新、連線預覽與建立流程。
- `js/workspace.js`：工作區尺寸、鏡頭範圍、縮放、平移與 Fit View。
- `js/theme.js`：深色／淺色主題切換與專案狀態同步。
- `js/text-box.js`：文字框建立、渲染、移動、縮放與選取。
- `js/storage.js`：本機存檔、JSON 驗證與匯入匯出、完整 SVG-to-PNG 渲染。
- `js/clipboard.js`：選取快照、貼上 UUID 與端點重建。
- `js/selection.js`：框選、Shift 多選、群組拖曳。
- `js/free-line.js`：獨立直線、端點拖曳、箭頭與繪製預覽。
- `js/architecture.js`：SVG Block、Handle、Port 與 Pointer 操作。
- `js/properties.js`：Component／Port／Connection 表單。
- `js/app.js`：元件庫、頁籤、工具列、清單、狀態與警告。

傳統 scripts 按序載入 `window.Planner` namespace，支援直接 file:// 開啟。拖曳／縮放不重建 SVG Block，只更新目標節點與相關連線。詳細 Schema 見 `DATA_MODEL.md`。

## 測試

Node.js 24 或更新版本：

```sh
pnpm install --frozen-lockfile
node --test tests/*.test.cjs
```

- `tests/graph.test.cjs`：九組 State／Geometry 測試，包含需求 Case 1–6、Port 容量、八方向與旋轉縮放、兩種路徑、多對多與 JSON 序列化。
- `tests/editor.test.cjs`：十三組 jsdom 事件／DOM 整合測試，涵蓋載入、Drag / Drop / Resize、Select / Delete、Properties、Connect、Warning 與頁籤切換；會捕捉執行時例外。

26 組測試通過。jsdom 使用模擬的 SVG 座標轉換與 hit target，不能替代實際瀏覽器的視覺、原生 Pointer Capture、縮放比例與滑鼠命中驗收。此環境的瀏覽器工具阻擋本機 file:// 頁面，尚未完成真實瀏覽器驗收。







### Virtual IC placement

Open **Placement** after creating your Block Diagram. Click an inventory item or **放入所有 IC** to create one planning footprint per block. Drag footprints on the PCB, edit X/Y in millimeters, rotate by 90°, or return a footprint to the inventory. Board dimensions are adjustable (10–1000 mm); placements stay inside the board. Red outlines identify overlapping footprints. Dashed lines follow the architecture connections and can be hidden.

Placement changes preserve the logical diagram. Project save/load and JSON import/export include board dimensions and placements; deleting a block removes its footprint. Set **IC 長 (mm)**, **IC 寬 (mm)** and **IC 高 (mm)** in the Architecture component properties; **IC 面積 (mm²)** is calculated as length × width. Placement uses these same dimensions, including for existing footprints and 3D solids; edit physical dimensions in Architecture. Changes that cannot fit an already placed IC on the board are rejected. Older projects inherit IC dimensions from existing placements, or default to 12 × 12 mm.

Sizes and drawn pads are illustrative planning geometry, not manufacturer packages or verified pin assignments.


Placement opens in **3D 旋轉檢視**. Drag to rotate the board, use the mouse wheel to zoom, or focus the view and use arrow keys and +/−. Click a solid to select its component. **俯視擺件** retains the drag-to-place editor; **重設視角** restores the default camera. Set **板厚 mm** and apply board dimensions to update the board solid. The height summary reports the tallest placed IC and the total height from the bottom of the board to the top of that IC (board thickness + tallest IC). All ICs mount on the top surface.

IC 高 is the physical Z height; older IC footprint dimensions remain the length and width, preserving existing placement layouts. Older files default to 1.5 mm IC height and 1.6 mm board thickness. These values persist through local save/load, copy/paste, and JSON export/import.

Architecture properties include **IC 封裝** with QFN, BGA and SOT options. SOT exposes **SOT 總 PIN 腳數**, accepting even integers from 2 to 64 (default 6), with half on each side. Placement top and 3D views show the symmetric SOT leads and rotate them with the component. Configured IC dimensions include the lead envelope; the SOT body is inset within it. Package information persists in copy/paste and project files; older projects default to QFN. These planning leads do not assign engineering ports to physical pins.
