#!/usr/bin/env python3
"""
PPT生成脚本 — ppt-from-markdown skill (v3)
统一风格：全篇暖色米白底色，中文衬线 + 英文/数字无衬线字体分类，字号系统化
"""
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree

# ── Palette ──────────────────────────────────────────────
BG     = RGBColor(0xF4, 0xEF, 0xEA)
DARK   = RGBColor(0x2C, 0x2C, 0x2C)
MUTED  = RGBColor(0x6B, 0x62, 0x58)
LIGHT  = RGBColor(0x8B, 0x7E, 0x74)
BORDER = RGBColor(0xD6, 0xCD, 0xC2)
WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
CARD   = RGBColor(0xEE, 0xE9, 0xE3)
GOLD   = RGBColor(0xC4, 0xA6, 0x6E)

# ── Font System ──────────────────────────────────────────
FONT_EN = 'Arial'     # 英文 & 数字 → 无衬线
FONT_ZH = 'SimSun'    # 中文         → 衬线（宋体，跨平台兼容）

# ── Typography Scale (pt) ────────────────────────────────
H1  = 38   # 封面主标题
H2  = 28   # 每页标题
H3  = 18   # 区域/卡片标题
H4  = 14   # 子标题 / 强调
BODY = 11  # 正文
SM  = 10   # 辅助文字
XS  = 9    # 页码 / 元数据

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height


def set_font(run, sz=BODY, c=DARK, bold=False):
    """统一应用到 run 的字体体系：拉丁 + 东亚分别设定"""
    run.font.size = Pt(sz)
    run.font.color.rgb = c
    run.font.bold = bold
    run.font.name = FONT_EN
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = etree.SubElement(rPr, qn('a:ea'))
    ea.set('typeface', FONT_ZH)


def bg(sl, c=BG):
    f = sl.background.fill; f.solid(); f.fore_color.rgb = c


def r(sl, l, t, w, h, fill=None):
    s = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    s.line.fill.background()
    if fill:
        s.fill.solid(); s.fill.fore_color.rgb = fill
    else:
        s.fill.background()
    return s


def tb(sl, l, t, w, h, text, sz=BODY, c=DARK, bold=False, align=PP_ALIGN.LEFT):
    """文本框（单段落），使用统一字体体系"""
    bx = sl.shapes.add_textbox(l, t, w, h)
    tf = bx.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text; p.alignment = align
    for run in p.runs:
        set_font(run, sz, c, bold)
    return bx


def slide_hdr(sl, title, sub=None):
    """页标题栏：深色短条 + 标题 + 可选副标题 + 分割线"""
    r(sl, Inches(0.8), Inches(0.55), Inches(2.0), Pt(1.5), fill=DARK)
    tb(sl, Inches(0.8), Inches(0.75), Inches(11), Inches(0.55),
       title, sz=H2, c=DARK, bold=True)
    if sub:
        tb(sl, Inches(0.8), Inches(1.25), Inches(11), Inches(0.35),
           sub, sz=SM, c=MUTED)
    r(sl, Inches(0.8), Inches(1.65), Inches(11.7), Pt(0.5), fill=BORDER)


def pn(sl, n, t):
    """页码"""
    tb(sl, SW - Inches(1.2), SH - Inches(0.45), Inches(1), Inches(0.3),
       f"{n} / {t}", sz=XS, c=LIGHT, align=PP_ALIGN.RIGHT)


def bot(sl):
    """底部装饰线"""
    r(sl, Inches(0.8), SH - Inches(0.15), Inches(11.7), Pt(1), fill=BORDER)


TOTAL = 8

# ════════════════════════════════════════════════════════════
# SLIDE 1 — 讲师简介
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)

# 顶部品牌
tb(sl, Inches(0.8), Inches(0.5), Inches(6), Inches(0.3),
   "供应链课程  —  2026 · 企业公开课", sz=XS, c=LIGHT)
r(sl, Inches(0.8), Inches(0.9), Inches(4.0), Pt(1), fill=DARK)

# 主标题
tb(sl, Inches(0.8), Inches(1.2), Inches(7.5), Inches(0.8),
   "讲师简介与课程体系", sz=H1, c=DARK, bold=True)

# 讲师姓名 + 标签
tb(sl, Inches(0.8), Inches(2.0), Inches(7.5), Inches(0.5),
   "李嘉俊", sz=H2, c=DARK)
tb(sl, Inches(0.8), Inches(2.5), Inches(7.5), Inches(0.4),
   "中欧供应链体系与管理专家  ·  VDA 6.8 审核专家", sz=SM, c=MUTED)

