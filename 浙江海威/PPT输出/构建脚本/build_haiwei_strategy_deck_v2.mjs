import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const SKILL_DIR = "/Users/lijiajun/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const workspaceDir = "/Users/lijiajun/Documents/GitHub/python-document/浙江海威";
const sourceTemplatePath = path.join(workspaceDir, "海威集团信息系统方案说明260617.pptx");
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
const previewDir = path.join(workspaceDir, ".codex-ppt-preview");
const outputDir = path.join(workspaceDir, "PPT输出");
const FINAL_PPTX = path.join(outputDir, "业务理解与系统建设路径_去品牌草稿_v2_修订.pptx");
const expectedSlideSizeEmu = "12192000,6858000";
const runtimePython = "/Users/lijiajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const sourceHash = crypto
  .createHash("sha256")
  .update(await fs.readFile(sourceTemplatePath))
  .digest("hex");

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs"),
).href);

const W = 1280;
const H = 720;
const C = {
  blue: "#23A8D8",
  green: "#76BC21",
  dark: "#1F2A33",
  mid: "#53626B",
  line: "#A8B8BF",
  light: "#F4F8FA",
  paleBlue: "#E9F6FB",
  paleGreen: "#F0F8E8",
  white: "#FFFFFF",
};
const FONT_CN = "Songti SC";
const FONT_EN = "Arial";

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

function shape(slide, cfg) {
  return slide.shapes.add(cfg);
}

