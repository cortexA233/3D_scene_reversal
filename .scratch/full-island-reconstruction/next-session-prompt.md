把 Full Island Reconstruction 推到全部 ticket 完成为止。

这是一个持续多轮、跨多次 compaction 的工程任务。除非遇到**必须人工介入**的问题（见第 8 节），否则不要停下来等指示：做完一个 ticket 就继续下一个。

## 0. 工作目录

**在 worktree 里工作，不要碰主仓库：**

    C:/recent_project/3d_pcg_island

主仓库 `C:/recent_project/3d_pcg_reversal` 现在检出在 `generalized-single-model-pipeline`
上，另一个会话在用它（reflog 显示来回切过几次）。本任务的分支
`experiment/claude-full-island-scene` 检出在上面那个 worktree 里，`node_modules` 是指向
主仓库的 junction（两个分支的依赖清单逐字相同，已核对过）。

**每条命令都要用绝对路径 `cd` 回去** —— shell 的 cwd 每条命令后会重置：

    cd /c/recent_project/3d_pcg_island && <command>

`.claude/worktrees/` 下的残留目录都不要用。

开始前核对：

    cd /c/recent_project/3d_pcg_island
    git branch --show-current
    git log --oneline -3
    git status --short
    git fetch origin && git rev-list --left-right --count HEAD...origin/experiment/claude-full-island-scene

预期：分支 `experiment/claude-full-island-scene`，HEAD `267da7b`，工作区干净，与 origin
同步（0 0）。若不符，停止并报告。

如果 worktree 不存在（被清理了），重建它：

    cd /c/recent_project && git -C 3d_pcg_reversal worktree add ../3d_pcg_island experiment/claude-full-island-scene
    cmd //c "mklink /J C:\recent_project\3d_pcg_island\node_modules C:\recent_project\3d_pcg_reversal\node_modules"

## 1. 必读

按顺序，读完再动手：

1. `.scratch/full-island-reconstruction/handoff.md` ← 权威交接
2. `.scratch/full-island-reconstruction/spec.md`
3. 你要做的那个 ticket（`.scratch/full-island-reconstruction/issues/`）
4. `AGENTS.md`、`CONTEXT.md`
5. `docs/adr/0036` 到 `0060`

**不要只看 ticket 的 Status 或复选框。**以 git 提交、代码、冻结证据和可重复的检查为准，证据文件直接读，不要凭记忆。

## 2. 当前状态

| 状态 | ticket |
| --- | --- |
| 完成 | 01（ADR-0051）、08、09、10（ADR-0056）、15（ADR-0059） |
| 部分完成 | 06 —— plazas/decks（ADR-0057）、rocks（ADR-0058）已落地，`paths` 真阻塞于 03 |
| 部分完成 | 12 —— `lantern`、`npc-statue` 已落地（ADR-0060），另 17 个 kind 多是单 placement |
| 已落地、门禁仍红 | 04 海面、05 天际线（ADR-0052 记录的边界） |
| 进行中 | 02 大气、11 材质 |
| 已诊断、待建 | 07 —— 桥的带状形体、两种树的地面结构，见 ticket 里的四个 finding |
| 未开始 | 13、14、16 |
| 边界已记录，不是待做项 | 03（ADR-0054）、05（ADR-0052） |

门禁：`structuralCorrespondence` PASS；`worldGeometry` 8/13 红；`fixedCameraGeometry`
10/10 红；`nativeAppearance` 被前两层 blocked（ADR-0040 排序规则）。

`npm test`：287 项，280 通过，6 todo，**1 失败**——ticket 04 的海面外观阈值。

累计进展：`surface p95` 均值 9.3025 → **7.175**；`worst group contour distance`
223.84 → **151.62**；`group world normal p95` 79.94 → **78.59**；`component deficit`
9 → **0**；`plazas` 像素比 1.89 → 1.12；`rocks` contour 47.93 → 24.06；
`decorations` IoU 0.429 → 0.452。

## 3. 建议顺序（可按证据调整，但要说明理由）

按**证据强度**排。前两项的测量都做完了，值都在 ticket 07 里，**不要重新测**：