# 简介文字
tb(sl, Inches(0.8), Inches(3.05), Inches(7.5), Inches(0.7),
   "拥有超过20年大众汽车集团（奥迪/大众）供应链管理体系深度工作经验。\n"
   "兼具中国视野与欧洲供应链标准的双重背景。",
   sz=BODY, c=MUTED)

# 核心资历（4项）
creds = [
    "VDA 6.8 / VDA 6.3 双证审核员，大众集团与VDA双认证供应链审核员，"
    "对亚太区超过100家目标供应商进行供应链全过程准入审核",
    "上汽集团培训中心外聘讲师（2020-2022）",
    "奥迪中国供应链咨询业务从0到1搭建者",
    "QPNi 供应商成熟度管理：PPE中国项目核心成员，"
    "“生产过程与动作”数据转化专家",
]
y0 = Inches(3.8)
for i, cred in enumerate(creds):
    y = y0 + i * Inches(0.6)
    r(sl, Inches(0.8), y + Inches(0.12), Inches(0.06), Inches(0.06), fill=DARK)
    tb(sl, Inches(1.1), y, Inches(11), Inches(0.55),
       cred, sz=BODY, c=DARK)

# 照片占位（右侧）
px, py, pw, ph = Inches(8.6), Inches(1.2), Inches(3.8), Inches(4.8)
r(sl, px, py, pw, ph, fill=CARD)
r(sl, px, py, pw, ph, fill=None)
tb(sl, px, py + Inches(1.5), pw, Inches(0.5),
   "⧁", sz=44, c=BORDER, align=PP_ALIGN.CENTER)
tb(sl, px, py + Inches(2.1), pw, Inches(0.35),
   "请在此处插入照片", sz=SM, c=LIGHT, align=PP_ALIGN.CENTER)
tb(sl, px, py + Inches(2.45), pw, Inches(0.25),
   "建议 3:4 比例", sz=XS, c=LIGHT, align=PP_ALIGN.CENTER)

# 底部
r(sl, Inches(0.8), SH - Inches(0.8), Inches(11.7), Pt(0.5), fill=BORDER)
tb(sl, Inches(0.8), SH - Inches(0.65), Inches(6), Inches(0.3),
   "2026.05", sz=XS, c=LIGHT)
pn(sl, 1, TOTAL)


# ════════════════════════════════════════════════════════════
# SLIDE 2 — 课程体系总结（统一浅色背景）
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)

slide_hdr(sl, "课程体系总结")
bot(sl)
pn(sl, 2, TOTAL)

summary = [
    ("L1+L2", "供应链概念 + VDA 6.8体系 — 3天连贯课程，从建立全局观到掌握审核标准"),
    ("L3", "预审核与问题整改 — 培训+咨询混合模式，确保通过认证"),
    ("L4", "端到端降本实战 — 项目制运作，理论+实地诊断，输出可落地方案"),
]

for i, (lv, desc) in enumerate(summary):
    cy = Inches(2.2) + i * Inches(1.1)
    # 卡片背景
    r(sl, Inches(0.8), cy, Inches(11.7), Inches(0.9), fill=WHITE)
    # 左侧金色竖条
    r(sl, Inches(0.8), cy, Inches(0.08), Inches(0.9), fill=GOLD)
    # Level 标签
    r(sl, Inches(1.2), cy + Inches(0.2), Inches(1.2), Inches(0.5), fill=DARK)
    tb(sl, Inches(1.2), cy + Inches(0.23), Inches(1.2), Inches(0.44),
       lv, sz=H4, c=WHITE, bold=True, align=PP_ALIGN.CENTER)
    # 描述文字
    tb(sl, Inches(2.7), cy + Inches(0.2), Inches(9.3), Inches(0.5),
       desc, sz=H4, c=DARK)

# 底部金色横条
r(sl, Inches(0.8), Inches(5.6), Inches(11.7), Inches(0.6), fill=GOLD)
tb(sl, Inches(0.8), Inches(5.65), Inches(11.7), Inches(0.5),
   "从概念建立到实战落地  ·  一站式供应链能力提升方案",
   sz=H4, c=DARK, bold=True, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 3 — L1+L2：3天连贯课程
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)
slide_hdr(sl,
    "Level 1：供应链概念体系 + Level 2：VDA 6.8 供应链过程审核",
    "从概念建立到体系掌握 — 3天连贯课程")
bot(sl)
pn(sl, 3, TOTAL)

