# 第三方代码声明 / Third-party notices

本项目的 `client.js` 中标记为 `TF` 的整块代码（连同 `TF_CSS`）是从
[@winteries/dsh-turn-fold](https://github.com/Winter-And-You-Gone/dsh-turn-fold)
**原样移植**的，不是重新实现。移植范围包括：

- turn-fold 的全部 `.ccg-*` 样式（`TF_CSS`）
- 扑克牌几何与花色 path、`PokerIcon` / `buildPokerSVGBase` / `pokerDynamicMask` /
  `PokerSpinIcon` / `buildPokerSpinSVG`（含 `icons/default.json` 里的图标配置值）
- `TurnBarView`、`SettingsDialog`、`IconStyleSelector`、`GearIconSvg`
- 指标聚合与文案：`computeTurnMetrics` / `turnHeaderLabel` / `filterVisibleMetrics` /
  `formatFieldValue` / `_T` 文案表 / `useLiveNow` / `useFieldVisibility` / `useIconStyle`

原作者许可（MIT）：

```
MIT License

Copyright (c) 2026 dsh-turn-fold contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

本仓库其余部分（`index.js`、胶水层、测试、文档）版权归 HuaiPengFei666，同样以 MIT 授权，
见 [LICENSE](LICENSE)。
