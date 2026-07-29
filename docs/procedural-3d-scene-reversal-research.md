# 用纯 JS/TS + Shader 程序化重建 `gt_designer` 场景：业界、开源与学术调研

> 调研日期：2026-07-28  
> 结论基于项目/论文/官方文档等一手来源；许可证信息仅作工程筛选，不构成法律意见。

## 摘要

有大量“相邻问题”已经被做过，但目前没有一个成熟、开箱即用的系统，能把这个体量的风格化岛屿村落直接逆向成高保真、可交互、最终运行时仅含 JS/TS 与 shader 的程序。

最直接的先例是 [img2threejs](https://github.com/img2threejs/img2threejs)：它明确把单张参考图重建为由 primitive、程序化 shader 和生成几何组成的 TypeScript `THREE.Group`，并采用分阶段构建和 render-vs-reference 质量门。它证明“参考图 → code-only Three.js 对象”已经可行；但其路线图仍把建筑、房间、街道、植被、地形和多对象重建列为未来的 Environment Update，说明完整场景级自动化仍处在能力缺口中。

对本仓库最现实的路线不是“一整个 raymarch shader”，也不是把 NeRF/3D Gaussian Splatting 当作最终资产，而是：

1. 把现有 GLB/JSON 当作离线 ground truth，而不是运行时依赖；
2. 建立一个有语义、有 seed、有局部坐标系的 TypeScript 场景 DSL；
3. 用参数化 mesh generator 重建地形、道路、建筑、桥、树木和道具；
4. 用 GLSL/TSL 负责材质、扰动、水、天空、雾、风和少量局部 SDF；
5. 用旧场景与新场景的固定多视图截图、silhouette、depth/normal/object-ID 做质量门和参数拟合；
6. 最终运行时移除 GLB、纹理、heightfield 和 CDN 资产，只保留代码、shader、seed 和少量数值参数。

这条路线与 Infinigen 的“全程序化资产”、CityEngine/CGA 的“形状语法”、img2threejs 的“分阶段视觉闭环”和 SceneScript/ShapeAssembly 的“场景程序表示”思想一致，同时符合 WebGL/WebGPU 的实际性能边界。

## 1. 问题定义与边界

### 1.1 本仓库当前状态

当前实现不是从零开始。`gt_designer` 已经混合使用了程序化生成与传统资产加载：

- 固定使用 Three.js r170；
- 目录约 72 MB，其中 `data/island-village.glb` 约 69 MB，是由 glTF-Transform 4.4.1 处理并使用 Draco 压缩的 GLB；
- 主 GLB 约含 676 个 mesh、117 个材质、87 张嵌入纹理，accessor 统计约 300 万三角形；
- 另有约 30 个小 GLB、8 张独立纹理、512×512 terrain heightfield（262,144 个采样）；
- 主 GLB 中重复语义前缀很多，例如 PalmTree 156、CherryBlossom 145、bamboo 130、Stone 34、Shop 16；运行时还有 16 只熊猫和 32 个点光；
- [`gt_designer/main.js`](../gt_designer/main.js) 已经程序化生成/修改 sky、water、terrain shader、cloud sprite，以及 instanced grass/rocks；
- [`gt_designer/src/scene-builder.js`](../gt_designer/src/scene-builder.js) 负责按静态 scene schema/GLB 构建主体并做实例批处理；
- 因而真正需要“逆向”的核心是岛屿地貌的精确轮廓、主体村落几何、材质纹理、英雄道具和动画，而不是已经程序化的全部环境效果。

这些数字意味着：目标不是把一个简单 low-poly demo 改写成几百行代码，而是在“视觉相似、代码紧凑、运行时性能、碰撞/交互一致性”之间做有意识的压缩。

### 1.2 建议采用两个严格程度不同的定义

**定义 A：最终运行时纯代码（推荐）**

- 浏览器最终包不加载 authored GLB、纹理、heightfield 或模型 CDN；
- 几何由 JS/TS 构建，表面由 shader、顶点色、程序化 `CanvasTexture` 或代码生成数据构建；
- 允许开发阶段用现有 GLB/JSON、Python/CUDA 工具或人工标注来提取参数；
- 最终提交物只包含 JS/TS、shader、seed 和紧凑的数值配置。

**定义 B：连作者工具链也必须纯 JS/TS**

- 除最终运行时外，参数提取、视觉比较和优化也只能用浏览器/Node.js；
- 这会排除成熟的 PyTorch3D、Mitsuba 3、nvdiffrast、BlenderProc 等工具；
- 可以完成，但自动优化能力明显变弱，更多依赖人工分解、浏览器截图回归和 derivative-free 参数搜索。

建议先明确项目采用定义 A。它不会污染最终产物，同时可以利用成熟的离线工具降低逆向成本。

### 1.3 “重建”也有两个不同目标

- **场景反编译 / exact-ish reversal**：固定相机和多个自由视角都尽量接近当前 `gt_designer`；适合本仓库。
- **同风格程序化生成**：保留构图、色彩、密度和语义，但每个 seed 生成不同岛屿；更像 Infinigen/CityEngine，不能自然保证与原场景逐物体一致。

二者可以共享 generator，但验收标准完全不同。建议第一阶段先做固定 seed 的反编译，第二阶段再把拟合出的常量扩展成分布。

## 2. 最直接的 JS/TS 与 Three.js 先例

| 项目/来源 | 已经做到什么 | 与本仓库的相似点 | 关键差异、成熟度与许可 |
|---|---|---|---|
| [img2threejs](https://github.com/img2threejs/img2threejs) | 从单张参考图生成 code-only、procedural、animation-ready 的 TypeScript `THREE.Group`；用 primitive、程序化 shader、生成几何和分阶段视觉复核 | 目标表述几乎完全一致；其 blockout → structure → form → material → surface → lighting → interaction → optimization 与本项目所需流程高度可迁移 | 当前强项仍是单对象/硬表面；官方路线图把 buildings/rooms/streets/vegetation/terrain-aware multi-object 放在未来版本，不能直接解决完整岛村。Apache-2.0；构建/校验脚本仍用 Python 3.10+，最终模型为 TS |
| [Three.js](https://github.com/mrdoob/three.js) 官方生成器与示例 | 当前官方文档已有 [TreeGenerator](https://threejs.org/docs/pages/TreeGenerator.html)、[ForestGenerator](https://threejs.org/docs/pages/ForestGenerator.html)、[CityGenerator](https://threejs.org/docs/pages/CityGenerator.html)、[building generator](https://threejs.org/examples/webgpu_generator_building.html)、[city generator](https://threejs.org/examples/webgpu_generator_city.html) 和 [TSL procedural terrain](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html) | 都是“种子/参数 → BufferGeometry/Group/InstancedMesh + 程序化材质”；ForestGenerator 甚至明确展示了单 draw call 的超大规模植被 | 这些 generator 出现在本仓库 r170 之后的官方版本中，不能假定直接可用；需要升级 Three.js 或把思路/代码有选择地 backport。Three.js 为 MIT |
| [procedural-gl-js](https://github.com/felixpalmer/procedural-gl-js) | 浏览器里的 JS/WebGL 3D 地图与景观，支持 elevation/raster tile 和 GPU LOD | 证明大地形、LOD、移动端 WebGL 景观可以由 JS 管理 | 重心是地图瓦片与地形可视化，不是无外部资产的风格化村落细节。MPL-2.0 |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) / [文档](https://jscad.app/docs/) | 用 JavaScript 参数化构造 2D/3D 形体，支持 primitive、extrude、hull、boolean 和浏览器/CLI | 建筑、栏杆、招牌、亭子等规则硬表面可以借鉴其组合式 API | 偏 CAD/制造，不负责实时世界渲染、材质、LOD、景观分布或动态效果。主体为 MIT |
| [Shader Park](https://github.com/shader-park/shader-park-core) | 用 JavaScript 描述实时 2D/3D 程序化 shader，并可编译到 Three.js/SDF raymarch 等目标 | 是“JS 作为高层建模语言、shader 作为执行表示”的直接开源先例，适合局部隐式形体与快速视觉迭代 | 更接近 creative coding/单体 shader sculpture，不提供大型语义场景的布局、碰撞、LOD 和对象管理。MIT；最新 GitHub release 较早，采用前应验证当前 Three.js 兼容性 |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) | 基于 three-mesh-bvh 的 Three.js 动态 CSG | 可用于门窗洞、拱门、屋檐切割等少量构件 | 官方明确仍属 experimental/in progress，数值退化可产生非流形结果；不适合把全场景都建成 CSG 树。MIT |

### 2.1 Three.js 当前官方示例为什么尤其重要

它们比泛化的 procgen 项目更能说明本目标在 Web 技术栈内是可行的：

- `TreeGenerator` 用确定 seed 递归生成树干/枝条，并烘焙为一个 `BufferGeometry`；
- `ForestGenerator` 把廉价树冠 geometry 与生态约束、rejection sampling、实例属性和远近 shader 分级结合；
- `CityGenerator` 把道路网格、地块、sidewalk 和 seeded skyscraper generator 组织为 `THREE.Group`；
- procedural terrain 示例把噪声、warp、高度和沙/草/雪/岩石分层材质写在 TSL 中；
- building/city 示例说明复杂立面不必来自 GLB，但需要专门的构件语法，而不是只靠随机盒子。

这些源码更适合作为 architecture/reference implementation，而不是直接复制到当前 r170 项目：官方 [WebGPURenderer 迁移说明](https://threejs.org/manual/en/webgpurenderer) 表明，TSL/node material 是 WebGPU 与 WebGL2 后备路径的共同材质系统；但旧式 `ShaderMaterial`、`RawShaderMaterial`、`onBeforeCompile()` 和传统 `EffectComposer` 不能原样迁移。当前仓库恰好大量使用这些能力，所以升级应独立成阶段，而不应与第一次场景重建同时进行。

## 3. 大规模程序化世界：行业与开源界

### 3.1 Infinigen：最强的“无外部资产”概念先例

[Infinigen](https://github.com/princeton-vl/infinigen) 及其[论文](https://arxiv.org/abs/2306.09310)用随机化数学规则程序化生成自然世界中的形状、纹理、材质、布局、天气和相机；其核心主张就是所有资产从零生成而非依赖外部资产库。它是本项目“代码即资产”的最佳概念先例，且为 BSD-3-Clause。

可迁移的不是 Blender/Python 实现本身，而是它的分层架构：

1. asset generator 负责单个语义对象；
2. world composition 负责地形、生态、支持关系和空间分布；
3. material/lighting generator 负责外观；
4. seed 和参数分布保证可复现及变化；
5. 每个 generator 都有明确的语义和暴露参数。

差异是 Infinigen 依赖 Python + Blender，面向离线高质量生成与数据集；浏览器不能照搬其布尔、几何节点、模拟和渲染成本。但它支持“先建立语义 generator 库，再组合世界”，不支持“写一个巨型场景函数”。

### 3.2 CityEngine/CGA：建筑和街区的行业范式

Esri CityEngine 的 [CGA shape grammar 官方概览](https://doc.arcgis.com/en/cityengine/latest/help/help-cga-modeling-overview.htm)与原始论文 [Procedural Modeling of Buildings](https://doi.org/10.1145/1179352.1141931)展示了从 footprint/初始形状出发，通过 split、repeat、component selection 和规则递归生成高细节建筑外壳与大规模城市。

对本仓库最重要的启示是：

- 建筑 generator 应接受 footprint、层数、屋顶类型、立面 bay、入口朝向和 palette，而不是散落的顶点；
- `split/repeat` 很适合 Shop、窗格、栏杆、竹篱、石阶和屋瓦；
- 规则应输出语义 component ID，便于材质、碰撞、LOD 和回归评测；
- 道路/地块/建筑之间应共享布局数据，而不是各自猜位置。

CityEngine/CGA 是成熟商业行业路线，但不是 JS，也不是本项目可直接依赖的开源 runtime；这里应借鉴语法，而非引入产品。

### 3.3 其他世界生成管线

| 项目 | 主要能力 | 可借鉴之处 | 不适合作为最终方案的原因 |
|---|---|---|---|
| [ProcTHOR](https://github.com/allenai/procthor) | 程序化生成语义合理、可交互的室内住宅，兼容 AI2-THOR；Apache-2.0 | 房间/对象的约束、support relation、可交互语义 | 依赖 Unity/AI2-THOR 和资产数据库，不是 asset-free 几何，也不是浏览器 runtime |
| [BlenderProc](https://github.com/DLR-RM/BlenderProc) | 在 Blender 中程序化采样对象、材质、灯光、相机、物理并生成数据；GPL-3.0 | 很适合离线生成多视图 ground truth、depth、normal、segmentation | Python + Blender，不能成为纯 JS/TS 最终实现 |
| [Manifold JS/WASM API](https://manifoldcad.org/docs/jsapi/documents/Using_Manifold.html) | 浏览器/Node 可调用的稳健 manifold boolean 与几何处理 | 若建筑洞口 CSG 的正确性比“严格纯 JS”更重要，可作为可选 authoring 工具 | 运行时含 WASM，不符合最严格的“纯 JS/TS + shader”；还需要显式管理 WASM 对象生命周期 |

## 4. Shader、SDF 与 ray marching 路线

### 4.1 已有代表

| 项目 | 能力 | 许可/状态 | 对本项目的判断 |
|---|---|---|---|
| [hg_sdf](https://mercury.sexy/hg_sdf/) | GLSL SDF primitive、boolean、空间变换和 domain repetition 的系统化库 | MIT 或 CC-BY-NC-4.0 双许可，使用前应选定适用许可 | 很适合岩石、云团、洞穴、软体装饰和重复纹样；也是理解 SDF 建模语汇的一手资料 |
| [marching.js](https://github.com/charlieroberts/marching) | JS API 组合 primitive/CSG，再编译成 GLSL ray marcher | MIT；偏 live coding/creative coding | 是“JS + shader 描述整个世界”的直接技术先例，但不是复杂可交互村落的生产框架 |
| [glslify](https://github.com/glslify/glslify) | 类 Node 模块系统组织 GLSL，可打包 noise、SDF、fog 等函数 | MIT | 适合把 shader 拆成可测、可复用模块；不负责几何/场景逆向 |
| [webgl-noise](https://github.com/ashima/webgl-noise) | 为 WebGL 优化的无纹理程序化 noise GLSL | 源码头部 MIT | 可替代一部分 noise texture/CDN 依赖，用于地形、材质、风和水面扰动 |

### 4.2 为什么不建议 SDF-only

一整个全屏 raymarch shader 确实最符合“代码很少、没有 mesh 资产”的直觉，但它对这个场景有结构性问题：

- 每像素成本近似与 march step 数和每步求值的 primitive/组合数量相乘；数百建筑构件和大量植被会迅速放大成本；
- 很难自然接入 Three.js 的 shadow、depth prepass、透明水面、后处理、raycast、frustum/occlusion、LOD 与 `InstancedMesh`；
- 需要另写 CPU 侧的碰撞和导航表示，否则视觉地形与交互地形不一致；
- 多材质 ID、薄片树叶、竹子、栏杆和动画角色在 SDF 中不一定比 mesh 简单；
- 局部改动会触碰全局距离场或生成的巨大 shader，编译时间和可维护性变差。

因此更合理的分工是：

- **mesh generator**：地形网格、道路、建筑、桥、栏杆、树干、竹子、角色代理和碰撞体；
- **instancing/batching**：草、石头、花、树冠、灯笼、瓦片等重复物；
- **surface shader**：颜色分层、噪声、triplanar、toon/rim、风摆、湿润度、积雪/沙线；
- **局部 SDF/raymarch**：云体、远景岩层、雾体、软边装饰，或只占很小屏幕区域的 hero effect。

## 5. 逆向图形、可微渲染和神经场景表示

### 5.1 可微渲染适合“拟合参数”，不适合直接成为 Web 最终资产

| 系统 | 一手来源所覆盖的能力 | 技术栈与许可 | 可迁移价值 |
|---|---|---|---|
| [PyTorch3D](https://github.com/facebookresearch/pytorch3d) / [renderer 文档](https://pytorch3d.org/docs/renderer) | 可微 mesh rasterization/shading，官方示例覆盖 camera 与 mesh fitting | Python/PyTorch + C++/CUDA；BSD | 离线优化相机、岛屿轮廓、建筑尺寸和 generator 连续参数；最终只导出参数 |
| [nvdiffrast](https://github.com/NVlabs/nvdiffrast) | 高性能可微 rasterization primitives | PyTorch/TensorFlow + CUDA/OpenGL；NVIDIA Source Code License | 可做高吞吐离线 fitting，但许可与 GPU 环境需额外评估 |
| [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3) | 可微正向/逆向光传输，可优化相机、geometry、BSDF、texture 和 volume | Python-first，C++/Dr.Jit/LLVM/CUDA；BSD-3-Clause | 若要把灯光/材质参数与几何参数分开拟合，它比只看 RGB 的手调更系统，但集成成本最高 |

这些工具可以实现：`generator(params) → render → loss(reference, render) → update(params)`。但 generator 必须对参数可微或有合适代理，离散拓扑选择（屋顶类型、建筑数量、语法分支）仍需人工、搜索或分阶段优化。

### 5.2 NeRF 与 3D Gaussian Splatting：视觉 oracle，而非程序化答案

| 系统 | 做到了什么 | 浏览器情况 | 为什么不满足最终目标 |
|---|---|---|---|
| [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio) / [文档](https://docs.nerf.studio/) | 从图片/视频训练 NeRF，并提供端到端数据处理、训练和 viewer | 主要为 Python/PyTorch；Apache-2.0 | 结果仍是大量学习参数/field，不是可编辑语义程序；碰撞、LOD、对象层次和 shader 资产化都需另做 |
| [3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) / [官方代码](https://github.com/graphdeco-inria/gaussian-splatting) | 从多视图与稀疏点优化 3D Gaussians，得到高质量实时新视角 | 官方 optimizer 是 Python/PyTorch/CUDA；官方仓库为非商用研究/评估许可 | splat 数据本身仍是资产；不提供建筑语法、可编辑 mesh、物理或导航，且许可证不适合直接商业集成 |
| [Spark](https://github.com/sparkjsdev/spark) / [文档](https://sparkjs.dev/docs/) | Three.js 中较新的 3DGS renderer，可与 mesh、shader graph 和程序化 splat 混合 | WebGL2，JS/TS；构建含 Rust/WASM；MIT | 说明神经重建结果能在浏览器显示，但不把它转成纯代码几何；最严格“纯 JS”还会遇到 WASM 边界 |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | Three.js 3DGS viewer | WebGL/Three.js；MIT | 官方 README 已说明项目不再活跃并推荐 Spark；同样只是 viewer，不是 scene-to-program |

对本项目，NeRF/3DGS 的最佳角色是：从旧场景导出大量视角后训练一个“视觉参考模型”，帮助发现新程序在自由视角下的缺失，而不是作为交付物。若已经能直接读取 source GLB，多视图 ground truth 更应直接由旧 Three.js 场景产生，通常无需先绕到神经表示。

### 5.3 浏览器内自动逆向的现实边界

目前成熟的 inverse rendering/training 栈仍主要在 Python/C++/CUDA；JS/TS 生态强在渲染、viewer、交互调参和最终部署。可行的折中是：

- 离线使用 PyTorch3D/Mitsuba 等拟合；
- 导出普通 JSON/TS 常量，再在最终构建中内联为 typed config；
- 若作者工具链也必须纯 JS/TS，则采用 CMA-ES、Nelder–Mead、随机/网格搜索等 derivative-free 方法，按 camera → terrain → massing → palette → detail 分块优化，不应承诺端到端自动微分。

## 6. 从图像/点云/场景图生成程序：学术界最接近的工作

| 工作 | 输入 → 输出 | 与本仓库的相似点 | 主要差距/许可 |
|---|---|---|---|
| [InverseCSG](https://inversecsg.csail.mit.edu/) | raw 3D model → CSG tree，通过几何处理与 program synthesis 反推 primitive/boolean 程序 | 已有 GLB 时，可对规则建筑构件做 mesh-to-program 原型 | 面向制造/规则形体，不覆盖完整自然场景、材质和布局；未在项目页确认可复用代码许可 |
| [CSGNet](https://hippogriff.github.io/CSGNet/) / [论文](https://arxiv.org/abs/1712.08290) | 2D image 或 3D shape → CSG program | 直接证明“观测 → primitive/boolean 程序”可以学习 | 研究对象是低复杂度孤立形体；表达能力不足以覆盖岛村、植被与 shader 外观 |
| [ShapeAssembly](https://rkjones4.github.io/shapeAssembly.html) / [代码](https://github.com/rkjones4/ShapeAssembly) | 点云/形状 → 层次化、可附着 cuboid proxy DSL；可用 Chamfer loss 拟合参数 | `attach`、对称、重复、局部坐标系很适合亭子、商店、桥和家具类构件 | Python/PyTorch；其 LICENSE 限制商业产品/服务使用，属于研究源码而非宽松开源 |
| [ShapeCoder](https://rkjones4.github.io/shapecoder.html) / [代码](https://github.com/rkjones4/ShapeCoder) | 从一组 unstructured primitive 中共同发现 abstraction library 与紧凑程序 | 很适合从 PalmTree/CherryBlossom/bamboo/Shop 的重复实例中发现可共享函数 | Python/PyTorch + Rust e-graph/CUDA；自定义非商用许可；输入已经是 primitive，不是原始完整 GLB/RGB |
| [SceneScript](https://arxiv.org/abs/2403.13064) / [代码](https://github.com/facebookresearch/scenescript) | semi-dense point cloud/视觉数据 → 表示 wall、door、window、box 等的结构化 scene language command | 证明场景级 DSL 能同时服务重建、编辑和下游任务；布局语义值得借鉴 | 偏室内 layout 和 gravity-aligned box，缺少细致外观、曲面和自然物；CUDA/Linux；CC BY-NC |
| [SceneMotifCoder](https://3dlg-hcvc.github.io/smc/) / [代码](https://github.com/3dlg-hcvc/smc) | 从带语义的 3D object arrangement 中学习 compact、editable meta-program | 与本场景大量重复树、竹、石、商店及灯的 motif 高度相关 | 只建模对象安排，不生成对象 mesh/shader；Python，依赖 OpenAI API 和大型 HSSD 数据；代码 MIT |
| [REST3D](https://github.com/ShirleyMaxx/REST3D) | 单张 RGB → 视觉一致、物理稳定、可交互的场景 tree/mesh，通过 support reasoning 和物理优化修正 | 最接近“单图整体场景逆向”，support graph 和物理校正非常值得借鉴 | 2026 年研究预印本/前沿原型；依赖 Python、Isaac Gym、Gemini API 和 image-to-3D mesh；输出不是程序化 JS；CC BY-NC 4.0 |
| [DI-PCG](https://thuzhaowang.github.io/projects/DI-PCG/) / [CVPR 2025 论文](https://openaccess.thecvf.com/content/CVPR2025/papers/Zhao_DI-PCG_Diffusion-based_Efficient_Inverse_Procedural_Content_Generation_for_High-quality_3D_CVPR_2025_paper.pdf) | 图像条件 → 已知 procedural generator 的参数 | 很适合“generator 已经写好，自动拟合屋顶、树、桥等连续参数”的后半程 | 它反求的是既定生成器的参数，不会替你发明覆盖整个岛村的 TS generator/DSL；主要验证对象级 PCG |
| [Thinking in Blender / SEIG](https://arxiv.org/abs/2606.02580) | 单张图像 → 分阶段迭代的可编辑 Blender 程序，依次修正 geometry、material、composition、lighting | 与本项目需要的 staged executable inverse graphics 极其接近，支持“先结构、后外观”的视觉闭环 | 2026 年 6 月前沿研究；输出 Blender/Python 而非 Three.js/TS，且单图仍存在隐藏面歧义，不能视为生产级转换器 |
| [SceneCode](https://scene-code.github.io/) / [论文](https://arxiv.org/abs/2605.19587) | 文本 → code-driven indoor world、part-level Blender Python asset program、持久 scene state 与仿真资产 | 证明完整场景可围绕可执行程序、局部可编辑资产和 scene registry 组织，而不必退化成 opaque mesh 集合 | 2026 年前沿室内场景系统；输入是文本而非现有 GLB/多视图，技术栈和输出也不是浏览器 JS/TS |

### 6.1 学术现状给出的明确信号

没有一个上述系统同时满足以下全部条件：

1. 单张或少量参考图输入；
2. 大型室外、多对象、含自然物的场景；
3. 输出有语义、可编辑的层次化程序；
4. 输出直接是 Three.js TypeScript + shader；
5. 最终不携带 mesh/texture/neural field 资产；
6. 浏览器实时、带物理/交互；
7. 宽松开源许可并达到生产成熟度。

学术界已经分别证明了 CSG 反推、对象装配 DSL、场景命令语言、motif 程序发现、单图场景树和神经新视角；工程上仍要把这些思想组合成面向本场景的专用管线。

## 7. 路线比较

评分是针对本仓库，而非对技术本身的普遍评价。

| 路线 | 原场景保真 | 可编辑/交互 | Web 性能 | 最终纯代码 | 实施风险 | 建议角色 |
|---|---:|---:|---:|---:|---:|---|
| 语义 TS DSL + 参数化 mesh + shader | 高 | 高 | 高 | 是 | 中 | **主路线** |
| SDF-only 全屏 raymarch | 中 | 低 | 低～中 | 是 | 高 | 只做局部体积/软形体 |
| 离线可微渲染拟合 → 导出 TS 参数 | 高 | 高 | 不影响最终 runtime | 是（按定义 A） | 中～高 | 主路线的可选加速器 |
| NeRF / 3DGS | 特定视角高 | 低 | 中～高 | 否，field/splat 仍是资产 | 中 | 视觉 oracle / baseline |
| WebGPU compute 驱动的全程序化世界 | 潜力高 | 高 | 潜力高 | 是 | 当前高 | 第二阶段性能路线，不做 MVP 前提 |
| 人工逐物体硬编码 | 高但成本极高 | 中 | 取决于实现 | 是 | 进度风险高 | 只用于 hero assets |

## 8. 推荐架构

### 8.1 一个小而“深”的 TypeScript scene DSL

不要把旧 GLB 每个 mesh 变成一段顶点数组；那只是把二进制资产换成更大的代码资产。建议建立下列语义层：

```ts
type SceneRecipe = {
  seed: number;
  terrain: TerrainRecipe;
  paths: PathRecipe[];
  districts: DistrictRecipe[];
  structures: StructureRecipe[];
  scatter: ScatterRecipe[];
  atmosphere: AtmosphereRecipe;
};

type StructureRecipe =
  | ShopRecipe
  | PavilionRecipe
  | BridgeRecipe
  | GateRecipe
  | PropRecipe;
```

每个 recipe 至少应包含：稳定 ID、seed、parent/local frame、support surface、生成器类型、连续参数、离散样式、材质语义、LOD/碰撞策略。生成器输出 render mesh、简单 collider、semantic tags 和可选 animation sockets。

### 8.2 建议的 generator 库

- `TerrainGenerator`：共享 CPU height function 与 GPU material function，保证视觉、放置和碰撞一致；固定 seed 下拟合当前 heightfield，再允许参数化变化；
- `PathGenerator`：Catmull–Rom/spline sweep、路面横坡、桥接点和路边 occupancy mask；
- `ShopGenerator`：footprint → foundation/wall/bay/roof/awning/sign，借鉴 CGA 的 split/repeat；
- `PavilionGenerator` / `BridgeGenerator`：柱、梁、屋顶、台阶、栏杆的 attach/array；
- `TreeGenerator`：枝干 sweep + 叶团/花团 instancing；可参考 Three.js 官方新 generator；
- `BambooGenerator`：分节 cylinder + 叶片，实例属性控制弯曲；
- `RockGenerator`：低面数 ico/sphere 做 domain warp 或顶点噪声，必要时局部 SDF；
- `ScatterSystem`：以高度、坡度、道路距离、水线、district mask 和 Poisson/rejection sampling 控制分布；
- `WildlifeGenerator`：先做低多边形、层次关节的熊猫/鸟类代理，hero animation 最后补；
- `MaterialLibrary`：程序化木纹、石纹、瓦片、泥土、草地、花瓣、toon ramp、rim light；禁止隐式纹理加载。

### 8.3 渲染器选择

**MVP 保持 WebGL2 + 当前 Three.js r170。** 先在现有渲染器上替换资产，能把“内容重建”和“渲染后端迁移”两个风险拆开。

之后再做一个明确的升级实验：

- 升级到包含官方 generator/TSL 示例的新版本；
- 将 `onBeforeCompile`、自定义 `ShaderMaterial` 和 `EffectComposer` 分批迁移为 node material/TSL/post-processing node；
- 用同一场景比较 WebGL2 backend 与 WebGPU；
- 只有当 compute scatter、GPU culling 或 procedural geometry 的收益经过测量，再决定是否把 WebGPU 设为主路径。

[TSL 官方文档](https://threejs.org/docs/TSL.html)说明它以 JS 风格节点描述 shader 并生成 WGSL/GLSL，还覆盖 compute 与 instancing；它适合作为中期统一 shader 表达，但不是当前重建工作的必要前置条件。

## 9. 推荐实施与验证流程

### Phase 0：固定验收标准

- 选 8～16 个固定 camera pose，覆盖全景、俯视、村中心、桥、商店、植被和背面；
- 从旧场景导出 RGB、linear depth、world normal、object-ID、material-ID；
- 记录 camera、tone mapping、exposure、sun/sky/water、viewport 和随机 seed；
- 建立资产门禁：最终 runtime 不允许 `GLTFLoader`、`TextureLoader`、heightfield fetch 或外部 asset URL；Three.js 自身是否 vendor 进仓库需单独约定。

### Phase 1：把旧场景转成“测量数据”，不是新运行时资产

- 导出每个语义对象的 world transform、bounds、材质主色、三角数、parent、可见视角；
- 用名称前缀和几何/材质相似度聚类 PalmTree、CherryBlossom、bamboo、Stone、Shop 等重复 motif；
- 识别道路中心线、岸线、建筑 footprint、入口朝向和 support graph；
- 把 69 MB GLB 与 JSON 保留在 ground-truth 工具目录，程序化 runtime 不引用它们。

### Phase 2：按视觉影响从大到小重建

1. camera、曝光、天空、水面与整体 palette；
2. 岛屿 silhouette、海岸、水线、主路；
3. 建筑 massing、屋顶和桥；
4. 重复植被、岩石、栏杆、灯笼等中频结构；
5. 立面细节、程序化材质；
6. 熊猫、招牌和少量 hero asset；
7. 动画、交互与碰撞。

这与 img2threejs 的 staged build 思路一致：上一层没通过 quality gate 时，不用纹理/噪声掩盖几何问题。

### Phase 3：视觉闭环与参数拟合

每次构建同时比较旧/新场景：

- silhouette IoU / edge distance：先约束岛、屋顶、树冠和桥的轮廓；
- depth/normal error：防止只在单视角“贴图骗过”RGB；
- semantic occupancy：检查 Shop/road/tree/water 等类别位置；
- RGB 的 SSIM/感知距离与颜色差：用于材质和灯光；
- draw calls、triangle/instance count、GPU frame time、首次加载字节数：防止以性能换相似度。

建议采用 block-coordinate fitting：先锁相机，再地形，再建筑，再 scatter，再材质/灯光。连续参数可接 PyTorch3D/Mitsuba 或 derivative-free optimizer；离散语法选择由规则/人工决定。

### Phase 4：移除资产并做多平台门禁

- 禁止网络后仍能完整启动；
- 删除/隔离 GLB、纹理、heightfield 后，production build 和测试仍通过；
- 同一 seed 在 Chrome/Firefox/Safari 和不同 GPU 上布局稳定；
- 移动端设定明确帧预算，并检查 shader 编译时间、峰值内存、过绘制和透明排序；
- CPU collider 与 shader-displaced surface 做一致性测试。

## 10. 主要风险及缓解

| 风险 | 为什么会发生 | 缓解方式 |
|---|---|---|
| 单图/少视角歧义 | 隐藏面、遮挡物和真实尺度不可观测 | 本仓库已有 source GLB，应从其导出多视图/语义，而非只看一张截图；对不可见处接受规则化近似 |
| “纯代码”退化成巨型常量数组 | 逐顶点序列化满足字面要求，却没有压缩、可编辑性或生成能力 | 对每类资产设参数预算和 generator 复用率；禁止大规模 position/index blob 进入源码 |
| hero asset 难以语法压缩 | 熊猫、招牌、独特屋顶等重复度低 | 允许少量专用 code geometry；先保证轮廓与关节层次，再决定细节预算 |
| 精确像素匹配与程序化紧凑性冲突 | 原场景包含大量艺术家制作的非规则细节 | 明确优先级：多视图结构正确 > 固定视角颜色接近 > 隐蔽微细节；报告残余误差 |
| Three.js 版本迁移扩大工作面 | r170 shader/后处理接口与当前 TSL/WebGPU 路线不同 | 内容重建先留在 r170；renderer migration 单独分支、单独 benchmark |
| shader/SDF 成本失控 | 循环次数、噪声 octave、透明层和距离场 primitive 会乘到每像素 | 限定 SDF 屏幕覆盖；distance gate；减少 octave；用 instance attribute 把远景变化从 fragment 移到 CPU/vertex |
| CSG 数值问题 | 共面/近共面、退化三角形和复杂布尔可产生洞或非流形 | CSG 只在初始化时少量使用；规范化输入；对窗格等重复构件优先直接生成拓扑 |
| 视觉地形与碰撞不一致 | GPU displacement 无法直接被 CPU raycast/物理读取 | CPU 和 shader 共享同一 height/noise 参数；或生成后回写高度采样/简化 collider |
| 跨 GPU 确定性 | shader precision、三角函数和浮点次序有差异 | seed/布局在 CPU 确定；GPU noise 只影响表面；回归测试使用容差而非逐像素相等 |
| 许可污染 | 多个研究项目是 CC BY-NC 或自定义非商用许可 | 只借鉴论文思想；复制源码前逐项审查；优先 MIT/BSD/Apache；把研究代码与产品代码隔离 |
| CDN 仍是隐形资产依赖 | 当前 water normal/Three.js CDN 使离线与可复现性变差 | vendor 锁定依赖；water normal 改为 shader noise 或代码生成 texture；CI 中断网测试 |

## 11. 最终建议

### 建议采用

**“专用 scene decompiler + typed procedural DSL + hybrid mesh/shader renderer”**：

- 以旧 GLB 为测量源，自动提取 transform、bounds、palette、motif 和多视图 ground truth；
- 人工/半自动把它们映射到少量有语义的 generator；
- 参考 CityEngine/ShapeAssembly 设计建筑与 attach/repeat 规则；
- 参考 Infinigen 设计 seeded asset/world/material 分层；
- 参考 img2threejs 采用 staged build 与视觉质量门；
- 参考 Three.js 官方当前 generator 设计 tree/forest/city/terrain 的 Web 实现；
- 以普通 mesh、instancing 和 shader 为主，SDF 为辅；
- 可微渲染只在离线参数拟合中使用，NeRF/3DGS 只做视觉 baseline。

### 不建议作为主路线

- 不建议把全场景塞进单一 raymarch shader；
- 不建议用 splat/NeRF 假装“纯代码”，因为 learned field 仍然是外部资产且不具备所需语义；
- 不建议一开始同时升级 Three.js、切 WebGPU、重写所有 shader 和替换全部资产；
- 不建议逐顶点硬编码现有 GLB；
- 不建议期望现有 image-to-3D 或 scene-to-program 研究系统一键交付生产级 Three.js 世界。

### 最小可行验证切片

先选一个同时包含 Shop、道路、桥、竹/樱花/棕榈、石头和水岸的 30～45° 视角区域，限定 2～3 周只验证：

1. 一个固定 seed 的 terrain/path；
2. 一个 Shop grammar 和一个 bridge/pavilion grammar；
3. 三种 vegetation generator；
4. 程序化石/木/瓦材质；
5. 旧/新双渲染多通道质量门；
6. runtime 断开所有美术资产仍可运行。

如果这个切片能在可接受帧预算下达到目标视觉误差，再扩展 generator library；否则应调整“保真”或“纯代码”的边界，而不是先重写剩余 300 万三角。

## 12. 一手来源索引

### Web / Three.js / 程序化生成

- [img2threejs 仓库与 README](https://github.com/img2threejs/img2threejs)
- [Three.js 仓库](https://github.com/mrdoob/three.js)、[MIT license](https://threejs.org/license/)
- [Three.js TreeGenerator](https://threejs.org/docs/pages/TreeGenerator.html)
- [Three.js ForestGenerator](https://threejs.org/docs/pages/ForestGenerator.html)
- [Three.js CityGenerator](https://threejs.org/docs/pages/CityGenerator.html)
- [Three.js WebGPU building generator](https://threejs.org/examples/webgpu_generator_building.html)
- [Three.js WebGPU city generator](https://threejs.org/examples/webgpu_generator_city.html)
- [Three.js TSL procedural terrain](https://threejs.org/examples/webgpu_tsl_procedural_terrain.html)
- [Three.js TSL 文档](https://threejs.org/docs/TSL.html)
- [Three.js WebGPURenderer 迁移说明](https://threejs.org/manual/en/webgpurenderer)
- [Three.js InstancedMesh 文档](https://threejs.org/docs/pages/InstancedMesh.html)
- [procedural-gl-js](https://github.com/felixpalmer/procedural-gl-js)
- [JSCAD](https://github.com/jscad/OpenJSCAD.org)
- [Shader Park](https://github.com/shader-park/shader-park-core)
- [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg)
- [Manifold JavaScript/WASM API](https://manifoldcad.org/docs/jsapi/documents/Using_Manifold.html)
- [Infinigen 代码](https://github.com/princeton-vl/infinigen)与[论文](https://arxiv.org/abs/2306.09310)
- [CityEngine CGA 官方说明](https://doc.arcgis.com/en/cityengine/latest/help/help-cga-modeling-overview.htm)与[原始论文](https://doi.org/10.1145/1179352.1141931)
- [ProcTHOR](https://github.com/allenai/procthor)
- [BlenderProc](https://github.com/DLR-RM/BlenderProc)

### Shader / SDF

- [hg_sdf](https://mercury.sexy/hg_sdf/)
- [marching.js](https://github.com/charlieroberts/marching)
- [glslify](https://github.com/glslify/glslify)
- [webgl-noise](https://github.com/ashima/webgl-noise)

### 逆向渲染 / 神经表示

- [PyTorch3D](https://github.com/facebookresearch/pytorch3d)与[renderer 文档](https://pytorch3d.org/docs/renderer)
- [nvdiffrast](https://github.com/NVlabs/nvdiffrast)
- [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3)
- [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio)
- [3D Gaussian Splatting 项目页](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)与[官方代码](https://github.com/graphdeco-inria/gaussian-splatting)
- [Spark](https://github.com/sparkjsdev/spark)
- [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D)

### Program synthesis / scene language

- [InverseCSG](https://inversecsg.csail.mit.edu/)
- [CSGNet](https://hippogriff.github.io/CSGNet/)
- [ShapeAssembly](https://rkjones4.github.io/shapeAssembly.html)
- [ShapeCoder](https://rkjones4.github.io/shapecoder.html)
- [SceneScript 论文](https://arxiv.org/abs/2403.13064)与[代码](https://github.com/facebookresearch/scenescript)
- [SceneMotifCoder 项目页](https://3dlg-hcvc.github.io/smc/)与[代码](https://github.com/3dlg-hcvc/smc)
- [REST3D 官方代码](https://github.com/ShirleyMaxx/REST3D)
- [DI-PCG 项目页](https://thuzhaowang.github.io/projects/DI-PCG/)与[CVPR 2025 论文](https://openaccess.thecvf.com/content/CVPR2025/papers/Zhao_DI-PCG_Diffusion-based_Efficient_Inverse_Procedural_Content_Generation_for_High-quality_3D_CVPR_2025_paper.pdf)
- [Thinking in Blender / SEIG](https://arxiv.org/abs/2606.02580)
- [SceneCode 项目页](https://scene-code.github.io/)与[论文](https://arxiv.org/abs/2605.19587)