days = [
    ("Day 1", "供应链概念体系（通识）", [
        "供应链全局观：从订单接收到交付回收的全链路逻辑",
        "信息流与实物流的协同关系",
        "供应链绩效目标与职能定位",
        "案例讨论与课堂练习",
    ]),
    ("Day 2", "VDA 6.8 体系标准解读（上）", [
        "VDA 6.8 标准背景与框架结构",
        "供应链过程审核条款逐项拆解",
        "真实审核案例穿插讲解",
    ]),
    ("Day 3", "VDA 6.8 体系标准解读（下）", [
        "重点条款深度解析与常见不符合项",
        "审核技巧与应对策略",
        "模拟审核演练与答疑",
    ]),
]

dw = Inches(3.7)
dg = Inches(0.25)
dx = Inches(0.8)

for i, (day, title, items) in enumerate(days):
    cx = dx + i * (dw + dg)
    # 卡片背景
    r(sl, cx, Inches(2.1), dw, Inches(4.5), fill=WHITE)
    r(sl, cx, Inches(2.1), dw, Pt(3), fill=DARK)
    # Day 标签
    r(sl, cx + Inches(0.2), Inches(2.4), Inches(1.0), Inches(0.35), fill=CARD)
    tb(sl, cx + Inches(0.2), Inches(2.42), Inches(1.0), Inches(0.3),
       day, sz=H4, c=DARK, bold=True, align=PP_ALIGN.CENTER)
    # 标题
    tb(sl, cx + Inches(0.2), Inches(2.9), dw - Inches(0.4), Inches(0.5),
       title, sz=H4, c=DARK, bold=True)
    # 分割线
    r(sl, cx + Inches(0.2), Inches(3.45), Inches(0.6), Pt(1), fill=BORDER)
    # 条目
    for j, item in enumerate(items):
        tb(sl, cx + Inches(0.2), Inches(3.7) + j * Inches(0.55),
           dw - Inches(0.4), Inches(0.5),
           f"▸ {item}", sz=BODY, c=DARK)

# 底部提示
tb(sl, Inches(0.8), Inches(6.8), Inches(11.7), Inches(0.3),
   "建议时长：3天  |  1天 供应链概念体系 + 2天 VDA 6.8 体系标准核心内容",
   sz=SM, c=MUTED, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 4 — L3：预审核与问题整改
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)
slide_hdr(sl,
    "Level 3：VDA 6.8 供应链过程（预）审核与问题整改",
    "培训 + 咨询混合模式")
bot(sl)
pn(sl, 4, TOTAL)

# 目标学员
r(sl, Inches(0.8), Inches(2.0), Inches(5.8), Inches(2.0), fill=CARD)
tb(sl, Inches(1.0), Inches(2.1), Inches(5.4), Inches(0.3),
   "目标学员", sz=H4, c=DARK, bold=True)
for i, item in enumerate([
    "即将面临VDA 6.8审核的企业",
    "审核未通过需要整改的企业",
]):
    tb(sl, Inches(1.0), Inches(2.6) + i * Inches(0.5),
       Inches(5.4), Inches(0.4), f"▸ {item}", sz=BODY, c=DARK)

# 课程形式
r(sl, Inches(0.8), Inches(4.3), Inches(5.8), Inches(1.1), fill=CARD)
tb(sl, Inches(1.0), Inches(4.4), Inches(5.4), Inches(0.3),
   "课程形式", sz=H4, c=DARK, bold=True)
tb(sl, Inches(1.0), Inches(4.8), Inches(5.4), Inches(0.5),
   "▸ 现场预审核 → 输出问题清单 → 制定改善方案与行动计划",
   sz=BODY, c=DARK)

# 右侧：时长
r(sl, Inches(7.0), Inches(2.0), Inches(5.5), Inches(3.4), fill=WHITE)
r(sl, Inches(7.0), Inches(2.0), Inches(5.5), Pt(3), fill=DARK)
tb(sl, Inches(7.2), Inches(2.2), Inches(5.1), Inches(0.3),
   "建议时长：5天", sz=H4, c=DARK, bold=True)

sched = [
    ("3天", "现场审核"),
    ("1天", "问题整理输出与根因分析"),
    ("1天", "方案制定与汇报讨论"),
]
for i, (dur, desc) in enumerate(sched):
    sy = Inches(2.8) + i * Inches(0.7)
    r(sl, Inches(7.2), sy, Inches(1.0), Inches(0.45), fill=DARK)
    tb(sl, Inches(7.2), sy + Inches(0.05), Inches(1.0), Inches(0.35),
       dur, sz=SM, c=WHITE, bold=True, align=PP_ALIGN.CENTER)
    tb(sl, Inches(8.5), sy + Inches(0.05), Inches(3.5), Inches(0.35),
       desc, sz=BODY, c=DARK)


