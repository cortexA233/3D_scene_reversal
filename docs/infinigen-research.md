# Infinigen 调研：定位、架构、工程边界与对 `3d_scene_reversal` 的启示

> 调研日期：2026-07-28  
> 来源范围：Princeton/Infinigen 官方站点与文档、官方 GitHub 源码/发布记录、原始 arXiv/CVPR 论文。  
> 许可证部分仅供工程筛选，不构成法律意见。

## 摘要

Infinigen 不是“从现有图片或 GLB 反推程序”的逆向工具，也不是可嵌入浏览器的实时世界引擎。它是 Princeton Vision & Learning Lab 基于 Blender/Python 构建的**离线、全程序化 3D 资产与场景生成器**，主要服务计算机视觉合成数据和机器人仿真。2023 年的 Nature 系统覆盖地形、植物、动物、天气和流体；2024 年的 Indoors 增加室内资产、约束语言与布局求解；2025 年的 Articulated/Sim 增加可关节化、带物理参数的仿真资产。[原始 Nature 论文](https://openaccess.thecvf.com/content/CVPR2023/html/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.html)把它的核心区别概括为：形状、材质、微观几何和场景组合都由随机化数学规则从零生成，而不是从有限资产库中抽样。

截至 2026-07-28，项目正处在明显的版本过渡期：官方已发布基于 ProcFunc 重写的 [`v2.0.0a1`](https://github.com/princeton-vl/infinigen/releases/tag/v2.0.0a1)，但文档明确称其为 **preview/alpha**，只含新室内材质、有限室内对象和简单房间布局，尚未达到 V1 Nature/Indoors 的覆盖面，接口在 2.0 正式版前也可能变化。[V2 官方文档](https://infinigen.cs.princeton.edu/docs/latest/)因此把 V1 与 V2 并列保留。需要自然场景、完整 ground truth 或 Sim 能力时，目前仍应以 V1 路线为准；想研究更清晰、更可组合的生成器 API 时，才优先看 V2/ProcFunc。

对本仓库而言，Infinigen 的价值主要是**架构参考，而非代码依赖**：应借鉴“显式 seed → 语义 generator → 布局/约束 → 分阶段细化 → 多通道 ground truth”的分层方式，把现有 69 MB 主 GLB 和 heightfield 逐步压缩为 TypeScript recipe、参数化 mesh、实例化生态和 shader；不应把 Blender/Python/Cycles 搬进最终 Web runtime，也不应期待 Infinigen 自动反编译当前岛村。

## 1. 定位、历史与当前状态

| 时间 | 官方项目/版本 | 新增能力 | 2026-07-28 的判断 |
|---|---|---|---|
| 2023 | [Infinigen Nature，CVPR 2023](https://openaccess.thecvf.com/content/CVPR2023/html/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.html) | 全程序化自然世界；地形、材质、岩石、植物、树、动物、天气、流体、scatter、相机与视觉标注 | V1 自然场景的基础；覆盖广，但离线成本高 |
| 2024 | [Infinigen Indoors，CVPR 2024](https://openaccess.thecvf.com/content/CVPR2024/html/Raistrick_Infinigen_Indoors_Photorealistic_Indoor_Scenes_using_Procedural_Generation_CVPR_2024_paper.html) / `v1.4` | 79 个室内对象生成器、30 个材质生成器；约束 DSL、模拟退火布局求解、室内导出 | 室内布局/支持关系的主要参考实现 |
| 2025 | [`v1.15` Infinigen-Sim](https://github.com/princeton-vl/infinigen/releases/tag/v1.15.0)，后续称 [Infinigen-Articulated](https://arxiv.org/abs/2505.10755) | 关节、碰撞、物理属性，导出 URDF/MJCF/USD；`v1.19` 扩为 18 个对象类别并发布 20k+ 资产 | 面向机器人资产域随机化，不是通用自然世界 runtime |
| 2026-04 | [ProcFunc](https://arxiv.org/abs/2604.26943) | 497 个显式、原子化 Python 图形函数；标准化 generator 接口；显式 RNG；程序 trace 与组合式材质 | 是 V2 的抽象层，也最值得本仓库借鉴 API 设计 |
| 2026-07 | [Infinigen `v2.0.0a1`](https://github.com/princeton-vl/infinigen/releases/tag/v2.0.0a1) | 基于 ProcFunc 从上到下重写；新 Python API/CLI、60 个新材质、新布局与 GT API | **alpha，不与 V1 功能等价**；版本应锁定，暂不宜成为生产依赖 |

项目的 [`main` README](https://github.com/princeton-vl/infinigen)同时把 V2、Articulated、Indoors 和 Nature 都列作入口，这容易让人误以为它们是同一成熟度的统一产品。实际边界是：

- **V1 Nature** 是高覆盖自然场景管线；V1 Indoors 和 Articulated/Sim 在同一代码库上扩展。
- **V2** 是新包 `infinigen2`，是顶层 API 与实现的重构；当前 `terrain` 和 `sim` 仍在 [`pyproject.toml`](https://github.com/princeton-vl/infinigen/blob/main/pyproject.toml) 中标为 V1 feature/extra。
- GitHub 把 `v2.0.0a1` 显示为 latest release，但版本号、安装要求和官方文档都明确它仍是 alpha；不能用“latest”推导“feature complete”或“production stable”。

## 2. V1 的系统架构与生成流水线

### 2.1 三层模型

V1 可以理解为三层：

1. **资产/材质生成器**：每个 probabilistic program 负责一个语义类别，暴露山体高度、花瓣密度、树枝形态等高层参数，并在内部继续采样低层随机量。原始论文统计了 182 个 generator、约 1,070 个可解释自由度；这只是外部参数下界，不包括地形模拟等内部自由度。[论文方法与表 2](https://openaccess.thecvf.com/content/CVPR2023/papers/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.pdf)
2. **世界组合与放置**：地形决定可见区域和支持面，scatter 按密度/生态条件放置对象，相机选点也参与决定需要生成的细节；V1 Indoors 则把支持关系、对称、距离、数量、无碰撞和可达空间表达为约束图。
3. **渲染与数据生成**：生成 `.blend` 场景，应用材质/几何 displacement，再用 Cycles 或其他渲染路径输出 RGB，并从几何与渲染元数据提取标注。

这不是单个“world generator”函数，而是大量语义子系统的组合。官方源码也按 [`assets`](https://github.com/princeton-vl/infinigen/tree/main/src/infinigen/assets)、[`terrain`](https://github.com/princeton-vl/infinigen/tree/main/src/infinigen/terrain)、[`core/placement`](https://github.com/princeton-vl/infinigen/tree/main/src/infinigen/core/placement)、[`datagen`](https://github.com/princeton-vl/infinigen/tree/main/src/infinigen/datagen) 和 [`tools`](https://github.com/princeton-vl/infinigen/tree/main/src/infinigen/tools) 分层。

### 2.2 自然场景如何生成

- 地形由 fractal-noise SDF、侵蚀/雪等模拟组合，再以 marching cubes 生成 mesh；terrain 系统既有 CPU 也有 Linux/CUDA 后端。[Nature 论文第 3 节](https://openaccess.thecvf.com/content/CVPR2023/papers/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.pdf)
- 树使用随机游走和 space colonization；珊瑚使用 differential/laplacian growth 与 reaction-diffusion；花、叶、海草等大量使用 Geometry Nodes。
- 生物由 genome tree、部件 generator、组装、材质、rig/pose 组成；这使“语义结构”在最终 mesh 之前就存在。
- 材质 generator 同时产生 shader 外观与对应的局部微几何。原始系统刻意少用 bump/normal illusion，因为它要让 depth/normal 等几何 GT 与图像细节一致。
- 密集植被采用少量原型加随机 transform 的 instancing；相机距离驱动动态分辨率，目标是渲染时每个 face 小于约 1 px。即便如此，原始论文场景平均仍约 1,600 万 polygon。

### 2.3 作业阶段

V1 的 [Hello World](https://github.com/princeton-vl/infinigen/blob/main/docs/source/HelloWorld.md)把单场景拆为：

1. `coarse`：场景布局、地形、相机和大尺度组成；
2. `populate` / `fine_terrain`：只为当前场景与视点生成必要资产和细节；
3. `render`：输出 RGB；
4. 以 flat/GT render 或 OpenGL annotator 再输出准确标注。

`manage_jobs` 再把这些任务调度为本地或集群作业。这种阶段化很重要：失败可重试、粗布局可复用、视觉渲染和精确标注可采用不同 backend，也避免每次调参都重新生成所有细节。

## 3. Indoors 与 Articulated/Sim

### 3.1 Indoors 的约束式组合

[Infinigen Indoors](https://openaccess.thecvf.com/content/CVPR2024/papers/Raistrick_Infinigen_Indoors_Photorealistic_Indoor_Scenes_using_Procedural_Generation_CVPR_2024_paper.pdf)增加两类关键抽象：

- **Constraint Specification API**：用 Python DSL 组合 minimum distance、对称、角度对齐、free space、accessibility、面积/体积、数量和语义过滤等项；约束可以是硬条件或 soft score。
- **分层 solver**：先求 whole-house floorplan，再按 large → medium → small objects 求布局；使用 simulated annealing 与 Metropolis-Hastings，在 addition、deletion、resample、relation change、translate、rotate 等离散/连续 move 间搜索。

对象的可移动自由度由关系决定，例如“书架靠墙且落地”会把移动限制到墙地交线。支持面关系还能让小物自然落到桌、架子或台面上。对本项目而言，这比室内物件本身更有价值：道路、桥、建筑、树、石、灯笼之间也应共享 support/clearance/occupancy 约束，而不是各自随机采样。

### 3.2 Articulated/Sim 的范围

[Infinigen-Articulated 论文](https://arxiv.org/abs/2505.10755)提供 18 类常见关节对象和自定义 joint 工具，并把 geometry、joint metadata、密度、摩擦、刚度等物理参数一起域随机化。官方 [Sim 导出文档](https://github.com/princeton-vl/infinigen/blob/main/docs/source/ExportingToSimulators.md)支持：

- 单资产导出 MJCF、URDF、USD；
- whole indoor scene 导出到 Isaac Sim；
- 使用 `solve_state.json` 恢复对象关系/物理属性。

边界也很明确：whole-scene exporter 不保留 articulation；官方只测试了 indoor scene + Isaac Sim，没有宣称 Nature 或其他 simulator 的整场景兼容性。早期 release 使用 **Infinigen-Sim** 名称，论文/当前 README 使用 **Infinigen-Articulated**；二者是同一生态的演进，不应误当成两个独立通用模拟器。

## 4. V2 / ProcFunc：为什么重写、现在能做什么

V1 的 Blender wrapper 仍依赖 GUI 导向的全局 context、动态 socket 名称和隐式状态，generator 参数也不标准化，模块组合容易因前序状态静默失败。[ProcFunc 论文](https://arxiv.org/abs/2604.26943)把这些问题作为 V2 重写动机。

ProcFunc/V2 的关键设计是：

- 497 个原子 Python primitive，把对象/context 依赖变成显式参数与返回值，并提供类型标注、运行时断言和数据类型推断；
- Mask、Material、Object、Scene 等 generator 采用标准接口；材质固定返回 surface、displacement、volume 等语义结果；
- deterministic generator 与 random sampler 分离，所有随机 sampler 必须显式接收 `np.random.Generator`，使 seed 与依赖关系可追踪；
- generator 可以组合成语义模块，例如 base material + brick/tile/plank shape + cracks/scratches/edge wear；
- tracer 能生成 instance-level 或 distribution-level compute graph，用于查看某个 seed 实际经过的分支，或分析整个数据分布中的参数/分支；
- V2 还封装 monocular/stereo/circular camera、RRT* 无碰撞轨迹、Cycles/EEVEE render 与 GT 输出。[V2 API 入口](https://infinigen.cs.princeton.edu/docs/latest/api/infinigen2.html)

但 [V2 首页](https://infinigen.cs.princeton.edu/docs/latest/)明确写明当前只有高质量室内材质、有限室内对象和简单房间 arrangement。它目前不是 Nature 的现代化等价替代品。工程上应：

- 把 V2 当作 API 设计参考或小规模室内实验工具；
- 把 V1 当作完整自然场景/GT/Sim 的现行实现；
- 若真要依赖 V2，固定 `infinigen==2.0.0a1`，因为官方提示 alpha 接口会继续变化。

## 5. 输出、数据与 Ground Truth

[官方 GT 规范](https://github.com/princeton-vl/infinigen/blob/main/docs/source/GroundTruthAnnotations.md)覆盖：

| 类别 | 主要输出 |
|---|---|
| 视觉 | RGB、albedo、lighting/specular 等 render pass；Cycles 为主，V2 也封装 EEVEE |
| 几何 | depth、camera-space surface normal、occlusion boundary、场景 mesh/PLY |
| 运动 | 2D optical flow、3D depth change、forward/backward flow、flow occlusion、跨帧 point trajectory/occlusion |
| 相机/惯导 | 3×3 intrinsics、4×4 camera-to-world pose、TUM trajectory、角速度和线加速度 IMU |
| 语义 | object、instance、tag/semantic segmentation；材质 segmentation；对象层级与材质 metadata |
| 检测/3D | 2D/3D bounding box 所需的 object bounds 与 instance model matrices |

有两套 GT 路径：Blender built-in pass 安装简单、可无 GPU运行；额外的 C++/OpenGL annotator 提供 sub-object/tag、occlusion boundary、3D flow 和更方便的 3D bbox。后者准确地从 mesh 提取，并可在标注时排除水、云等视觉对象，但安装更复杂。

输出形态包括 `.blend`、渲染帧/NumPy 标注，以及烘焙后的 OBJ/FBX/STL/PLY/USDC。[官方 exporter 文档](https://github.com/princeton-vl/infinigen/blob/main/docs/source/ExportingToExternalFileFormats.md)强调：完整场景只正式支持 USDC；OBJ/FBX 等会把 instance realize，可能造成灾难性的体积和内存开销。材质烘焙只覆盖 albedo、roughness、normal、metallicity 等常见通道，透明、clearcoat、sheen、transmission、动画与复杂程序材质可能丢失或错误。

官方还提供 [pre-generated data](https://github.com/princeton-vl/infinigen/blob/main/docs/source/PreGeneratedData.md)，但全通道标注约可达 **30 GB/scene**，应按任务选择通道，而不是全量下载。

## 6. 安装、依赖、硬件与性能

### 6.1 当前安装模型

[官方安装矩阵](https://github.com/princeton-vl/infinigen/blob/main/docs/source/Installation.md)区分：

- Python module：headless，`bpy` 作为依赖；适合生成和数据流水线；
- Blender internal Python：可在 Blender UI 中交互开发 generator；
- Docker：Linux 路线可选 CUDA、GPU passthrough 和 OpenGL GT；
- V2 PyPI：Python `3.11.x`、`bpy==4.2.0`、`procfunc>=0.34,<0.35`，以 `uv pip install "infinigen==2.0.0a1"` 安装；
- V1 Nature/Indoors：仍需额外 `infinigen1`、terrain/native build、git submodule；OpenGL GT 还要单独编译 C++ annotator。

平台支持不是对称的：minimal object/material 在 Linux/macOS 支持最好，原生 Windows 仍是 experimental；terrain CPU 支持 Linux/macOS，terrain CUDA 仅正式支持 Linux，OpenGL annotations 在 Linux/macOS 支持，fluid 在 macOS 仍标 experimental。

### 6.2 性能数字应如何解释

- 当前 [Hello World](https://github.com/princeton-vl/infinigen/blob/main/docs/source/HelloWorld.md)称简单演示在 M1 Mac 或 Linux desktop 上约 **10 分钟、16 GB RAM**。
- 2023 Nature 论文的完整基准是在双 Xeon Silver 4114 + 单 NVIDIA GPU 上生成一对 1080p stereo：平均 wall time **3.5 小时**；场景平均约 **1,600 万 polygon**。这是高质量、10,000 samples/pixel 的论文配置，不是最小 demo SLA。
- 2024 Indoors 论文中，约 29 个对象、5k solver steps 的完整布局求解平均约 **2,281 秒**；优化缓存相对未优化版本约提速 3×。
- 2026 ProcFunc 论文用 4 个 Xeon Gold 5320 CPU core 和一张 L40 测试：其高细节、有对象的示例房间约 4,340 万 triangles，但 scene generation 约 **1.1 分钟、4.743 GB RAM**；首帧 setup/render 约 30.7 秒、后续每帧约 8.79 秒。论文也明确指出当前房间类别覆盖不足，不能据此推断 Nature V2 的性能。

这些差异来自版本、场景内容、视点、GT 通道、mesh detail 和 render samples。落地前应使用自己的配置跑 10–50 个 seed，记录成功率、P50/P95 时间、峰值 RAM/VRAM 和磁盘，而不是只引用论文均值。

## 7. 许可证与合规边界

- 主仓库是 [BSD-3-Clause](https://github.com/princeton-vl/infinigen/blob/main/LICENSE)：允许源/二进制形式的使用、修改与再分发，但要保留版权/许可/免责声明，且不得用 Princeton 或贡献者姓名背书。
- [ProcFunc 的包元数据](https://github.com/princeton-vl/procfunc/blob/main/pyproject.toml)同样标为 BSD-3-Clause。
- 当前 Infinigen 含一个独立的 [`infinigen_gpl`](https://github.com/princeton-vl/infinigen_gpl) GPL-3.0 submodule，以及多个第三方组件。若分发修改后的工具链或把代码 vendoring 进产品，需要逐项审查，而不能只看根目录 BSD。
- 官方 README 说明 CVPR 版本不含外部程序资产；后续版本加入了少量标注为 CC0 的外部程序代码。Indoors 也支持导入外部 GLB/GLTF/OBJ/FBX；一旦使用，[外部资产的许可证](https://github.com/princeton-vl/infinigen/blob/main/docs/source/StaticAssets.md)仍各自生效，“全程序化、无外部资产”不再自动成立。
- 对本仓库最安全的方式是借鉴思想、自己实现 TS generator；如果离线运行 Infinigen，只导入生成结果或测得的参数，也要保存使用版本、seed、配置和第三方许可清单。

## 8. 可扩展性与实际用例

### 8.1 扩展接口

V1 的 [asset 开发文档](https://github.com/princeton-vl/infinigen/blob/main/docs/source/ImplementingAssets.md)允许三种方式：直接用 Blender Python/NumPy 写 mesh、用 Geometry/Shader Nodes 设计后经 Node Transpiler 转为 Python、继承 `AssetFactory` 暴露 seed 与参数。可进一步接入：

- gin config：改变场景类别、资产开关、密度、相机和 pipeline；
- 自定义 factory/scatter/material；
- Indoors semantics、support surface 与 constraint program；
- 静态外部资产类别及其放置约束；
- 自定义 GT 标签或过滤规则；
- OBJ/USD/URDF/MJCF exporter 或 simulator 后处理。

V2 把扩展面进一步收敛为有类型、显式输入输出的函数和标准 generator 接口，更适合代码审查、组合、自动搜索和 AI 辅助编辑；但其当前资产覆盖仍小。

### 8.2 适合的用例

- 为 depth、normal、flow、segmentation、MVS/stereo、SLAM、view synthesis 生成大规模且精确标注的 synthetic data；
- 为机器人感知、关节物体操作和 sim-to-real 做几何/材质/动力学 domain randomization；
- 批量生成可控对象/材质作为训练或压力测试数据；
- 研究 procedural distribution、inverse procedural generation、相机/场景扰动和数据课程学习；
- 离线生成影视、VR、游戏或 3D 打印素材，但需要额外优化、烘焙和许可审查。

不适合把它直接当成：浏览器 runtime、实时编辑器、现有场景的自动反编译器、保证跨平台 bit-exact 的 deterministic generator，或无需 QA 就可用于物理训练的 simulator。

## 9. 局限与风险

1. **生成范围不等于真实世界分布**：所谓“无限”是从有限手工规则与参数分布采样；会无限地产生新样本，但不会自动覆盖规则库没有表达的结构。参数先验和类别覆盖会形成系统性 bias。Nature 论文也显示，只用自然场景训练的模型在室内平面/无纹理区域泛化较弱。
2. **可复现性风险**：[Hello World](https://github.com/princeton-vl/infinigen/blob/main/docs/source/HelloWorld.md)仍标注跨平台 reproducibility 已知问题，同一命令可能产生重新排列的场景、不同运行时和内存需求。数据集应固定 commit、Blender/Python/依赖、OS/硬件，并保存中间 `.blend` 与 metadata。
3. **计算与存储重**：高质量 mesh、Cycles、流体、dense GT 和多视图会迅速消耗 CPU/GPU、RAM 和磁盘；失败 seed 与相机轨迹搜索还会降低有效吞吐。
4. **导出有损**：程序材质、instance、透明、复杂光学效果、动画和关节信息无法无损映射到所有格式；full scene 非 USDC 导出尤其危险。
5. **布局求解不是证明器**：Indoors 使用启发式模拟退火最大化约束，复杂场景仍可能碰撞、不对称或不可达；结果需要几何和视觉校验。
6. **V2 迁移风险**：V2 是 alpha、API 可变、自然/Sim 未完成；现在围绕 `infinigen2` 深度集成可能同时承担功能缺口和接口迁移成本。
7. **高保真与实时目标相冲突**：Infinigen 为准确 GT 刻意保留真实微几何；Web 场景通常需要 normal/shader illusion、LOD 和 aggressive instancing。直接导出只会把 Blender 的离线复杂度带到浏览器。
8. **许可证是组合问题**：根仓库 BSD 不会覆盖 GPL submodule、用户导入模型、字体或其他第三方组件的全部义务。

## 10. 对本仓库的具体相关性

### 10.1 当前实现已经有“半个 Infinigen”式骨架

本仓库的 [`gt_designer/index.html`](../gt_designer/index.html)固定使用 Three.js `0.170.0`；[`main.js`](../gt_designer/main.js)已经有 seeded value noise、fBm/ridged terrain、程序化 terrain shader、水、云、草和基于高度/坡度的放置；[`scene-decoration.js`](../gt_designer/scene-decoration.js)已有固定 seed、rejection sampling、生态 noise patch 和 `InstancedMesh`。

但最终场景仍依赖：

- `data/island-village.glb`：约 69 MB，由 `GLTFLoader` + Draco WASM 加载；
- `data/terrain-heightfield.json`：约 1.8 MB，并优先覆盖程序高度函数；
- `assets/glb/` 下 30 个 GLB、8 张独立纹理和 Draco decoder；
- Three.js CDN texture，以及 authored layout/wildlife/lighting JSON。

因此任务不是从零引入 procgen，而是把“程序化环境壳 + authored 主体资产”迁移为统一的语义 scene recipe。

### 10.2 可直接迁移的思想

| Infinigen 思想 | 本仓库落点 |
|---|---|
| 显式 RNG，deterministic 与 random sampler 分离 | 所有 generator 接收 `{seed, rng}`；禁止隐式 `Math.random()`，并保存 seed/版本 |
| 语义 generator + 高层参数 | `TerrainGenerator`、`PathGenerator`、`ShopGenerator`、`BridgeGenerator`、`TreeGenerator`、`BambooGenerator`、`RockGenerator` |
| support/constraint/occupancy | 建筑贴地且朝路，桥端点接岸，道具落在支持面，树/石避开道路、建筑与核心构图区域 |
| coarse → populate → render/GT | 先拟合岛轮廓和建筑 massing，再生成 hero asset/生态细节，最后跑固定多视图回归 |
| 相机感知 detail | 根据固定验收相机和自由飞行距离决定 segment、枝叶、瓦片和 scatter LOD |
| instance + semantic metadata | 草、竹、石、树冠、灯笼、瓦片共享 geometry/material，同时保留 stable semantic ID |
| ProcFunc 的标准接口与 trace | TypeScript generator 返回 `{renderables, colliders, tags, sockets, bounds}`；记录调用 recipe，而不是只留下 mesh |
| 几何 GT 与视觉 render 分离 | 从旧 GLB 与新程序场景输出相同 camera 的 RGB、depth、normal、silhouette、object-ID，建立自动质量门 |

### 10.3 不应迁移的部分

- 不要把 Blender、Python、Cycles、Geometry Nodes 或 Infinigen 本体引入最终 Web bundle；技术栈和性能目标不一致。
- 不要把 1,600 万/4,000 万 triangle 的“真实微几何”当作 Web 质量标准；在 Three.js 中应把微细节留给 shader、vertex color、实例属性和少量 hero geometry。
- 不要先用 Infinigen 生成“另一个岛”再尝试匹配当前场景；它解决的是同分布采样，不是 exact-ish reversal。
- 不要把 OBJ/FBX 全场景导出作为桥梁；官方自己也警告 instance realize 和材质烘焙损失。若做离线实验，优先 `.blend`/USDC，再写专用语义导出器。

## 11. 推荐路线

### 决策

**不把 Infinigen 加为本仓库 runtime 或核心构建依赖；把 V2/ProcFunc 与 V1 pipeline 当作架构蓝本。** 只有在需要生成训练数据、验证 generator 参数空间或测试离线 GT 时，才建立隔离的 Blender/Python sidecar 实验，并锁定 commit/version。

### 分阶段实施

1. 定义 `SceneRecipe`、稳定 semantic ID、显式 seed/RNG 和 generator 统一返回结构；把现有常量与 JSON 先纳入 recipe，而非立刻删资产。
2. 固定一组 authored baseline cameras，从当前 GLB 场景批量导出 RGB/depth/normal/silhouette/object-ID；这相当于本地的 Infinigen GT pipeline。
3. 先替换已接近程序化的 terrain、coast、rocks、grass、bamboo/tree scatter；确保 CPU 高度、放置/碰撞与 GPU shading 使用同一参数源。
4. 将 Shop、亭、桥、栏杆、道路拆为可解释 generator；先拟合固定 seed 的原场景，再把常量扩为分布。对本项目，**exact-ish reversal 应先于 same-style procgen**。
5. 建立逐阶段质量门：camera → terrain silhouette → layout/massing → palette/material → fine detail；用多视图指标防止只拟合一个截图。
6. 用 `InstancedMesh`、分级 geometry 和 shader 取代 Infinigen 式超高精度 mesh；以浏览器帧时间、draw call、显存和下载体积为硬约束。
7. 只有当人工参数拟合成为瓶颈时，再单独评估用 Infinigen/Blender 生成扰动数据、训练参数回归器或离线搜索；其输出应是紧凑 TS 参数，不是 `.blend`/USDC 运行时资产。

## 12. 最终判断

Infinigen 对本项目的相关性是“**概念和架构很高，直接复用很低**”。它有力证明了大型自然/室内世界可以围绕代码、seed、语义 generator、组合约束和精确 GT 来组织；ProcFunc 又说明，把隐式 Blender 状态重构为显式、有类型、可组合的函数接口能显著提高可维护性和自动化潜力。

但它没有解决本仓库最难的那一步：从一个具体的 authored 岛村中恢复紧凑、可编辑、浏览器实时的生成程序。这个问题仍需要本仓库自己的语义分解、参数拟合和视觉回归闭环。最现实的成果不是“移植 Infinigen”，而是建立一个更小、更深、针对岛村领域的 TypeScript Infinigen-style generator system。
