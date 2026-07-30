把 Full Island Reconstruction 推到全部 ticket 完成为止。

这是一个持续多轮、跨多次 compaction 的工程任务。除非遇到**必须人工介入**的问题（见第 8 节），否则不要停下来等指示：做完一个 ticket 就继续下一个。

## 0. 工作目录

**直接在主仓库工作：**

    C:/recent_project/3d_pcg_reversal

分支 `experiment/claude-full-island-scene` 检出在主仓库里。`.claude/worktrees/` 下有三个残留目录，都不要用、不要 checkout（目标分支已被主仓库占用，强制切换会损坏状态）。如果 harness 把你分配到某个 worktree，每条命令都用绝对路径 `cd` 回主仓库——shell 的 cwd 每条命令后会重置。

开始前核对：

    cd C:/recent_project/3d_pcg_reversal
    git branch --show-current
    git log --oneline -3
    git status --short
    git fetch origin && git rev-list --left-right --count HEAD...origin/experiment/claude-full-island-scene

预期：分支 `experiment/claude-full-island-scene`，HEAD `a2e67e8`，工作区干净，与 origin 同步（0 0）。若不符，停止并报告。

## 1. 必读

按顺序，读完再动手：

1. `.scratch/full-island-reconstruction/handoff.md` ← 权威交接
2. `.scratch/full-island-reconstruction/spec.md`
3. 你要做的那个 ticket（`.scratch/full-island-reconstruction/issues/`）
4. `AGENTS.md`、`CONTEXT.md`
5. `docs/adr/0036` 到 `0052`

**不要只看 ticket 的 Status 或复选框。**以 git 提交、代码、冻结证据和可重复的检查为准，证据文件直接读，不要凭记忆。

## 2. 当前状态

| 状态 | ticket |
| --- | --- |
| 完成 | 01（ADR-0051）、08 |
| 已落地、门禁仍红 | 04 海面、05 天际线 |
| 进行中 | 02 大气、03 地形、09 分布式覆盖 |
| 未开始 | 06、07、10、11、12、13、14、15、16 |

门禁：`structuralCorrespondence` PASS；`worldGeometry` 9/13 红；`fixedCameraGeometry` 10/10 红；`nativeAppearance` 被前两层 blocked（ADR-0040 排序规则，不是缺校准）。

`npm test`：245 项，239 通过，4 todo，2 失败。两个失败是：海面外观阈值（真红），以及**先于本任务就存在的** `stone-v2-calibration-contract`（CRLF/LF 哈希，见 handoff）。

## 3. 建议顺序（可按证据调整，但要说明理由）

1. **09 cover 的埋深**——最高性价比。cover 是 fixed-camera 层里最差的组，独占十个门禁里两个 worst-group 项，目前 IoU 0.0013 对阈值 0.3026。放置和尺寸已修好，剩下的原因已定位：参考的 `overviewPixels` 是 0, 0, 105, 3, 20，最大的两个 population 横跨 590×552 单位却一个像素不占——authored 地面岩石是**埋进地形里**的，候选把实例摆在地表中心。inventory 里没有记录这个下沉量，需要新增一次浏览器侧测量（每实例 Y 对其下方地形的偏移）。
2. **06 地面** plazas 0.334 / paths 0.176 / rocks 0.337 IoU。
3. **07 建筑** structures 0.500 IoU、31–40 ΔE。
4. **11 材质**——`palm-foliage` 六机位均值 51.82，是最大的单项外观残差。之后是 `paving-stone` 33.15、`blossom-foliage` 32.82、`painted-timber` 32.26。
5. 10、12、13、14，然后 15、16。
6. **05 的共享形态族**（见第 7 节）。

**在 06/07/11 之前，先建"浏览器在环"的拟合工具。** 这三个都是只能通过渲染捕获测量的外观 ticket，现有的 Reference-guided Fitting Loop 是 Node 侧、只测几何。做 04 时是靠 90 秒一轮手工试参数推进的，再来三次不划算。