# ════════════════════════════════════════════════════════════
# SLIDE 5 — L4：端到端降本实战（项目制，更新内容）
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)
slide_hdr(sl,
    "Level 4：供应链端到端降本实战",
    "项目制 — 基于客户需求，理论 + 实地展开")
bot(sl)
pn(sl, 5, TOTAL)

# 目标企业&学员 —— 左列
r(sl, Inches(0.8), Inches(2.0), Inches(6.5), Inches(2.2), fill=WHITE)
r(sl, Inches(0.8), Inches(2.0), Inches(6.5), Pt(3), fill=GOLD)
tb(sl, Inches(1.0), Inches(2.15), Inches(6.1), Inches(0.3),
   "目标企业 & 学员", sz=H4, c=DARK, bold=True)

targets = [
    "企业产品的边际效益优化需求",
    "准备规模扩大化的企业",
    "供应链成本结构与制造过程优化需求",
    "过去几年销售额上涨但利润率不升反降的企业",
]
for i, t in enumerate(targets):
    tb(sl, Inches(1.0), Inches(2.6) + i * Inches(0.4),
       Inches(6.1), Inches(0.35), f"▸ {t}", sz=BODY, c=DARK)

# 课程形式 —— 左侧下方
r(sl, Inches(0.8), Inches(4.5), Inches(6.5), Inches(1.2), fill=CARD)
tb(sl, Inches(1.0), Inches(4.6), Inches(6.1), Inches(0.3),
   "课程形式", sz=H4, c=DARK, bold=True)
tb(sl, Inches(1.0), Inches(5.0), Inches(6.1), Inches(0.6),
   "区别于传统采购视角的压价降本，以运营视角的端到端降本为主线。\n"
   "基于企业实际需求定制，结合理论培训与现场实地诊断，输出可落地的降本方案。",
   sz=BODY, c=DARK)

# 右侧：时长 + 提示
r(sl, Inches(7.7), Inches(2.0), Inches(4.8), Inches(2.2), fill=DARK)
tb(sl, Inches(7.9), Inches(2.1), Inches(4.4), Inches(0.3),
   "课程时长", sz=SM, c=GOLD, bold=True)
tb(sl, Inches(7.9), Inches(2.5), Inches(4.4), Inches(0.8),
   "3 — 5 天\n（视项目范围而定）",
   sz=H2, c=WHITE, bold=False)

# 底部提示
tb(sl, Inches(7.9), Inches(3.6), Inches(4.4), Inches(0.4),
   "本课程以项目制运作，前期沟通需求后定制方案，\n适合已有VDA 6.8基础的企业",
   sz=SM, c=RGBColor(0xCC, 0xC5, 0xBC))


# ════════════════════════════════════════════════════════════
# SLIDE 6 — 课程组合建议
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)
slide_hdr(sl, "课程组合建议", "灵活组合 · 按需选择")
bot(sl)
pn(sl, 6, TOTAL)

combos = [
    ("基础包", "L1+L2\n供应链概念+VDA 6.8", "3天",
     "初次导入VDA 6.8\n体系的企业"),
    ("落地包", "L1+L2 + L3\n体系+预审核整改", "6-8天",
     "需要体系搭建并\n通过认证的企业"),
    ("进阶包", "L1+L2 + L4\n体系+端到端降本", "6-8天",
     "概念+体系+\n降本三合一"),
    ("完整包", "L1+L2+L3+L4\n全流程系统提升", "L3与L4须\n分阶段执行",
     "想系统提升供应链\n能力的企业"),
]

cw = Inches(2.8)
csx = Inches(0.8)

for i, (name, content, dur, scenario) in enumerate(combos):
    cx = csx + i * (cw + Inches(0.3))
    cy = Inches(2.1)

    r(sl, cx, cy, cw, Inches(4.5), fill=WHITE)
    r(sl, cx, cy, cw, Inches(0.06), fill=DARK)

    # 头部
    r(sl, cx, Inches(0.06) + cy, cw, Inches(0.7), fill=CARD)
    tb(sl, cx, cy + Inches(0.15), cw, Inches(0.5),
       name, sz=20, c=DARK, bold=True, align=PP_ALIGN.CENTER)

    # 内容
    tb(sl, cx + Inches(0.15), cy + Inches(0.9), cw - Inches(0.3), Inches(0.8),
       content, sz=BODY, c=DARK, bold=True, align=PP_ALIGN.CENTER)

    # 时长
    tb(sl, cx + Inches(0.15), cy + Inches(1.9), cw - Inches(0.3), Inches(0.5),
       f"⏱ {dur}", sz=SM, c=MUTED, align=PP_ALIGN.CENTER)

    # 分割线
    r(sl, cx + Inches(0.15), cy + Inches(2.5), Inches(0.5), Pt(1), fill=DARK)

    # 适用场景
    tb(sl, cx + Inches(0.15), cy + Inches(2.7), cw - Inches(0.3), Inches(0.9),
       f"适用场景：\n{scenario}", sz=SM, c=MUTED, align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 7 — 培训时间安排与课程定价
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)
slide_hdr(sl, "培训时间安排与课程定价")
bot(sl)
pn(sl, 7, TOTAL)