function textBox(slide, text, x, y, w, h, style = {}) {
  const s = shape(slide, {
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = text;
  s.text.style = {
    typeface: style.typeface ?? FONT_CN,
    fontSize: style.fontSize ?? 22,
    bold: style.bold ?? false,
    color: style.color ?? C.dark,
    autoFit: "shrinkText",
    ...(style.align ? { alignment: style.align } : {}),
  };
  return s;
}

function rect(slide, text, x, y, w, h, fill, line = C.line, style = {}) {
  const s = shape(slide, {
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: style.lineWidth ?? 1.5 },
    borderRadius: 6,
  });
  s.text = text;
  s.text.style = {
    typeface: style.typeface ?? FONT_CN,
    fontSize: style.fontSize ?? 17,
    bold: style.bold ?? false,
    color: style.color ?? C.dark,
    autoFit: "shrinkText",
    ...(style.align ? { alignment: style.align } : {}),
  };
  return s;
}

function line(slide, x, y, w, h, color = C.line, width = 1.5) {
  return shape(slide, {
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function header(slide, title, pageNo) {
  slide.background.fill = C.white;
  textBox(slide, title, 58, 36, 880, 56, { fontSize: 28, bold: true, color: C.dark });
  line(slide, 58, 96, 1110, 0, "#D3DEE2", 1.1);
  textBox(slide, String(pageNo).padStart(2, "0"), 1178, 42, 44, 28, {
    fontSize: 15,
    bold: true,
    color: C.green,
    align: "right",
    typeface: FONT_EN,
  });
}

function footer(slide, tool) {
  shape(slide, {
    geometry: "rect",
    position: { left: 0, top: 688, width: 920, height: 18 },
    fill: C.blue,
    line: { style: "solid", fill: C.blue, width: 0 },
  });
  shape(slide, {
    geometry: "rect",
    position: { left: 920, top: 688, width: 360, height: 18 },
    fill: C.green,
    line: { style: "solid", fill: C.green, width: 0 },
  });
  if (tool) {
    textBox(slide, `现场穿插：${tool}`, 58, 650, 650, 24, { fontSize: 14, color: C.mid });
  }
}

function bullets(slide, items, x, y, w, gap = 46, fontSize = 19) {
  items.forEach((item, i) => {
    const top = y + i * gap;
    shape(slide, {
      geometry: "ellipse",
      position: { left: x, top: top + 8, width: 10, height: 10 },
      fill: i % 2 === 0 ? C.blue : C.green,
      line: { style: "solid", fill: "none", width: 0 },
    });
    textBox(slide, item, x + 24, top, w - 24, gap + 6, { fontSize, color: C.dark });
  });
}

function sectionLabel(slide, text, x, y, w, fill) {
  return rect(slide, text, x, y, w, 34, fill, "none", {
    fontSize: 17,
    bold: true,
    color: C.dark,
    align: "center",
  });
}

function addNotes(slide, text) {
  if (slide.speakerNotes?.textFrame?.setText) {
    slide.speakerNotes.textFrame.setText(text);
  }
}

function cover() {
  const slide = presentation.slides.add();
  slide.background.fill = C.white;
  textBox(slide, "信息系统建设理解与下一阶段路径", 160, 248, 960, 72, {
    fontSize: 36,
    bold: true,
    color: C.dark,
    align: "center",
  });
  textBox(slide, "当前功能理解、二阶段数据闭环与最终智能架构", 240, 330, 800, 36, {
    fontSize: 20,
    color: C.mid,
    align: "center",
  });
  shape(slide, { geometry: "rect", position: { left: 0, top: 652, width: 780, height: 30 }, fill: C.blue, line: { fill: C.blue, width: 0 } });
  shape(slide, { geometry: "parallelogram", position: { left: 760, top: 652, width: 120, height: 30 }, fill: C.blue, line: { fill: C.blue, width: 0 } });
  shape(slide, { geometry: "rect", position: { left: 858, top: 652, width: 422, height: 30 }, fill: C.green, line: { fill: C.green, width: 0 } });
  addNotes(slide, "封面已去除公司 logo 和名称，仅保留原模板的蓝绿底栏风格。");
}

const slides = [
  {
    title: "汇报结构",
    tool: "",
    layout: "three",
    items: [
      ["当前", "把已有和预期功能转译成真实业务能力，确认每项功能服务的过程位置。"],
      ["阶段二", "围绕全工序设备数据收集，回答收集之后产生哪些可执行动作。"],
      ["最终阶段", "在计划能力和数字孪生基础上，引入 AI 做调整、过滤和重排。"],
    ],
    note: "本页按新的三段式结构重排。"
  },
  {
    title: "当前系统功能的业务理解",
    tool: "业务过程与功能重组工作台",
    layout: "mapping",
    left: ["WMS / MES / TPM", "WMS / MES / TPM", "WMS / MES / TPM", "QMS", "IoT"],
    right: ["实物／物料流管理", "生产计划管理", "生产过程与工艺管理", "QM 相关界面输出", "设备数据采集"],
    note: "现场可打开工作台，展示功能项从系统模块重组为业务能力的过程。"
  },
  {
    title: "功能落位到价值流",
    tool: "价值流画板",
    layout: "chain",
    items: ["供应商", "收货", "入库检", "仓库", "材料出库", "生产工序", "成品检验", "成品入库", "成品出库", "客户"],
    note: "现场打开价值流画板，展示 F 项如何落到过程节点。"
  },
  {
    title: "当前能力判断",
    tool: "业务过程与功能重组工作台",
    layout: "twoCol",
    leftTitle: "已有能力",
    leftItems: ["仓储、库存、出入库、FIFO 等功能具备基础框架。", "生产执行、报工、防错和追溯已有功能入口。", "检验、质量标准、不合格品处理已有明确功能项。"],
    rightTitle: "主要缺口",
    rightItems: ["功能仍偏记录和局部管控。", "生产计划能力弱，信息流缺少统一牵引。", "既有零件跨工序移动缺少拉动式机制。"],
    note: "本页用于从理解过渡到问题判断。"
  },
  {
    title: "阶段二的核心问题",
    tool: "价值流画板",
    layout: "hub",
    center: "全工序数据",
    items: ["设备状态", "质量指标", "技术参数", "产品状态", "生产进度", "节拍 CT", "Performance Rate"],
    bottom: "二阶段已经向数字孪生靠拢，关键问题不是采集多少数据，而是采集后触发什么动作。"
  },
  {
    title: "完整价值流展开",
    tool: "价值流画板",
    layout: "chain",
    items: ["供应商", "收货", "入库检", "仓库", "材料出库", "生产工序", "WIP", "成品检验", "成品出库", "客户"],
    note: "本页用于现场展开完整价值流，再引出全工序设备数据收集的目的。"
  },
  {
    title: "数据目的一：状态异常与质量指标",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "触发动作",
    leftItems: ["设备运作状态异常时，系统触发停线或人工确认。", "质量指标持续跟踪，生成趋势曲线和异常曲线。", "超出阈值时，把异常反馈到现场和计划层。"],
    rightTitle: "实现前提",
    rightItems: ["需要 100% 检查能力。", "需要清晰阈值设定。", "需要定义停线责任和恢复条件。"],
    note: "本页对应 2.1。"
  },
  {
    title: "状态异常的价值与代价",
    tool: "",
    layout: "matrix",
    rows: [
      ["判断项", "说明"],
      ["即时价值", "减少质量报废率，避免问题继续流入后序"],
      ["直接代价", "生产过程被停掉，价值环节同步停滞"],
      ["建设要求", "检查覆盖率、阈值、停线规则和恢复流程都要明确"],
      ["管理重点", "让停线动作可解释，避免系统只会报警而无法闭环"]
    ]
  },
  {
    title: "数据目的二：技术参数与经验值",
    tool: "业务过程与功能重组工作台",
    layout: "twoCol",
    leftTitle: "采集内容",
    leftItems: ["设备技术参数和工艺参数。", "产品状态变化和质量结果。", "同一产品、同一工艺路线下的长期表现。"],
    rightTitle: "后续动作",
    rightItems: ["对照产品状态，形成技术经验值。", "支持未来产品开发。", "支持后续工艺设定和参数边界优化。"],
    note: "本页对应 2.2。"
  },
  {
    title: "技术参数的价值周期",
    tool: "",
    layout: "matrix",
    rows: [
      ["判断项", "说明"],
      ["即时价值", "通常不能直接创造当班收益"],
      ["长期价值", "在经验轨道上积累有效参数，支撑产品开发和工艺设定"],
      ["数据过滤", "需要识别哪些参数真正影响产品状态"],
      ["阶段定位", "更适合成为数字孪生和 AI 训练的数据基础"]
    ]
  },
  {
    title: "数据目的三：生产进度跟踪",
    tool: "价值流画板",
    layout: "hub",
    center: "Planning",
    items: ["24H 计划", "工序进度", "前后序衔接", "WIP 水位", "节拍 CT", "Performance Rate", "Replan"],
    bottom: "生产进度跟踪可以识别当前工序与前后续的连贯关系，并支持 replan 动作减少浪费。"
  },
  {
    title: "进度跟踪的即时价值",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "它能解决什么",
    leftItems: ["制止不同工序生产波动带来的等待和堆积。", "保障价值环节尽量不停顿。", "把异常及时反馈给计划层，形成短周期调整。"],
    rightTitle: "它依赖什么",
    rightItems: ["24H 内业务运作是否按计划执行。", "真实生产动作如何发生。", "节拍 CT 和 Performance Rate 的可信数据。"],
    note: "本页对应 2.3。"
  },
  {
    title: "Planning 是动态数据的前提",
    tool: "DEMO2 场地规划软件",
    layout: "flow",
    items: ["24H 计划", "设备状态", "质量指标", "进度反馈", "偏差判断", "Replan"],
    bottom: "没有计划基准，动态数据只能成为记录；有计划基准，动态数据才能判断偏差和触发调整。"
  },
  {
    title: "工单驱动与拉动式物料流",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "可以接受的工单驱动",
    leftItems: ["工单驱动料单和发料动作。", "铝锭等原材料发出至铸造产线，可以由工单牵引。", "计划仍然需要提供材料需求和产能边界。"],
    rightTitle: "更适合拉动的物料移动",
    rightItems: ["铸造完成品到后续工序。", "机加到装配。", "排产基于各环节库存量级，真实物理流动由后工序拉动前工序。"],
    note: "本页引出当前系统架构对拉动式物流能力的弱化。"
  },
  {
    title: "当前架构中的弱化能力",
    tool: "业务过程与功能重组工作台",
    layout: "twoCol",
    leftTitle: "业务层面较弱",
    leftItems: ["生产计划没有充分牵引现场节奏。", "跨工序库存水位和拉动关系不清晰。", "异常反馈缺少短周期重排机制。"],
    rightTitle: "系统层面较弱",
    rightItems: ["当前已有功能偏库存记录和执行记录。", "二期功能偏设备数据和质量输出。", "对拉动式物流和计划重排的支撑不足。"],
    note: "本页把业务弱项和系统弱项合并表达。"
  },
  {
    title: "阶段二的实现方法",
    tool: "价值流画板，DEMO2 场地规划软件",
    layout: "four",
    items: [
      ["价值流落位", "把全工序数据采集放回过程节点，而不是放在系统模块里讨论。"],
      ["动作反推", "先定义停线、曲线、经验值、replan 等动作，再定义数据范围。"],
      ["计划基准", "建立 24H 计划和工序节拍基准，让动态数据有判断对象。"],
      ["拉动补强", "补足跨工序库存水位和后工序拉动前工序的能力。"],
    ]
  },
  {
    title: "阶段二后的数字孪生基础",
    tool: "价值流画板，DEMO2 场地规划软件",
    layout: "twins",
    items: ["计划基准", "设备状态", "质量曲线", "参数经验", "WIP 水位", "进度偏差"],
    bottom: "当计划、设备、质量、参数和实物流都能投影到同一张图上，数字孪生才具备调整能力。"
  },
  {
    title: "AI 的介入位置",
    tool: "",
    layout: "ai",
    items: [
      ["设备边缘", "在状态异常和质量指标偏离时，辅助判断是否停线、降速或切换参数。"],
      ["计划重排", "以更小颗粒度监控工序进度，并生成短周期 replan 建议。"],
      ["参数过滤", "过滤非必要数据，保留对产品状态和工艺设定有效的参数。"],
    ],
    bottom: "AI 的价值建立在阶段二形成的计划基准、现场数据和调整手段之上。"
  },
  {
    title: "数字孪生的调整方式",
    tool: "",
    layout: "matrix",
    rows: [
      ["调整类型", "触发方式与能力要求"],
      ["定时调整", "按更小颗粒度周期检查计划执行状态，依赖模型反应速度和计算能力"],
      ["不定时调整", "由阈值、异常责任和模型判断触发，适合状态突变和质量风险"],
      ["边缘调整", "在设备侧快速响应，减少等待中心系统判断的时间"],
      ["计划调整", "把现场偏差回写到 Planning，更新工序衔接和物料拉动动作"]
    ]
  },
  {
    title: "最终软件架构展望",
    tool: "",
    layout: "cost",
    items: [
      ["计划层", "形成 24H 基准、短周期 replan 和成本展开入口。"],
      ["过程层", "承接工序、质量、设备、节拍和 WIP 的真实动作。"],
      ["数据层", "按动作目的采集、过滤和沉淀有效参数。"],
      ["智能层", "在边缘和计划层分别承担快速响应和优化建议。"],
    ]
  },
  {
    title: "阶段性建设路线图",
    tool: "",
    layout: "roadmap",
    items: [
      ["阶段一", "当前功能业务理解", "价值流画板、功能重组表、现状判断"],
      ["阶段二", "数据采集与计划闭环", "全工序数据、24H 计划、拉动物流、replan"],
      ["阶段三", "AI 与数字孪生调整", "边缘模型、参数过滤、短周期重排、成本优化"],
    ]
  },
  {
    title: "建议的下一步工作",
    tool: "价值流画板",
    layout: "next",
    items: [
      "确认当前功能已落地、部分落地和未落地的边界。",
      "围绕全工序设备数据收集，定义停线、曲线、经验值和 replan 动作。",
      "梳理 24H 生产计划、CT、Performance Rate 和工序衔接关系。",
      "补充铸造后、机加后、装配前后的拉动式物流规则。",
      "把 AI 介入点放在阶段二能力形成之后再展开。"
    ]
  }
];
function drawThree(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 86 + i * 390;
    rect(slide, head, x, 180, 320, 54, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21, bold: true, align: "center" });
    rect(slide, body, x, 252, 320, 190, C.white, "#B9C9CF", { fontSize: 20 });
  });
  textBox(slide, "先建立理解，再讨论路径，最后讨论长期软件架构。", 190, 522, 900, 40, { fontSize: 22, color: C.mid, align: "center" });
}

function drawMapping(slide, data) {
  sectionLabel(slide, "原系统视角", 112, 144, 300, C.paleBlue);
  sectionLabel(slide, "业务能力视角", 790, 144, 330, C.paleGreen);
  data.left.forEach((v, i) => {
    const y = 208 + i * 72;
    rect(slide, v, 150, y, 220, 42, C.blue, C.blue, { fontSize: 20, bold: true, color: C.white, align: "center", typeface: FONT_EN });
    rect(slide, data.right[i], 790, y, 330, 42, C.white, C.green, { fontSize: 20, bold: true, align: "center" });
    line(slide, 390, y + 21, 380, 0, "#8DA5AE", 1.4);
  });
  textBox(slide, "这一步把系统清单转成经营和现场能讨论的业务语言。", 230, 594, 820, 34, { fontSize: 21, color: C.mid, align: "center" });
}

function drawChain(slide, data) {
  const xs = [50, 168, 286, 404, 522, 646, 770, 894, 1018, 1136];
  data.items.forEach((v, i) => {
    const y = i < 5 ? 184 : 360;
    const x = xs[i % 5];
    rect(slide, v, x, y, 104, 54, i === 0 || i === 9 ? C.paleGreen : C.white, i === 0 || i === 9 ? C.green : C.blue, { fontSize: 17, bold: true, align: "center" });
    if (i < 4) line(slide, x + 104, y + 27, 14, 0, C.line, 1.5);
    if (i > 5 && i < 10) line(slide, x - 14, y + 27, 14, 0, C.line, 1.5);
  });
  line(slide, 626, 211, 0, 176, C.line, 1.5);
  textBox(slide, "每个功能项都要落到过程节点，才能判断它服务的动作和管理意义。", 168, 535, 944, 42, { fontSize: 22, color: C.mid, align: "center" });
}

function drawTwoCol(slide, data) {
  rect(slide, data.leftTitle, 92, 146, 485, 48, C.paleBlue, C.blue, { fontSize: 21, bold: true, align: "center" });
  rect(slide, data.rightTitle, 704, 146, 485, 48, C.paleGreen, C.green, { fontSize: 21, bold: true, align: "center" });
  bullets(slide, data.leftItems, 110, 228, 430, 68, 19);
  bullets(slide, data.rightItems, 722, 228, 430, 68, 19);
}

function drawHub(slide, data) {
  const center = rect(slide, data.center, 535, 276, 210, 88, C.green, C.green, {
    fontSize: 27,
    bold: true,
    color: C.white,
    align: "center",
    typeface: FONT_EN,
  });
  const positions = [
    [132, 160], [420, 142], [750, 142], [1010, 160],
    [182, 450], [552, 500], [905, 450],
  ];
  data.items.forEach((v, i) => {
    const [x, y] = positions[i];
    const b = rect(slide, v, x, y, 160, 48, C.white, i % 2 ? C.green : C.blue, { fontSize: 18, bold: true, align: "center" });
    slide.shapes.connect(center, b, {
      kind: "straight",
      line: { style: "solid", fill: "#94A9B0", width: 1.1 },
    });
    center.bringToFront();
    b.bringToFront();
  });
  textBox(slide, data.bottom, 150, 606, 980, 38, { fontSize: 20, color: C.mid, align: "center" });
}

function drawFour(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 84 + (i % 2) * 580;
    const y = 158 + Math.floor(i / 2) * 210;
    rect(slide, head, x, y, 470, 48, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 21, bold: true, align: "center" });
    rect(slide, body, x, y + 62, 470, 92, C.white, "#B9C9CF", { fontSize: 20 });
  });
}

