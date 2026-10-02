import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { FileBlob, Presentation, PresentationFile } from "@oai/artifact-tool";

const SKILL_DIR = "/Users/lijiajun/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const workspaceDir = "/Users/lijiajun/Documents/GitHub/python-document/浙江海威";
const sourceTemplatePath = path.join(workspaceDir, "海威集团信息系统方案说明260617.pptx");
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
const previewDir = path.join(workspaceDir, ".codex-ppt-preview");
const outputDir = path.join(workspaceDir, "PPT输出");
const FINAL_PPTX = path.join(outputDir, "业务理解与系统建设路径_去品牌草稿_v12_Planning参数校准版.pptx");
const expectedSlideSizeEmu = "12192000,6858000";
const runtimePython = "/Users/lijiajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const sourceHash = crypto
  .createHash("sha256")
  .update(await fs.readFile(sourceTemplatePath))
  .digest("hex");
const insertedSourceDeckPath = path.join(outputDir, "业务理解与系统建设路径_去品牌草稿_v3_讲述版_修订.pptx");
const insertedSourceDeck = await PresentationFile.importPptx(await FileBlob.load(insertedSourceDeckPath));
const insertedOriginalSlide = insertedSourceDeck.slides.getItem(2);
const insertedOriginalSlidePng = new Uint8Array(await (await insertedOriginalSlide.export({ format: "png", scale: 2 })).arrayBuffer());

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
const TOOL_LINKS = {
  "业务过程与功能重组工作台": pathToFileURL(path.join(workspaceDir, "海威信息系统_业务过程重组工作台.html")).href,
  "价值流画板": pathToFileURL(path.join(workspaceDir, "海威价值流_功能标注画板.html")).href,
  "Planning 参数校准工具": pathToFileURL("/Users/lijiajun/Documents/GitHub/python-document/capa. calculation/排产模型/formal.html").href,
};

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
    fontSize: style.fontSize ?? 14,
    bold: style.bold ?? false,
    color: style.color ?? C.dark,
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
    fontSize: style.fontSize ?? 14,
    bold: style.bold ?? false,
    color: style.color ?? C.dark,
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
  textBox(slide, title, 58, 36, 880, 56, { fontSize: 26.6667, bold: true, color: C.dark });
  line(slide, 58, 96, 1110, 0, "#D3DEE2", 1.1);
  textBox(slide, String(pageNo).padStart(2, "0"), 1178, 42, 44, 28, {
    fontSize: 18.6667,
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
    const footerBox = textBox(slide, `现场穿插：${tool}`, 58, 650, 650, 24, { fontSize: 18.6667, color: C.mid });
    const uri = TOOL_LINKS[tool];
    if (uri) {
      const range = footerBox.text.get(`现场穿插：${tool}`);
      range.link = { uri, isExternal: true };
      range.underline = "sng";
      range.fill = C.mid;
    }
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
    fontSize: 21.3333,
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
    fontSize: 26.6667,
    bold: true,
    color: C.dark,
    align: "center",
  });
  textBox(slide, "客户要求、运营能力与系统建设路径", 240, 330, 800, 36, {
    fontSize: 18.6667,
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
    title: "汇报切入点",
    tool: "",
    layout: "three",
    items: [
      ["原系统/软件规划路径解读", "宁波海威与浙江海威已有两阶段系统规划，浙江海威因 CATL强化要求进一步补强。"],
      ["运营能力剖析", "客户关注的不是系统名称，而是稳定交付、过程可控和质量可证明。"],
      ["系统建设路径", "系统工具要回应当前运作问题，并强化计划、物料、质量和设备数据能力。"],
    ],
    bottom: "客户要求是入口，运营能力是主题，系统功能是手段。"
  },
  {
    title: "原系统/软件规划路径来源页",
    tool: "保留原系统/软件规划路径来源页，不删除",
    layout: "originalSlide",
    note: "用户手动加入的原系统/软件规划路径来源页，作为后续解读来源。"
  },
  {
    title: "原系统/软件规划路径的重新理解",
    tool: "",
    layout: "twoCol",
    leftTitle: "原有系统建设思路",
    leftItems: ["一阶段系统规划（宁波海威+浙江海威）偏 WMS/MES，解决库存、出入库、生产执行和基础追溯。", "二阶段系统规划（宁波海威+浙江海威）本来就计划补强 QMS、TPM、IoT 等能力。", "原系统/软件规划路径不是从无到有，而是宁波海威与浙江海威共同的一阶段/二阶段系统规划；CATL强化要求（浙江海威）是在浙江海威（嵊州）面向主要客户 CATL 的运营能力补强。"],
    rightTitle: "CATL强化要求（浙江海威）带来的变化",
    rightItems: ["CATL强化要求（浙江海威）把功能清单推向过程控制要求。", "强化项更关注批次、参数、权限、点检、SPC 和全工序数据。", "系统建设从功能补充，转向浙江海威（嵊州）的运营能力证明。"],
    note: "这里解释 CATL强化要求（浙江海威）的由来：主要客户关心供应商过程是否稳定、可控、可追溯。"
  },
  {
    title: "客户关注的是运营能力",
    tool: "",
    layout: "four",
    items: [
      ["稳定交付", "计划能否牵引物料、工序和设备，交期偏差能否及时反馈。"],
      ["过程可控", "人员、参数、程序、工装夹具和检测动作是否被过程约束。"],
      ["质量可证明", "质量不是只有检验记录，还要有标准、曲线、SPC 和异常闭环证据。"],
      ["异常可闭环", "异常出现后，系统能否触发停线、确认、replan 或客户要求的处理动作。"],
    ]
  },
  {
    title: "功能从系统模块转向业务能力",
    tool: "业务过程与功能重组工作台",
    layout: "mapping",
    left: ["WMS / MES / TPM", "WMS / MES / TPM", "WMS / MES / TPM", "QMS", "IoT"],
    right: ["实物／物料流管理", "生产计划管理", "生产过程与工艺管理", "QM 相关界面输出", "设备数据采集"],
    note: "这不是模块替换，而是把客户要求重新归入业务能力。"
  },
  {
    title: "功能落到价值流后才有意义",
    tool: "价值流画板",
    layout: "chain",
    items: ["供应商", "收货", "入库检", "仓库", "材料出库", "生产工序", "WIP", "成品检验", "成品出库", "客户"],
    note: "进入价值流后才能看清功能发生在哪、解决什么问题、输出什么证据。"
  },
  {
    title: "价值流中的三类状态",
    tool: "价值流画板",
    layout: "three",
    items: [
      ["已有基础", "库存、出入库、FIFO、派工、报工、追溯和检验入口，更多解决记录和基础管控。"],
      ["二阶段系统规划", "QMS、TPM、IoT 等方向，边界在于是否能进入过程动作并形成反馈。"],
      ["CATL强化要求（浙江海威）", "权限、点检、参数、防错、SPC、设备数据和全工序控制继续加深。"],
    ],
    bottom: "同一个价值流节点上，可能同时存在已有能力、二阶段系统规划和 CATL强化要求（浙江海威）。"
  },
  {
    title: "当前基础与二期边界",
    tool: "业务过程与功能重组工作台",
    layout: "twoCol",
    leftTitle: "已有基础如何现场加强",
    leftItems: ["把记录型功能转成现场动作入口。", "让库存、发料、报工、检验与计划偏差建立关联。", "补齐跨工序 WIP 水位和后工序拉动前工序的判断。"],
    rightTitle: "二阶段系统规划的边界",
    rightItems: ["QMS 如果只做记录，很难承担过程控制。", "TPM/IoT 如果只采集设备状态，很难解释产出波动。", "二阶段系统规划能否承接 CATL强化要求（浙江海威），取决于 Planning、过程动作和数据反馈是否打通。"],
    note: "回答：CATL强化要求（浙江海威）是否能从二阶段系统规划中展开，以及当前条件是否足够。"
  },
  {
    title: "后续加强能否实现目的",
    tool: "",
    layout: "matrix",
    rows: [
      ["后续加强方向", "实现条件"],
      ["质量与异常闭环", "需要标准、阈值、责任、停线和恢复规则，不只是 QMS 表单"],
      ["设备与参数控制", "需要产品状态、工艺参数和设备参数之间形成可解释关系"],
      ["全工序数据采集", "需要先定义采集后的动作，再定义点位、频率和采集手段"],
      ["短周期计划调整", "需要小时级计划基准、CT、Performance Rate 和真实执行反馈"]
    ]
  },
  {
    title: "全工序数据的分类角度",
    tool: "价值流画板",
    layout: "hub",
    center: "全工序数据",
    items: ["设备状态", "质量指标", "技术参数", "产品状态", "生产进度", "节拍 CT", "Performance Rate"],
    bottom: "原系统/软件规划路径多次提到全工序数据。分类的目的，是区分哪些数据触发即时动作，哪些数据用于长期沉淀。"
  },
  {
    title: "数据采集意义的展开面向",
    tool: "价值流画板",
    layout: "three",
    items: [
      ["风险阻断", "设备状态或质量指标异常时，触发停线、确认、曲线跟踪和异常闭环。"],
      ["经验沉淀", "对照产品状态变化，沉淀有效技术参数，服务产品开发和工艺设定。"],
      ["进度调整", "跟踪工序衔接和 WIP 水位，触发短周期 replan，减少等待和堆积。"],
    ],
    bottom: "数据采集不是越多越好，而是要从后续动作反推范围和手段。"
  },
  {
    title: "数据的价值收益方向",
    tool: "",
    layout: "matrix",
    rows: [
      ["价值方向", "收益逻辑"],
      ["减少质量损失", "通过异常阻断和质量曲线，减少报废和问题流入后序"],
      ["积累工艺经验", "用技术参数和产品状态对照，形成可复用的经验值"],
      ["减少波动浪费", "通过进度跟踪和 replan，减少等待、堆积和断流"],
      ["支撑客户证明", "用过程证据回应 CATL强化要求（浙江海威）对稳定性、追溯和闭环的要求"]
    ]
  },
  {
    title: "Planning 是后续重点",
    tool: "Planning 参数校准工具",
    layout: "flow",
    items: ["ERP 1D 计划", "参数校准", "小时级基准", "现场数据", "偏差判断", "短周期 Replan", "物料拉动", "执行反馈"],
    bottom: "小时级计划基准不是把 ERP 日计划简单拆细，而是先把 CT、SA、setup、planned stop 与 R&R 观察校准成 Planning 可用约束。"
  },
  {
    title: "不同工艺过程的拉动方式",
    tool: "价值流画板",
    layout: "twoCol",
    leftTitle: "工单驱动适用场景",
    leftItems: ["工单可以驱动料单和发料动作。", "铝锭等原材料发至铸造产线，可以由工单牵引。", "计划仍负责材料需求和产能边界。"],
    rightTitle: "拉动式物流适用场景",
    rightItems: ["铸造完成品到后续工序。", "机加到装配。", "排产基于库存水位展开，真实物料移动由后工序消耗节奏触发。"],
    note: "结合成本展开：不同拉动方式会影响库存占用、等待时间、换线和异常调整成本。"
  },
  {
    title: "成本向展开",
    tool: "",
    layout: "cost",
    items: [
      ["库存成本", "跨工序 WIP 水位不清，会带来过量库存、缺料等待和账实偏差。"],
      ["波动成本", "计划弱和反馈慢，会造成等待、堆积、断流和局部加急。"],
      ["质量成本", "异常阻断不及时，导致报废、返工和客户证据不足。"],
      ["数据成本", "未定义动作的数据采集，会增加点位、存储、解释和维护成本。"],
    ]
  },
  {
    title: "AI 的初步落地方案",
    tool: "",
    layout: "ai",
    items: [
      ["边缘模型", "在状态异常和质量指标偏离时，辅助判断停线、降速、参数切换，并过滤非必要参数。"],
      ["服务器模型", "基于小时级计划基准、跨工序状态和 WIP 水位，生成短周期 replan 建议。"],
      ["协同边界", "边缘模型快速处理当前覆盖范围，服务器模型处理全局计划重排和跨工序取舍。"],
    ],
    bottom: "边缘 AI 解决现场快速响应与参数过滤；计划重排更适合由服务器侧模型结合全局约束来判断。"
  },
  {
    title: "阶段路线与下一步",
    tool: "价值流画板",
    layout: "roadmap",
    items: [
      ["阶段一", "重新解读原系统/软件规划路径", "识别客户要求、业务问题、能力短板和价值流位置"],
      ["阶段二", "数据采集与计划闭环", "参数校准、小时级计划基准、拉动物流、replan"],
      ["阶段三", "AI 与数字孪生调整", "边缘模型、参数过滤、短周期重排、成本优化"],
    ]
  }
];

