# 把给定 mesh / 场景逆向成"纯代码程序化生成"：通用技术路线图

> 调研日期：2026-07-28
> 本文是**通用技术分类**，不绑定具体技术栈。针对本仓库 `gt_designer`（Three.js + JS/TS + shader）的落地方案见 [procedural-3d-scene-reversal-research.md](./procedural-3d-scene-reversal-research.md)。

## 0. 先把问题拆开：三个正交维度

"逆向复原成代码"不是一个问题，而是三个维度的组合。选路线之前必须先把这三格填掉，否则会拿错工具。

### 0.1 输入观测

| 输入 | 信息完备度 | 典型来源 | 主要难点 |
|---|---|---|---|
| 完整 mesh / B-Rep | 最高 | 已有资产、GLB、STEP | 无歧义，纯粹是"压缩成程序" |
| 点云 / 扫描 | 高 | 激光扫描、摄影测量 | 噪声、缺失、无拓扑 |
| RGB-D 扫描 | 中高 | ARKit、Kinect | 尺度可靠但遮挡多 |
| 多视图图像 | 中 | 渲染截图、视频 | 需先做重建或可微拟合 |
| 单张图像 | 最低 | 参考图 | 隐藏面、尺度、材质本质歧义 |

**关键区分**：如果你手上已经有 ground-truth mesh（本仓库就是这种情况），问题是**程序压缩 / 反编译**；如果只有图像，问题是**逆向图形（inverse graphics）**，难度高一个数量级。绝大多数论文做的是后者，但工程上前者的价值更实在。

### 0.2 输出程序的表示（这是最关键的选择）

| 表示 | 例子 | 表达力 | 可编辑性 | 搜索难度 |
|---|---|---|---|---|
| CSG 树 | primitive + 布尔 | 中（硬表面强，有机弱） | 中 | 中 |
| Sketch-and-Extrude 序列 | DeepCAD、CadQuery、build123d | 中高（机械件） | **高**（贴近人类设计意图） | 高（长程序） |
| 参数化 B-Rep | STEP + 特征树 | 高（工业标准） | 高 | 高 |
| 形状语法 / L-system | CGA、split grammar | 高（重复/递归结构） | 高 | 很高（结构+参数同时未知） |
| 节点图 | Blender Geometry Nodes、Substance | 高 | 高 | 高 |
| 通用命令式代码 | Blender Python、Three.js TS、OpenSCAD | **最高**（图灵完备） | 取决于代码质量 | **最高** |
| 场景语言 | SceneScript、ShapeAssembly | 中（限定语义） | 高 | 中 |
| 已有生成器的参数向量 | Infinigen factory 参数 | 受生成器限制 | 高 | **最低** |

表最后一行是重点：**只要目标域的 generator 已经存在，问题就从"发明程序"降级为"拟合参数"**——难度差几个数量级。这是唯一已经工业化可用的一条。

### 0.3 目标函数（互相冲突，必须排序）

1. **几何保真** — Chamfer、volumetric IoU、F-score、normal consistency
2. **语义可编辑** — 程序结构是否对应人类概念（"屋顶""柱子""层数"）
3. **紧凑性 / MDL** — 程序长度、primitive 数、参数数
4. **可泛化** — 换 seed 能否生成同风格新实例

保真度和紧凑性是**根本对立**的：保真度的极限解永远是"把顶点数组硬编码进源码"。任何逆向系统如果没有显式的紧凑性正则项，都会往这个退化解滑。**这是设计验收标准时第一个要钉死的事。**

---

## 1. 贯穿所有路线的统一结构

看完所有能 work 的系统，会发现它们是同一个骨架的变体：

```
离散结构搜索  (程序骨架：有几个 primitive？什么拓扑？哪条语法分支？)
        ×
连续参数优化  (每个 primitive 的尺寸、位置、角度、噪声频率)
        ×
执行 + 度量反馈  (跑一遍程序 → 渲染/采样 → 和目标比 → 回传)
```

区别只在于**谁来负责哪一层**：

| 层 | 可选方案 |
|---|---|
| 离散结构 | 人工设计 DSL / 贪心增量拟合 / 束搜索 / MCTS / RL / 神经自回归解码 / LLM 生成 / e-graph 等价重写 |
| 连续参数 | 可微渲染反传 / 神经代理网络 / CMA-ES、Nelder–Mead / MCMC / 解析拟合（最小二乘） |
| 反馈 | 几何度量（CD/IoU）/ 多视图 silhouette、depth、normal / 感知与语义特征（SigLIP、DINO）/ 执行错误 / 几何合法性 verifier |

