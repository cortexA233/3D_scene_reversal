# Stage 2 之上的通用单模型生成 Pipeline 调研

- 日期：2026-07-30
- 状态：研究结论与 PoC 建议
- 方法：本地代码/ADR 审计 + 一手来源交叉核对
- 范围：单个 3D 模型，或被视为一个语义对象的紧密组合体
- 目标输出：纯 Three.js Object Generator、compact Object Recipe、definition binding 与可复核 evidence
- 输入材料：
  - `/Users/Brian/Downloads/high_quality_3d_pcg_repositories.md`
  - `/Users/Brian/Downloads/procedural-scene-reversal-follow-up-research-2026.md`
  - 当前仓库实现、`CONTEXT.md` 与相关 ADR
  - 本文末尾列出的一手项目页、论文与官方文档

## 0. 结论先行

**可以做，而且值得做；但应把“通用”放在开发流程，不放在生产几何语言。**

建议目标是：

> 一个通用、开发侧、人指导的 Scene Decompiler Workflow，加一组 family-specific 的深
> Object Generator。对于已知 family，Pipeline 自动完成检查、测量、recipe 拟合、
> 候选生成、评估与冻结；对于未知 family，明确退出到人工 authoring，而不是自动把
> 任意 mesh 翻译成不受约束的 JavaScript。

这条路线可以支持：

- 多种树先按 branching/tiered/frond `StructuralArchetype` 路由；经三实例
  recipe-only 证据后，再在各自范围内共用 Bounded Plant RepresentationFamily。
- 建筑与商铺，共用若干 Bounded Built-form Assembly。
- 低模小车，共用一个固定拓扑、镜像约束明确的 vehicle family。
- 由多个 mesh、material 和 fixture 组成，但在语义上仍是一个对象的组合体。

近期不应承诺：

- 任意 mesh 一键生成优雅、紧凑、可编辑的 Three.js 程序。
- 自动恢复唯一的原始建模意图。
- 自动发明新的 Object Generator 后直接进入 production。
- 把顶点、索引、纹理像素或稠密采样表伪装成“纯代码”。
- 让一个通用 CSG、SDF、Geometry Nodes 或 operation graph 覆盖所有对象。
- 把 Blender、Python、CGAL、训练模型或参考资产带入 Code-only Production Runtime。

近期最有价值的交付是：**稳定做成已知 family 的 mesh → compact recipe 反演**。

生产输出仍然只有：

```text
已审核的 generator kind/version
  + compact、bounded、semantic Object Recipe
  + Object Definition binding
  + qualification / freeze evidence
```

现有 `generateObject(recipe, generator) -> THREE.Object3D` Interface 保持不变。

## 1. 能力分级：L0–L3

### L0：受控生成

- 输入是已写好的 Object Recipe。
- 固定 Object Generator 生成一个语义 `THREE.Object3D` root。
- seeded RNG 保证 CPU 结构确定性。
- Evaluation Harness 负责与 Authored Reference 比较。
- Stage 2 已稳定达到这一层。

### L1：已知 family 的参数反演

- 人显式选择已注册 family。
- Pipeline 从 mesh/subgraph 提取有界 Semantic Measurements。
- fitter 在既有 recipe schema 内搜索参数。
- 输出 compact recipe、definition identity 和 evidence。
- 不增加新的建模操作或 generator source。

**这是下一阶段的推荐目标。**

### L2：已知 family 内的有限结构选择

- family 声明少量、有限的 topology variant。
- 例如树的冠形、商铺的开间数、车的厢体类型。
- 离散搜索只在固定、可审计的候选集合内进行。
- 每个 variant 仍由已审核的 generator implementation 解释。

这一层需要更严格的复杂度预算、可辨识性测试和防过拟合门。

### L3：未知 family 的程序合成

- 系统从任意 mesh 推断新操作图或新 JavaScript。
- 需要同时解决表示发现、程序搜索、语义命名、安全执行和质量判断。
- 现有研究能解决其中一部分，但没有项目同时满足本仓库全部约束。

L3 可以作为开发期 proposal generator；其结果必须进入人工 authoring 和完整验收，
不能自动注册为 Production Replacement。

### 推荐边界

- 近期：稳定 L1。
- 有充分证据的少数 family：进入 L2。
- 研究观察：L3。
- production 始终只消费 L0 形式的固定 definition + compact recipe。

## 2. 与当前领域模型和 ADR 的关系

推荐方案是现有领域模型的延伸，不是重写：

- ADR-0003：继续采用 human-guided Scene Decompiler Workflow。
- ADR-0005：一个语义对象可以由多个 child part 组成。
- ADR-0006：先做 purpose-built generator，不先发明通用 modeling DSL。
- ADR-0007：保持最小 Object Generator contract。
- ADR-0008：只保留 resolution-independent Semantic Measurements。
- ADR-0009：继续使用固定十二视图。
- ADR-0011：CPU 结构必须 deterministic。
- ADR-0012：Production Runtime 必须 Reference Independent。
- ADR-0013：保留 generator 与 gates，丢弃开发分析产物。
- ADR-0017：重复外观只能是 bounded semantic pattern。
- ADR-0020：继续执行 source、scalar、triangle 和 runtime budgets。
- ADR-0023：object-specific scalar 必须可完整审计。
- ADR-0034：candidate freeze 必须绑定 definition、recipe、generator 与 shared kernel。

以下提案会与现有 ADR 冲突，不能作为主线：

- 全自动 arbitrary mesh-to-program：冲突 ADR-0003。
- 先建设通用 operation-soup runtime DSL：冲突 ADR-0006。
- 直接把 Manifold/其他 JS 或 WASM dependency 加入 production：
  WASM 必须满足 ADR-0001 的至少两个可复用 shape class 门槛；
  普通 JavaScript dependency 则按 ADR-0002 逐依赖提供许可、确定性、预算与隔离证据。

开发侧使用 CGAL、Blender、PyTorch、Manifold 或 CAD 工具做实验并不冲突，
前提是产物经过 Semantic Measurement Admission，且这些依赖不进入 production import graph。

## 3. Stage 2 已经可以复用的 Module

### 3.1 Production Runtime Kernel

| Module | 当前 Interface / 证据 | 新 Pipeline 中的角色 |
|---|---|---|
| Object Generator core | `gt_designer/src/reconstruction/core/object-generator.js:23-80` | 保持 recipe envelope、seeded RNG 注入、单 root 与 semantic ID 检查 |
| Semantic part IDs | `object-generator.js:82-90` | 对齐语义 part、材质 pass 与 evidence |
| Seeded RNG | `gt_designer/src/reconstruction/core/rng.js:1-38` | generator 与 fitter 可重放 |
| Object registry | `gt_designer/src/reconstruction/objects/object-registry.js:17-61` | 演进为 versioned Production Definition Catalog |
| 八个 Object Generator | `gt_designer/src/reconstruction/objects/*-generator.js` | regression corpus；不直接迁移或重写已冻结候选 |
| Reference layout adapter | `gt_designer/src/reconstruction/stage-1-5-layout.js:23-70` | 继续把 placement/display scale 留在 generator 之外 |

现有八对象已经证明：

- compact recipe 可以表达复杂单对象。
- 一个语义 root 可以包含多个 mesh、material 和 fixture。
- source scale、Reconstruction Frame 与场景 placement 可以分离。
- 随机结构可以通过 versioned RNG 确定性重放。
- Reference GLB 可以从 production 中完全删除。

### 3.2 开发侧通用 Module

| Module | 精确证据 | 可复用能力 |
|---|---|---|
| Ground Truth Extractor | `tools/ground-truth/extract-single-mesh.mjs:205-319` | GLB/Draco decode、world transform、bounds、material/topology facts |
| Mesh analysis | `tools/ground-truth/mesh-analysis.mjs:112-263` | bounds、连通分量、开闭性、面积与体积 |
| Evaluation Protocol | `gt_designer/single-mesh-evaluation/evaluation-protocol.js:88-152` | 从 Authored Reference bounds 建立固定视图；candidate 不参与 framing |
| Evaluation Harness | `gt_designer/single-mesh-evaluation/evaluation-harness.js:185-515` | 隐藏 isolation、capture、passes、render target 与像素编码 |
| Visual metrics | `tools/evaluation/visual-metrics.mjs:596-993` | view-level geometry/appearance 与 gate aggregation |
| Candidate Freeze | `tools/evaluation/candidate-freeze.mjs:237-764` | 固化候选源码、recipe、baseline 与 evidence |
| Static/runtime audits | `tools/acceptance/` | Reference Independence、runtime isolation 与 prohibited data |
| Semantic Admission 原则 | `tools/evaluation/full-island-semantic-admission-policy.mjs:607` | 有界、命名、可编辑、分辨率无关的字段审查 |

这些 Module 应直接复用。新 Pipeline 不应另建第二套 capture、metric 或 freeze 系统。

### 3.3 已有重复证据、可谨慎 deepening 的内部 helper

- Bamboo Shoot 与 Mushroom 都有 geometry merge，已达到“两处真实重复”。
- Vase、Blue Hat、Candle 都有 bounded axial profile surface。
- 多个复杂 generator 重复 lit/albedo 双材料与 shader injection plumbing。

可以抽取 narrow helper，但不要把它们升级成公开、任意组合的 modeling DSL。
外观 motif、closure、inner wall、semantic frame 等仍留在 family/object Module 内，
以保持 Locality。

## 4. 当前精确缺口

### 4.1 Authored Reference 输入

- 当前 extractor 围绕一个精确命名 mesh node。
- 树、建筑、小车和商铺常是多 node、多 primitive、多 material 子图。
- 缺少 `node | node-set | subgraph` selection contract。
- 缺少 source digest + selection digest 的稳定身份。
- 缺少 unit、up axis、负 scale、镜像 transform 的统一政策。

### 4.2 Family 与 recipe contract

- registry 目前只是浅 lookup，没有 family descriptor。
- core 只验证 `id/kind/seed/shape/appearance` envelope。
- 没有 kind-specific schema、cardinality、参数区间与 version migration。
- 没有正式的 `representation-incompatible` / `needs-human-authoring` outcome。

### 4.3 Inspection 与 fitter orchestration

- `tools/development/fit-stone-supports.mjs` 是明显的对象特定 fitter。
- `tools/development/measure-stage2-components.mjs` 硬编码 Stage 2 对象与输出。
- 没有共同的 parameter vector、bounds、loss、search、checkpoint 和 seed contract。
- 没有 synthetic recovery、identifiability、敏感度或 decimation robustness 基准。

### 4.4 Semantic Measurement Admission

- Full-Island 已有 deny-by-default 的 admission 原则。
- Single Mesh recipe 尚未统一进行字段级 provenance、boundedness 和 causal editability 审查。
- tree branch list、building part list、vehicle component list 很容易随 source 分辨率增长；
  必须在进入 recipe 前拒绝。

### 4.5 Qualification 与输出

- Stage 2 baseline/预算 registry 仍绑定具体对象 ID。
- 缺少同一 family 第二、第三实例的泛化 gate。
- 没有安全 code emitter。
- 自动输出应先限定为可信模板生成的 recipe module 与 definition binding。
- 新 generator source 只能作为未认证 draft，由人 review 后再进入 catalog。

## 5. 外部算法与项目矩阵

Direct reuse 分为：

- **可集成候选**：许可、体积和构建形态合适时，作为 development dependency。
- **窄重实现**：借算法与 Interface，自行实现与仓库契约匹配的 Adapter。
- **只借思想**：研究许可、技术栈或运行时边界不合适，不复制代码。