function drawOriginalSlide(slide) {
  slide.background.fill = C.white;
  slide.images.add({
    blob: insertedOriginalSlidePng,
    contentType: "image/png",
    alt: "原系统/软件规划路径来源页",
    fit: "contain",
    position: { left: 0, top: 0, width: W, height: H },
  });
}

function drawThree(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 86 + i * 390;
    rect(slide, head, x, 180, 320, 54, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, x, 252, 320, 190, C.white, "#B9C9CF", { fontSize: 18.6667 });
  });
  textBox(slide, data.bottom ?? "先建立理解，再讨论路径，最后讨论长期软件架构。", 190, 522, 900, 40, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawMapping(slide, data) {
  sectionLabel(slide, "原系统语言来源", 112, 144, 300, C.paleBlue);
  sectionLabel(slide, "重组后的业务能力", 790, 144, 330, C.paleGreen);
  data.left.forEach((v, i) => {
    const y = 208 + i * 72;
    rect(slide, v, 150, y, 220, 42, C.blue, C.blue, { fontSize: 21.3333, bold: true, color: C.white, align: "center", typeface: FONT_EN });
    rect(slide, data.right[i], 790, y, 330, 42, C.white, C.green, { fontSize: 21.3333, bold: true, align: "center" });
    line(slide, 390, y + 21, 380, 0, "#8DA5AE", 1.4);
  });
  textBox(slide, "这一步把系统清单转成经营和现场能讨论的业务语言。", 230, 594, 820, 34, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawChain(slide, data) {
  const xs = [50, 168, 286, 404, 522, 646, 770, 894, 1018, 1136];
  data.items.forEach((v, i) => {
    const y = i < 5 ? 184 : 360;
    const x = xs[i % 5];
    rect(slide, v, x, y, 104, 54, i === 0 || i === 9 ? C.paleGreen : C.white, i === 0 || i === 9 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    if (i < 4) line(slide, x + 104, y + 27, 14, 0, C.line, 1.5);
    if (i > 5 && i < 10) line(slide, x - 14, y + 27, 14, 0, C.line, 1.5);
  });
  line(slide, 626, 211, 0, 176, C.line, 1.5);
  textBox(slide, "每个功能项都要落到过程节点，才能判断它服务的动作和管理意义。", 168, 535, 944, 42, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawTwoCol(slide, data) {
  rect(slide, data.leftTitle, 92, 146, 485, 48, C.paleBlue, C.blue, { fontSize: 21.3333, bold: true, align: "center" });
  rect(slide, data.rightTitle, 704, 146, 485, 48, C.paleGreen, C.green, { fontSize: 21.3333, bold: true, align: "center" });
  bullets(slide, data.leftItems, 110, 228, 430, 68, 18.6667);
  bullets(slide, data.rightItems, 722, 228, 430, 68, 18.6667);
}

function drawHub(slide, data) {
  const center = rect(slide, data.center, 535, 276, 210, 88, C.green, C.green, {
    fontSize: 21.3333,
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
    const b = rect(slide, v, x, y, 160, 48, C.white, i % 2 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    slide.shapes.connect(center, b, {
      kind: "straight",
      line: { style: "solid", fill: "#94A9B0", width: 1.1 },
    });
    center.bringToFront();
    b.bringToFront();
  });
  textBox(slide, data.bottom, 150, 606, 980, 38, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawFour(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 84 + (i % 2) * 580;
    const y = 158 + Math.floor(i / 2) * 210;
    rect(slide, head, x, y, 470, 48, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, x, y + 62, 470, 92, C.white, "#B9C9CF", { fontSize: 18.6667 });
  });
}

function drawFlow(slide, data) {
  const boxes = [];
  data.items.forEach((v, i) => {
    const x = 42 + i * 150;
    const b = rect(slide, v, x, 255, 118, 58, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
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
  textBox(slide, data.bottom, 168, 430, 944, 70, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawQuality(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 120 + i * 360;
    rect(slide, head, x, 185, 270, 50, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, x, 258, 270, 140, C.white, "#B9C9CF", { fontSize: 18.6667 });
    if (i < 2) line(slide, x + 270, 327, 70, 0, C.line, 1.5);
  });
  textBox(slide, data.bottom, 150, 522, 980, 44, { fontSize: 18.6667, color: C.mid, align: "center" });
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
    textStyle: { typeface: FONT_CN, fontSize: 21.3333, bold: true, color: C.dark },
  });
  table.cells.block({ row: 1, column: 0, rowCount: data.rows.length - 1, columnCount: 2 }).assign({
    fill: C.white,
    textStyle: { typeface: FONT_CN, fontSize: 18.6667, color: C.dark },
  });
}

function drawTwins(slide, data) {
  rect(slide, "现场过程", 118, 180, 220, 74, C.paleBlue, C.blue, { fontSize: 21.3333, bold: true, align: "center" });
  rect(slide, "数字投影", 530, 180, 220, 74, C.paleGreen, C.green, { fontSize: 21.3333, bold: true, align: "center" });
  rect(slide, "管理判断", 942, 180, 220, 74, C.paleBlue, C.blue, { fontSize: 21.3333, bold: true, align: "center" });
  line(slide, 338, 217, 192, 0, C.line, 1.5);
  line(slide, 750, 217, 192, 0, C.line, 1.5);
  data.items.forEach((v, i) => {
    const x = 174 + (i % 3) * 310;
    const y = 330 + Math.floor(i / 3) * 72;
    rect(slide, v, x, y, 210, 42, C.white, i % 2 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
  });
  textBox(slide, data.bottom, 150, 560, 980, 56, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawCost(slide, data) {
  data.items.forEach(([head, body], i) => {
    const y = 150 + i * 105;
    rect(slide, head, 125, y, 190, 52, i % 2 ? C.paleGreen : C.paleBlue, i % 2 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, 348, y, 780, 52, C.white, "#B9C9CF", { fontSize: 18.6667 });
  });
}

function drawAi(slide, data) {
  data.items.forEach(([head, body], i) => {
    const x = 122 + i * 350;
    rect(slide, head, x, 174, 260, 50, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, x, 250, 260, 130, C.white, "#B9C9CF", { fontSize: 18.6667 });
  });
  textBox(slide, data.bottom, 170, 512, 940, 54, { fontSize: 18.6667, color: C.mid, align: "center" });
}

function drawRoadmap(slide, data) {
  data.items.forEach(([phase, head, body], i) => {
    const x = 105 + i * 372;
    rect(slide, phase, x, 160, 275, 44, i === 1 ? C.paleGreen : C.paleBlue, i === 1 ? C.green : C.blue, { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, head, x, 222, 275, 70, C.white, "#B9C9CF", { fontSize: 21.3333, bold: true, align: "center" });
    rect(slide, body, x, 312, 275, 156, C.white, "#B9C9CF", { fontSize: 18.6667 });
  });
}

function drawNext(slide, data) {
  bullets(slide, data.items, 170, 148, 900, 76, 18.6667);
}

function drawSlide(data, index) {
  const slide = presentation.slides.add();
  header(slide, data.title, index + 1);
  switch (data.layout) {
    case "originalSlide": drawOriginalSlide(slide); break;
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
  explicitTotalSlideCount: 18,
  requiredNativeTableOwnerSlides: [10, 13],
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
    "--require-native-table-slide", "10", "--require-native-table-slide", "13",
  ],
  requiredNativeTableOwnerSlides: [10, 13],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, `${path.basename(FINAL_PPTX)}.validation.json`),
});

for (let i = 0; i < 18; i += 1) {
  const slide = presentation.slides.getItem(i);
  const png = await slide.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(previewDir, `strategy-slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await presentation.export({ format: "png", montage: true, scale: 0.35 });
await fs.writeFile(path.join(previewDir, "strategy-montage.png"), new Uint8Array(await montage.arrayBuffer()));

console.log(JSON.stringify({ finalPath: FINAL_PPTX, previewDir }, null, 2));