**可微性是主要障碍**：程序化生成里的随机采样、拓扑变化、布尔运算天然不可微。四种破解方式——
① 训神经代理逼近生成器（[NNProc, EG 2025](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70024)、[ProcGen3D](https://arxiv.org/html/2511.07142v1)）；
② 松弛为软占据/软 min-max（BSP-Net、D²CSG 一族）；
③ 直接放弃梯度，用 CMA-ES / MCTS / LLM 搜索；
④ 分层：结构离散搜索，参数梯度优化（主流做法）。

---

## 2. 八条技术路线

### R1. 几何分析式逆向工程（分割 → 基元拟合 → B-Rep）

**思路**：把 mesh/点云切成片 → 每片拟合解析曲面（平面/球/柱/锥/环面/NURBS）→ 求交得到边和顶点 → 缝合成 B-Rep → 特征识别还原成参数化历史树。

- 经典：Efficient RANSAC（Schnabel 2007）、region growing、Hough 变换
- 学习式分割+拟合：SPFN、ParSeNet、HPNet、SED-Net、[Point2CAD (CVPR 2024)](https://ar5iv.labs.arxiv.org/html/2312.04962)、[IPFNet (CGF 2025)](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70231)
- 检测式（跳过分割，直接出拓扑）：[ComplexGen (TOG 2022)](https://arxiv.org/pdf/2205.14573)、[Split-and-Fit / NVDNet（Voronoi 划分）](https://arxiv.org/pdf/2406.05261)、[HoLa (2025)](https://arxiv.org/pdf/2504.14257)、[AutoBrep](https://arxiv.org/pdf/2512.03018)、[DualBrep (2026)](https://arxiv.org/pdf/2606.31579)
- 商用成熟度最高：Geomagic Design X、[QUICKSURFACE 2026](https://www.quicksurface.com/whats-new-qs2026/)、[Shining3D EXModel 2026](https://www.shining3d.com/reverse-engineering/exmodel)（Parasolid 内核）

**适用**：机械件、硬表面、规则几何。
**不适用**：有机自然物、大规模场景、风格化艺术资产。
**注意**：B-Rep ≠ 程序。得到 B-Rep 后还需要特征识别才能变成可编辑的"代码"，这一步至今没有全自动的可靠方案。

### R2. CSG / 隐式程序归纳

**思路**：把形体解释成 primitive 的布尔组合，用无监督方式反推这棵树——不需要构造历史标注，这是它相对 R3 的最大优势。

- 程序合成派：[InverseCSG (SIGGRAPH Asia 2018)](https://inversecsg.csail.mit.edu/)
- 神经派：CSGNet → BSP-Net → UCSG-Net → CSG-Stump → CAPRI-Net → [ExtrudeNet](https://arxiv.org/pdf/2209.15632) → [D²CSG (NeurIPS 2023)](https://proceedings.neurips.cc/paper_files/paper/2023/file/4732d425125832887f6c5a9675d49ead-Paper-Conference.pdf)
- D²CSG 目前是这条线的强基线：双分支（cover + residual complement）设计，**可证明能表达任意 CSG 树**，在 ABC 上 Chamfer 0.069 / 平均 28.6 个 primitive，同时超过 InverseCSG、BSP-Net、CSG-Stump、CAPRI-Net
- 神经 SDF 上直接做布尔：[CSG on Neural SDFs (SIGGRAPH Asia 2023)](https://dl.acm.org/doi/fullHtml/10.1145/3610548.3618170)

**优点**：无监督、鲁棒、有理论保证。
**缺点**：程序**语义弱**——它给你 28 个二次曲面的堆叠，不是"底座 + 四条腿 + 靠背"。可编辑性接近于零。适合当中间表示，不适合当交付物。

### R3. CAD 指令序列生成（sketch-and-extrude 语言）

**思路**：直接生成人类 CAD 建模的动作序列（画草图 → 拉伸 → 旋转 → 倒角 → 布尔），输出天然可编辑。

- 数据与基线：DeepCAD、Fusion360 Gallery、SkexGen、HNC-CAD、Free2CAD
- 2025–2026：[CADFit](https://arxiv.org/abs/2605.01171) 把 mesh→CAD 表述成 **IoU 驱动的结构化程序优化**，增量地拟合并用几何反馈验证每一步操作，支持 extrude / revolve / **fillet / chamfer**（此前方法的公认弱项），指标用 volumetric IoU + Chamfer + invalid ratio；[CADFS](https://arxiv.org/pdf/2605.01925) 提供了大规模 CAD 程序数据集 + LLM 框架
- 公认瓶颈：**长程序、复杂布尔交互、收尾特征（倒角/圆角）**，以及依赖构造历史数据——而真实资产往往没有历史

**适用**：工业零件、需要交给 CAD 软件继续编辑的场景。
**不适用**：自然物、场景。

### R4. 语法归纳（经典 Inverse Procedural Modeling）

**思路**：从形体中检测**对称性和重复模式**，把它们提升成产生式规则，得到形状语法。正向对应物是 CityEngine 的 CGA。

- 理论基础：Bokeloh, Wand & Seidel 2010 建立了**部分对称性与逆向程序化建模之间的等价联系**——这是整条线的理论支点
- L-system 归纳：Št'ava et al. 2010（从矢量图自动生成 L-system）、Št'ava et al. 2014（树木）
- 语法学习：Talton et al. 2012（贝叶斯语法归纳）、Martinović & Van Gool 2013
- 立面：[Inverse Procedural Modeling of Facade Layouts (SIGGRAPH 2014)](https://arxiv.org/pdf/1308.0419)、Müller et al. 2007（image-based facade）
- 神经符号版：[FaçAID (SIGGRAPH Asia 2024)](https://arxiv.org/html/2406.01829) 用 transformer 做立面的神经符号重建

**适用**：建筑、城市、立面、装饰纹样、植物——**任何有强重复/强递归结构的东西**。
**不适用**：一次性的、无规律的艺术资产。
**难点**：结构和参数同时未知，搜索空间极大；对噪声和未分割输入敏感（这正是 Bokeloh 那条线要解决的）。

### R5. 已知生成器的参数反演（Inverse PCG）★ 最实用

**前提**：目标域的程序化生成器已经写好（Infinigen 的 factory、Blender Geometry Nodes、Substance 图、你自己的 TS generator）。任务只剩：**找到让它输出最接近目标的那组参数。**

| 手段 | 代表工作 | 适用条件 |
|---|---|---|
| 可微渲染 + 梯度 | Mitsuba 3 / nvdiffrast / PyTorch3D；[Automatic Differentiable Procedural Modeling (EG 2022)](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Gaillard-2022-Automatic_Differentiable_Procedural_Modeling.pdf)；[单视图 + IPM (2024)](https://www.mdpi.com/2073-8994/16/2/184)（silhouette loss） | generator 至少部分可微 |
| 神经代理（学正/逆映射） | [NNProc (CGF 2025)](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70024)——对齐参数空间与形状空间的隐空间，可从 mesh / 点云 / 照片反推参数 | generator 不可微但可大量采样 |
| 扩散模型直接预测参数 | [DI-PCG (CVPR 2025)](https://arxiv.org/html/2412.15200v1)——把 PCG 参数当作去噪目标，图像作为条件 | 有条件观测（图像） |
| 神经程序图 + 搜索 | [ProcGen3D (2025)](https://arxiv.org/html/2511.07142v1)——用 transformer 逼近生成器的"地形"，推理时用 **MCTS** 对着图像 mask 搜索。仙人掌/树/桥上验证；单个复杂物体最长 42 分钟 | 生成过程含随机采样、完全不可微 |
| 无梯度优化 | CMA-ES、Nelder–Mead、MCMC、GA | 参数维度不高（< 数十） |
| 程序材质（同构问题） | MATch / DiffMat、[VLMaterial (2025)](https://arxiv.org/pdf/2501.18623) | 外观而非几何 |

**这是投入产出比最高的一条**。代价是：generator 得先有人写——而写 generator 恰恰是人类擅长、AI 目前不擅长的部分。**分工建议：人写 generator 骨架，机器拟合参数。**

### R6. LLM / VLM 写代码 + 渲染闭环 ★ 最活跃

**思路**：让模型直接写 Blender Python / CadQuery / Three.js / OpenSCAD，执行、渲染、和参考对比、再改。本质是把"程序合成"外包给语言模型，用执行反馈做搜索信号。

- [LL3M](https://threedle.github.io/ll3m/)：多智能体分三阶段（初始创建 → 自动精修 → 用户引导精修），agent 做**代码自审 + 视觉自审**，输出可读可编辑的 Blender Python
- [CADDesigner](https://arxiv.org/html/2508.01031)：知识约束的代码生成 + 迭代视觉反馈，基于 CadQuery 定义了面向 LLM 的表达范式
- [CADSmith](https://arxiv.org/html/2603.26512)：闭环**几何验证**——在接受结果前程序化校验尺寸与拓扑正确性
- [3DFroMLLM](https://arxiv.org/pdf/2508.08821)：不借助任何 3D 训练数据，纯靠多模态 LLM 出 3D 原型

**[3DCodeBench (2026)](https://arxiv.org/html/2606.01057v1) 的实测结论最值得记住**（212 类、26K 条 text/image → code → mesh，数据由 Infinigen 的程序化 factory 改造而来）：

1. 多轮错误反馈把**可执行率从 0.70 拉到 0.97**——但这只解决"能跑"
2. **真正的瓶颈是物理/结构合理性**（部件断开、几何悬空），不是代码能否执行
3. Agent 脚手架能提升可执行性，**但不提升条件形状质量**
4. 思考预算对小模型有用，对前沿模型**饱和**
5. SigLIP-2 视图相似度与人类偏好相关性 **r = 0.964**——是目前最好的廉价自动评估代理
6. 该 benchmark 只覆盖**单物体**，场景级仍是空白

**结论**：这条路线现在能可靠地产出"能跑、大致像"的代码，但**几何精度和结构正确性远达不到复原一个给定 mesh 的要求**。正确用法是当**结构骨架的生成器**（出 DSL 调用、出程序框架），精度交给 R5 的参数拟合补。

### R7. 场景级：解析 → 检索 → 布局优化

**思路**：场景不逐三角形重建，而是分解为"资产引用 + 位姿 + 关系图"。程序化体现在**布局层**。

- 对齐派：Scan2CAD、Mask2CAD、ROCA、Vid2CAD
- 场景语言：[SceneScript](https://arxiv.org/abs/2403.13064)——点云自回归解码成 `make_wall` / `make_door` 之类的结构化命令
- 2025 前沿：[Diorama](https://arxiv.org/html/2411.19492v2)（**零样本、开放世界、单图** → 分割 + 深度 + 场景图 → CAD 检索 → 布局优化）、[LiteReality](https://litereality.github.io/)（RGB-D 扫描 → 结构化场景图 → 检索视觉相似资产 → 输出紧凑、可编辑、graphics-ready 的场景）
- 可微渲染版：PSDR-Room（单图 → 场景，路径追踪级材质光照拟合）
- 布局程序归纳：SceneMotifCoder（从物体排布中学紧凑可编辑的 meta-program）

**关键取舍**：这条线把几何**外包给资产库**——所以它不是"纯代码"。如果你的硬约束是最终产物零外部资产，R7 只能提供**布局层**的答案，物体几何仍要落回 R1–R6。

### R8. 抽象库发现（元层：自动发明 DSL）

**思路**：不逆向单个 mesh，而是从**一批** mesh 里自动发现可复用的抽象函数，构成 DSL，再用这个 DSL 去逆向。这是"程序紧凑性和可编辑性"的真正来源。

- ShapeAssembly（可附着 cuboid 的层次 DSL）→ ShapeMOD（宏操作发现）→ [ShapeCoder (SIGGRAPH 2023)](https://arxiv.org/pdf/2305.05661)（e-graph 从非结构化 primitive 中发现抽象）
- [ShapeLib (2025)](https://arxiv.org/html/2502.08884)：用 **LLM 引导 + 几何推理**设计抽象库，在函数库上训识别网络的实验中**优于 ShapeCoder**——ShapeCoder 找到的抽象能泛化但"难以交互"，LLM 引导让抽象更贴近人类概念
- 通用理论背景：DreamCoder 式的 wake-sleep 循环（程序归纳 ↔ 抽象发现交替）

**什么时候用**：目标场景包含**大量同类重复实例**（156 棵棕榈、145 株樱花、130 根竹子……）。这时 R8 的价值远超逐个逆向——它直接决定最终代码是 500 行还是 50000 行。

---

## 3. 路线对比

| 路线 | 输入 | 输出可编辑性 | 几何精度 | 覆盖域 | 自动化程度 | 成熟度 |
|---|---|---|---|---|---|---|
| R1 分析式逆向 | mesh/点云 | 中（B-Rep 非程序） | **高** | 硬表面 | 高 | **商用成熟** |
| R2 CSG 归纳 | mesh/SDF | 低 | 中高 | 硬表面 | **高（无监督）** | 研究成熟 |
| R3 CAD 序列 | mesh/点云 | **高** | 中高 | 机械件 | 中 | 快速进展中 |
| R4 语法归纳 | mesh/图像 | **高** | 中 | 重复/递归结构 | 低（需人参与） | 学术为主 |
| R5 参数反演 | 任意 | **高** | 中高 | **受 generator 限制** | **高** | **可工业化** |
| R6 LLM 代码 | 文本/图像/mesh | 中高（看代码质量） | **低** | 广但浅 | **高** | 早期 |
| R7 场景检索布局 | 扫描/图像 | 高（布局层） | 中 | 室内场景 | 高 | 较成熟 |
| R8 抽象库发现 | **一批** shape | **最高** | 继承底层 | 通用 | 中 | 学术前沿 |

---

## 4. 选型决策

```
手上有 ground-truth mesh 吗？
├─ 没有，只有图像 → 先解决重建（image-to-3D / 多视图 / 3DGS）拿到几何，
│                    或直接走 R5/R6 的图像条件版本（DI-PCG、ProcGen3D、LL3M）
└─ 有
   ├─ 目标是机械件 / 硬表面 / 要进 CAD 软件
   │     → R1 打底 + R3 出可编辑序列（CADFit 一类），R2 当兜底
   ├─ 目标是自然物（树、石、地形、云）
   │     → R5 为主（写 generator + 拟合参数），R4 补递归结构
   ├─ 目标是建筑 / 城市 / 立面 / 强重复结构
   │     → R4 语法归纳为主，R8 抽出共享构件库
   ├─ 目标是室内场景
   │     → R7（若允许资产库）；不允许则 R7 只取布局，几何回落 R4/R5
   └─ 目标是"整个风格化场景，最终产物零外部资产"（本仓库）
         → 没有现成方案。必须组合：
           R8 定 DSL → R6 出 generator 骨架 → R5 拟合参数 → 多视图闭环验收
```

---

## 5. 评估指标（必须多轴，单轴一定被 game）

| 轴 | 指标 |
|---|---|
| 几何 | Chamfer distance、volumetric IoU、F-score、normal consistency、Hausdorff |
| 合法性 | invalid / non-manifold ratio、可执行率、拓扑校验（CADSmith 式 verifier） |
| 视觉 | 多视图 silhouette IoU、depth/normal error、SSIM、**SigLIP-2 / DINOv3 特征相似度**（3DCodeBench 验证其与人类偏好 r=0.964） |
| 紧凑性 | 程序 token 数、primitive 数、参数个数、抽象复用率 |
| 语义 | 部件命名正确性、结构合理性（悬空/断开检测）、参数改动是否产生合理变化 |
| 泛化 | 换 seed 后是否仍在目标分布内 |

**紧凑性一定要进验收标准**，否则系统会滑向硬编码顶点的退化解。

常用数据集：ABC、Fusion360 Gallery、DeepCAD、[CADFS](https://arxiv.org/pdf/2605.01925)、PartNet、ShapeNet、3D-FRONT、ScanNet、[3DCodeBench](https://arxiv.org/html/2606.01057v1)（源自 Infinigen）。

---

## 6. 现实边界（这部分比路线本身更重要）

1. **不存在通用方案。** 任意 mesh → 高质量可编辑程序的全自动系统，2026 年仍不存在。所有 work 的系统都靠强先验：限定域 DSL、已有 generator、或资产库。谁声称通用，先看它的域。
2. **可执行 ≠ 正确。** 3DCodeBench 的核心发现：错误反馈能把可执行率推到 0.97，但物理合理性和结构完整性不跟着涨；agent 脚手架提升可执行性却**不提升形状质量**。
3. **保真度与紧凑性根本对立。** 必须提前定死优先级，并把紧凑性写进指标。
4. **有机 / 自然物基本只能走 R5 或 R4。** 没有人能从一棵树的 mesh 反推出一个漂亮的树 generator；但给定树 generator 反推参数是可行的（ProcGen3D 在树/仙人掌/桥上验证过，代价是最长 42 分钟）。
5. **场景级只有 R7 成熟，而它靠资产库。** "纯代码 + 场景级 + 高保真"三者目前无法同时满足。
6. **不可微是常态。** 随机采样、拓扑变化、布尔运算都不可微；别指望端到端自动微分，用神经代理或搜索。
7. **人机分工的现实答案**：generator 骨架和 DSL 由人（或 LLM 辅助）设计，参数拟合和实例化交给机器。反过来做（让机器发明 generator、人调参数）目前不 work。

---

## 7. 可组合的通用 pipeline 骨架

```
[0] 定义验收标准        固定视角集、几何+视觉+紧凑性指标、资产禁令
[1] 分解               语义分割 / 实例聚类 / 对称性检测，把场景切成可独立处理的单元
[2] 分类调度           每个单元按 §4 决策树选路线（硬表面→R1/R3，自然物→R5，重复结构→R4）
[3] 抽象发现 (R8)      跨实例找共享构件，凝练成 DSL —— 决定最终代码规模
[4] 结构生成           LLM (R6) / 搜索 / 语法归纳 出程序骨架
[5] 参数拟合 (R5)      可微渲染 or 神经代理 or CMA-ES，分块坐标下降（相机→大形体→细节→材质）
[6] 执行闭环           渲染对比 + 几何 verifier + 多视图度量，失败回 [4]
[7] 程序简化           抽公共函数、消冗余、参数预算审计
```

第 [3] 步最容易被跳过，也最影响最终结果——它是"一堆硬编码"和"一个能改 seed 的生成器"之间的分水岭。

---

## 8. 一手来源

**分析式逆向 / B-Rep**：[ComplexGen](https://arxiv.org/pdf/2205.14573)、[Point2CAD](https://ar5iv.labs.arxiv.org/html/2312.04962)、[Split-and-Fit](https://arxiv.org/pdf/2406.05261)、[IPFNet](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70231)、[HoLa](https://arxiv.org/pdf/2504.14257)、[AutoBrep](https://arxiv.org/pdf/2512.03018)、[DualBrep](https://arxiv.org/pdf/2606.31579)、[QUICKSURFACE 2026](https://www.quicksurface.com/whats-new-qs2026/)、[EXModel 2026](https://www.shining3d.com/reverse-engineering/exmodel)

**CSG / 隐式**：[InverseCSG](https://inversecsg.csail.mit.edu/)、[ExtrudeNet](https://arxiv.org/pdf/2209.15632)、[D²CSG](https://proceedings.neurips.cc/paper_files/paper/2023/file/4732d425125832887f6c5a9675d49ead-Paper-Conference.pdf)、[CSG on Neural SDFs](https://dl.acm.org/doi/fullHtml/10.1145/3610548.3618170)

**CAD 序列**：[CADFit](https://arxiv.org/abs/2605.01171)、[CADFS](https://arxiv.org/pdf/2605.01925)

**语法归纳**：[Facade Layouts](https://arxiv.org/pdf/1308.0419)、[FaçAID](https://arxiv.org/html/2406.01829)、[Procedural Modelling for Virtual Worlds 综述](https://dl.acm.org/doi/10.1111/cgf.12276)、[IPM for Virtual Worlds (SIGGRAPH 2016 Course)](https://dl.acm.org/doi/10.1145/2897826.2927323)

**参数反演**：[NNProc (CGF 2025)](https://onlinelibrary.wiley.com/doi/10.1111/cgf.70024)、[DI-PCG](https://arxiv.org/html/2412.15200v1)、[ProcGen3D](https://arxiv.org/html/2511.07142v1)、[Automatic Differentiable Procedural Modeling](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Gaillard-2022-Automatic_Differentiable_Procedural_Modeling.pdf)、[单视图 + IPM](https://www.mdpi.com/2073-8994/16/2/184)、[VLMaterial](https://arxiv.org/pdf/2501.18623)

**LLM 代码路线**：[LL3M](https://threedle.github.io/ll3m/)、[3DCodeBench](https://arxiv.org/html/2606.01057v1)、[CADDesigner](https://arxiv.org/html/2508.01031)、[CADSmith](https://arxiv.org/html/2603.26512)、[3DFroMLLM](https://arxiv.org/pdf/2508.08821)

**场景级**：[SceneScript](https://arxiv.org/abs/2403.13064)、[Diorama](https://arxiv.org/html/2411.19492v2)、[LiteReality](https://litereality.github.io/)、[PSDR-Room](https://arxiv.org/pdf/2307.03244)

**抽象库发现**：[ShapeCoder](https://arxiv.org/pdf/2305.05661)、[ShapeMOD](https://arxiv.org/pdf/2104.06392)、[ShapeLib](https://arxiv.org/html/2502.08884)