function drawFlow(slide, data) {
  const boxes = [];
  data.items.forEach((v, i) => {
    const x = 80 + i * 190;
    const b = rect(slide, v, x, 255, 140, 58, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 18, bold: true, align: "center" });
    boxes.push(b);
  });
  for (let i = 0; i < boxes.length - 1; i += 1) {
    slide.shapes.connect(boxes[i], boxes[i + 1], {
      kind: "straight",
      fromSide: "right",
      toSide: "left",
      line: { style: "solid", fill: "#8DA5AE", width: 1.5 },
      head: { type: "triangle", width: "sm", length: "sm" },
    });
  }
  textBox(slide, data.bottom, 168, 430, 944, 70, { fontSize: 22, color: C.mid, align: "center" });
}

function drawQuality(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 120 + i * 360;
    rect(slide, head, x, 185, 270, 50, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21, bold: true, align: "center" });
    rect(slide, body, x, 258, 270, 140, C.white, "#B9C9CF", { fontSize: 20 });
    if (i < 2) line(slide, x + 270, 327, 70, 0, C.line, 1.5);
  });
  textBox(slide, data.bottom, 150, 522, 980, 44, { fontSize: 22, color: C.mid, align: "center" });
}

function drawMatrix(slide, data) {
  const table = slide.tables.add({
    rows: data.rows.length,
    columns: 2,
    left: 140,
    top: 150,
    width: 1000,
    height: 370,
    columnTracks: [{ mode: "fr", value: 1 }, { mode: "fr", value: 2.3 }],
    values: data.rows,
  });
  table.borders.assign({ style: "solid", fill: "#B9C9CF", width: 1 });
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 2 }).assign({
    fill: C.paleGreen,
    textStyle: { typeface: FONT_CN, fontSize: 18, bold: true, color: C.dark },
  });
  table.cells.block({ row: 1, column: 0, rowCount: data.rows.length - 1, columnCount: 2 }).assign({
    fill: C.white,
    textStyle: { typeface: FONT_CN, fontSize: 17, color: C.dark },
  });
}