## 4. 每个 ticket 的做法

先建一个能准确暴露缺口的非交互式红色检查 → 小步红绿驱动 → 跑最小相关检查 + 回归检查 → 检查 diff、独立 cohesive commit、push → 继续下一个。

一个 ticket 一个提交。提交前检查 `git status`、staged diff 和相关检查。

## 5. 这一轮学到的、会重复出现的教训

**测量比候选先出错，而且不止一次。** 到目前为止每一个大缺陷都是这个形状：

- 天际线：人工复核记录的是"候选的远山又低又块状"，测量说的是候选**高出参考 2.6453°**、在 720 个 bin 里有 624 个更高。绝对角度误差分不出这两者，所以现在证据里有 `profile.signedBias`。
- 深度区间：`depthError` 是两个顶点的极值，奖励"把包围盒填满到角落"，一个填满盒子的团块比一条正确的窄脊得分更高。为此加了 `depthCentreError`。
- cover：`scaleRange: [0.6, 1.6]` 是**编出来的**，参考自己的 `worldSurfaceArea` 早就躺在冻结的 inventory 里，四个 population 大了 1.6–2.7 倍。
- ridgeDirection 一度只决定节点排序，三分之二的组被给了同一个值，因为任何值都产出相同几何。

所以：**当一个数字大幅变好或某个修复"没效果"时，先确认它到底在测什么。** 遇到一个作为拟合输入的测量摘要，先检查它的分辨率对不对得上阈值（天际线的山峰来自 12×12 网格，在 1400 单位外是 ±4.7 个方位 bin，比整个 0.945° 预算还宽）。

**先看参考再设计。** 参考 GLB 可以离线读：`@gltf-transform/core`、`@gltf-transform/extensions`、`draco3dgltf` 已在 devDependencies，`tools/development/fit-stone-supports.mjs` 是范例。ticket 05 是在盲拟合两轮之后才去看 authored 网格的，一看就清楚了（31% 包围盒占用的对角窄脊带）。

**不许用一个门禁买另一个门禁。** 本轮实例：cover 用 authored 地板做二次过滤，密度比从 0.9 塌到 0.19——那是 ticket 03 的地形残差，用 cover 规则去补它就是拿一个 ticket 的错误买另一个的指标。修好放置后单独提交会让七个门禁指标变差，所以把尺寸一起修完才提交。

## 6. 环境与命令

浏览器命令前先设置：

    export CHROME_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    export PYTHON_BIN="python"

本机只有 Edge 150 headless + SwiftShader、Python 3.14、Node v24.11。**没有 Chrome、Firefox、Safari，也没有 macOS。**

浏览器门禁逐条单独跑，用 `run_in_background`，不要前台 sleep 轮询。`run-scene-passes.mjs` 约 90–120 秒；16 个校准控制全量约 10 分钟。

**改了 `tools/evaluation/scene-pass-metrics.mjs` 里任何东西 = 每一份已存捕获都失效**，包括 16 个校准控制的 partial。重测顺序见 handoff。改 `horizon-evidence.mjs` 之类不影响捕获。

改了几何/材质之后的常规顺序：

    npm run measure:scene-correspondence
    node scripts/run-scene-passes.mjs      # 后台
    npm run report:scene-parity
    npm run certify:scene-parity-foundation
    npm test

## 7. 绝对运行时约束

最终 Production Runtime 必须完全由代码生成。禁止：已有网格、GLB/GLTF 或模型加载器、authored texture、terrain heightfield、Ground Truth loader、source-node identity、dense vertex arrays、像素表、采样网格、压缩模型数据、矢量化位图、reference/measurement/fitting/evaluation import、`Math.random()`、时间或设备状态驱动结构生成、为通过测试复制参考拓扑、隐藏在 shader/数组/字符串中的密集参考数据。three.js addon 是允许的第三方库代码。

新增生产模块要同时加到两处：`check-scene-generation.mjs` 的 `PERMITTED_RUNTIME_PATHS` 和 `run-foundation-certification.mjs` 的 `PRODUCTION_FILES`。