1. **桥的带状形体。** 三个已测控制在 ticket 07（coverage 0.568/0.432、`deckHeight`
   0.712/0.443、profile spread 0.184/0.187 —— spread 两桥一致，是 family 常量）。
   缺的是第四个：**轴向**。两桥最大两个矩形连成的轴是 **−119.2° 和 +136.1°**，即沿各自
   包围盒的**相反对角线**。上一次用居中的十字+步道 plate 做，像素比 2.22→1.58、
   contour/depth/normal 全好转、**IoU 0.362→0.295**，已回退。
   几何约束要先算清楚：旋转带子的 AABB 必须精确等于 extent。桥 1 的 AABB 比例 0.75 配
   60.8° 轴向要求 L≈3.02w，单条带子只覆盖 0.414 而实测 0.568，差额是栏杆/桥台/引道。
2. **两种树的地面结构。** `wish-tree` + `swing-tree` 是 `structures` 组 40% 的 authored
   像素、8 个 placement。缺的是地面结构不是树冠：authored 底部 reach 0.616–0.661 对候选
   0.095–0.314。**支柱数量无法从径向平均剖面恢复** —— 显式声明它、说明是声明的、用实测
   share/reach 这一对校验建出来的结果。别把树干加粗：reach 是均值，实心柱会画七倍宽。
3. **`pavilion` / `pavilion-single`** —— 2,792 + 1,654 像素但各只有 1 个 placement。
   证据薄，用 ADR-0060 的旋转剖面（`axialLathe`，`segments: 4` 或 8 给方形/八角平面）
   而不是一堆盒子。
4. **11 材质的下半** —— roughness / transparency / emission 仍是手写的，且完全没有
   bounded semantic pattern program，每个 family 一个平色。
5. 13、14，然后 16。

**每次改形体，捕获必须在环里。** 本里程碑回退过两次（架构 massing 拟合、桥的 plate），
**两次都栽在已有证据里已经记录、而设计步骤跳过了的东西上**。先读你已经付钱买到的分解和
剖面再设计形体：`plate-footprint-v1.json` 每个资产记了最多六个矩形（位置携带**轴向**），
`axial-massing-v1.json` 记了每个 kind 逐分位的 share 和 reach（两侧同一个采样器）。

**已经证明有效的三个做法**，优先复用而不是另发明：`axialLathe` 的单旋转曲面（比一堆图元
好：回退那次剖面对了、contour 涨了五分之一）；已接受的 Bounded Support-plane Polyhedron
（`canonicalSupportDirections` 已 import，径向求值，不复制冻结的凸包构造）；recipe 里的
逐实体紧凑控制（`shape: {}`，两三个标量，有测试断言只有那几个键）。

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

**先读你已经付钱买到的分解，再设计形体。** 这一轮又被同一件事咬了两次，两次都回退：

- **架构 massing**：拟合的是 *triangle-share* 剖面，而门禁量的是渲染 contour 和 depth。
  剖面对上了，contour p95 涨了五分之一（29.635 → 35.635），8 个渲染门禁退化 6 个。
- **桥的 plate**：coverage 和 deckHeight 都测对了，形体族错了。像素比 2.22 → 1.58、
  contour/depth/normal 全好转，**IoU 0.362 → 0.295**。而 `plate-footprint-v1.json`
  里早就记着每座桥最大两个矩形的位置，连起来的轴向是 −119.2° 和 +136.1°——两座桥沿
  **相反对角线**跑，居中的十字+步道 plate 两个都不是。

所以：**一个测量出来的控制能迁移，不等于形体族能迁移。** 而且改村落形体时捕获必须在环里
——surface 剖面和渲染门禁会朝相反方向走（plaza 那次 deck 的 surface 微涨、渲染大幅改善；
桥这次反过来）。