function drawTwins(slide, data) {
  rect(slide, "现场过程", 118, 180, 220, 74, C.paleBlue, C.blue, { fontSize: 22, bold: true, align: "center" });
  rect(slide, "数字投影", 530, 180, 220, 74, C.paleGreen, C.green, { fontSize: 22, bold: true, align: "center" });
  rect(slide, "管理判断", 942, 180, 220, 74, C.paleBlue, C.blue, { fontSize: 22, bold: true, align: "center" });
  line(slide, 338, 217, 192, 0, C.line, 1.5);
  line(slide, 750, 217, 192, 0, C.line, 1.5);
  data.items.forEach((v, i) => {
    const x = 174 + (i % 3) * 310;
    const y = 330 + Math.floor(i / 3) * 72;
    rect(slide, v, x, y, 210, 42, C.white, i % 2 ? C.green : C.blue, { fontSize: 18, bold: true, align: "center" });
  });
  textBox(slide, data.bottom, 150, 560, 980, 56, { fontSize: 21, color: C.mid, align: "center" });
}

function drawCost(slide, data) {
  data.items.forEach(([head, body], i) => {
    const y = 150 + i * 105;
    rect(slide, head, 125, y, 190, 52, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 20, bold: true, align: "center" });
    rect(slide, body, 348, y, 780, 52, C.white, "#B9C9CF", { fontSize: 20 });
  });
}