# 左侧：课程节奏
r(sl, Inches(0.8), Inches(2.0), Inches(5.8), Inches(2.5), fill=WHITE)
tb(sl, Inches(1.0), Inches(2.1), Inches(5.4), Inches(0.3),
   "单次课程节奏", sz=H4, c=DARK, bold=True)
sched_items = [
    "标准授课日：7小时/天（9:00-12:00 + 13:30-17:30）",
    "完整包建议分两阶段执行，间隔4周以上，给企业消化和实践时间",
]
for i, s in enumerate(sched_items):
    tb(sl, Inches(1.0), Inches(2.6) + i * Inches(0.5),
       Inches(5.4), Inches(0.4), f"▸ {s}", sz=BODY, c=DARK)

# 右侧：定价表
pricing = [
    ["课程", "费用（人民币）"],
    ["L1+L2  供应链概念+VDA 6.8", "40,000"],
    ["L3  预审核与整改方案制定",
     "60,000（审核+报告）\n/ 100,000（含整改方案）"],
    ["L4  端到端降本（项目制）",
     "30,000（元/天）\n或 15,000（元/天）+ 项目收益（%）提成"],
]

tx = Inches(7.0)
cw1 = Inches(3.0)
cw2 = Inches(2.8)
tb(sl, tx, Inches(2.1), Inches(5.5), Inches(0.3),
   "课程定价", sz=H4, c=DARK, bold=True)

for r_idx, row in enumerate(pricing):
    ry = Inches(2.5) + r_idx * Inches(0.9)
    bg_c = DARK if r_idx == 0 else (WHITE if r_idx % 2 == 0 else CARD)
    tc = WHITE if r_idx == 0 else DARK

    # 第1列
    r(sl, tx, ry, cw1, Inches(0.9), fill=bg_c)
    tb(sl, tx + Inches(0.08), ry + Inches(0.15), cw1 - Inches(0.16), Inches(0.6),
       row[0], sz=H4 if r_idx == 0 else BODY, c=tc, bold=(r_idx == 0))

    # 第2列
    cx2 = tx + cw1
    r(sl, cx2, ry, cw2, Inches(0.9), fill=bg_c)
    tb(sl, cx2 + Inches(0.08), ry + Inches(0.12), cw2 - Inches(0.16), Inches(0.66),
       row[1], sz=BODY if r_idx > 0 else H4, c=tc, bold=(r_idx == 0),
       align=PP_ALIGN.CENTER)


# ════════════════════════════════════════════════════════════
# SLIDE 8 — 感谢页
# ════════════════════════════════════════════════════════════
sl = prs.slides.add_slide(prs.slide_layouts[6])
bg(sl, BG)

# 顶部装饰
r(sl, Inches(0.8), Inches(0.5), Inches(2.0), Pt(1.5), fill=DARK)

# 主文字
tb(sl, Inches(0.8), Inches(2.5), Inches(11), Inches(0.7),
   "感谢聆听", sz=46, c=DARK, bold=True)
tb(sl, Inches(0.8), Inches(3.4), Inches(11), Inches(0.5),
   "李嘉俊  ·  中欧供应链体系与管理专家", sz=H3, c=MUTED)
r(sl, Inches(0.8), Inches(4.0), Inches(3.0), Pt(1), fill=DARK)

# 底部
r(sl, Inches(0.8), SH - Inches(0.7), Inches(11.7), Pt(0.5), fill=BORDER)
tb(sl, Inches(0.8), SH - Inches(0.55), Inches(11), Inches(0.3),
   "欢迎联系  ·  期待与您的企业深入合作", sz=SM, c=LIGHT)
pn(sl, 8, TOTAL)


# ── Save ────────────────────────────────────────────────
if __name__ == "__main__":
    out = sys.argv[2] if len(sys.argv) > 2 else "output.pptx"
    prs.save(out)
    print(f"Done: {out}")