**Target AABB Extent 是硬输出目标，所以候选无法靠缩小来降低覆盖率。** `placeEntity` 把
生成体的 AABB 精确压到申报的 extent 上，内缩的板会被拉回墙上。低覆盖只能靠凹或穿孔。而且
只匹配覆盖率不匹配覆盖**位置**会让 IoU 变差、同时让像素比看起来变好：填满盒子的候选 IoU
恰好等于参考的覆盖率 c，覆盖率对了位置随机的候选是 c²/(2c−c²)。

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
- **ticket 15 的 Firefox / Safari 原生 GPU 门禁**。ticket 15 本身**已完成**（ADR-0059）：
  真正的阻塞不是"没装浏览器"，而是我们自己的 harness 每次启动都传
  `--use-angle=swiftshader`，所以里程碑里每一次运行都是软件光栅化；这台机器其实有
  Intel Arc 140T，`--use-angle=default` 就能拿到。Edge 已记录两次稳定的原生 GPU 运行。
  Firefox / Safari 仍然拿不到，原因比"没装"更深：**Gecko 说 WebDriver BiDi、WebKit 说
  WebKit inspector 协议，共享的 CDP harness 驱动不了任何一个**。写一个 BiDi 传输才是那份
  工作。Safari 还需要 macOS（不可替代硬件）。两个都已按可复现命令记为 `unavailable`，
  **不要伪造通过，也不要为此改共享 harness**（那会一次性移动里程碑里所有 rendered 测量）。

另外两个**先于本任务存在**的红色，已诊断未修，都属于仓库级决定，请明确处理（修或明确记录为不修）而不是让它们悬着：

- ~~`test/stone-v2-calibration-contract.test.mjs`~~ **已结清**：它在这个 worktree 里
  7/7 通过、在原工作副本的同一个 commit 上失败，证实冻结哈希是对的、是某个工作副本磁盘上
  是 CRLF。**不要为了让它变绿去重新冻结契约**——那会把一台机器的 checkout 状态烤进冻结
  产物。修法是重规范化那个副本。
- `npm run check:scene-parity-foundation`：把 `generationMs` 这个墙钟值放进逐字节比对，永远不可能通过（对着存档的 538.5，三次跑出 540.4 / 524.5 / 529.5）。`certify:` 本身正常。

**只有以下情况才停下来问人：** 缺少外部授权或凭据；需要不可替代的硬件（如 macOS / Safari）；需要删除或重写来源不明的文件；需要修改 main 分支；或者要做一个会推翻已认证 Foundation 的决定。其余一律自己判断，重要且难以逆转的写 ADR。

## 9. 纪律

- 只修改 `experiment/claude-full-island-scene`；不动 main；不 `git reset --hard`；不 force push；不删除来源不明的文件（仓库根有一个无害的未跟踪 `dev/null/` git-lfs hook 目录，留着别管）。
- 定期给出简短进展：当前 ticket、已完成检查、当前红色证据、下一步。报告要如实：失败就贴输出，跳过就说跳过。
- 若必须 compact，先把状态写进 `handoff.md` 再继续，不要重新开始。**本任务预计跨越多次 compaction，这是正常的，不要因此收尾。**
- 临时脚本放 `.scratch/browser-tooling/`（已 gitignore），提交前清理；有长期价值的分析工具提升到 `tools/development/` 并让它可复现（例：`tools/development/measure-horizon-form-budget.mjs` 是 ADR-0052 的证据）。

## 10. 启动动作，和唯一一次结束报告

**开头**：报告分支/HEAD/工作区状态、从 handoff 与**实际证据**核对出的真实进度、你要处理的
第一个 ticket 和理由、你将运行的第一个红色检查。报告后立即持续执行，**不要等确认**。

**中途**：每完成一个 ticket 或一次回退，给一段简短进展（当前 ticket、跑过的检查、当前红色
证据、下一步），然后**直接继续下一个**。不要在中途把阻塞项拿出来问——按第 8 节判断：能自己
决定的就决定，重要且难以逆转的写 ADR。只有第 8 节列的五种情况才停下来问人。

**结尾**：所有可执行 ticket 处理完之后，给一次**唯一的合并阻塞报告**，包含：

1. 每个仍然红的门禁，以及它是"已记录的表示边界"（附 ADR）还是"未完成的工作"；
2. 每个需要人工介入的项，说明**具体需要人做什么**（授权、硬件、仓库级决定），而不是笼统说
   "被阻塞"；
3. 每个被回退的尝试，附它的数字和被回退的原因；
4. 每一处你**声明**而非测量的数字，以及为什么测量给不出它；
5. 工作区状态、提交列表、`npm test` 与四层门禁的最终结果。

报告要如实：失败就贴输出，跳过就说跳过，回退就说回退并给数字。**不要把未执行的门禁写成
通过，不要为了让某个数字变绿去松动冻结阈值或重新冻结契约。**

最终目标是完成全量程序化岛屿复现，不是只交付评估框架或又一个粗略 prototype。