function drawAi(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 122 + i * 350;
    rect(slide, head, x, 174, 260, 50, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 22, bold: true, align: "center" });
    rect(slide, body, x, 250, 260, 130, C.white, "#B9C9CF", { fontSize: 19 });
  });
  textBox(slide, data.bottom, 170, 512, 940, 54, { fontSize: 22, color: C.mid, align: "center" });
}

function drawRoadmap(slide, data) {
  data.items.forEach(([phase, head, body], i) => {
    const x = 105 + i * 372;
    rect(slide, phase, x, 160, 275, 44, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 20, bold: true, align: "center" });
    rect(slide, head, x, 222, 275, 70, C.white, "#B9C9CF", { fontSize: 20, bold: true, align: "center" });
    rect(slide, body, x, 312, 275, 156, C.white, "#B9C9CF", { fontSize: 18 });
  });
}

function drawNext(slide, data) {
  bullets(slide, data.items, 170, 148, 900, 76, 20);
}

function drawSlide(data, index) {
  const slide = presentation.slides.add();
  header(slide, data.title, index + 1);
  switch (data.layout) {
    case "three": drawThree(slide, data); break;
    case "mapping": drawMapping(slide, data); break;
    case "chain": drawChain(slide, data); break;
    case "twoCol": drawTwoCol(slide, data); break;
    case "hub": drawHub(slide, data); break;
    case "four": drawFour(slide, data); break;
    case "flow": drawFlow(slide, data); break;
    case "quality": drawQuality(slide, data); break;
    case "matrix": drawMatrix(slide, data); break;
    case "twins": drawTwins(slide, data); break;
    case "cost": drawCost(slide, data); break;
    case "ai": drawAi(slide, data); break;
    case "roadmap": drawRoadmap(slide, data); break;
    case "next": drawNext(slide, data); break;
  }
  footer(slide, data.tool);
  addNotes(slide, data.note ?? "");
}

cover();
slides.forEach((data, i) => drawSlide(data, i + 1));

const candidatePath = path.join(stagingDir, "candidate_strategy_deck.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 23,
  requiredNativeTableOwnerSlides: [9, 11, 20],
  requiredNativeChartOwnerSlides: [],
};
const fontPolicy = {
  basis: "design",
  families: [FONT_EN, FONT_CN],
};

await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", expectedSlideSizeEmu,
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    "--require-native-table-slide", "9", "--require-native-table-slide", "11", "--require-native-table-slide", "20",
  ],
  requiredNativeTableOwnerSlides: [9, 11, 20],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, `${path.basename(FINAL_PPTX)}.validation.json`),
});

for (let i = 0; i < 23; i += 1) {
  const slide = presentation.slides.getItem(i);
  const png = await slide.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(previewDir, `strategy-slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await presentation.export({ format: "png", montage: true, scale: 0.35 });
await fs.writeFile(path.join(previewDir, "strategy-montage.png"), new Uint8Array(await montage.arrayBuffer()));

console.log(JSON.stringify({ finalPath: FINAL_PPTX, previewDir }, null, 2));