**禁止的"改善"方式：** 根据候选结果放宽冻结阈值、为当前失败定制校准扰动、手工修图、隐藏错误机位、删除不利证据、用材质掩盖错误几何、用平均分掩盖缺失对象、把 reference node name 带入生产、把密集测量数组塞进代码、复制参考 topology、跳过 worst-case evidence。

若冻结 gate 本身有盲点，走 reference-only calibration + 明确 ADR + 版本化 baseline 修订。ADR-0049/0050/0051 是范例。

## 8. "全部完成"是什么意思，以及什么才算真阻塞

目标是所有可执行 ticket 完成、四层门禁按 ADR-0040 排序规则尽可能全绿、Production Runtime 通过参考独立性/确定性/性能/compactness/浏览器检查、六机位比较与差异证据已生成、工作区干净全部 push。

**有两处已知不可能在当前约束下变绿，不要在上面空转，也不要伪造通过：**

- **ticket 05 的天际线门禁**（ADR-0052）。八形态上限下不可达，这是控制预算的性质而不是拟合器的问题：动态规划给出的最优分段线性界在 8 节点是 3.257°、24 节点 0.952°，阈值 0.945°。唯一出路是共享形态族——16 个组只是 3 个源网格的实例，3 张 24 节点 crest 表是 216 个数而不是 1152 个。形态族要按**测量形状聚类**推导，绝不能用源网格身份。这是新表示，需要 reference-only 测量 + 版本化 gate 修订 + 自己的 ADR。做不做由证据和预算决定；不做就保持 `todo` 并说明。
- **ticket 15 的 Firefox / Safari 原生 GPU 门禁**。两个浏览器都没装，这是真实 blocker，必须明确列为 blocker 而不是伪造通过。

另外两个**先于本任务存在**的红色，已诊断未修，都属于仓库级决定，请明确处理（修或明确记录为不修）而不是让它们悬着：

- `test/stone-v2-calibration-contract.test.mjs`：CRLF vs LF，十一个冻结文件规范化成 LF 后哈希全部正确（`visual-metrics.mjs` 磁盘 32,795 字节 / LF 31,800 字节，sha 与冻结值精确吻合），`core.autocrlf` 是 `false`。
- `npm run check:scene-parity-foundation`：把 `generationMs` 这个墙钟值放进逐字节比对，永远不可能通过（对着存档的 538.5，三次跑出 540.4 / 524.5 / 529.5）。`certify:` 本身正常。

**只有以下情况才停下来问人：** 缺少外部授权或凭据；需要不可替代的硬件（如 macOS / Safari）；需要删除或重写来源不明的文件；需要修改 main 分支；或者要做一个会推翻已认证 Foundation 的决定。其余一律自己判断，重要且难以逆转的写 ADR。

## 9. 纪律

- 只修改 `experiment/claude-full-island-scene`；不动 main；不 `git reset --hard`；不 force push；不删除来源不明的文件（仓库根有一个无害的未跟踪 `dev/null/` git-lfs hook 目录，留着别管）。
- 定期给出简短进展：当前 ticket、已完成检查、当前红色证据、下一步。报告要如实：失败就贴输出，跳过就说跳过。
- 若必须 compact，先把状态写进 `handoff.md` 再继续，不要重新开始。**本任务预计跨越多次 compaction，这是正常的，不要因此收尾。**
- 临时脚本放 `.scratch/browser-tooling/`（已 gitignore），提交前清理；有长期价值的分析工具提升到 `tools/development/` 并让它可复现（例：`tools/development/measure-horizon-form-budget.mjs` 是 ADR-0052 的证据）。

## 10. 启动动作

先报告：分支/HEAD/工作区状态、从 handoff 与实际证据核对出的真实进度、你要处理的第一个 ticket 和理由、你将运行的第一个红色检查。报告后立即持续执行，不需要等确认。

最终目标是完成全量程序化岛屿复现，不是只交付评估框架或又一个粗略 prototype。