| 项目 | 可借鉴内容 | 推荐角色 | Direct reuse / caveat |
|---|---|---|---|
| [CADFit](https://ghadinehme.github.io/cadfit.github.io/) | watertight mesh → profile/extrude/revolve/Boolean CAD 程序；混合几何搜索 | 硬表面 family 的结构搜索与 prune/validate loop | 窄重实现；逐仓核验代码、数据、模型与专利许可 |
| [GeoCode](https://threedle.github.io/GeoCode/) | 从 point cloud/sketch 恢复人工设计程序的可解释参数 | `fitRecipe` 的核心范式 | 借方法；Geometry Nodes 不进入 runtime |
| [PyTorchGeoNodes](https://vevenom.github.io/pytorchgeonodes/) | 将既有程序变成可微计算图，联合离散与连续搜索 | 可选 development fitter | 借优化结构；节点覆盖、Blender/PyTorch 与许可需核验 |
| [DI-PCG](https://thuzhaowang.github.io/projects/DI-PCG/) | 用学习模型预测既有 generator parameters | 搜索稳定后的 amortized proposal | 后期研究；每个 generator 需数据/训练，官方用途限制需核验 |
| [CGAL Shape Detection](https://doc.cgal.org/latest/Shape_detection/index.html) | RANSAC/region growing 平面、圆柱、球、锥等检测 | inspection 的 primitive proposal | 离线/窄 Adapter；C++、WASM 与 package 许可成本 |
| [CGAL Skeletonization](https://doc.cgal.org/latest/Surface_mesh_skeletonization/index.html) | surface contraction skeleton | 树干、枝条和细长物体的 skeleton oracle | 离线候选；对孔洞、噪声、叶片混合敏感 |
| [Inverse Procedural Modeling of Trees](https://doi.org/10.1111/cgf.12437) | 从树形输入恢复 branch structure 与生成参数 | tree family 初始化和参数设计 | 借算法；预处理、代码和数据许可需单独核验 |
| [Space Colonization](https://algorithmicbotany.org/papers/colonization.egwnp2007.html) | 少量视觉参数控制三维树枝生长 | deterministic tree generator kernel | 自行实现；正向生成不等于逆向拟合 |
| [ArcPro](https://vcc.tech/research/2025/ArcPro) | sparse points → hierarchical architectural program | building massing、层级轮廓与屋顶 proposal | 借思想；实现和数据可用性需核验 |
| [Facade Layout Inference](https://arxiv.org/abs/1308.0419) | 用 MDL/动态规划发现立面重复分割 | 商铺/建筑的 floor、bay、opening grammar | 窄重实现；依赖分割质量和规则性 |
| [CityEngine CGA](https://doc.arcgis.com/en/cityengine/2025.0/cga/cityengine-cga-introduction.htm) | `split/repeat/extrude/roof/setback` 词汇 | built-form family authoring 参考 | 只借思想；专有系统不作为依赖 |
| [ShapeAssembly](https://rkjones4.github.io/shapeAssembly.html) | `attach/mirror/repeat/squeeze` 层级装配 | 车辆、店铺 fixture 与 part relation 参考 | 只借思想；cuboid 偏置且许可需核验 |
| [ShapeCoder](https://rkjones4.github.io/shapecoder.html) | 从一批已有 primitive programs 发现共同 abstraction | 多个成功 family 后的 post-hoc deepening | 后期使用；不解决首个 mesh，许可需核验 |
| [PrimitiveAnything](https://primitiveanything.github.io/) | 跨类别 primitive assembly proposal | representation suggestion 与初始化 | 只作 proposal；代码、权重与数据许可需按固定版本复核 |
| [CoACD](https://github.com/SarahWeiii/CoACD) | approximate convex decomposition | 组合体 part proposal | 可选离线工具；convex part 不等于 semantic part |
| [EMS Superquadric Recovery](https://github.com/bmlklwx/EMS-superquadric_fitting) | 点云 → 多 superquadric | 车身、树冠、灯罩的粗 proxy | 窄重实现或离线工具；部件数和局部最优困难 |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | JavaScript primitives、boolean、extrusion、transform | JS 建模词汇与开发原型 | 不替代 Object Generator contract；依赖需证据门 |
| [Manifold](https://github.com/elalish/manifold) | 稳健 solid Boolean 与 JS/WASM binding | 两个真实 shape class 证明需求后的 kernel 候选 | 受 ADR-0001/0002 约束；只适合 closed solid |
| [replicad](https://replicad.xyz/docs/use-as-a-library) | TypeScript CAD over OpenCascade WASM | CAD-like family 的离线 prototype | WASM、bundle、worker 和传递依赖成本高 |
| [MeshCoder](https://arxiv.org/abs/2508.14879) | point cloud → Blender Python modeling script | L3 proposal 与 failure taxonomy | 代码、模型与数据许可需按固定版本复核；不直接依赖 |
| [3DCodeBench](https://arxiv.org/abs/2606.01057) | 评估可执行 3D code；暴露 API mismatch、漂浮/断连 part | evaluator 与 agent-loop 参考 | 2026 新基准；任务分布需重新校准 |
| [P3D-Bench](https://arxiv.org/abs/2606.11152) | 参数、拓扑、语义和 assembly-level benchmark | part structure 与精确参数指标参考 | 2026 新基准；不能直接外推为本仓库效果 |
| [ProcGen3D](https://xzhang-t.github.io/project/ProcGen3D/) | 可变 topology 程序图生成与搜索 | 固定 recipe 无法覆盖时的研究上界 | 后期研究；搜索昂贵、仍依赖 domain prior |

### 最值得吸收的算法模式

1. **GeoCode / PyTorchGeoNodes**：先有高质量 family program，再反演参数。
2. **CADFit**：离散结构搜索与连续参数优化交替，每步执行并用几何反馈验证。
3. **CGAL / CoACD / primitive fitting**：只产生 proposal，不冒充语义真相。
4. **Skeleton + inverse tree modeling**：恢复树的中心线与分枝层级，再拟合 bounded recipe。
5. **Facade grammar / ShapeAssembly**：显式建模 repeat、mirror、attach 和层级关系。
6. **ShapeCoder**：先积累成功程序，再发现共同 abstraction，而不是先建万能库。
7. **DI-PCG**：昂贵搜索已证明有效后，再用合成数据摊薄搜索成本。

### 不应直接吸收的部分

- 不采用任何外部项目的完整 DSL 作为 Production Runtime Interface。
- 不允许神经模型结果绕过 parser、执行、预算和质量门。
- 不把 convex pieces、skeleton nodes 或 detected primitives 原样写入 recipe。
- 不因项目有 demo 就假定代码、权重、训练数据和专利均可商用。
- 每个 dependency 必须分别记录 code/model/data license、专利声明、bundle 与 worker 成本。

## 6. 推荐 Pipeline

```text
Authored Reference
  → Reference ingestion / subgraph selection
  → canonical Reconstruction Frame
  → inspection facts and representation proposals
  → explicit human family decision
  → Semantic Measurement Admission
  → family-specific Fit Problem
  → candidate generation and search
  → simplify / compactness check
  → Evaluation Harness and hard audits
  → qualification / rejection / needs-authoring
  → Object-scoped Candidate Freeze
  → trusted production materialization
```

### Step 1：Reference Ingestion

- 首批只支持 GLB，避免一个真实 Adapter 被包装成假插件系统。
- selection 立即支持 `node | node-set | subgraph`。
- bake world transform，但保留可恢复的 source provenance。
- 计算 source、selection、reader version digest。
- raw geometry 只能进入 development-only ephemeral handle。

### Step 2：Canonical Reconstruction Frame

- 明确 unit、up axis、forward hint、bottom-center 和 identity root。
- 记录 mirrored/negative scale。
- 固定 framing 只由 Authored Reference 决定。
- candidate 不得参与相机、阈值或 Calibration Bracket。

### Step 3：Inspection

通用 inspection 可以输出：

- bounds、surface area、volume、connected components、watertightness。
- PCA/OBB、主轴、近似镜像/旋转对称。
- sharp-edge patches、平面/圆柱/球/锥 proposal。
- skeleton/centerline proposal。
- 轮廓、截面、repetition period、attachment/contact proposal。
- material role clustering 与 transparency/emissive hints。

这些只是 development facts，不自动进入 recipe。

### Step 4：Human Representation Decision

- Pipeline 可给出 family ranking 和 incompatible reasons。
- 人必须明确选择已注册 family/version。
- 无 family 可解释时返回 `needs-human-authoring`。
- 系统不能把最高分建议静默当成可靠合成。

### Step 5：Semantic Measurement Admission

每个拟进入 recipe 的字段必须证明：

- 有语义名称和单位。
- 有固定上限或 bounded cardinality。
- 不随 vertex、triangle、pixel 或 sample resolution 增长。
- 改变它会因果地改变预期属性。
- provenance 可复现。
- 不包含 source node ID、reference path 或评价 gate。

### Step 6：Fit Problem

每个 `RepresentationFamilyAdapter` 定义：

- recipe schema 与 parameter bounds。
- 有限 topology variants。
- initializers 与 optional human anchors。
- geometry、normal、silhouette、part relation、appearance loss。
- complexity/MDL penalty。
- optimizer budget 与 deterministic seed。

离散结构可用 bounded enumeration、beam、genetic 或 MCTS；
连续参数优先 analytic solve、coordinate descent、CMA-ES，
有可靠 differentiable proxy 时再使用 Adam/L-BFGS。

### Step 7：Candidate Generation

- 只通过已注册 generator kind 生成 candidate。
- 新 generator 只能在 authoring session 中作为 draft。
- 每轮执行后检查 recipe schema、root contract、semantic IDs、budget 和 determinism。
- optimizer 不能改 generator source。

### Step 8：Simplification

- 移除对质量无影响的参数。
- 合并明显共线、共面或等价结构。
- 对程序自由度和 recipe 字节数施加 MDL penalty。
- 禁止用 residual vertex table 修补误差。
- shared helper 只在至少两个 generator 出现同一语义操作后提取。

### Step 9：Evaluation 与 Qualification

- 复用固定十二视图和现有 passes。
- 增加 mesh-space Chamfer、point-to-surface、normal 与 occupancy/SDF 误差。
- 检查 part count、contact、symmetry、repetition 和 semantic role。
- 执行 determinism、runtime、scalar、source、triangle 和 Reference Independence audit。
- quality failure 是 `rejected`，工具/contract failure 是 `failed`。

### Step 10：Freeze 与 Materialization

- Candidate Freeze 绑定 definition、recipe、generator、shared runtime kernel、baseline 和 evidence。
- materializer 只接受 qualified、digest 未漂移的 candidate。
- 可信模板只生成 recipe module 与 definition binding。
- 生产 import graph 不得反向依赖 Workbench、reader、fitter、reference 或 evidence。

## 7. Internal ReconstructionPlan 不是 Production DSL

开发侧需要一个可恢复 orchestration record，但它不应描述任意几何操作：

```ts
type ReconstructionPlan = Readonly<{
  unitIdentity: string;
  referenceIdentity: string;
  reconstructionFrame: ReconstructionFrame;
  representation: {
    family: string;
    version: string;
    humanRationale: string;
  };
  qualityContract: {
    baselineIdentity: string;
    budgetIdentity: string;
    protocolIdentity: string;
  };
  seed: {
    algorithm: "mulberry32-v1";
    value: number;
  };
}>;
```

它只记录：

- 重建谁。
- 人选择哪一个 family。
- 用哪套质量 contract。
- 用哪个确定性 seed。
- 哪些 decision/evidence identity 支撑结果。

它不记录：

- 通用 CSG/SDF/Geometry Nodes tree。
- vertex/index/pixel/sample table。
- 自动生成的任意 JS/GLSL。
- source-resolution-scaled branch、part 或 patch list。

family-specific inspection 与 fit state 留在对应 Adapter 的 development artifacts 中。

## 8. 四类目标对象的路线

### 8.1 多种树

建议定义一个固定深度、固定 cardinality 的 `Bounded Plant Archetype`：

```text
trunk axis/profile
  + bounded branch tiers
  + branch-angle / taper / tropism distributions
  + crown lobes or attraction volume
  + bounded leaf-cluster families
  + bark / leaf semantic material roles
```

开发期：

1. 分离或弱分类 trunk/branch/foliage。
2. 对木质部分 skeletonize，得到中心线 proposal。
3. 用高度、冠幅、分枝高度、角度、taper 初始化 recipe。
4. 用 deterministic Space Colonization 或 bounded branch family 正向生成。
5. 拟合 crown envelope、silhouette、branch density 与 major fork positions。

生产期：

- `TubeGeometry`/自定义 sweep 生成 trunk 与 major branches。
- `InstancedMesh` 或 bounded cluster meshes 生成 foliage。
- seed 控制局部变化，拓扑上限由 schema 固定。

首批可做三种明显不同但仍共享 schema 的树：

- 单干阔叶树。
- 锥形针叶树。
- 低矮分叉/伞冠树。

如果第二、第三棵树仍需修改 generator，而不是只改 recipe，
说明 family 太浅或对象跨度过大，应拆 family，不应扩大万能参数表。

### 8.2 建筑

优先做 stylized、小体量、规则建筑：

```text
footprint
  + massing tiers
  + floor heights
  + facade bays
  + openings
  + roof family
  + bounded attachments
```

算法借鉴：

- ArcPro 的层级轮廓/massing。
- CGA 的 split/repeat/roof 词汇。
- Facade Layout Inference 的 MDL 重复结构。
- CADFit 的 profile extrusion 与每步几何验证。

生成侧优先用 `Shape` + `ExtrudeGeometry`、box/cylinder、profile loft。
只有 doorway/window cutout 等确有两个 family 复用证据时，才评估 Manifold Boolean。

### 8.3 商铺

商铺不是独立万能表示，而是：

```text
Bounded Built-form Assembly
  + facade/opening grammar
  + Fixed-topology Fixture Generator
```

semantic parts 可包括：

- main mass。
- roof/canopy/awning。
- counter/opening/door。
- sign frame 与 bounded sign motif。
- shelf/crate/light 等有限 fixture family。

它是验证多 node/subgraph、多 material role、part contact 和层级组合的最佳 PoC。
避免把每个源 node 都映射为 recipe part；part roster 必须由 family schema 定义。

### 8.4 低模小车

建议在树和商铺之后做，范围限定为 stylized low-poly vehicle：

```text
body section profiles / bounded loft
  + cabin
  + mirrored wheel pairs
  + bumpers / windows / lights
  + fixed attachment and contact constraints
```

Inspection 重点：

- 左右镜像平面。
- wheel cylinder proposal、轴距、轮距、半径。
- body/cabin 主体分割。
- longitudinal cross sections 与 ground contact。

生产侧：

- body 可用 bounded cross-section loft、extrusion 或少量 superquadric proxy。
- wheels、lights、bumper 使用固定 fixture generators。
- 所有 attachment 由语义约束生成，不能依赖输入 vertex。

首轮不覆盖真实汽车的复杂自由曲面、钣金细缝、内饰或照片级材质。
若车辆不能自然归入现有 Fixed-topology Fixture Generator，应先补 domain model/ADR。

## 9. Design It Twice：三种 Interface 比较

| 方案 | 外部 Interface | 优点 | 代价 |
|---|---|---|---|
| A：最小 `inspect + fit` | `inspect(reference)`；`fit(plan)` | 最小、清晰、最大 Leverage；人类决策显式 | 交互式分支、恢复和 materialize 需调用方管理 |
| B：resumable Workbench | `begin(request)`；`resume(token, decision)`；`materialize(ref, target)` | 可暂停、分支、恢复；完整 provenance；适合研究平台 | session schema、migration、adapter contract 和 artifact store 较重 |
| C：Known-admission fast path | `qualify({source, admissionPlanRef, seed})` | 高频调用极简；已冻结 route 自动走完全流程 | 新 semantic/structural/representation definition 和复杂人类 decision 必须退出 |

### 推荐：C 作为默认路径，B 作为异常路径

最常见 caller 已有 candidate-independent、versioned admission plan，只需要：

```ts
type QualifyOutcome =
  | {
      kind: "qualified";
      definition: { id: string; version: string };
      recipe: ObjectRecipe;
      evidence: EvidenceIndex;
    }
  | {
      kind: "needs-human-authoring";
      brief: AuthoringBrief;
    }
  | {
      kind: "rejected";
      reason: RejectionReason;
      evidence: EvidenceIndex;
    };

qualifyKnownFamily({
  source: {
    path,
    selection:
      | { kind: "node", name }
      | { kind: "node-set", names }
      | { kind: "subgraph", root }
  },
  admissionPlanRef: { id, version },
  seed
}) -> Promise<QualifyOutcome>
```

`AdmissionPlanRef` 只在 development 侧把已冻结的 ReferenceClassification、
RepresentationFamily proposal、Compatibility Contract 与 RestorationProfile
串起来；它不代表 candidate。生成 immutable Candidate Attempt 后，Workbench 才
创建 `CandidateFamilyBinding`，随后进入 qualification。

只有 `needs-human-authoring` 才进入：

```ts
openAuthoringSession(brief) -> AuthoringSession

AuthoringSession.advance(decision?) ->
  | { kind: "decision-required"; request; continuation }
  | { kind: "draft-ready"; generatorDraft; recipeSchemaDraft; evidence }
  | { kind: "rejected"; reason; evidence }
  | { kind: "failed"; error }
```

最终写 production 的操作独立且严格：

```ts
materializeQualified(candidateRef, targetPaths)
  -> MaterializedDefinition
```

`materializeQualified`：

- 只接受 qualified candidate。
- 重查 definition、recipe、generator、baseline 与 evidence digest。
- 只用可信模板生成 recipe 和 definition binding。
- 新 generator draft 必须先人工 review、测试、注册，再回到 known-family fast path。

这个 Hybrid 保持一个深 Module：

- 默认 caller 只学习一次 `qualifyKnownFamily`。
- 研究者在新 family 时获得可恢复 authoring session。
- production caller 完全不知道 reader、optimizer、browser、CGAL 或 artifact store。

## 10. Internal Adapter Seams

首版只保留真实会变化的 Seam。

### ReferenceReaderAdapter

```ts
open(referenceSpec) -> EphemeralReferenceHandle
```

- 首批实现：真实 GLB reader + in-memory test reader。
- handle 不可序列化，不得进入 Production Projection。
- OBJ/USD/FBX 第二种真实需求出现前，不做格式插件生态。

### RepresentationFamilyAdapter

```ts
{
  descriptor,
  recipeSchema,
  inspect(referenceContext),
  fit(inspection, constraints, rng)
}
```

- 封装 representation-specific initializer、loss、optimizer 与 recipe fitting。
- 不能输出任意 generator source 或通用 operation tree。
- `descriptor.generatorKind` 必须解析到已注册 Object Generator。

### SemanticStructureRegistry

```ts
resolveSemanticFamily(ref)
resolveStructuralArchetype(ref)
validateCompatibility(bindingRef)
```

- 拥有 required/optional roles、And/Or ontology、`H/C/S/R/J` templates 与
  cardinality bounds；
- 不 import Object Generator，不拥有 fitter 或 candidate-specific values；
- 自动分类只返回 proposal；binding 仍需显式 human-reviewed admission。

### ProductionDefinitionCatalog

```ts
describe(generatorKind)
generate(generatorKind, recipe, seed) -> THREE.Object3D
```

- 内部包装现有 `generateObject(recipe, generator)`。
- development 可以 import production；production 不得反向 import Workbench。

### RestorationProfileAdapter

```ts
createCalibrationBracket(context)
evaluate(evidence, frozenBaseline) -> QualityGateResult
```

- 由 `SemanticFamily + StructuralArchetype + QualityProfile` 编译并校准，拥有
  category-specific mild/destructive controls、measurements、baseline bindings
  与 gate 解释。
- 不拥有 generator 或 fitter。

### EvidenceRunnerAdapter

```ts
run({reference, candidate, protocol, baseline}) -> EvaluationEvidence
```

- 真实实现复用现有 Evaluation Harness。
- in-memory implementation 支持快速 Interface tests。

### ArtifactStore

只有 resumable authoring 确实需要跨进程恢复时再引入：

```ts
put(closedDevelopmentArtifact) -> ArtifactIdentity
get(identity) -> closedDevelopmentArtifact
```

不为 emitter 建 Adapter；目前合法输出只有一种。

## 11. 必须保持的 invariants

- Semantic/Structural/Representation binding 由人或 request 显式确认；自动 ranking
  只是建议。
- 已知 `RepresentationFamily` 的 fitter 只能改变 schema 声明的 bounded semantic
  fields。
- 新 generator 只能由 authoring workflow 产生 draft，不能自动进入 catalog。
- recipe cardinality 不得随 source node、vertex、triangle、pixel 或 sampling resolution 增长。
- source path、node ID、raw mesh、texture、capture、fit history 不进入 Production Projection。
- 同一 source identity、selection、family/version、seed、baseline 和 decision chain 产生相同 canonical result。
- candidate 不参与 framing、Calibration Bracket 或 gate threshold 选择。
- Object Generator 返回一个 identity-local semantic root，并满足 Reconstruction Frame。
- `qualified` 必须同时通过 quality、budget、determinism、Reference Independence 与 freeze。
- 人类 decision 不能 `force-pass` 或豁免 prohibited data、hard audit、destructive control。
- complete-source scalar audit 覆盖 recipe、generator、helper 和 shader constant。
- dependency direction 永远是 development → production。

## 12. Outcome 与 Error

预期的业务 outcome：

```ts
type WorkflowOutcome =
  | { kind: "qualified"; candidate; evidence }
  | { kind: "needs-human-decision"; request; continuation }
  | { kind: "needs-human-authoring"; brief }
  | { kind: "rejected"; reason; evidence }
  | { kind: "failed"; error };
```

应明确区分：

- `rejected`：表示 family 合法，但质量、预算、admission 或 attempt budget 失败。
- `needs-human-authoring`：没有已注册 family 能解释输入。
- `needs-human-decision`：source selection、semantic anchor 或 representation 存在歧义。
- `failed`：reader、Adapter、schema、baseline、determinism 或 freeze contract 出错。

稳定 error code 至少包括：

- `SOURCE_DECODE_FAILED`
- `SELECTION_EMPTY`
- `SELECTION_AMBIGUOUS`
- `FAMILY_NOT_REGISTERED`
- `REPRESENTATION_INCOMPATIBLE`
- `RECIPE_SCHEMA_INVALID`
- `ADAPTER_CONTRACT_VIOLATION`
- `NONDETERMINISTIC_FIT`
- `PROHIBITED_DATA_DETECTED`
- `BASELINE_NOT_FROZEN`
- `BASELINE_CANDIDATE_CONTAMINATED`
- `FREEZE_DRIFT`
- `STALE_CONTINUATION`

## 13. 评估体系

### 13.1 Synthetic recovery

先用 generator 自己生成的 held-out recipe 作为输入：

- 连续参数相对误差。
- 离散 variant accuracy。
- 生成后 mesh-space error。
- 同 `RepresentationFamily` held-out 实例成功率。
- 是否错误增加自由度。

这是判断 fitter 是否真的工作的最便宜证据。

### 13.2 Mesh-space geometry

- symmetric Chamfer。
- point-to-surface distance。
- normal consistency。
- occupancy/SDF IoU。
- Hausdorff 上界或高分位误差。
- bounds、volume、surface area。
- watertight/closed-solid 条件仅对适用 family 使用。

### 13.3 Render-space quality

- 固定十二视图 silhouette。
- depth、normal、albedo、lit appearance。
- material role coverage。
- category-specific mild/destructive controls。
- reference-framed camera，不允许 candidate 自适应取景。

### 13.4 Structure 与 semantics

- semantic part roster 与上限。
- contact/attachment correctness。
- mirror、radial、linear repetition。
- opening、wheel-ground、branch continuity 等 family constraints。
- 一个 root、唯一 semantic ID、identity-local transform。

### 13.5 Program quality

- recipe byte size 与字段数。
- generator source/scalar/triangle budgets。
- 参数因果可编辑性。
- 参数 identifiability 与敏感度。
- 输入 decimation、retriangulation、node reorder 后的稳定性。
- Reference 删除后离线构建与运行。

### 13.6 流程 Leverage

- 新 Semantic/Structural/Representation definition 的一次性 authoring 时间。
- 同 `RepresentationFamily` 第二、第三实例的拟合时间。
- 人工 intervention 次数。
- generator 是否保持零改动。
- 删除 Workbench 后有多少 extraction、fit、evaluation、freeze 逻辑会重新散落。

## 14. 建议 PoC 顺序

### P0：冻结边界，不迁移八个候选

目标：

- 给现有八个 Reconstruction Unit 建只读回归入口。
- 验证新 Workbench 调用现有 generator、Evaluation Harness 与 Candidate Freeze。
- 不改已冻结 recipe/generator。
- 把 `node | node-set | subgraph` reader、digest 与 Reconstruction Frame contract 独立测通。

成功：

- 八对象的 production definition 与生成结果不漂移。
- production import graph 不新增开发依赖。

### P1：通用 `fitRecipe` orchestration

目标：

- 选现有 vase/stone 等已知 schema 做 synthetic recovery。
- 同时做一个 CADFit-style 的 development micro-spike，
  验证 profile/extrude/revolve candidate search 与几何反馈。

成功：

- held-out recipes 可在固定预算内恢复。
- optimizer、checkpoint、loss 与 seed 不含对象硬编码。
- RepresentationFamilyAdapter 可以替换，但 Workbench Interface 不变。

停止/重设：

- 只能通过每对象特判恢复。
- loss 改进不能转化为既有 quality gates 的改进。

### P2：验证一个树的 RepresentationFamily

目标：

- 新建 `plant.tree` SemanticFamily、`hierarchical-branching-crown`
  StructuralArchetype 与一个 Bounded Plant RepresentationFamily。
- 同一 generator 覆盖圆冠、柱形冠、低矮分叉/伞冠等三个处于声明 topology bounds
  内的树实例；第一棵允许 author representation，第二、第三棵只允许改 recipe。
- 把 whorled conifer 与 single-stem palm 作为 out-of-family routing controls；
  若 hard compatibility 不成立，就分别登记新 Structural/Representation family，
  不强迫进入万能 tree generator。

成功：

- 第二、第三棵 generator 零改动。
- recipe field/cardinality 有固定上限。
- 原 mesh 与 decimated/retriangulated mesh 得到容差内一致的 Semantic Measurements。
- Reference Independence、determinism、quality 与 budget gates 全部通过。
- conifer/palm controls 能被正确路由或拒绝，不靠 object-ID branch 偷渡。

停止/拆 `RepresentationFamily`：

- branch list 长度随输入三角形增长。
- 每棵树都需要新增 generator branch。
- foliage 只能靠 reference-derived point cloud 重放。

### P3：多 node 商铺，再扩展到小建筑

目标：

- 一个 subgraph 输入覆盖 massing、awning、opening、sign 与 fixtures。
- 验证多 material role、part contact、重复 bay 与 bounded attachments。
- 尝试用同一个 built-form RepresentationFamily 再拟合一个小建筑；商铺使用
  `RetailShopfront` semantic specialization/profile，小建筑使用自己的 profile。

成功：

- Workbench 与 reader Interface 不改。
- 新实例只增加 compact recipe/definition binding。
- Boolean 若被引入，必须给出两个 shape class、bundle、worker、freeze 与 fallback 证据。

停止/拆分：

- recipe part roster直接复制 source node roster。
- 建筑和商铺只能靠一个巨型 operation tree 共存。

### P4：stylized low-poly vehicle

目标：

- 建立明确的 vehicle domain term 或确认 Fixed-topology Fixture Generator 足够。
- 恢复车体、cabin、镜像 wheel pairs 与 bounded attachments。

成功：

- 左右关系、轮地接触、轴距/轮距和 semantic role 通过结构 gate。
- 至少两个同族车型只改 recipe。

停止：

- 需求滑向照片级自由曲面、内饰或工业 CAD 精度。
- 固定 topology 无法覆盖目标样本，应新建 family，而非扩张参数表。

### P5：只在有重复数据后做 amortization/deepening

- 某一 family 有稳定 generator、足够 synthetic pairs，且搜索成本确实是瓶颈：
  再研究 DI-PCG 类 proposal model。
- 至少 10–30 个成功程序出现重复结构：
  再用 ShapeCoder/ShapeMOD 思路发现 shared abstraction。
- 固定 recipe family 被证明不足：
  才研究 ProcGen3D/L3 program proposal。

## 15. 总体成功、Go/No-Go 与停止条件

### Go

- 通用 development-side Workbench。
- GLB node-set/subgraph ingestion。
- explicit Semantic/Structural registry 与 RepresentationFamilyAdapter registry。
- recipe schema、Semantic Measurement Admission 与 deterministic fitter。
- 复用现有 Evaluation Harness、audits 与 Candidate Freeze。
- 三树 + 商铺/小建筑作为前两类新 evidence。
- JSCAD/CGAL/Manifold 等仅作 evidence-gated development experiment。

### Conditional

- 自动 family ranking：只作建议。
- generator source proposal：只进入 authoring draft。
- differentiable optimization：有稳定 family program 后再接。
- learned proposal：只有搜索成本和数据量证明值得时。
- Manifold/其他 JS/WASM production dependency：严格执行 ADR-0001/0002。

### No-Go

- 一键 arbitrary mesh → trusted Three.js source。
- production 通用 CSG/SDF/GN DSL。
- source-scaled arrays、residual vertex tables 或运行时 reference loading。
- 大模型生成的任意 JS 直接执行/提交。
- candidate-tailored camera、baseline 或 threshold。

### 全局停止或重新划分 family 的信号

- 第二个实例仍需修改 generator。
- recipe 大小随源 mesh 分辨率线性增长。
- `StructuralArchetype/RepresentationFamily` 的 topology variants 无法设置固定上限。
- 最优 mesh loss 持续无法通过 perceptual/semantic gates。
- 同一输入与 seed 无法产生 canonical result。
- 移除 reference/evidence 后 production 无法构建。
- 新 dependency 无法满足 bundle、worker、freeze、supply-chain 或 fallback 预算。
- 人工每实例工作量没有比 Stage 2 一次性脚本显著下降。

## 16. 主要风险与未知项

### 表示不可辨识

多个程序可以产生近似相同 mesh。目标不是恢复“作者真正怎么建模”，
而是找到满足语义、可编辑性、紧凑性和质量门的等价 Procedural Replacement。

### 分割不等于语义

connected component、convex decomposition、primitive detection 与 source node
都只是 proposal。最终 semantic part 必须由 SemanticFamily contract 和人工
decision 确认。

### 优化目标错配

Chamfer 或 IoU 更好不保证结构、轮廓或材质更好。
必须组合 mesh-space、render-space、semantic constraints 与 MDL penalty。

### 非凸搜索与可辨识性

branch count、bay count、roof type、vehicle variant 是离散变量；
尺寸、角度、taper 是连续变量。需要 bounded mixed search，
并记录多解、敏感度与 attempt budget，不能只报告最佳 loss。

### Appearance

真实纹理不能进入 production。复杂外观继续使用 Semantic Material Role、
bounded procedural pattern 与 category-specific destructive controls。
不能用一个统一“纹理折扣”掩盖几何或材质失败。

### 许可与供应链

论文、代码、权重、训练集与专利是不同授权面。
任何项目进入依赖前需独立审计，不能从项目页或论文许可推断仓库可商用。

### Benchmark 外推

MeshCoder、3DCodeBench、P3D-Bench 等结果说明 code generation 在进步，
也显示 executability、断连 part、精确参数和 assembly structure 仍是难点。
它们不能证明本仓库能直接达到相同成功率。

### 范围控制

“树、建筑、商铺、车”不是一个 shape class。
Pipeline 的公共 Interface 可以通用，Representation 与 Quality Baseline 必须分族。

## 17. 建议仓库落点

仅在 PoC 立项后创建；本次调研不实现：

```text
tools/reconstruction-workbench/
  index.mjs
  reference-reader.mjs
  reconstruction-frame.mjs
  semantic-admission.mjs
  fit-orchestrator.mjs
  candidate-qualifier.mjs
  materialize-qualified.mjs
  adapters/
    bounded-plant-v1.mjs
    bounded-built-form-v1.mjs

gt_designer/src/reconstruction/
  core/
    object-generator.js
    rng.js
  families/
    bounded-plant-v1/
      generator.js
      recipe-schema.js
    bounded-built-form-v1/
      generator.js
      recipe-schema.js
```

保持 dependency direction：

```text
Workbench / development adapters
  → Production Definition Catalog
  → existing Object Generator core

Production Runtime
  -X→ Workbench
  -X→ Authored Reference
  -X→ fitter / browser / CGAL / Blender / PyTorch
```

## 18. 最终建议

1. 批准“通用开发流程 + family-specific 深生成器”方向。
2. 不批准“任意 mesh 自动转 trusted Three.js 程序”作为近期承诺。
3. 先做 `fitRecipe` synthetic recovery 和 subgraph reader。
4. 第一类新 evidence 做同一 `hierarchical-branching-crown` 原型内的三棵树，
   强制同 generator、只改 recipe；用 conifer/palm 验证路由边界。
5. 第二类做多 node 商铺/小建筑，验证可共享 built-form representation、但语义
   specialization/profile 仍分离。
6. 低模车放在下一轮，并先澄清 vehicle domain vocabulary。
7. 外部项目优先借算法和 failure taxonomy，默认不直接带入 production。
8. 以“第二、第三实例是否无需修改 generator”作为最重要的 Leverage 判据。

一句话版本：

> Stage 2 足以作为底座；下一步应造一个会读取、分析、路由、拟合和验收的
> Reconstruction Workbench，而不是造一个万能建模语言。

## 19. 参考资料

### 本地输入

- `/Users/Brian/Downloads/high_quality_3d_pcg_repositories.md`
- `/Users/Brian/Downloads/procedural-scene-reversal-follow-up-research-2026.md`
- `CONTEXT.md`
- `docs/mesh-to-program-technical-routes.md`
- `docs/procedural-3d-scene-reversal-research.md`
- `docs/infinigen-research.md`
- `docs/manifold-research.md`
- `docs/adr/0001`、`0002`、`0003`、`0005`、`0006`、`0007`、`0008`
- `docs/adr/0009`、`0011`、`0012`、`0013`、`0017`、`0020`、`0023`、`0034`

### 一手项目页、论文与官方文档

- [CADFit](https://ghadinehme.github.io/cadfit.github.io/)
- [GeoCode](https://threedle.github.io/GeoCode/)
- [PyTorchGeoNodes](https://openaccess.thecvf.com/content/CVPR2025/html/Stekovic_PyTorchGeoNodes_Enabling_Differentiable_Shape_Programs_for_3D_Shape_Reconstruction_CVPR_2025_paper.html)
- [DI-PCG](https://openaccess.thecvf.com/content/CVPR2025/html/Zhao_DI-PCG_Diffusion-based_Efficient_Inverse_Procedural_Content_Generation_for_High-quality_3D_CVPR_2025_paper.html)
- [CGAL Shape Detection](https://doc.cgal.org/latest/Shape_detection/index.html)
- [CGAL Skeletonization](https://doc.cgal.org/latest/Surface_mesh_skeletonization/index.html)
- [Inverse Procedural Modeling of Trees](https://doi.org/10.1111/cgf.12437)
- [Space Colonization](https://algorithmicbotany.org/papers/colonization.egwnp2007.html)
- [ArcPro](https://vcc.tech/research/2025/ArcPro)
- [Facade Layout Inference](https://arxiv.org/abs/1308.0419)
- [CityEngine CGA](https://doc.arcgis.com/en/cityengine/2025.0/cga/cityengine-cga-introduction.htm)
- [ShapeAssembly](https://rkjones4.github.io/shapeAssembly.html)
- [ShapeCoder](https://rkjones4.github.io/shapecoder.html)
- [PrimitiveAnything](https://primitiveanything.github.io/)
- [CoACD](https://github.com/SarahWeiii/CoACD)
- [EMS Superquadric Recovery](https://github.com/bmlklwx/EMS-superquadric_fitting)
- [JSCAD](https://github.com/jscad/OpenJSCAD.org)
- [Manifold](https://github.com/elalish/manifold)
- [replicad](https://replicad.xyz/docs/use-as-a-library)
- [MeshCoder](https://arxiv.org/abs/2508.14879)
- [3DCodeBench](https://arxiv.org/abs/2606.01057)
- [P3D-Bench](https://arxiv.org/abs/2606.11152)
- [ProcGen3D](https://xzhang-t.github.io/project/ProcGen3D/)

### 引用与复用原则

- 项目页或论文只支持算法事实，不自动证明代码可直接复用。
- GitHub license 只覆盖声明范围内代码，不自动覆盖权重、数据、专利和第三方资产。
- 本文所有 “Direct reuse” 判断都必须在选定 commit/version 后重新审计。
- 2026 年新论文与 benchmark 只作为路线证据，不作为完成度承诺。

## 20. 分层还原程度 Rubric：结论

单个 3D 对象不应共享一张“相似度总表”。推荐把资格合同拆成三层：

1. **`CommonQualityKernel`（Common Core Rubric）**：所有对象都必须满足的执行、
   证据、几何观测完整性、程序质量、确定性与 Reference Independence 合同。
2. **`FrozenRestorationProfile`（Family Rubric）**：由
   `SemanticFamily + StructuralArchetype + QualityProfile` 编译并校准出的、
   与具体 generator 无关的必要部件、关系、形态统计、appearance roles、
   mild/destructive controls、measurements 与 thresholds。前文若继续使用
   `FamilyRestorationProfile`，均指这一 compiled artifact，而不是第三种对象 taxonomy。
3. **`InstanceEvaluationContract`（Instance Contract）**：某一个 Authored
   Reference 的身份锚点、优先视图、必须保留的例外细节、允许的语义等价和明确排除项。

三层分别版本化，不允许 instance threshold 反向改写 family，也不允许较容易的
family 把阈值借给较困难的 family。

`QualityProfile` 是 `FrozenRestorationProfile` identity 的组成输入。任何
QualityProfile version 变化都会生成新的 RestorationProfile ref，并对受影响
measurements/controls/baselines 做 candidate-independent recalibration；旧 profile
不能原地换 QualityProfile。

### 20.1 还原等级

这里的 `R0–R4` 描述候选已经证明的还原程度，不等同于第 1 节 Pipeline 能力
`L0–L3`：

| Grade | 已满足证据 | 含义 | 可否进入 Production Runtime |
|---|---|---|---|
| R0 Invalid | Common Core contract 失败 | 不可执行、证据无效、非确定或违反 Reference Independence | 否 |
| R1 Core-valid Proxy | Core hard gates 通过 | 是合法 compact 程序，但只证明粗代理 | 否 |
| R2 Family-faithful | Core + Family hard gates 通过 | 语义类别、结构原型、必要 part roles 和关系成立 | 否；可作为 authoring milestone |
| R3 Instance-faithful | 再通过 Instance geometry/structure/semantic anchors | 已保留目标身份，但尚有 appearance 或最终环境证据缺口 | 否 |
| R4 Qualified Exact-ish | 三层全部 hard gates、浏览器/production gates 与 portable Candidate Freeze 通过 | 在声明的观测合同内 Exact-ish Reconstruction | 是 |

等级不能靠 soft score 越级；例如很高的 RGB/LPIPS 分数不能把断开的车轮从 R1
提升到 R2。

### 20.2 总判定

```text
eligible =
  AND(core.hard)
  AND(family.hard)
  AND(instance.hard)

qualified =
  eligible
  AND deterministic
  AND referenceIndependent
  AND nativeGpuWhenRequired
  AND evidenceComplete
  AND qualifiedCandidateFreezeVerified
```

soft metrics 只负责：

- 在同一冻结 Rubric 下排序已通过 hard gates 的候选；
- 解释候选离 mild envelope 和 destructive boundary 有多远；
- 定位下一个 authoring/fitting 动作；
- 比较同 family 的算法效率。

soft score 永远不决定 `qualified`。

### 20.3 在现有 Evaluation 架构中的位置

对 Stage 2 的只读审计表明，可直接复用的稳定层包括 Protocol、Harness、raw
visual metrics 与 Candidate Freeze；需要新增的是 reference role binding、family
measurement/control plugins、profile registry 和 qualification schema。由于这些模块
的工作量不是同一量纲，这里不使用未经实现清单验证的“复用百分比”。Family-aware
行为应位于通用证据采集之后、qualification gate 之前：

```text
frozen protocol
  → generic Evaluation Harness
  → raw, reference-framed evidence
  → CommonQualityKernel
  → versioned SemanticFamily + StructuralArchetype
  → FrozenRestorationProfile
  → frozen InstanceEvaluationContract
  → qualification decision + diagnostics
```

Harness 只负责确定性采集与原始 measurement，不应出现
`if (family === "tree")` 一类分支。Family profile 只消费通用 evidence、semantic
intermediate representation 和 family measurement plugin 的版本化输出。这样新增对象族
不会改变既有 evidence semantics，也不会把 candidate-specific 逻辑藏进 Harness。

## 21. Common Core Rubric

### 21.1 Core hard gates

| 维度 | 必须通过的合同 |
|---|---|
| Execution | recipe schema 有效；generator 正常完成；无 NaN/Infinity；返回一个 `THREE.Object3D` root |
| Identity | 根 semantic ID 等于 recipe ID；全部 semantic IDs 非空、唯一、确定 |
| Frame | 使用冻结 Reconstruction Frame；candidate 不独立 recenter、rescale 或重新取景；hard metric 禁止 post-hoc ICP 或逐 part 对齐 |
| Evidence | reference/candidate digest、tool/version、view/pass manifest 齐全；不得以 `NOT EVALUATED` 当 PASS |
| Mesh validity | 非空、有限坐标，记录退化面、非流形边与反向法线；只有 profile 声明为 solid 的 part 才要求 watertight，leaf card、opening surface 等开放表面不得被误判 |
| Geometry observations | 固定视图的 silhouette、depth、normal、bounds 全部产出；适用时产出 mesh-space metrics |
| Program quality | recipe bounded、semantic、可解析；无 source-resolution arrays、base64 或隐藏 sampled geometry |
| Runtime | triangle、draw call、geometry bytes、bundle、warm generation 均在所属 budget 内 |
| Determinism | 相同 recipe/seed 的 semantic hierarchy、topology、attribute/index lengths 和 CPU signature 稳定 |
| Reference Independence | 删除 reference、loader、fit history 与 artifact store 后仍可离线构建和运行 |
| Cross-browser | 适用时在 fresh Authored Reference/candidate capture 上通过 native hardware-GPU gate |

Core 不设置一组“所有对象共用”的 silhouette 或 Chamfer 数值。它规定哪些证据
必须存在、如何观测以及哪些非视觉合同不可补偿；数值质量阈值、operator 与
applicability rule 由 Family Rubric 校准并授权。Instance Contract 只提供冻结的
reference target/annotation 与 family 允许的例外，不得自定 family threshold。

这延续：

- [ADR-0004](./adr/0004-separate-geometry-and-appearance-gates.md) 的先 geometry、
  后 appearance；
- [ADR-0009](./adr/0009-reference-framed-twelve-view-evaluation.md) 的固定
  12-view、aggregate + worst-view；
- [ADR-0019](./adr/0019-require-native-cross-browser-gpu-visual-gates.md) 的
  fresh native-GPU evidence；
- `CONTEXT.md` 的非补偿式 Quality Gate Stack。

### 21.2 Core soft dimensions

每个候选保留一个向量，不先压成总分：

```text
geometry:
  bounds, Chamfer/DCD, surface-distance P95, volume/occupancy,
  silhouette, edge distance, depth, normal
structure:
  part roster, connectedness, contacts, symmetry, repetition, openings
semantics:
  role coverage, hierarchy, instance anchors, required/optional parts
appearance:
  DeltaE00, SSIM/LPIPS diagnostics, material roles, roughness/metalness,
  multi-scale stability
program:
  scalar count, recipe bytes, source delta, parameter sensitivity,
  identifiability, reuse
workflow:
  evaluator calls, wall time, human decisions, restart count
```

结构维度统一使用五种中间表示，而不是让每个对象族发明互不兼容的输出：

```text
H = semantic hierarchy / part tree
C = contact and containment graph
S = declared symmetry groups and exceptions
R = repetition groups, order and spacing
J = optional articulated joints, axes and ranges
```

树主要消费 `H/C/R`，建筑与商铺主要消费 `H/C/S/R`，车辆消费
`H/C/S/R`，有车门、轮轴或其他可动件时再消费 `J`。这些结构证据必须与原始
semantic IDs 互相引用。[StructureNet](https://arxiv.org/abs/1908.00575) 用
n-ary part hierarchy 加 sibling adjacency/symmetry 等关系联合表达 part geometry
与结构，支持 `H + relations` 的统一中间层；[Hi3DEval](https://papers.neurips.cc/paper_files/paper/2025/hash/42ffaddcc6edc9fb05ff9f9b49fca700-Abstract-Datasets_and_Benchmarks_Track.html)
同时做 object-level、part-level 和 material-subject 评价，支持全局与局部 evidence
并存，但其自动 learned score 仍不能替代本项目的冻结 hard gates。

### 21.3 Metric failure modes

| Metric | 能发现 | 典型漏检/误导 | 必须搭配 |
|---|---|---|---|
| Symmetric Chamfer | 整体表面距离 | 对局部密度、薄结构、重复缺失不敏感；outlier 可支配无界值 | DCD、P95/worst、part/structure gates |
| DCD/EMD | 点分布与局部细节 | 仍不理解 part role、attachment 或负空间语义 | family structure + rendered depth |
| Volumetric IoU | 体块和大凹凸 | 受 voxel/SDF 分辨率影响；小窗、叶片、轮辐贡献小 | silhouette edge、opening/part gates |
| Silhouette IoU | 外轮廓 | 单视图看不到深度、背面、内孔；大面积主体掩盖小部件 | 固定多视图、worst-view、depth |
| Depth error | 可见表面层次 | 被遮挡面无证据；平均值掩盖局部穿插 | P95/worst、anchor views、contacts |
| Normal consistency | 面朝向与局部形态 | 对位置偏移弱；硬边风格与光滑法线不可直接比较 | position metric、family style contract |
| SSIM | 同位置亮度/对比/结构 | 相机、光照、phase 改变会重罚语义等价 pattern | semantic role coverage、DeltaE、human anchor |
| LPIPS | 与人类 patch judgement 更接近的图像距离 | 仍是 2D learned feature；不能证明隐藏面、尺度和装配正确 | geometry/structure hard gates |
| DeltaE00/palette | 颜色角色 | 不证明图案位置、coverage、材质或几何 | role coverage、roughness/metalness |
| Part IoU | 已标注 part 的覆盖 | 大 part 支配平均；依赖可靠 role mapping | macro-average、worst-part、required-role presence、relations |
| CLIP/SigLIP/VLM judge | 类别/语义大致相似 | 容忍比例、数量、接触和小部件错误；会受 prompt/style bias | 只作 diagnostic 或 human triage |
| Code length/scalar count | 紧凑性 | 短代码可以不可读，长代码可能含合理复用；可把数据藏进表达式 | static audit、semantic edit tests、gzip/AST |

[Occupancy Networks](https://openaccess.thecvf.com/content_CVPR_2019/papers/Mescheder_Occupancy_Networks_Learning_3D_Reconstruction_in_Function_Space_CVPR_2019_paper.pdf)
把 IoU、Chamfer-L1 与 normal consistency 并列，说明没有一个 mesh metric 足够；
[Density-aware Chamfer Distance](https://proceedings.neurips.cc/paper/2021/hash/f3bd5ad57c8389a8a1a541a76be463bf-Abstract.html)
进一步实证普通 Chamfer 对局部密度不匹配不敏感、无界值易受 outlier 影响。
[LPIPS 官方实现与 BAPPS](https://github.com/richzhang/PerceptualSimilarity)
基于 2AFC/JND 人类 judgement 校准，但其构造仍是图像 patch 感知距离。

### 21.4 Rubric QA meta-tests

Metric 不能因为“业界常用”就进入 hard gate；它自己也要接受 system-level unit
tests。对每个 family/reference 的 identity，以及预声明的
`add/remove/disconnect/deform/perturb` 连续强度 corruption，至少检查：

| Property | 测试 | 失败后的处理 |
|---|---|---|
| Identity | `d(x,x)=0` 或 similarity 达到冻结上界；重复 capture 仍在 repeatability envelope 内 | 修 evaluator；不得定 threshold |
| Symmetry | 对称 distance 满足 `d(x,y)≈d(y,x)` | 改为明确有向 metric，或降为 diagnostic |
| Representation invariance | edge split、retriangulation、node reorder、合法 batching 改变不应逆转等价结果 | 修 correspondence/sampling；否则 diagnostic |
| Monotonicity | corruption 越重，坏分数比例与方向不得改善 | diagnostic；不能参与 hard gate/weight |
| Quasi-proportionality | 小步连续 perturbation 的 score change 应平滑，不能频繁翻转 | diagnostic 或限定有效区间 |
| Human order agreement | 在 identity/mild/destructive 和真实近邻候选上，与专家 pairwise order 的一致性及置信区间达标 | 不能据此单独决定资格 |

[Langerman 等，ICCV 2025](https://arxiv.org/pdf/2503.08208) 将 benchmark 明确拆成
data、protocol、metrics，并展示 edge split 这类语义等价重参数化会让常见 F1、
WED 等指标误排；其 identity、symmetry、monotonicity、quasi-proportionality
unit tests 直接适合作为本 Rubric 的 QA 层。论文还用专业 3D modeler 的 pairwise
preference 校准 metric order。

[Pix3D](https://jiajunwu.com/papers/pix3d_cvpr.pdf) 的行为研究中，IoU、EMD、CD
与人类判断的 Spearman 相关分别约为 `0.32/0.43/0.49`。这不是说这些 metric
无效，而是说明不得依赖单一几何指标；进入 hard gate 的 family metric 需要 family
内的人类 pairwise calibration 与 destructive-control separation。

Meta-tests 与 threshold calibration 是两件事：前者证明 metric “方向可信”，后者才
确定 mild 与 destructive 的资格边界。任何不能稳定通过 meta-tests 的 metric，即使
在当前两个 control 上偶然可分，也只能保留为 diagnostic。

### 21.5 Part correspondence 与尺度规则

当 family 声明 one-to-one part correspondence 时，可借鉴
[P3D-Bench](https://arxiv.org/abs/2606.11152) 的实现思路：以 Hungarian assignment
求一对一匹配，用 `1 − part F-score` 作 cost，并同时惩罚漏件和多件。其
`5%` GT part bounding-box diagonal 容差、`F1 ≥ 0.7` 接受线可作为初始
calibration reference，但不能原样成为本仓库 hard threshold。

必须冻结以下约束：

- 只在全局 Reconstruction Frame 内匹配；禁止逐 part recenter/rescale；
- hard gate 不允许 post-hoc ICP；alignment-normalized 结果只能作为 diagnostic；
- 除 macro part score 外必须报告 `worstPart`，小轮、门把、招牌或枝杈不能被面积平均淹没；
- 一对一汇总可同时报告
  `sum(matchedPartF1) / max(N_gt, N_pred)`，使漏件与多件都降分；
- 多 solid reference 与融合外壳比较时，可预声明 `exterior-only` sampling，避免把
  GT 内部重合面当成候选缺陷；该开关属于 Instance Contract，不能候选失败后临时开启；
- `bounded-family` 或 `distribution` correspondence 不得偷偷退化成逐 part
  nearest-neighbor；它们分别使用角色容量/拓扑约束或统计分布。

## 22. Family Rubric

Family Rubric 声明的是“一个 family 若仍被认作该类对象，绝不能丢掉什么”，不是
对每个 source component 做一一复制。

### 22.1 树

**Family hard gates**

- 至少一个 grounded 主干/primary axis，底部接触 ground plane；
- 主干到主要冠层连续；不得出现悬浮冠层或断开的主要枝组；
- trunk/branch/foliage 必要 role 按该 archetype 声明存在；
- branch depth、axis family、organ family 和 instance count 均在固定上限；
- 显式 seed 决定拓扑与 semantic IDs；
- 关键 view 的 trunk/crown silhouette、depth 与 role coverage 通过 bracket；
- 删除主干、删除冠层、断开主枝、把冠层压成单 blob、交换 trunk/foliage
  palette 等 destructive controls 必须失败。

**Family soft metrics**

- crown envelope 的水平切片 IoU、radial/vertical occupancy profile；
- trunk lean、height/radius、taper 曲线；
- 容差几何对应后的**双向 skeleton distance**，分别报告 reference→candidate 与
  candidate→reference，防止漏枝或增枝只罚一边；
- 主分叉高度，以及 branch length、radius、taper、angle 和 branch-order
  distribution；
- 冠层非对称度、空隙率和 foliage density；
- 叶片/叶簇的数量、节距、螺旋角、密度和 crown coverage distribution；
- trunk/branch/foliage Semantic Material Role Coverage；
- 多 seed 的 family validity，而不是只看目标 seed。

**不作为 hard metric**

- 与 reference 每一根 twig、每一片叶的一一对应；
- source-level exact branch count；Instance Contract 明确命名的 major branch 除外；
- source skeleton graph edit distance。

它们会逼迫 production recipe 保留 branch graph，违反 Bounded Plant Archetype。
树的 topology 比较应先以空间容差建立 branch/节点对应，再比较 parent-child
关系与 branch order；这比直接对原始 tree 做 edit distance 更能容忍分叉点的轻微位移。
叶片按分布恢复，不做逐叶 identity matching。
[UAV-LiDAR tree reconstruction evaluation](https://www.frontiersin.org/journals/environmental-science/articles/10.3389/fenvs.2022.960083/full)
给出了双向 skeleton matching 的一手先例：两个方向的最近距离分别惩罚虚增枝和漏枝。
[Inverse Procedural Modeling of Trees](https://juliankratt.info/inverse_modeling.php)
证明 polygonal tree 可用于估计随机 tree model 参数，但目标是生成“相似树”；
因此 family distribution 与大结构比逐枝 identity 更合理。

**Calibration controls**

- mild：整体尺度、轻微 lean/taper、冠层宽高比、叶片大小/密度、分叉角的小扰动；
- destructive：缺主干/冠层、明显断枝、错误生长轴、冠层塌缩、结构深度失控、
  trunk/foliage role 删除或互换。

### 22.2 Built-form Core、建筑与商铺

以下先定义 building 与 shop 可共享的 **Built-form Core hard gates**：

- footprint、ground contact、主要 massing layers 和 roof class 成立；
- 必要 wall/roof/window/door/installation semantic surfaces 存在，opening 不被实心面
  错误封死；
- floor/bay/opening repetition 的数量、顺序、spacing 与 adjacency 满足声明的
  bounded grammar；
- door/window 被正确 containment 在所属 facade，roof 与 wall、installation 与
  host surface 的 contact 合法；
- canopy、sign、balcony 等 attachment 不悬浮、不穿入主体；
- 一个 Bounded Built-form Assembly，不保留逐 source-face/component 表；
- 删除入口、封死主要窗口、删屋顶、交换 floor order、悬浮雨棚、压平 facade
  role 等 destructive controls 必须失败。

**Family soft metrics**

- footprint/每层 contour IoU、layer height error、setback；
- roof pitch、ridge、overhang、eave silhouette；
- rectified facade 上 opening/bay macro part IoU；
- floor/bay/opening count error，以及 opening aspect、spacing、alignment 和
  repeat residual；
- wall/roof/window/door/installation semantic surface 的 macro-average 与
  `worstPart`；
- wall/roof/window/door/installation material role macro-average；
- visible attachment contact distance。

[ArcPro](https://vcc.tech/research/2025/ArcPro) 用 layer height、polygon contour 和
architectural tree 表示 massing；[BuildingNet](https://buildingnet.org/) 用 2,000
个 building mesh、mesh primitives 与 part components 的语义标注，支持语义部件与
组件覆盖评价；它本身不证明 contact/relations，后两者仍须由本项目的 `C/R` hard
gates 单独验证。Area-weighted semantic IoU 也不能取代 containment、contact、
floor/bay repetition 和 opening-presence hard gates。

`RetailShopfront` 不是普通 building 的一个任意 instance 标签，而是
`BuiltForm` 下的 `SemanticFamily` 特化。以下 class-defining roles 应进入
`RetailShopfront` 的 frozen semantic/profile contract：

- 主入口和 display window；
- public access 与 frontage/display 的关系；
- 招牌、雨棚/awning、柜台等角色是 required 还是 bounded optional；

某个商铺的 **Instance Contract** 再声明：

- 该实例具体拥有的招牌、雨棚/awning、柜台等身份锚点；
- 店面 opening 的优先正视图；
- 招牌若只要求 semantic pattern，应明确文字逐字匹配是 in-scope 还是 excluded。

**Calibration controls**

- mild：层高、bay 宽、roof pitch、overhang、opening inset 和 trim 深度的小扰动；
- destructive：主入口删除、整层丢失、roof class 错误、开口封闭、repeat collapse、
  canopy/sign 脱离、wall/window role 互换。

### 22.3 Stylized vehicle

**Family hard gates**

- body 是一个连续主质量体；
- subtype 声明的 axle/wheel roster 完整，左右轮配对；
- wheel 与 ground plane 的接触和 axle alignment 合法；
- cabin/window/light 等 required roles 按 subtype 存在；
- 左右 symmetry 在声明容差内，但 instance asymmetry 可显式豁免；
- wheel arch、body/cabin negative space 不被错误填平；
- 不允许 floating wheel、轮子穿体、错误轮数、车身断裂或 part ID 漂移。

**Family soft metrics**

- length/width/height、ground clearance、front/rear overhang；
- side/top/front profile IoU 与 edge P95；
- wheel radius、width、axle spacing、wheelbase 和 left-right track；
- cabin centroid、roofline、hood/trunk proportions；
- body/window/wheel/light macro part IoU；
- bilateral symmetry error；
- flat-shaded plane distribution、crease preservation 和 color-role coverage。

`InstanceEvaluationContract` 可声明一个 bounded semantic keypoint subset，例如
wheel centers、axle midpoints、body corners、roof/cabin extrema、灯和门的 landmarks。
[ApolloCar3D](https://openaccess.thecvf.com/content_CVPR_2019/html/Song_ApolloCar3D_A_Large_3D_Car_Instance_Understanding_Benchmark_for_Autonomous_CVPR_2019_paper.html)
用 66 个语义 keypoints 表达车辆实例结构，支持“有限关键点集合”这一做法；本项目
不应机械照搬全部 66 点，也不把它们编码进 production recipe。

若 reference 含可动门、轮轴或其他 articulation，则 `J` 还报告 motion-part IoU、
joint type、axis orientation、axis minimum distance 与 motion-range overlap。
[Shape2Motion，CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/html/Wang_Shape2Motion_Joint_Analysis_of_Motion_Parts_and_Attributes_From_3D_CVPR_2019_paper.html)
提供了同时评价 motion part segmentation 与 motion attributes 的一手先例；静态
stylized vehicle 不适用时，这组字段必须标记 `not-applicable`，不能填零。

[UDA-Part](https://qliu24.github.io/udapart/) 对 car、motorbike、bus、bicycle 等
车辆建立 part annotations，支持用 per-role/macro part evidence；
[P3D-Bench](https://arxiv.org/abs/2606.11152) 明确把 executability、geometry、
topology、约束、multiview semantics 和 part-level structure 分开，并发现 assembly
最常失败在 part 数量和组合关系。

**Calibration controls**

- mild：ride height、wheel radius、wheelbase、cabin height、hood length、body taper；
- destructive：删轮/加轮、左右不配对、轮不接地、车舱漂浮、车窗封死、车体断裂、
  body/window palette 互换、把 stylized hard edges 全部抹平。

## 23. Instance Contract

Instance Contract 在第一次 candidate fitting 之前冻结，至少包含：

```text
identity:
  reference contract/digest, fixed Reconstruction Frame,
  object ID, family/profile version, declared variant
scope:
  required roles, optional roles, explicit exclusions
correspondence:
  per semantic layer:
    one-to-one | bounded-family | distribution
  matching capacity, family-authorized tolerance profile ID
  and unmatched-part policy
anchors:
  named dimensions, contacts, landmarks, symmetry exceptions
views:
  fixed common views, priority anchor views, diagnostic extra views
appearance:
  material roles, pattern semantics, allowed phase/position equivalence
structure:
  semantic roster and required/optional H/C/S/R/J relations
measurements:
  family metric spec ID, reference target value/range and unit
  applicability decision plus authorizing family rule ID
equivalence:
  source topology/part batching that need not be preserved
controls:
  family-allowlisted control template IDs and bounded parameters
attempts:
  Qualified Candidate Attempt budget
```

`correspondenceMode` 可以按 semantic layer 分别声明。例如树的 trunk 与 major
branches 可用 `one-to-one` 或有容量上限的 `bounded-family`，twigs、leaves 与
leaf clusters 则用 `distribution`；建筑入口可 `one-to-one`，重复窗口可
`bounded-family`；车辆 wheels 通常 `one-to-one`。不得给整个对象只写一个模糊模式。

Family 定义“树必须有 grounded trunk”；instance 才定义“这棵树的主干向左倾、冠层
右侧缺口是身份锚点”。Family 定义“车必须有合法 wheel roster”；instance 才定义
“这辆 stylized car 是三轮或左右不对称”的显式例外。

若某一特征未在 family 或 instance contract 中声明，不能在 candidate 已经失败后
临时升级为 hard identity，也不能临时宣布为 excluded。第一次 candidate fitting
之后同样不得改 family threshold、weight、correspondence mode 或 applicability。

`validateInstanceContract(profile, contract)` 必须在 freeze 与 qualification 前同时
运行。它至少拒绝：

- 未由 Family Profile 授权的 metric、operator、tolerance、weight 或 control；
- 把 family-required gate 标成 optional/not-applicable；
- 超出 family bounds 的 subtype、part count、correspondence 或 control 参数；
- 没有 annotation evidence/rationale 的 exclusion 或 symmetry exception；
- 与 profile、reference、frame、quality profile digest 不一致的 contract。

Digest 只证明 contract 没变，validator 才证明它合法。Instance 可以记录“这辆车的
轴距目标是多少”，但不能决定“轴距误差多大仍算通过”。

### 23.1 Reference Evaluation Annotation

通用输入 mesh 往往没有可信 semantic IDs。Family rubric 因此还需要一个
candidate-independent、development-only 的 `ReferenceEvaluationAnnotation`：

```text
reference surface/region roles and masks
semantic landmarks and measured dimensions
reviewed H/C/S/R/J relations
visibility, occlusion and ambiguity policy
annotation provenance, confidence and reviewer state
frame/unit plus annotation digest
```

它可以由 segmentation、skeletonization 或 primitive fitting 自动提议，但进入 hard
gate 的 role、landmark 和 relation 必须在候选出现前完成复核并 hash-freeze。低置信、
遮挡或语义歧义区域只能标为 `diagnostic` 或 `not-applicable`；不能填零，也不能在
候选失败后补标。

Annotation 只描述 family ontology 中的角色、关系和测量，不复制 source node roster、
triangle arrays 或参考实现结构。Candidate 使用自己的 semantic IDs，再由 evaluator
通过冻结 ontology 映射到相同角色。若一个 required role 无法被可靠标注，则该
reference 尚不具备相应 hard qualification 的条件，而不是默认候选 PASS。

[PartNet](https://partnet.cs.stanford.edu/) 的 category-specific hierarchical
annotation 与 [BuildingNet](https://buildingnet.org/) 的建筑 primitive/component
semantic labels 说明：part-level 评价依赖显式、按类别组织的 reference annotation；
自动相似度不能凭空恢复可审计的语义 ground truth。

## 24. Calibration、Threshold 与 Candidate Contamination

### 24.1 冻结顺序

1. 冻结 Authored Reference、Evaluation View Set、renderer/environment 和 rubric versions；
2. 做至少两次 independent identity capture，测 repeatability；
3. 以多个代表性 family references 冻结 perturbation manifest，覆盖 common、
   family 和 instance 维度；
4. 运行 mild、intermediate、destructive controls；
5. 检查每个 metric 的方向性与 monotonicity；
6. mild 与 destructive 可分才允许 hard threshold；
7. 不可分、非单调或环境敏感的 metric 改为 `diagnostic`；
8. 用独立 Rubric Validation objects 或 leave-one-object-out 检验 separation 与
   human order，不触碰 Pipeline Benchmark Qualification hold-out；
9. 冻结 threshold/weight/aggregation rule 后才允许查看候选；
10. 每个 qualified candidate hash-freeze，并消耗 Attempt Budget；
11. candidate failure 不改变 baseline。

当前
[`stage2-category-baselines-v1.json`](../gt_designer/single-mesh-evaluation/baselines/stage2-category-baselines-v1.json)
已经采用：

- two independent reference-only runs；
- `candidatesFittedBeforeFreeze: false`；
- candidate failure 不得放宽 threshold；
- inseparable metric 变 diagnostic；
- mild/destructive 之间的 `guardFraction: 0.25`。

建议沿用其确定性 threshold rule。跨全部 calibration references、independent
runs 和适用 controls，令 `m` 为最差 mild boundary，`d` 为最接近 mild 的
destructive boundary，`g=0.25`：

```text
lower-is-better: threshold = m + g * (d - m)
higher-is-better: threshold = m - g * (m - d)
```

如果 `m` 与 `d` 没有正确排序，metric 不得成为 hard gate。样本增加后可用预声明的
repeatability/tolerance interval 代替单个 extreme，但规则仍须在候选前冻结。

### 24.2 两种评测任务与四类数据

必须区分：

1. **Authored Candidate Qualification**：目标 reference、Instance Contract 与诊断
   对 author 可见，允许针对这一件对象拟合和修正；防污染要求是 rubric/baseline/
   controls 必须先冻结，candidate failure 不得反向改 gate。它对应当前 Stage 2 的
   日常 R4 路径，不需要假装目标 reference 是盲的。
2. **Sequestered Pipeline Benchmark**：测试“同一 pipeline 对未见 family instance
   是否泛化”。population 在 pipeline 开发期不可见；正式 run 才按协议把规定输入
   交给 pipeline，禁止 target-specific 手工改 generator，精细结果在评测窗口关闭前
   redacted。

四类数据服务于 family rubric 与第二种 benchmark，不得把盲测规则强加给第一种
日常 qualification：

- **Calibration set**：identity + reference-only mild/destructive controls，只定 gate；
- **Rubric Validation set**：不参与 threshold fitting 的 reference/control objects，
  用于批准或拒绝 profile 的跨对象泛化；若据此修改 rubric，旧 validation 结论作废，
  必须换新 split/version；
- **Development set**：调 Adapter、loss、optimizer 和 generator；
- **Pipeline Benchmark Qualification hold-out**：pipeline 开发者不可见，只用于
  sequestered population run；它不是单件 Authored Candidate 的 reference。

Synthetic generator 的 recovery train/dev/test 也必须按 recipe/seed/variant 拆分，
不能只随机拆 render，因为同一个 recipe 的多视图会泄漏。

Family calibration 不能只由一个“典型对象”代表。每个 profile 至少需要多个不同
subtype/复杂度/尺度的 representative references，再对未参与定阈值的 Rubric
Validation objects 做验证；样本较小时可在 candidate-independent calibration corpus
内做 leave-one-object-out，但它只估计 profile readiness，绝不替代密封的
Pipeline Benchmark Qualification hold-out。若某 metric 只对一件对象可分，或者
换一件对象就违反 meta-test，应降为 instance metric 或 diagnostic，不能升格为
family gate。

### 24.3 Candidate contamination

对 Sequestered Pipeline Benchmark，反复根据 hold-out 结果修改 generator，本质上
是适应性过拟合。
[The Ladder](https://proceedings.mlr.press/v37/blum15.html) 说明连续提交会让参与者
逐渐 overfit leaderboard holdout；[NIST AITE](https://pages.nist.gov/ai-technology-evaluation/)
因此使用 blind、sequestered data 降低 train/test contamination。

本项目应：

- 记录 `candidateExposedBeforeFreeze`、首次暴露时间和暴露字段；
- 限制 Qualified Candidate Attempt，而不是限制内部 optimizer iteration；
- sequestered benchmark 对 pipeline author 只返回 redacted gate/failure class；
  per-view、per-part、threshold boundary 和 raw evidence 留在 sealed internal report；
- 日常 Authored Candidate development 可以看完整 diagnostics；最终 qualification
  仍要求 immutable attempt ref，且失败不能修改 rubric/baseline；
- 改 metric、threshold、view 或 destructive manifest 必须新版本；
- candidate 已知后的正常 baseline 修改一律禁止；
- 只有 Quarantined Rebaseline 或 Human-anchored Baseline 可继续，且保留历史 FAIL。

Human-anchored Baseline 不是“人工说通过”：它必须命名并 hash-freeze positive，
记录 `candidateInformed: true`，保留 candidate-independent 历史结果，并继续拒绝全部
声明的 destructive controls。

### 24.4 Evidence visibility

必须区分三种产物：

1. **Sealed Candidate Evidence Report**：供 evaluator/auditor 使用，包含 raw、
   per-view、per-part、threshold、control 与完整 diagnostics，content-addressed
   保存并绑定 reference/candidate/protocol/environment digests。
2. **Authored Candidate Result**：已知目标的日常开发/验收结果，可包含完整
   diagnostics；它必须清楚标记 `mode=authored-candidate`，且只接受已经 immutable
   的 candidate attempt。
3. **Benchmark Qualification Receipt**：在 sequestered Attempt Budget 尚开放时
   返回给 pipeline author，只包含 verdict、稳定的 failure class、profile/attempt ID
   和审计引用，不泄露 hold-out 目标值、逐视图误差或 threshold margin。

Calibration、Development 与 Authored Candidate run 可以输出完整报告；真正的
Sequestered Pipeline Benchmark 必须默认 redacted。只有在 profile retirement、
评测窗口关闭或明确的 disclosure policy 满足后，才可以公开完整 benchmark evidence。
否则“限制 attempt 次数”仍会被精细 diagnostics 绕过。

## 25. Aggregate、Weight 与 Soft Score

### 25.1 视图聚合

每个视觉 metric 必须保留：

- `perView[]`
- `mean`
- `p90` 或 `p95`
- `worstView`
- instance priority views 的独立结果

每个 part/role metric 还必须保留：

- `perPart[]`
- `macroMean`
- `worstPart`
- required small-part subset 的独立结果

平均值会掩盖背面缺失或单个断裂部件；worst-view 又可能被单帧 GPU/edge noise
支配，所以二者都保留。critical anchor view 直接设 hard gate，不藏进平均。

### 25.2 Bracket normalization

仅用于 soft ranking。对 raw value `x`、mild boundary `m`、destructive boundary
`d`：

```text
lower-is-better: s = clamp((d - x) / (d - m), 0, 1)
higher-is-better: s = clamp((x - d) / (m - d), 0, 1)
```

`s=1` 表示进入 mild envelope，`s=0` 表示到达/越过 destructive boundary。没有
有效 bracket 的 metric 不生成 normalized score。

### 25.3 权重

- fidelity weights 属于 Family Rubric，候选前冻结；
- geometry、structure、semantics、appearance 各自产出 fidelity dimension score；
- family 内部可用 weighted geometric mean，避免某个 fidelity 低项被高项完全买回；
- required-role、contact、opening、Reference Independence 等仍是 hard gate；
- family fidelity soft score 只作排序，必须同时展示完整 fidelity dimension vector；
- 不跨 family 比较 overall score，除非 calibration population 和 rubric 相同；
- 不从当前候选的 human preference 反向学习本轮 weights。
- program quality、editability 与 workflow cost 属于独立 Quality/Budget Profile，
  不参与 restoration-fidelity 加权。

推荐：

```text
dimensionScore = exp(sum(w_i * log(max(epsilon, s_i))) / sum(w_i))
fidelityRankingVector = [
  geometryScore,
  structureScore,
  semanticScore,
  appearanceScore
]
productionRankingVector = [
  programQualityScore,
  editabilityScore,
  workflowCostScore
]
```

项目正式 exit 仍使用 `AND(hard gates)`，不使用 `sum(weights * scores)`。

### 25.4 系统级聚合与非补偿原则

跨对象或跨运行报告三种互补统计，不能只报“通过样本的平均质量”：

```text
pass_rate           = passed / attempted
quality_given_pass  = mean(soft quality | hard gates passed)
penalized_quality   = mean(qualified ? soft quality : 0)
```

`pass_rate` 表达系统可靠性，`quality_given_pass` 区分合格候选的上限，
`penalized_quality` 防止只在少数容易对象上拿高分。三者均按 family macro-average
并报告 worst family/instance，不把对象数量多的 family 变成隐性权重。

硬门槛先于任何排序；缺失关键 part、关系或 semantic role 时，appearance、
Chamfer 或其他维度不得补偿。正式报告分别给出 geometry、structure、semantics、
appearance 向量，以及独立的：

```text
productionFitness: boolean
programQuality: dimension report
editability: dimension report
codeBudget: pass | fail
```

程序性、可编辑性和代码预算很重要，但与 restoration fidelity 正交；短代码不能
抹掉漏件，极高 fidelity 也不能豁免 production budget。

## 26. Human Evaluation

Human evaluation 只在以下情形进入：

- 自动 metrics 无法区分语义等价的 procedural appearance；
- family/instance identity 依赖风格化比例或可读性；
- 两个都通过 hard gates 的候选需要排序；
- 需要建立显式 Human-anchored Baseline。

协议：

1. 使用同一 reference-framed views/pass、显示设备和色彩环境；
2. 候选顺序和左右位置随机、评价者不知道实现方法；
3. 优先 pair comparison：`哪个更保留目标的 X？`，而不是无定义的“哪个好看”；
4. 分开询问 silhouette/proportion、part completeness/contact、semantic identity、
   appearance roles 和整体 preference；
5. 混入 identity、mild 和 destructive controls，验证评价任务能区分边界；
6. 用预实验和 power analysis 决定人数，不用固定“小样本感觉良好”；
7. 报告 preference rate、confidence interval、inter-rater agreement、弃权和理由；
8. session 时长、break、显示环境和 subject screening 均记录；
9. 人不能豁免 prohibited data、Reference Independence、determinism、runtime、
   destructive-control 或 missing-evidence failures。

[ITU-T P.910](https://www.itu.int/rec/T-REC-P.910-202310-I/en) 提供 ACR、DCR、
pair comparison、实验设计、subject 数量/power、session 与报告要求；
[LPIPS/BAPPS](https://github.com/richzhang/PerceptualSimilarity) 使用 2AFC/JND；
[3DCodeArena](https://www.3dcodebench.com/) 使用 pairwise human-preference BT-Elo，
并同时显示 automated metric 与 human ranking 的关系。它们支持“结构化盲评 +
自动 metric 并存”，不支持用 human overall preference 取代项目 hard gates。

## 27. Synthetic Recovery Rubric

每个 Registered Family 在真实 reference qualification 前必须有 recovery benchmark：

```text
sample held-out recipe + seed
  → production generator
  → mesh / fixed multi-view observations
  → optional decimation, retriangulation, noise, node reorder
  → fitter
  → recovered recipe
  → regenerate and compare
```

报告至少包括：

- continuous parameter 的按合法 range 归一化误差；
- discrete/topology variant accuracy；
- required role/count/contact accuracy；
- recovered mesh/render 的三层 rubric 结果；
- recipe equivalence：不同参数若生成观测等价结果，不强求 literal equality；
- identifiability：一项观测能否唯一约束一个参数；
- qualification precision、false accept、false reject；
- 多初值/seed 的成功率与方差；
- evaluator calls、wall time、peak memory；
- 是否偷偷增加参数、放宽 bounds 或修改 generator。

必须有：

- family variant hold-out；
- seed hold-out；
- 至少一个结构上更难而不是只换颜色/尺度的 hold-out；
- decimation/retriangulation invariance；
- destructive targets 的拒绝实验。

[GeoCode](https://threedle.github.io/GeoCode/) 和
[PyTorchGeoNodes](https://vevenom.github.io/pytorchgeonodes/) 都以既有程序合成
parameter/shape pairs，再做参数恢复；这正适合检验 fitter，但 synthetic success
只能进入 L1 证据，不能代替真实 Authored Reference 的 instance qualification。

## 28. Rubric Report Schema

建议把候选级完整证据、调用方回执和系统级聚合拆成三种 schema。完整候选报告是
development-only 且默认 sealed，不可进入 Production Runtime：

```json
{
  "schemaVersion": "candidate-evidence-report-v1",
  "artifactRole": "sealed-internal-qualification-evidence",
  "visibility": "sealed-internal",
  "evaluationMode": "authored-candidate",
  "productionUse": "prohibited",
  "rubricContract": {
    "coreVersion": "single-model-core-rubric-v1",
    "candidateFamilyBindingRef": "sha256:candidate-family-binding",
    "profileRef": {"id": "passenger-car-exact-ish", "version": "v1"},
    "resolvedProfileIdentity": {
      "semanticFamily": {"id": "road-vehicle.passenger-car", "version": "v1"},
      "structuralArchetype": {"id": "bilateral-two-axle-four-wheel", "version": "v1"},
      "qualityProfile": {"id": "code-only-production-exact-ish", "version": "v1"}
    },
    "profileDigest": "sha256:profile",
    "bindingResolutionDigest": "sha256:binding-resolution",
    "instanceContractVersion": "shop-or-car-id-v1",
    "instanceContractDigest": "sha256:instance",
    "instanceValidationReportDigest": "sha256:instance-validation"
  },
  "instanceContract": {
    "referenceDigest": "sha256:reference",
    "referenceAnnotationDigest": "sha256:annotation",
    "reconstructionFrameDigest": "sha256:frame",
    "variant": "four-wheel-compact",
    "correspondenceBySemanticLayer": {
      "wheels": "one-to-one",
      "body-panels": "bounded-family",
      "surface-detail": "distribution"
    },
    "semanticRosterDigest": "sha256:roster",
    "relationContractDigest": "sha256:relations",
    "targetMeasurementsDigest": "sha256:targets",
    "applicabilityDigest": "sha256:applicability"
  },
  "candidate": {
    "immutableAttemptRef": "sha256:candidate-attempt",
    "representationFamilyRef": "body-cabin-axle-v1",
    "compatibilityContractRef": "sha256:representation-compatibility",
    "definitionDigest": "sha256:definition",
    "recipeDigest": "sha256:recipe",
    "seed": 1,
    "qualifiedAttempt": 1
  },
  "rawEvidenceSeal": {
    "manifestDigest": "sha256:raw-evidence-manifest",
    "referenceDigest": "sha256:reference",
    "candidateDigest": "sha256:candidate",
    "protocolDigest": "sha256:protocol",
    "harnessDigest": "sha256:harness",
    "environmentDigests": ["sha256:environment"],
    "toolchainDigest": "sha256:toolchain",
    "verified": true
  },
  "derivedEvidenceSeal": {
    "rawEvidenceSealDigest": "sha256:raw-evidence-seal",
    "manifestDigest": "sha256:derived-evidence-manifest",
    "referenceAnnotationDigest": "sha256:annotation",
    "profileDigest": "sha256:profile",
    "familyEvidenceExtractorDigest": "sha256:family-extractor",
    "measurementEvaluatorSetDigest": "sha256:measurement-evaluators",
    "verified": true
  },
  "candidateFreeze": {
    "attemptManifestDigest": "sha256:candidate-attempt",
    "qualifiedFreezeDigest": "sha256:qualified-candidate-freeze",
    "verified": true
  },
  "calibration": {
    "baselineKind": "candidate-independent",
    "baselineDigest": "sha256:baseline",
    "supersedesBaselineRef": null,
    "manifestDigest": "sha256:calibration-manifest",
    "referenceOnly": true,
    "frozenBeforeCandidate": true,
    "candidateInformed": false,
    "positiveExemplarDigest": null,
    "humanApprovalArtifactDigest": null,
    "historicalVerdictsRef": "sha256:historical-verdicts",
    "requiredDestructiveControlResultsRef": "sha256:control-results",
    "identityRuns": 2,
    "thresholdRule": "separated-quarter-guard",
    "mildScenarioIds": ["vehicle-wheelbase-mild"],
    "destructiveScenarioIds": ["vehicle-delete-wheel"],
    "inseparableMetrics": [],
    "metricQaResultsRef": "sha256:metric-qa",
    "rubricValidationResultsRef": "sha256:rubric-validation"
  },
  "hardGates": [
    {
      "id": "vehicle.wheel-roster",
      "level": "family",
      "status": "pass",
      "evidenceRefs": [
        "sha256:derived-evidence-manifest#semantic-parts/wheel-roster"
      ]
    }
  ],
  "metrics": [
    {
      "id": "geometry.silhouette.iou",
      "level": "family",
      "role": "hard",
      "direction": "higher-is-better",
      "perViewRef": "sha256:raw-evidence-manifest#silhouette/per-view",
      "aggregate": {"mean": 0.94, "p90": 0.91, "worst": 0.88},
      "perPartRef": "sha256:derived-evidence-manifest#silhouette/per-part",
      "partAggregate": {"macroMean": 0.92, "worstPart": 0.84},
      "mildBoundary": 0.90,
      "destructiveBoundary": 0.62,
      "threshold": 0.83,
      "normalizedSoftScore": 1.0
    }
  ],
  "fidelityScores": {
    "geometry": null,
    "structure": null,
    "semantics": null,
    "appearance": null
  },
  "productionScores": {
    "programQuality": null,
    "editability": null,
    "workflowCost": null
  },
  "syntheticRecovery": {
    "benchmarkVersion": null,
    "splitDigest": null,
    "resultsRef": null
  },
  "humanEvaluation": {
    "protocolVersion": null,
    "candidateInformed": false,
    "resultRef": null
  },
  "decision": {
    "restorationGrade": "R4",
    "qualified": true,
    "productionFitness": true,
    "codeBudget": "pass",
    "failures": [],
    "diagnostics": [],
    "acceptedQualityDeviation": false
  }
}
```

Pipeline author 在 sequestered benchmark 窗口内只收到 redacted receipt：

```json
{
  "schemaVersion": "benchmark-qualification-receipt-v1",
  "visibility": "pipeline-author-facing-redacted",
  "evaluationMode": "sequestered-pipeline-benchmark",
  "profileRef": {"id": "passenger-car-exact-ish", "version": "v1"},
  "candidateDigest": "sha256:candidate",
  "qualifiedAttempt": 1,
  "qualified": false,
  "restorationGrade": "R2",
  "failureClasses": ["instance-geometry"],
  "sealedEvidenceRef": "opaque:audit-ref",
  "withheld": ["perView", "perPart", "thresholdMargin", "rawEvidence"]
}
```

`passRate`、`qualityGivenPassed` 与 `penalizedQuality` 属于独立的
`system-aggregate-report-v1`。它必须绑定 population manifest 和
`family/profile/version` comparability key，不能伪装成单个候选的属性。

Schema invariants：

- `pass | fail | not-evaluated | not-applicable | diagnostic` 五种状态明确，缺字段不等于 PASS；
- `baselineKind` 只能是 `candidate-independent`、`quarantined-rebaseline` 或
  `human-anchored`，三者执行不同的必填字段与审批规则；
- 每个 hard gate 指向 sealed raw/derived evidence，不能只保存 aggregate；
- baseline、rubric、candidate、environment 与 toolchain digest 可追溯；
- `rawEvidenceSeal.verified=true` 前不得运行 derived extractor；
- `derivedEvidenceSeal.verified=true` 前不得运行 gates 或计算 verdict；
- `candidateInformed` 永不省略；
- `baselineKind=human-anchored` 时，positive exemplar、human approval、
  superseded baseline、历史 verdict 和 required destructive-control results
  必须全部存在；candidate-independent baseline 则不得伪填 positive exemplar；
- mixed family/instance baselines 不折叠成“统一分数”；
- R4 要求 `failures=[]`、全部适用 hard gates 为 `pass`，且
  `candidateFreeze.verified=true`；
- R1–R3 仍保存 factual failures，不使用 “partial pass”；
- candidate report 不得包含 population aggregate；benchmark receipt 不得包含
  withheld 精细 evidence；
- Accepted Quality Deviation 单独记录，不能把 `qualified` 改成 `true`。

## 29. Rubric 决策

建议下一步：

1. 先把 Stage 2 现有报告映射到 `Core + Family + Instance`，只读验证，不改历史；
2. 用 Vase/Stone synthetic recovery 验证 report schema 和 contamination 字段；
3. 为三种树先冻结同一个 Bounded Plant family rubric，再写三个 instance contracts；
4. 建筑与商铺共享 core measurements，但分别声明 built-form/shop required roles；
5. stylized vehicle 先冻结 subtype 与 wheel/axle/ground-contact 语义，再拟合；
6. 正式 acceptance 继续使用 hard-gate conjunction；
7. normalized/weighted score 只用于候选排序和诊断；
8. 只有 candidate-independent metrics 无法表达已获人类认可的语义替代时，
   才建立显式、版本化、destructive-separated 的 Human-anchored Baseline。

新增 Rubric 的一句话原则：

> Core 证明程序可信，Family 证明“它是什么”，Instance 证明“它是这个目标”，
> hard gates 决定资格，soft scores 只说明还差在哪里。

### 29.1 Rubric 一手来源补充

- [Occupancy Networks，CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/papers/Mescheder_Occupancy_Networks_Learning_3D_Reconstruction_in_Function_Space_CVPR_2019_paper.pdf)
- [Density-aware Chamfer Distance，NeurIPS 2021](https://proceedings.neurips.cc/paper/2021/hash/f3bd5ad57c8389a8a1a541a76be463bf-Abstract.html)
- [LPIPS / BAPPS 官方仓库](https://github.com/richzhang/PerceptualSimilarity)
- [PartNet 官方 benchmark](https://partnet.cs.stanford.edu/)
- [BuildingNet 官方 benchmark](https://buildingnet.org/)
- [UDA-Part 官方项目](https://qliu24.github.io/udapart/)
- [P3D-Bench](https://arxiv.org/abs/2606.11152)
- [3DCodeBench / 3DCodeArena](https://www.3dcodebench.com/)
- [Explaining Human Preferences via Metrics for Structured 3D Reconstruction，ICCV 2025](https://arxiv.org/pdf/2503.08208)
- [Pix3D，CVPR 2018](https://jiajunwu.com/papers/pix3d_cvpr.pdf)
- [StructureNet，SIGGRAPH Asia 2019](https://arxiv.org/abs/1908.00575)
- [Hi3DEval，NeurIPS 2025](https://papers.neurips.cc/paper_files/paper/2025/hash/42ffaddcc6edc9fb05ff9f9b49fca700-Abstract-Datasets_and_Benchmarks_Track.html)
- [ApolloCar3D，CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/html/Song_ApolloCar3D_A_Large_3D_Car_Instance_Understanding_Benchmark_for_Autonomous_CVPR_2019_paper.html)
- [Shape2Motion，CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/html/Wang_Shape2Motion_Joint_Analysis_of_Motion_Parts_and_Attributes_From_3D_CVPR_2019_paper.html)
- [Reconstruction of tree branching structures from UAV-LiDAR，2022](https://www.frontiersin.org/journals/environmental-science/articles/10.3389/fenvs.2022.960083/full)
- [ITU-T P.910 主观质量评价规范](https://www.itu.int/rec/T-REC-P.910-202310-I/en)
- [The Ladder：adaptive leaderboard overfitting](https://proceedings.mlr.press/v37/blum15.html)
- [NIST AITE blind/sequestered evaluation](https://pages.nist.gov/ai-technology-evaluation/)
- [Inverse Procedural Modeling of Trees](https://juliankratt.info/inverse_modeling.php)
- [ArcPro](https://vcc.tech/research/2025/ArcPro)
- [GeoCode](https://threedle.github.io/GeoCode/)
- [PyTorchGeoNodes](https://vevenom.github.io/pytorchgeonodes/)

## 30. 落地架构与迁移边界

### 30.1 最小接口

```ts
type VersionedRef = {
  id: string;
  version: string;
};

type ProfileRef = VersionedRef;
type ReferenceClassificationRef = VersionedRef;
type CandidateFamilyBindingRef = VersionedRef;

interface ReferenceClassification {
  readonly ref: ReferenceClassificationRef;
  readonly authoredReferenceRef: string;
  readonly semanticFamilyRef: VersionedRef;
  readonly structuralArchetypeRef: VersionedRef;
  readonly digest: string;
}

interface CandidateFamilyBinding {
  readonly ref: CandidateFamilyBindingRef;
  readonly referenceClassificationRef: ReferenceClassificationRef;
  readonly representationFamilyRef: VersionedRef;
  readonly compatibilityContractRef: VersionedRef;
  readonly restorationProfileRef: ProfileRef;
  readonly digest: string;
};

interface RestorationProfileRegistry {
  resolve(ref: ProfileRef): FrozenRestorationProfile;
  resolveCandidateBinding(ref: CandidateFamilyBindingRef): {
    binding: CandidateFamilyBinding;
    classification: ReferenceClassification;
    profile: FrozenRestorationProfile;
  } | BindingValidationFailure;
}

interface MeasurementSpec {
  readonly id: string;
  readonly group: "geometry" | "structure" | "semantics" | "appearance";
  readonly evaluatorId: string;
  readonly role: "hard" | "diagnostic";
  readonly direction: "lower-is-better" | "higher-is-better";
  readonly unit: string;
  readonly applicabilityRuleId: string;
  readonly repeatabilityAllowance: number;
  readonly viewAggregation: readonly ("mean" | "p95" | "worst")[];
  readonly partAggregation: readonly ("macro" | "worst")[];
  readonly applicableControlIds: readonly string[];
}

type ParameterBound =
  | {readonly kind: "number"; readonly min: number; readonly max: number}
  | {readonly kind: "enum"; readonly values: readonly string[]};

interface ControlSpec {
  readonly id: string;
  readonly classification: "should-pass" | "must-reject";
  readonly severity: "identity" | "mild" | "intermediate" | "destructive";
  readonly implementationId: string;
  readonly parameterBounds: Readonly<Record<string, ParameterBound>>;
  readonly applicableMetricIds: readonly string[];
}

interface CalibrationSpec {
  readonly independentRuns: number;
  readonly input: "authored-reference-only";
  readonly thresholdRule: "separated-quarter-guard";
  readonly guardFraction: number;
  readonly nonSeparatingAction: "diagnostic";
  readonly minimumHardMetricsByGroup: Readonly<Record<string, number>>;
  readonly maximumReferenceOnlyCorrections: number;
  readonly candidateFailuresMayChangeBaseline: false;
}

interface HardGateSpec {
  readonly id: string;
  readonly evaluatorId: string;
  readonly metricId?: string;
  readonly operator: "<=" | ">=" | "boolean-true";
  readonly thresholdSource:
    | {kind: "frozen-baseline"; baselineMetricId: string}
    | {kind: "boolean-evaluator"};
  readonly failureClass: string;
}

interface FrozenRestorationProfile {
  readonly ref: ProfileRef;
  readonly digest: string;
  readonly semanticFamilyRef: VersionedRef;
  readonly structuralArchetypeRef: VersionedRef;
  readonly qualityProfileRef: VersionedRef;
  readonly ontologyDigest: string;
  readonly structuralArchetypeDigest: string;
  readonly evidenceProfileIds: readonly string[];
  readonly familyEvidenceExtractorId: string;
  readonly measurementSpecs: readonly MeasurementSpec[];
  readonly controlSpecs: readonly ControlSpec[];
  readonly calibrationSpec: CalibrationSpec;
  readonly hardGateSpecs: readonly HardGateSpec[];
  readonly baselineBindings: Readonly<
    Record<
      "geometry" | "structure" | "semantics" | "appearance",
      {
        readonly baselineRef: string;
        readonly provenanceKind:
          | "candidate-independent"
          | "quarantined-rebaseline"
          | "human-anchored";
      }
    >
  >;
  readonly controlFactoryId: string;
  readonly gateEvaluatorId: string;
  readonly instanceContractPolicyId: string;
  readonly softAggregationSpec: {
    readonly method: "weighted-geometric-mean";
    readonly weightSetDigest: string;
    readonly dimensions: readonly (
      "geometry" | "structure" | "semantics" | "appearance"
    )[];
  };
  readonly budgetProfileRef: string;
  readonly calibrationManifestDigest: string;
}

validateInstanceContract(
  profile: FrozenRestorationProfile,
  instanceContractRef: string
): ValidatedInstanceContract | ContractValidationFailure;

interface BaseFreezeProfileInput {
  profileDefinitionRef: string;
  authoredCalibrationSetRef: string;
  rubricValidationSetRef: string;
  protocolRef: string;
  environmentRef: string;
}

type BaselineFacetInput =
  | {
      kind: "candidate-independent";
    }
  | {
      kind: "quarantined-rebaseline";
      supersedesBaselineRef: string;
      quarantineApprovalArtifactRef: string;
      historicalVerdictsRef: string;
    }
  | {
      kind: "human-anchored";
      positiveExemplarRef: string;
      humanApprovalArtifactRef: string;
      supersedesBaselineRef: string;
      historicalVerdictsRef: string;
      requiredDestructiveControlResultsRef: string;
    };

type FreezeProfileInput = BaseFreezeProfileInput & {
  baselineInputs: Readonly<
    Record<
      "geometry" | "structure" | "semantics" | "appearance",
      BaselineFacetInput
    >
  >;
};

freezeRestorationProfile(
  input: FreezeProfileInput
): Promise<ProfileRef | CalibrationFailure>;

evaluateAuthoredCandidate(input: {
  reconstructionUnitRef: string;
  candidateAttemptRef: string;
  candidateFamilyBindingRef: CandidateFamilyBindingRef;
  instanceContractRef: string;
}): Promise<GateQualifiedCandidateReportRef | EvaluationFailure>;

freezeQualifiedCandidate(input: {
  gateQualifiedCandidateReportRef: string;
}): Promise<AuthoredCandidateResult | CandidateFreezeFailure>;

benchmarkPipelineOnSequesteredPopulation(input: {
  pipelineFreezeRef: string;
  populationManifestRef: string;
  benchmarkProtocolRef: string;
}): Promise<BenchmarkQualificationReceipt>;
```

`Authored Candidate Qualification` 明确由
`evaluateAuthoredCandidate → freezeQualifiedCandidate` 两步组成；另一条
`benchmarkPipelineOnSequesteredPopulation` 才使用 sequestered population 与
redacted receipt。

调用方只能传 content-addressed references，不能传 raw evidence、inline baseline、
threshold、weight、aggregation rule 或临时 URL。`evaluateAuthoredCandidate` 和
benchmark runner 的 Implementation 必须：

1. 只从 Registry 解析 `CandidateFamilyBindingRef`，一次得到 binding、
   ReferenceClassification 与 FrozenRestorationProfile；调用方不能并行传
   `ProfileRef`；
2. 验证 profile 的 semantic/structural refs 与 ReferenceClassification 逐项相等，
   profile 的 QualityProfile ref 与 calibration manifest 一致，并验证 candidate 的
   `RepresentationFamily` 对该 classification 的 frozen Compatibility Contract，
   再运行 `validateInstanceContract(profile, contract)`；
3. 自己调用 Protocol/Harness 采集 reference 与 candidate；
4. 先生成并验证 `rawEvidenceSeal`，绑定 reference、candidate、profile、protocol、
   Harness、environment 与 toolchain digests；
5. 再运行冻结版本的 role mapping、family extractor 与 measurements，生成包含
   `H/C/S/R/J` 和 metric outputs 的 `derivedEvidenceSeal`；
6. 验证 derived seal 后才运行 gates 并保存完整 internal report；
7. Authored Candidate 返回可诊断的 gate result；sequestered benchmark 只返回
   redacted receipt；
8. 只有 `freezeQualifiedCandidate` 成功验证 candidate files、recipe、generator、
   baseline、raw/derived evidence 与 production runtime 后，才允许标记 R4。

这样 `FrozenEvaluationEvidence` 是内部的 sealed artifact，不是调用方可以伪造的
参数。Registry 返回的是已验证、不可变的 CandidateFamilyBinding resolution，
其中 profile 是唯一质量边界来源，不只是若干字符串标签。
Human-anchored 与 quarantined rebaseline 的 provenance 按 geometry、structure、
semantics、appearance facet 分别通过 discriminated input 显式传入，不能藏进
`profileDefinitionRef`，也不能假设四个 facet 总是共享同一种 baseline provenance。

### 30.2 现有 Stage 2 迁移

- 保留现有 Protocol、Harness、12-view/raw pass、native GPU evidence、
  Candidate Freeze 和 nonvisual gates；
- 把现有 object-id/category baseline 迁成显式 ReferenceClassification、
  CandidateFamilyBinding 与按 facet versioned 的 profile/baseline references；
- 禁止 URL/inline baseline 与 threshold override；这两者是最直接的 candidate
  contamination seam；
- 现有
  [`evaluation-protocol.js`](../gt_designer/single-mesh-evaluation/evaluation-protocol.js#L46)
  已声明、Harness 已渲染 `semantic-id` pass；真正缺少的是冻结的 reference role
  binding、candidate role mapping，以及消费该 pass 的 per-role/worst-part metrics，
  不应重复造一个 pass；
- `semantic-id` raster 只覆盖可见 role，不能单独证明 contact、containment、隐藏
  part 或 `H/C/S/R/J`。为此新增 versioned `FamilyEvidenceExtractor`，同时消费
  semantic render、scene/mesh inspection 与 Reference Evaluation Annotation；
- 新增 family-local `ControlFactory` 处理多 node 删除、断连、错位、重复破坏等
  controls；现有
  [`calibration-perturbations.mjs`](../tools/evaluation/calibration-perturbations.mjs#L119)
  中偏向单 geometry 的通用 perturbation 只保留 scale/pivot/rotation 等适用子集；
- family measurement/extractor plugin 可以新增，但不得改变通用 Harness 的 capture
  semantics；
- 先做只读 compatibility adapter，把八个 Stage 2 对象重新生成新 schema 报告，
  与历史 verdict 并排比较；未通过等价性审计前不替换既有 acceptance；
- qualification 前先冻结 immutable Candidate Attempt；gates 通过后再由 Node-side
  `freezeQualifiedCandidate` 生成并验证 portable freeze，不能由浏览器/UI 自报 R4；
- production `generateObject`、production recipes 与 production bundle 在本阶段
  保持不变，所有 Registry/profile/evaluator 代码仍是 development-only。

### 30.3 迁移完成条件

只有同时满足以下条件，family-aware rubric 才能接管新对象资格：

1. profile 经多 representative references、独立 Rubric Validation objects 和
   metric meta-tests，且未触碰 Pipeline Benchmark Qualification hold-out；
2. 两次 reference-only identity 与 mild/destructive bracket 可重现；
3. semantic ID evidence 真正被 metrics 消费，并由 family extractor 补齐
   `H/C/S/R/J`，而不是只验证 ID 唯一；
4. raw-evidence injection、inline/URL baseline、未授权 Instance override 与
   candidate-aware override 被 schema 和 runtime 拒绝；
5. 八个 Stage 2 历史对象的 compatibility report 没有未解释 verdict drift；
6. raw/derived evidence seal 都可验证，Authored Result 与 redacted Benchmark
   Receipt 的 disclosure boundary 有自动测试；
7. R4 必须绑定已验证的 portable Qualified Candidate Freeze；gate 通过但 freeze
   未完成时最多报告 R3/pending；
8. 系统级报告同时给出 `pass_rate`、`quality|passed`、`penalized_quality`，
   不把它们塞进单候选报告；
9. family-local controls 能对多 node 的删件、断连、错位和关系破坏产生预期 evidence；
10. hard-gate conjunction、production fitness、program/editability/code budget
   始终分开。

## 31. 如何划分物体 Family

### 31.1 结论：不存在一个唯一的 `sameFamily`

`tree`、`building`、`shop`、`car` 这样的视觉/语言类别只能作为候选
`SemanticFamily`，不能直接决定：

- 是否能共用一个 generator；
- 是否有相同的必要 part/relations；
- 是否能使用同一 correspondence；
- mild/destructive controls 是否相同；
- metric 是否能在同一 calibration population 上稳定分离；
- 是否应共享 threshold、weight 和 production budget。

因此不要把对象塞进一棵扁平 taxonomy，也不要把一个 `familyId` 同时交给
router、generator 和 evaluator。Reference 与 candidate 的记录必须拆开：

```text
ReferenceClassification =
  SemanticFamily
  × StructuralArchetype

RestorationProfile =
  compileAndCalibrate(
    SemanticFamily,
    StructuralArchetype,
    QualityProfile
  )

CandidateFamilyBinding =
  ReferenceClassificationRef
  × RepresentationFamily
  × CompatibilityContractRef
  × RestorationProfileRef
```

Authored Reference 只能获得 `ReferenceClassification`，不能预先绑定
`RepresentationFamily`；同一 reference 完全可以由 loft、superquadric 或其他
不同表示族重建。`CandidateFamilyBinding` 才描述本次 candidate 如何生成，以及
用哪个 frozen profile 验收。所有 definition/ref 必须分别命名和版本化：

- 一个 `SemanticFamily` 可以有多个 `StructuralArchetype`，也可以由多个
  `RepresentationFamily` 实现；
- 一个 `RepresentationFamily` 可以服务多个 semantic families；
- `RestorationProfile` 必须保持 generator-independent，防止为某种实现定制
  gate；
- 改变 LOD、预算、证据强度或 R-grade 不改变对象分族，但必须创建新的
  `QualityProfile` **以及引用它的新 `RestorationProfile`**，并重校准受影响项；
  旧 profile 不得继续绑定新政策。

换句话说，真正有用的是三个不同问题：**语义是否同族、结构是否同原型、程序是否
同表示族**。它们没有一个可以替代另外两个。

### 31.2 六个不可混用的概念与两种 binding

| 概念 | 回答的问题 | 主要依据 | 不负责什么 |
|---|---|---|---|
| `Domain` | 属于哪种大结构问题？ | organic branching、built form、rigid wheeled assembly、articulated assembly 等表示与算子 | 不直接决定对象身份或 threshold |
| `SemanticFamily` | 人和 ontology 认为“它是什么、能做什么”？ | required/optional functional part roles、affordance predicates、And/Or taxonomy | 不拥有 parent-child/contact/containment/symmetry/repetition/joint 关系 |
| `StructuralArchetype` | parts 是怎样组织的？ | 全部 `H/C/S/R/J` relations、cardinality、opening/negative space、有限拓扑 variants | 不决定对象功能或使用哪段 generator code |
| `RepresentationFamily` | 哪一套 bounded 程序结构能生成它？ | Object Generator kind/version、recipe schema、拓扑算子、参数语义、输出 invariants | 不决定语义上漏掉什么仍可接受 |
| `RestorationProfile` | 这类语义和结构怎样被可执行地验收？ | semantic/structural roles、correspondence、measurements、controls、calibration、frozen thresholds/baselines | 不拥有 generator 或 fitter |
| `QualityProfile` | 要验收到多严格、用什么横切政策？ | R-grade、环境/browser lanes、证据完整性、Code-only 与资源预算政策 | 不创造 family-specific roles 或为 candidate 放宽 threshold |

本文后续将早先的 `GeneratorFamily` 统一解释为
`RepresentationFamily`；这样不会与仓库中“一个 object-specific
`Object Generator`”的领域术语混淆。早先的 `FamilyRestorationProfile` 则统一
解释为 compiled `RestorationProfile`。Schema 中的 `SemanticFamily`、
`ReferenceClassification` 与 `CandidateFamilyBinding` 是 `CONTEXT.md` 领域词汇
**Semantic Object Family**、**Reference Classification** 与
**Candidate Family Binding** 的 serialized names。

例如 building 与 shop 可以共享 silhouette/depth capture、同一 built-form
`StructuralArchetype` 和部分 generator code，但 `RetailShopfront` 仍要求
entrance、display/frontage 等 semantic roles。因此两者可以共用
`RepresentationFamily`，不能因此共用完整 `RestorationProfile`。

### 31.3 Registry 组织

不要把这些轴重新伪装成一棵树。Registry 保存独立定义，再由 binding 和
compatibility contract 连接：

```text
Domain
├── SemanticFamily ── has ──> SemanticSubtype
├── StructuralArchetype ── has ──> bounded topology variant
└── RepresentationFamily ── has ──> recipe subtype/schema

SemanticFamily + StructuralArchetype + QualityProfile
  ── compile/calibrate ──> Frozen RestorationProfile

RepresentationFamily
  ── CompatibilityContract ──> SemanticFamily + StructuralArchetype

AuthoredReference
  ── ReferenceClassification ──> SemanticFamily + StructuralArchetype

CandidateAttempt
  ── CandidateFamilyBinding ──> {
       ReferenceClassificationRef,
       RepresentationFamilyRef,
       CompatibilityContractRef,
       RestorationProfileRef
     }
```

- **Domain**：共享通用结构表示、优化策略和 measurement plugin 的大范围；
- **Semantic subtype / topology variant / recipe subtype**：分别属于各自的轴，
  不能用一个含混的 `Subtype` 跨轴传播；
- **Recipe/Instance**：选择合法 variant 后的 bounded 参数、seed、appearance roles 与
  instance anchors，不得增加新 topology operator 或 object-ID branch。

`CandidateFamilyBinding` 是 candidate qualification 的单一 profile source。
Registry 解析 binding 时必须验证：Restoration Profile 内的 semantic/structural
refs 与 `ReferenceClassification` 完全相同；profile 内的 QualityProfile ref 与其
冻结 calibration 完全相同；Compatibility Contract 的两端正是该
RepresentationFamily 与该 classification。禁止调用方再并行传一个可能不一致的
`profileRef`。

任何 subtype/variant 都不是失败后的逃生口。新增 semantic 或 structural variant
必须在拟合相应 qualification candidate 前注册、补 controls，并重跑受影响的
Restoration Profile calibration；仅新增 recipe values 不改 profile。

### 31.4 一手来源对 family 的启示

[PartNet，CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/html/Mo_PartNet_A_Large-Scale_Benchmark_for_Fine-Grained_and_Hierarchical_Part-Level_3D_CVPR_2019_paper.html)
不是用一个全局 taxonomy 描述全部物体，而是为每个 object category 设计
category-specific And-Or-Graph template。`AND` node 把 part 分成共同需要的
subcomponents，`OR` node 表示 subtype；table lamp 与 ceiling lamp 可以通过 lamp
根部的 `OR` 分支共享 part concepts。其 template 原则是 well-defined、
consistent、compact、hierarchical、atomic、complete，且由专家查看同类中的广泛
变化后设计。这支持：

- `AND` 部分进入 SemanticFamily required functional roles/affordance predicates；
- `OR` 部分进入 subtype；
- leaf primitive 是 generator/measurement 的可交换原子，不等于 production
  source component；
- 一个视觉标签只有在共享 template 能覆盖其结构变化时才是有效 family。

[StructureNet](https://cs.stanford.edu/~kaichun/structurenet/) 把同一 shape family
表达成相似的 n-ary part hierarchies，并用 sibling adjacency、symmetry 等横向关系
同时覆盖 continuous geometry variation 与 discrete structural variation。这支持把
`H/C/S/R/J` template 单独登记为 `StructuralArchetype`，而不是用 global
appearance 判同族。

[ShapeAssembly](https://arxiv.org/abs/2009.08026) 的一个 program structure 通过
continuous free variables 表达一族相关形状，但论文同时指出单一 procedural model
覆盖的结构变化有限，例如很难用一个程序表示所有 car types；其程序本身没有
structural variability，结构变化由生成模型写出不同程序。这是区分
`SemanticFamily` 与更窄 `RepresentationFamily` 的直接证据。

[ShapeCoder](https://arxiv.org/abs/2305.05661) 从一个 shape dataset 中发现重复的
structural/parametric abstractions，用更紧凑程序和更少自由度解释同分布 held-out
shapes。它适合**提议**哪些对象可能共享 representation abstraction；compression
收益本身不证明它们共享 semantic/structural hard gates 或 Restoration Profile。

[CGA Shape / Procedural Modeling of Buildings](https://doi.org/10.1145/1179352.1141931)
用 context-sensitive shape rules 从 mass model 逐步生成与体块一致的 facade
detail。因而 built-form `RepresentationFamily` 应由 grammar productions、context
constraints 和合法 terminal roles 定义，而不是由“看起来都是房子”定义。

[Infinigen Indoors，CVPR 2024](https://openaccess.thecvf.com/content/CVPR2024/papers/Raistrick_Infinigen_Indoors_Photorealistic_Indoor_Scenes_using_Procedural_Generation_CVPR_2024_paper.pdf)
在 Appliances、Windows/Doors/Staircases、Furniture、Decorations、Small Objects
等 broad categories 下放置多个 randomized procedural generators。这说明 broad
semantic category 与具体 factory/generator 不是同一粒度。其官方
[`AssetFactory`](https://github.com/princeton-vl/infinigen/blob/main/src/infinigen/core/placement/factory.py)
定义通用 factory 生命周期，而
[Static Assets 文档](https://infinigen.cs.princeton.edu/docs/latest/StaticAssets.html)
把 `StaticShelfFactory` 另行映射为 `Semantics.Storage`，直接证明 factory class
与 semantic identity 应分开。
[3DCodeBench](https://www.3dcodebench.com/) 又把 Infinigen factories 迁移为
212 个 procedural object classes，并为每类生成 60 seeds。`factory × seed`
适合构造数据，但“同一 factory 的 60 seeds”只证明该 generator 的 variation，
不自动证明 212 classes 应共享一个 restoration profile。

树也给出反例：[Self-organizing Tree Models](https://algorithmicbotany.org/papers/selforg.sig2009.html)
用一套自组织过程生成多种 trees/shrubs；
[Parametrization of biological assumptions to simulate tree branching architectures](https://pubmed.ncbi.nlm.nih.gov/38696364/)
通过少量共同 biological parameters 得到 spruce、pine、oak、poplar 的不同
branching shapes。同一 generator 可以跨多个生物/视觉 subtype，是否共享
Restoration Profile 仍取决于 trunk/branch/organ ontology 与对应方式。

### 31.5 `FamilySignature`

每个 binding 必须有机器可比较、human-reviewable 的 signature；不要再用一个
`category` string 隐含所有判断：

```json
{
  "schemaVersion": "candidate-family-binding-signature-v1",
  "referenceClassification": {
    "ref": "reference-classification-sha256",
    "domainRef": "built-form-v1",
    "semanticFamily": {
      "ref": "retail-shopfront-v1",
      "ontologyDigest": "sha256",
      "requiredAndRoles": ["mass", "wall", "entrance", "display-window"],
      "allowedOrSubtypes": ["single-bay", "multi-bay", "corner-shop"],
      "optionalRoleGroups": ["awning", "sign", "counter"]
    },
    "structuralArchetype": {
      "ref": "split-repeat-facade-massing-v1",
      "hcsrjTemplateDigest": "sha256",
      "topologyVariants": ["single-bay", "multi-bay", "corner"],
      "cardinalityBoundsDigest": "sha256"
    }
  },
  "candidateFamilyBinding": {
    "ref": "candidate-family-binding-sha256",
    "referenceClassificationRef": "reference-classification-sha256",
    "representationFamily": {
      "ref": "bounded-built-form-assembly-v2",
      "generatorKind": "bounded-built-form-assembly-v2",
      "recipeSchemaDigest": "sha256",
      "topologyOperators": ["extrude-mass", "split-floor", "repeat-bay", "insert-opening"],
      "parameterBoundsDigest": "sha256",
      "outputInvariantDigest": "sha256"
    },
    "compatibilityContractRef": "shopfront-v1--built-form-assembly-v2",
    "restorationProfileRef": "shopfront-exact-ish-v1"
  },
  "resolvedRestorationProfile": {
    "ref": "shopfront-exact-ish-v1",
    "semanticFamilyRef": "retail-shopfront-v1",
    "structuralArchetypeRef": "split-repeat-facade-massing-v1",
    "qualityProfileRef": "code-only-production-exact-ish-v1",
    "digest": "sha256"
  }
}
```

Signature 可以列出 semantic/structural facts，但 thresholds、baseline、weights 与
candidate exception 只能通过 immutable references/digests 解析。resolved block
只是 Registry 的已验证回执；调用方不能单独提供它。`semanticFamily.ref`、
`structuralArchetype.ref`、`representationFamily.ref` 与
`restorationProfileRef` 不能互相代替。

### 31.6 三种 compatibility 必须分别判断

不存在一个加权 `sameFamilyScore`。三个 hard predicates 分别回答三个问题：

```text
sameSemanticFamily(a, b) =
  oneExpertReviewedAndOrOntologyCovers(a, b)
  AND requiredFunctionalRolesCompatible(a, b)
  AND affordancePredicatesCompatible(a, b)
  AND differencesAreFiniteDeclaredOrBranches(a, b)

sameStructuralArchetype(a, b) =
  hierarchyContactContainmentCompatible(a, b)
  AND symmetryRepetitionJointCompatible(a, b)
  AND negativeSpaceCompatible(a, b)
  AND topologyVariantDeclared(a, b)
  AND cardinalitiesRemainBounded(a, b)

sameRepresentationFamily(a, b) =
  oneFrozenGeneratorAndRecipeSchemaCovers(a, b)
  AND noGeneratorSourceOrSchemaChange(a, b)
  AND parameterAndOperatorClosureHolds(a, b)
  AND syntheticRecoveryAndOutputInvariantsPass(a, b)
  AND boundedWithoutObjectIdBranches(a, b)
```

是否可以共用 `RestorationProfile` 再单独检查：

```text
sameRestorationProfile(a, b) =
  semanticAndStructuralGateSemanticsCompatible(a, b)
  AND correspondenceModesCompatible(a, b)
  AND metricApplicabilityCompatible(a, b)
  AND commonControlsRemainSeparating(a, b)
  AND pooledOrHeldOutCalibrationRemainsValid(a, b)
```

这意味着：

1. 两棵树可以是同一个 `SemanticFamily`，却因 branching topology 不同分成两个
   `StructuralArchetype` 和两个 `RepresentationFamily`；
2. shop 与 house 可以共享 `StructuralArchetype/RepresentationFamily`，但由于
   class-defining roles 不同而使用不同 semantic specialization 和
   `RestorationProfile`；
3. 同一 passenger car reference 可以由 loft 或 superquadric 两个
   `RepresentationFamily` 重建，评价边界仍相同；
4. 外观相似、CLIP/mesh embedding 接近、共享材质、primitive 或 helper 都不是
   任何 hard predicate 的替代品。

### 31.7 Admission flow

```text
new reference
  → assign Domain
  → annotate required/optional semantic roles and And/Or path
  → extract H/C/S/R/J, cardinalities and correspondence needs
  → human-review and freeze ReferenceClassification
  → resolve an existing compatible RestorationProfile
      or compile + reference-only calibrate a new profile before candidate fitting
  → rank RepresentationFamily candidates
  → run representation + compatibility-contract hard checks
  → fit existing generator without source/schema changes
      ├─ all compatible → new recipe + CandidateFamilyBinding
      ├─ finite structural variation → proposed versioned topology variant
      ├─ same structure, different identity roles → semantic specialization
      ├─ same semantics, incompatible program closure → new RepresentationFamily
      └─ H/C/S/R/J representation inapplicable → new Domain
  → run semantic/structural destructive controls and synthetic recovery
  → human accepts CandidateFamilyBinding or returns needs-human-authoring
  → qualify candidate only against the already frozen RestorationProfile
```

任何分支若改变 SemanticFamily、StructuralArchetype 或 QualityProfile，必须丢弃
尚未资格化的 binding，回到 ReferenceClassification/profile freeze 步骤；不得用
已经看到的 candidate 参与新 threshold 选择。

Admission 决策表：

| 观测 | 决策 |
|---|---|
| 只改 continuous parameters、seed、palette、declared pattern | 新 recipe |
| roster/count 的变化已是冻结 structural variant / recipe branch | 现有 `StructuralArchetype` 与 `RepresentationFamily`，新 recipe |
| 可加入一个 finite bounded `OR`，required roles 不变 | 新 structural/recipe variant 版本；重跑受影响 profile calibration |
| required functional role 或 affordance predicate 改变 | 新 `SemanticFamily` specialization；编译新 RestorationProfile |
| parent-child/contact/containment/symmetry/repetition/joint 改变 | 新 `StructuralArchetype`；编译新 RestorationProfile |
| semantic roles 相同，但需要新 topology operator/ABI | 新 `RepresentationFamily`；必要时新 `StructuralArchetype` |
| generator 可复用，但 functional roles、H/C/S/R/J 或 destructive controls 不同 | 共用 `RepresentationFamily`；拆相应 semantic/structural/profile binding |
| 只有 capture noise、硬件 envelope、R-grade 或预算政策改变 | 新 QualityProfile **和新 RestorationProfile**；不拆对象族 |
| `H/C/S/R/J` 表示本身不适用 | 新 Domain |
| 只发现共享 primitive/helper | 抽 Runtime Kernel/library helper，不合并任何 family |

### 31.8 三实例 leverage criterion

“写出一个对象”和“证明 `RepresentationFamily` 可复用”不是同一完成度。最小
promotion gate 使用三个结构上不同、但都在声明覆盖范围内的实例：

1. `A/B` 用于提出 generator abstraction、recipe schema 与 compatibility contracts；
2. 在看 `C` 的拟合结果前冻结 core operators、parameter schema、output invariants 与
   topology variant roster；
3. `C` 至少与 `A/B` 中一件在 topology/roster 上不同，不能只是换颜色、尺度或 seed；
4. `C` 只能新增 recipe，并选择已声明 variant；若必须改 generator core/schema、
   新增 topology operator 或 object-ID branch，则本次 leverage check 失败；
5. 最终用冻结 core 重新生成 `A/B/C`，三者各自通过预先绑定且
   generator-independent 的 Restoration Profile，destructive controls 仍全部拒绝。

同时报告：

```text
L3_code =
  sum(three standalone implementation costs)
  / (shared representation core cost + sum(three recipe costs))

L3_workflow =
  sum(three standalone authoring/evaluation costs)
  / (representation setup cost + sum(three incremental instance costs))
```

成本口径在实验前冻结，可用 AST/source units 与 human time/evaluator calls，但受
Program Quality 禁止隐藏数据的约束。promotion 的最低要求是 `L3_code > 1`，
并且 `L3_workflow > 1`；同时不能牺牲 fidelity、放宽 gate 或把成本转移到未报告的
人工步骤。

三实例只是**表示复用性的最低证据**，既不能自动证明一个宽 SemanticFamily，也不是
Restoration Profile 校准的充分样本。正式 profile
仍需第 24 节的多个 representative references、held-out objects 或
leave-one-object-out validation。若只有一个对象，登记为
`provisional representation/instance adapter`，不能宣称 registered
`RepresentationFamily`。

### 31.9 Split 与 Merge triggers

| 轴 | Split trigger | Merge 所需证据 |
|---|---|---|
| `SemanticFamily` | required functional roles、And/Or identity、affordance 或 semantic destructive controls 冲突；大量成员依赖 exception 才能通过 | ontology 与 hard identity 可无损对齐，差异能作为 finite declared semantic subtype，并通过跨 subtype annotation review |
| `StructuralArchetype` | 新的 parent/child、contact、containment、symmetry、repetition、joint 类型或 cardinality 无法进入现有 bounded variants | 一套 `H/C/S/R/J` template 与 cardinality bounds 覆盖双方，held-out topology 不系统失败 |
| `RepresentationFamily` | 第二/第三实例需改 generator source/schema、增加互斥 operator、引入不同算法，或参数表退化成 operation soup | 同一冻结 generator/schema 对至少三个代表实例只改 recipe 即成功；总 program/library complexity 下降 |
| `RestorationProfile` | required gates、correspondence、metric applicability、control semantics、calibration cohort 或 baseline provenance 分叉 | semantic/structural inputs 与 QualityProfile 相同，pooled/held-out calibration、meta-tests 和 worst-subgroup 都成立 |
| `QualityProfile` | R-grade、环境 lanes、证据强度、Code-only/budget policy 不同 | 横切政策完全相同；任何新版本都派生新 RestorationProfile 并重校准受影响项，绝不能为了挽救 candidate 新建较宽松版本 |
| helper/library | 只发现共享 primitive、lathe、sweep、radial 或 facade split helper | 抽取 Runtime Kernel/helper；这本身不触发任何 family merge |

通用预警是：每加一个实例都出现 object-ID conditional/source table、第三个实例
不能 recipe-only 接入，或 failures 明显按 subtype 聚类。embedding cluster 只能
提议人工审查，不能触发 merge。

Merge 必须创建新版本，做 reference-only recalibration，并保留旧 profile 的历史
verdict。可借用 [ShapeCoder](https://rkjones4.github.io/shapecoder.html) 的思路比较
`shared library/generator complexity + Σ recipe complexity`，但压缩收益只有在所有
语义、结构、质量 hard contracts 不退化时才算证据。更常见的正确结果是“共享
`RepresentationFamily`/helper，但保留不同 `SemanticFamily/RestorationProfile`”。

### 31.10 四类对象的具体划分

| Domain | SemanticFamily | StructuralArchetype | 候选 RepresentationFamily | 划界依据 |
|---|---|---|---|---|
| `organic-branching` | `plant.tree` / broadleaf subtype | `hierarchical-branching-crown` | `bounded-woody-branching-v1` | trunk→major branch→crown 连续；branch depth/cardinality 有界；叶片按 distribution 对应 |
| `organic-branching` | `plant.tree` / conifer subtype | `primary-axis-whorled-tiers` | 先用独立 `bounded-whorl-conifer-v1`；有 recipe-only 证据后再考虑与 broadleaf 合并 | tier/whorl、apical dominance 和 crown correspondence 与 broadleaf 不同 |
| `axial-organic` | `plant.tree` / palm subtype | `single-stem-apical-frond` | `bounded-stem-frond-v1` | 即使复用 skeleton helper，H/R、frond role 与 destructive controls 也不同 |
| `built-form` | `built-form.small-building` | `massing-floor-bay-roof` | `massing-roof-facade-grammar-v1` | gabled/flat roof 可作 finite variant；curved shell、桥梁或无 floor/bay grammar 的对象另族 |
| `built-form` | `retail.shopfront`，语义上特化 building | `massing-split-repeat-facade` | 可复用 building massing core，加 `shopfront-facade-v1` module | generator 可共用；entrance/display/frontage 是独立 semantic/profile hard roles |
| `rigid-wheeled-assembly` | `road-vehicle.passenger-car` | `bilateral-two-axle-four-wheel` | `body-cabin-axle-v1` | sedan/hatchback/van 只有在同 schema 的 finite body variants 内才同表示族；motorcycle/tracked vehicle 另原型 |

具体例子：

- 三棵外观差异很大的 broadleaf trees 若共享 trunk→major branch→crown hierarchy、
  同一 bounded grower 和 distribution leaf correspondence，可以是同一个
  `RepresentationFamily` 的 recipes；一棵 palm 即使复用同一个 tree engine，也更
  可能使用不同 `StructuralArchetype` 与 RestorationProfile。
- house 与 small shop 可以共享 massing/roof/floor/bay helpers；shop 的 storefront
  profile 单独存在。一个“楼下商铺+楼上住宅”的 compound object 使用
  `building massing + shopfront module` composition，而不是把 shop hard gates
  稀释成 optional。
- sedan 与 toy van 若 wheel/axle/body/cabin invariants 相同，可作为
  `bilateral-two-axle-four-wheel` 下的 finite variants；自行车只因都有轮子而合并，
  会让 required role、contact、symmetry 和 joint 规则失真。

### 31.11 Stage 2 八对象的 provisional 落位

依据冻结的
[`stage-1-5-layout.js`](../gt_designer/src/reconstruction/stage-1-5-layout.js)
与 [`object-registry.js`](../gt_designer/src/reconstruction/objects/object-registry.js)，
在没有改历史 verdict、也没有为新 family 定 threshold 前，现有八对象只做
provisional mapping：

| Stage 2 对象 | 暂定 SemanticFamily / functional roles | 暂定 StructuralArchetype | 当前 RepresentationFamily `kind` | 状态 |
|---|---|---|---|---|
| stone-path | `PathSurfaceSegment`：path/walkable-surface role | `grounded-shallow-bounded-footprint` | `shallow-footprint-extrusion-v1` | `legacy.stage2.stone-path` provisional |
| stone | `LithicObject`：single rock-body role | `grounded-closed-support-plane-solid` | `bounded-support-polyhedron-v2` | `legacy.stage2.stone` provisional |
| vase | `OpenHollowVessel`：body、mouth、rim、cavity、base roles | `axial-hollow-lathed-profile` | `hollow-lathed-profile-v1` | `legacy.stage2.vase` provisional |
| umbrella | `Parasol`：canopy、shaft、ribs、runner/grip roles | `radial-canopy-shaft-rib-assembly` | `radial-parasol-assembly-v1` | `legacy.stage2.umbrella` provisional |
| bamboo-shoot | `PlantShoot`：core、sheath、crown organ roles | `grounded-tapered-axis-ordered-layer-families` | `tapered-core-axial-layer-families-v1` | `legacy.stage2.bamboo-shoot` provisional |
| mushroom | `MushroomCluster`：member、cap、stem roles | `grounded-bounded-repeated-cap-stem-pairs` | `curved-stem-bell-cap-cluster-v1` | `legacy.stage2.mushroom` provisional |
| blue-hat | `BrimmedHat`：crown、brim、panel、motif roles | `closed-contacting-crown-brim-panel-shell` | `closed-double-profile-panel-hat-v1` | `legacy.stage2.blue-hat` provisional |
| candle | `PedestalCandleFixture`：pedestal、tray、wax、wick roles | `compound-axial-support-containment-chain` | `profiled-pedestal-wax-wick-v1` | `legacy.stage2.candle` provisional |

这张表只是 registry migration hypothesis，不是新 baseline。特别是：

- stone-path 与 stone 是最适合验证“shared helper 不等于 shared profile”的一对；
- bamboo-shoot 与 mushroom 都是 organic semantic，但 hierarchy、correspondence
  和 generator closure 不同；
- vase、candle 可测试共享 axial/revolved helper 是否只停留在 library 层；
- umbrella、blue-hat 即使共享 radial/panel helper，也不共享 semantic identity；
- 八个 `kind` 目前都只有 object-specific generator 与单 reference 证据，因此仍是
  八个 provisional `RepresentationFamily`；现有 synthetic variants 不能替代真实
  第三实例的 promotion gate。

### 31.12 ML embedding clustering 的边界

render、mesh、point-cloud、part-graph 或 code embedding 可以：

- 为新 reference 提议 nearest registered semantic、structural 或 representation
  definitions；
- 发现 profile 内 outlier 或潜在 split；
- 找到跨 semantic family 的 shared representation abstractions；
- 选择需要专家标注的 active-learning samples。

它不能直接写任何 family/profile ref、合并 profile 或设 threshold。原因是
embedding：

- 未必编码 required small parts、contact、function 或 negative space；
- 对模型版本、视图、材质和训练类别敏感；
- 容易把“外观近但 generator/ontology 不兼容”和“外观远但共享 grammar”判反；
- 无法证明 mild/destructive separation 与 production boundedness。

所有 cluster proposal 必须记录 embedding model/version、input digest、nearest
neighbors 与置信度，然后分别通过第 31.6 节三个 hard predicates、三实例
leverage 和 reference-only calibration。候选 qualification 失败后重聚类，不得
用于放宽本轮 profile；只能产生一个新版本的独立 admission 提案。

### 31.13 实际分族时的六问

每来一个新物体，按以下顺序逐项回答；任何“不兼容”都拆相应轴，不做视觉
similarity 加权投票：

1. **Required functional roles 与 affordance predicates 相同吗？** 不同则拆
   `SemanticFamily` 或建立明确 semantic specialization。
2. **`H/C/S/R/J` template、negative space 与 cardinality bounds 相同吗？**
   不同则拆 `StructuralArchetype`。
3. **差异是已声明、有限的 `OR` variant 吗？** 是则保留原型、选择 variant；
   不是则新增原型，而不是把所有 part 都变成 optional。
4. **同一个冻结 generator kind/version 与 recipe schema 能覆盖吗？** 若需要改
   generator source/schema 或新增 object-ID branch，就拆 `RepresentationFamily`。
5. **同一 correspondence、destructive controls 和 metric applicability 仍成立吗？**
   不成立就编译新的 `RestorationProfile`，即使 generator 可复用。
6. **差异只在 R-grade、环境、证据强度、LOD 或预算吗？** 不新建对象 family；
   创建新 `QualityProfile`，同时编译并重校准一个引用它的新
   `RestorationProfile`。

最终的最短判定表是：

```text
只改值/seed/material/scale                    → Recipe / Instance
有限且预声明的 roster/topology 分支            → Variant / Subtype
新增必需功能角色                               → SemanticFamily
改变 H/C/S/R/J 或 bounded topology             → StructuralArchetype
改变生成算法、operator closure 或 recipe schema → RepresentationFamily
改变验收语义、correspondence 或 controls        → RestorationProfile
只改变严格度、环境、证据或预算                  → QualityProfile + 新 RestorationProfile
只复用几何 helper                              → Runtime Kernel / library
```
