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
const FINAL_PPTX = path.join(outputDir, "业务理解与系统建设路径_去品牌草稿_v1.pptx");
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
  textBox(slide, "围绕业务过程、Planning 能力与最终软件架构的汇报草稿", 240, 330, 800, 36, {
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
    title: "本次汇报要回答的问题",
    tool: "",
    layout: "three",
    items: [
      ["业务理解", "展示的功能架构包含已有能力和未来预期，需要先转译成真实业务内容。"],
      ["实现路径", "基于当前功能落地状态，判断二阶段功能的意义、目标和叠加顺序。"],
      ["最终架构", "展望功能覆盖、数字投影、成本优化和 AI 引入后的软件形态。"],
    ],
    note: "本页用于对齐董事长真正关心的问题。"
  },
  {
    title: "从系统模块到业务能力",
    tool: "业务过程与功能重组工作台",
    layout: "mapping",
    left: ["WMS", "MES", "QMS", "TPM", "IoT"],
    right: ["实物／物料流管理", "生产计划管理", "生产过程与工艺管理", "QM 相关界面输出", "设备数据采集"],
    note: "现场可打开工作台，展示功能项从系统模块重组为业务能力的过程。"
  },
  {
    title: "价值流视角",
    tool: "价值流画板",
    layout: "chain",
    items: ["供应商", "收货", "入库检", "仓库", "材料出库", "生产工序", "成品检验", "成品入库", "成品出库", "客户"],
    note: "现场打开价值流画板，展示 F 项如何落到过程节点。"
  },
  {
    title: "当前系统能力判断",
    tool: "业务过程与功能重组工作台",
    layout: "twoCol",
    leftTitle: "已经具备一定基础",
    leftItems: ["仓储、库存、出入库、FIFO 等功能具备基础框架。", "生产执行、报工、防错和追溯已有功能入口。", "检验、质量标准、不合格品处理已有明确功能项。"],
    rightTitle: "需要重新定义重心",
    rightItems: ["当前功能更偏记录和局部管控。", "计划能力弱，导致信息流缺少统一牵引。", "设备数据采集需要回到采集目的和后续动作。"],
    note: "本页用于从理解过渡到问题判断。"
  },
  {
    title: "Planning 是信息流的源头能力",
    tool: "价值流画板",
    layout: "hub",
    center: "Planning",
    items: ["订单与交期", "物料齐套", "产能负荷", "设备状态", "工序节拍", "质量要求", "异常反馈"],
    bottom: "当前 Planning 能力弱，会让系统被动记录已经发生的动作，而难以及时牵引现场。"
  },
  {
    title: "Planning 弱对实物流的影响",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "信息流问题",
    leftItems: ["订单、物料、产能、设备和质量要求之间缺少同一套判断。", "现场异常无法及时回到计划层重新安排。", "设备数据没有计划背景，难以判断对产出的影响。"],
    rightTitle: "实物流后果",
    rightItems: ["物料齐套状态不清晰，发料节奏容易脱节。", "WIP 状态难以及时掌握，现场库存和系统库存出现偏差。", "退料、替代料、临期料缺少前置判断。"],
    note: "本页是后续解决方案的关键问题页。"
  },
  {
    title: "下一阶段建设目标",
    tool: "",
    layout: "four",
    items: [
      ["计划牵引", "让计划成为业务启动和异常反馈的入口。"],
      ["物料闭环", "让收货、库存、发料、WIP 和出库围绕计划联动。"],
      ["质量过程化", "让质量要求进入工序、参数、检验和放行判断。"],
      ["数据目的化", "先定义动作，再决定设备数据采集范围。"],
    ]
  },
  {
    title: "叠加路径一：Planning 主线",
    tool: "DEMO2 场地规划软件",
    layout: "flow",
    items: ["订单需求", "能力校验", "计划分解", "现场执行", "异常反馈", "计划调整"],
    bottom: "Planning 需要连接交期、物料、产能、设备和质量要求。后续它会成为成本展开的入口。"
  },
  {
    title: "叠加路径二：物料流掌控",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "从库存记录",
    leftItems: ["账物一致", "出入库记录", "库存盘点", "报表输出"],
    rightTitle: "到过程掌控",
    rightItems: ["齐套判断", "按单发料", "退料闭环", "WIP 可视化", "临期与替代料风险预警"],
    note: "本页建议配合价值流画板点选仓库、发料、WIP 和成品库节点。"
  },
  {
    title: "叠加路径三：质量过程化",
    tool: "业务过程与功能重组工作台",
    layout: "quality",
    items: [
      ["质量要求", "检验标准、参数边界、放行规则"],
      ["过程动作", "来料、工序、设备参数、工艺执行、成品检验"],
      ["界面输出", "QM 状态展示、异常提示、SPC 控制图"],
    ],
    bottom: "质量功能的重点放在标定和输出，真正的管理动作由过程承担。"
  },
  {
    title: "叠加路径四：设备数据目的化",
    tool: "DEMO2 场地规划软件",
    layout: "matrix",
    rows: [
      ["采集目的", "后续动作"],
      ["设备状态", "判断设备是否支持计划继续执行"],
      ["参数变化", "触发工艺防呆和质量风险提示"],
      ["故障趋势", "安排维护窗口，减少计划扰动"],
      ["节拍与产能", "支持计划模拟和成本分析"],
    ],
    note: "本页强调数据采集不是越多越好。"
  },
  {
    title: "最终架构一：Digital Twins 与数据投影",
    tool: "价值流画板，DEMO2 场地规划软件",
    layout: "twins",
    items: ["订单状态", "物料状态", "设备状态", "工序状态", "质量状态", "计划偏差"],
    bottom: "数字孪生的核心作用，是把现场状态投影成管理层和现场都能使用的同一套事实。"
  },
  {
    title: "最终架构二：Planning 定义成本展开",
    tool: "",
    layout: "cost",
    items: [
      ["计划变化", "改变物料准备、库存占用和发料节奏。"],
      ["能力约束", "改变设备利用率、等待时间和维护窗口。"],
      ["质量风险", "改变返工、报废、检验和交付风险。"],
      ["成本输出", "让每一次计划调整对应可解释的成本变化。"],
    ]
  },
  {
    title: "最终架构三：AI 的引入方式",
    tool: "",
    layout: "ai",
    items: [
      ["初期", "查询助手、报表解释、异常摘要。"],
      ["中期", "风险识别、计划冲突提示、质量波动分析。"],
      ["后期", "结合数字投影和 Planning，生成模拟、预测和优化建议。"],
    ],
    bottom: "AI 应嵌入计划、质量、设备、工艺和成本管理场景。"
  },
  {
    title: "阶段性建设路线图",
    tool: "",
    layout: "roadmap",
    items: [
      ["阶段一", "功能梳理与业务落位", "价值流画板、功能重组表、现状判断"],
      ["阶段二", "围绕 Planning 建立过程闭环", "计划牵引、物料联动、质量过程化、设备数据目的化"],
      ["阶段三", "数字投影与经营优化", "数字孪生、成本模型、AI 辅助决策"],
    ]
  },
  {
    title: "建议的下一步工作",
    tool: "价值流画板",
    layout: "next",
    items: [
      "确认当前功能已落地、部分落地和未落地的边界。",
      "围绕 Planning 梳理订单、物料、产能、设备和质量之间的关系。",
      "用价值流画板持续补充过程节点和功能落位。",
      "用 DEMO2 展开场地、设备、动线和产能之间的关系。",
      "把二阶段建设拆成可验证的能力包和交付顺序。"
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
  explicitTotalSlideCount: 17,
  requiredNativeTableOwnerSlides: [12],
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
    "--require-native-table-slide", "12",
  ],
  requiredNativeTableOwnerSlides: [12],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, `${path.basename(FINAL_PPTX)}.validation.json`),
});

for (let i = 0; i < 17; i += 1) {
  const slide = presentation.slides.getItem(i);
  const png = await slide.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(previewDir, `strategy-slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await presentation.export({ format: "png", montage: true, scale: 0.35 });
await fs.writeFile(path.join(previewDir, "strategy-montage.png"), new Uint8Array(await montage.arrayBuffer()));

console.log(JSON.stringify({ finalPath: FINAL_PPTX, previewDir }, null, 2));
