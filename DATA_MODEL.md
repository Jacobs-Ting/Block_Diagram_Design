# Engineering Graph 資料模型

所有資料位於 `window.Planner.state`，包含 `project`、`board`、`components`、`ports`、`connections`、`placements`、`zones`、`rules`。
選取項目、頁籤、工具模式與警告屬於 `Planner.ui`，不屬於工程資料。

`state.workspace` 保存 Architecture 工作區的 `width` 與 `height`。目前的 pan / zoom camera 是 UI 視角，不寫入工程資料；Fit View 會重設為完整工作區。調整工作區不會重算、裁切或刪除任何工程物件座標。

## Component

```js
{
  id: 'UUID',
  name: 'CPU', type: 'CPU', category: 'Processor',
  vendor: 'NXP', partNumber: 'i.MX 8M Plus',
  description: '', voltage: '', frequency: '', power: '', notes: '',
  renderColor: '#1c2938',
  x: 60, y: 160, width: 200, height: 112,
  rotation: 0, minWidth: 180, minHeight: 112
}
```

x/y/width/height 為 Architecture 畫布單位，並非 PCB mm；rotation 為以 Block 中心旋轉的角度。
renderColor 使用六位十六進位 RGB，供 Architecture、JSON 與 PNG 使用；舊資料缺少此欄位時套用預設色。

## Port

```js
{
  id: 'PORT_UUID', componentId: 'COMPONENT_UUID',
  name: 'CLK_OUT', type: 'Clock', side: 'top',
  direction: 'output', maxConnections: null
}
```

Port 正規化儲存在 `state.ports`，透過 componentId 參照 Component；使用 `Planner.componentPorts(componentId)` 取得某個 Block 的 Port，不在 Component 內複製另一份資料。
side 為 top/right/bottom/left；direction 為 input/output/bidirectional。方向在此階段作為工程 metadata，尚未執行方向或介面相容性檢查。
maxConnections 為正整數或 null（不限數量），同時計入作為來源或目標的連線。UI 允許降低上限但會警告，新增連線則會拒絕超額。

## Connection

採用需求 5L 的 nested endpoint 結構。`id` 即連線的 connectionId，不另存重複欄位。

```js
{
  id: 'CONNECTION_UUID',
  source: {componentId: 'CPU_UUID', portId: 'PCIE_PORT_UUID', anchor: 'right'},
  target: {componentId: 'SDR_UUID', portId: null, anchor: 'left'},
  interfaceType: 'PCIe',
  label: 'PCIe Gen4 x4',
  description: '',
  routingStyle: 'orthogonal'
}
```

source.componentId / source.portId 對應 sourceComponentId / sourcePortId；target 同理。
portId=null 代表一般連接點；非 null 代表 Engineering Port，必須屬於指定 Component。其 anchor 會隨 Port.side 修改保持一致，幾何函式以 Port 的目前 side 為準。
每條 Edge 都是獨立物件，無單一 parent/child 或 component.target 限制，支援一對多、多對一、多對多；不允許同一 Component 自連線。

## 幾何與一致性

- 不在 State 保存 x1/y1/x2/y2、SVG path 或 DOM 參照。
- `geometry.anchor` 依 Component 位置、尺寸、旋轉與 Port 排列即時計算端點。
- 多條 General Connection 沿其邊界插槽錯開；多條 Engineering Connection 保留共同 Port 的精確位置。
- `geometry.route` 產出 SVG path 與 Label 位置，僅作渲染輸出。
- 移動與縮放會更新相關 Edge；拓樸變更會清理不再存在的 SVG Edge。
- 刪除 Component 清理其所有 Port、Connection、Placement；刪除 Port 清理引用它的 Connection；刪除單一 Connection 保留其他 Edge。
- 新增連線前驗證 Component 與 Port UUID、Port 所屬關係與容量，不允許建立孤立 Edge。

## 後續擴充

Geometry 不依賴 DOM，可供 Placement、檢查或匯出重用。分析程式可直接以 components / connections 建立 adjacency map；工程規則、Power / Clock / RF Tree 不必從 SVG 反推關係。
`state.ports`、`state.connections` 是唯一工程真實來源；未來匯入應先驗證 UUID、端點引用與設定，再通知 renderer 更新。

## Independent line object

`state.lines` 保存自由繪圖直線。每個物件包含 `id`（UUID）、`x1`、`y1`、`x2`、`y2`、`label`、`arrows`。
`arrows` 為 `none` / `start` / `end` / `both`；座標為畫布單位。直線無 Component／Port 引用，不參與工程 Graph；刪除 Block 不會刪除此類物件。
使用 `addLine` / `updateLine` / `removeLine` 修改，並經 line-add / line-update / line-remove 通知畫面。既有工程 Connection 仍依邏輯端點計算座標。

## Selection and clipboard

`ui.selection` 為 `{id, kind}` 陣列，kind 為 component / connection / line。單選時 `ui.selected` / `ui.selectedKind` 仍提供既有屬性面板相容性，多選改以數量摘要呈現。
`copySelection` 保存深層快照，包括選取 Component 的 Port、內部 Connection 與明確選取的 Edge／Line。`pasteSelection` 重新配置 Component／Port／Edge／Line UUID，內部端點透過 ID map 重建；原有 Port 容量驗證照常執行。
剪貼簿是工作階段 UI 資料，不加入 Project JSON。Placement／Zone 不隨 Architecture 複製。
