#!/usr/bin/env python3
"""Build single-file handbook HTML from Markdown sources."""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / "handbook_template.html"
OUTPUT = ROOT / "讲师介绍与课程体系_翻页手册.html"

CONFIG = {
    "brand": "供应链课程",
    "event": "2026 · 企业公开课",
    "cover_title": "讲师简介与课程体系",
    "ai_badge": "AI 辅助构建 · 业务驱动交付",
    "ai_hint": "内容以业务 MD 为源，可快速迭代 — 拥抱 AI 实战工作流",
    "tagline": "从业务中来 · 到业务中去",
    "contact": "欢迎联系 · 期待与您的企业深入合作",
    "courses": [
        {
            "level": "L1",
            "tier": "核心层 · 人人需要",
            "name": "VDA6.8迎审实战",
            "subtitle": "把你的供应链业务投影到过程标准",
            "desc": "3天 · 从供应链通识到业务流拆解，一次性打通",
            "dark": True,
        },
        {
            "level": "L2",
            "tier": "进阶层（需体系基础）",
            "name": "VDA 6.8 预审核与问题整改",
            "desc": "咨询模式 · 现场预审核 + 整改方案，从审核发现到体系闭环",
        },
        {
            "level": "L3",
            "tier": "进阶层（需体系基础）",
            "name": "供应链端到端降本实战",
            "desc": "项目制 · 运营视角降本，非传统压价，从运营视角识别成本空间",
        },
    ],
    "paths": [
        ("A", "#8a9aa8", "传统条款路径：标准组织→逐条对标→考试拿证，学完回到企业不知从何下手"),
        ("B", "#c8a45c", "本课程路径：业务流拆解→对应条款→断点分析→反向改到位，学完直接落地"),
        ("C", "#0f1a2e", "融合路径：体系认证+业务优化并行推进，以业务健康度驱动审核通过"),
    ],
    "packages": [
        ("基础包", "核心课程 VDA6.8迎审实战", "3天", "初次导入体系"),
        ("落地包", "核心课程 + L2 预审核整改", "5-7天", "体系搭建+认证"),
        ("进阶包", "核心课程 + L3 端到端降本", "5-8天", "概念+体系+降本"),
        ("完整包", "核心课程 + L2 + L3", "分阶段", "系统全面提升"),
    ],
    "pricing": {
        "schedule": "标准授课日：7小时/天（9:00-12:00 + 13:30-17:30）",
        "l1": ("Level 1：VDA6.8迎审实战（3天）", "40,000"),
        "l2": ("Level 2：预审核与整改方案制定", [("不含整改方案", "60,000"), ("含整改方案", "100,000")]),
        "l3": ("Level 3：端到端降本（项目制）", "30,000/天", "或15,000/天+提成"),
    },
}


def read_md(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def md_inline(text: str) -> str:
    text = html.escape(text.strip())
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    return text


def parse_sections(text: str) -> dict[str, str]:
    parts = re.split(r"\n(?=## )", text.strip())
    sections: dict[str, str] = {}
    for part in parts:
        if not part.startswith("## "):
            continue
        first_line, _, body = part.partition("\n")
        title = first_line[3:].strip()
        sections[title] = body.strip()
    return sections


def parse_subsections(body: str) -> dict[str, str]:
    parts = re.split(r"\n(?=### )", body)
    subs: dict[str, str] = {}
    for part in parts:
        if not part.startswith("### "):
            if part.strip() and "_intro" not in subs:
                subs["_intro"] = part.strip()
            continue
        first_line, _, content = part.partition("\n")
        subs[first_line[4:].strip()] = content.strip()
    return subs


def parse_table_block(text: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        if re.match(r"^\|[\s\-:|]+\|$", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
    return rows


def render_table(rows: list[list[str]], widths: list[str] | None = None) -> str:
    if not rows:
        return ""
    head = rows[0]
    body = rows[1:]
    ths = []
    for i, cell in enumerate(head):
        w = f' style="width:{widths[i]}"' if widths and i < len(widths) else ""
        ths.append(f"<th{w}>{md_inline(cell)}</th>")
    trs = [f"<tr>{''.join(ths)}</tr>"]
    for row in body:
        tds = []
        for cell in row:
            tds.append(f"<td>{md_inline(cell)}</td>")
        trs.append(f"<tr>{''.join(tds)}</tr>")
    return f'<div class="tbl-wrap"><table>{"".join(trs)}</table></div>'


def extract_pain_points(section_body: str) -> list[tuple[str, str]]:
    subs = parse_subsections(section_body)
    points = []
    for title, body in subs.items():
        if not title.startswith("痛点"):
            continue
        label = re.sub(r"^痛点\s*[①②③④\d]+[：:]\s*", "", title)
        paras = []
        for p in re.split(r"\n\n+", body):
            ps = p.strip()
            if not ps or ps.startswith(">"):
                continue
            if ps.strip("-").strip() == "":
                continue
            if ps.strip() == "---":
                continue
            paras.append(ps)
        text = " ".join(paras)
        points.append((label, text))
    return points


def extract_cognition_gaps(section_body: str) -> list[tuple[str, str]]:
    subs = parse_subsections(section_body)
    gaps = []
    for title, body in subs.items():
        m = re.match(r"^[①②③④⑤⑥]\s*(.+)", title)
        if not m:
            continue
        label = m.group(1)
        lines = []
        for p in body.splitlines():
            ps = p.strip()
            if not ps or ps == "---":
                continue
            lines.append(ps)
        text = " ".join(lines).replace(" ---", "").rstrip("-").strip()
        gaps.append((label, text))
    return gaps


def extract_code_block(text: str, label: str | None = None) -> str:
    blocks = re.findall(r"```[^\n]*\n(.*?)```", text, re.S)
    if not blocks:
        return ""
    content = blocks[0 if label is None else 0].strip()
    if label:
        for block in blocks:
            if label in block.split("\n", 1)[0]:
                content = block.strip()
                break
    lines = [md_inline(l) for l in content.splitlines()]
    inner = "<br>".join(lines)
    return f'<div class="flow t-note">{inner}</div>'


def extract_modules(day_content: str) -> list[dict]:
    modules = []
    chunks = re.split(r"\n(?=\*\*模块[①②③④⑤⑥⑦])", day_content)
    for chunk in chunks:
        m = re.match(r"\*\*模块([①②③④⑤⑥⑦])[：:]\s*(.+?)\*\*", chunk)
        if not m:
            continue
        num, name = m.group(1), m.group(2).strip()
        biz = re.search(r"- 业务核心[：:]\s*(.+)", chunk)
        vda = re.search(r"- VDA 6\.8 评价视角[：:]\s*\n((?:  - .+\n?)+)", chunk)
        traction = re.search(r"- → 业务牵引[：:]\s*(.+)", chunk)
        reverse = re.search(r"- → 反向映射[：:]\s*(.+)", chunk)

        vda_items = []
        if vda:
            vda_items = [re.sub(r"^\s*-\s*", "", l).strip() for l in vda.group(1).splitlines() if l.strip()]

        modules.append({
            "num": num,
            "name": name,
            "biz": biz.group(1).strip() if biz else "",
            "vda": vda_items,
            "traction": traction.group(1).strip() if traction else "",
            "reverse": reverse.group(1).strip() if reverse else "",
        })
    return modules


def render_accordion(mod: dict) -> str:
    vda_html = ""
    if mod["vda"]:
        items = "".join(f"<li>{md_inline(i)}</li>" for i in mod["vda"])
        vda_html = f'<div class="oml">VDA 6.8 评价视角</div><ul>{items}</ul>'
    extra = ""
    if mod["traction"]:
        extra += f'<div class="oml">业务牵引</div><div class="omv">{md_inline(mod["traction"])}</div>'
    if mod["reverse"]:
        extra += f'<div class="oml">反向映射</div><div class="omv">{md_inline(mod["reverse"])}</div>'
    return f'''<div class="s omod">
  <div class="omh">模块{mod["num"]} {html.escape(mod["name"])}<span class="omo">+</span></div>
  <div class="omc"><div class="omci">
    <div class="oml">业务核心</div><div class="omv">{md_inline(mod["biz"])}</div>
    {vda_html}{extra}
  </div></div>
</div>'''


def render_pflow() -> str:
    nodes = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]
    parts = []
    for i, lb in enumerate(nodes):
        gold = ' style="background:#c8a45c"' if lb in ("L1", "L7") else ""
        lbc = ' style="color:#c8a45c"' if lb in ("L1", "L7") else ""
        parts.append(
            f'<div class="pfnode"><div class="pfdot"{gold}></div>'
            f'<div class="pflb"{lbc}>{lb}</div></div>'
        )
        if i < len(nodes) - 1:
            parts.append('<div class="pfarr"><div class="ln"></div><div class="hd"></div></div>')
    return f'<div class="s pflow">{"".join(parts)}</div>'


def page_wrap(idx: int, inner: str, extra_class: str = "") -> str:
    cls = f"page {extra_class}".strip()
    return f'<div class="{cls}" data-i="{idx}">\n{inner}\n</div>'


def render_cover(intro_md: str) -> str:
    tagline = CONFIG["tagline"]
    m = re.search(r">\s*(.+?)\s*——", intro_md)
    if m:
        tagline = m.group(1).strip().strip('"').replace("，", " · ").rstrip("。")
    name = "李嘉俊"
    subtitle = "大众集团供应链管理专家"
    cred = "VDA 6.8 / 6.3 双证审核员"
    for line in intro_md.splitlines():
        if "**李嘉俊**" in line:
            parts = line.split("|")
            if len(parts) >= 2:
                subtitle = parts[1].strip().replace("**", "")
            break
    return page_wrap(
        0,
        f"""  <div class="s brand">{CONFIG["brand"]}</div>
  <div class="s sub-brand">{CONFIG["event"]}</div>
  <div class="s ai-badge">{CONFIG["ai_badge"]}</div>
  <div class="s ai-hint">{CONFIG["ai_hint"]}</div>
  <div class="s title">{CONFIG["cover_title"]}</div>
  <div class="s divider"></div>
  <div class="s name">{name}</div>
  <div class="s subtitle">{subtitle}</div>
  <div class="s"><span class="t-note" style="opacity:.55">{cred}</span></div>
  <div class="s tagline">{tagline}</div>""",
        "cover",
    )


def render_intro(intro_md: str) -> str:
    sections = parse_sections(intro_md)
    body = sections.get("一、个人简介", "")
    subs = parse_subsections(body)
    name_line = ""
    title_line = ""
    bio = ""
    for line in body.splitlines():
        if "**李嘉俊**" in line and "|" in line:
            name_line = "李嘉俊"
            title_line = line.split("|", 1)[1].strip().replace("**", "")
        elif line.strip() and not line.startswith("#") and not line.startswith("**") and not line.startswith("1."):
            if "20年" in line or "大众" in line:
                bio = line.strip()

    cred_items = []
    in_list = False
    for line in body.splitlines():
        if re.match(r"^\d+\.\s", line):
            in_list = True
            cred_items.append(re.sub(r"^\d+\.\s*", "", line).strip())
        elif in_list and line.strip() and not line.startswith("#"):
            if re.match(r"^\d+\.", line):
                cred_items.append(re.sub(r"^\d+\.\s*", "", line).strip())

    cred_ol = "".join(f"<li>{md_inline(i)}</li>" for i in cred_items)

    course_cards = []
    for c in CONFIG["courses"]:
        if c.get("dark"):
            course_cards.append(f'''<div class="card dark" style="margin-bottom:2px">
  <div class="label" style="color:rgba(255,255,255,.6)">{c["tier"]}</div>
  <div class="value" style="color:#fff;margin:2px 0">{c["level"]}：{html.escape(c["name"])}<br>{html.escape(c.get("subtitle", ""))}</div>
  <p style="opacity:.7;margin-top:1px">{md_inline(c["desc"])}</p>
</div>''')
        else:
            course_cards.append(f'''<div class="card" style="margin-bottom:1px">
  <div class="label">{c["level"]} · {c["tier"]}</div>
  <div class="value t-body">{html.escape(c["name"])}</div>
  <p class="t-note" style="color:#6a7a8a;margin-top:1px">{md_inline(c["desc"])}</p>
</div>''')

    return page_wrap(
        1,
        f"""  <div class="cf">
  <h2 class="s">讲师简介与课程体系</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:1;gap:12px">
    <div class="s vf">
      <div>
        <p class="t-display" style="font-weight:700;color:#0f1a2e;margin-bottom:1px">{name_line}</p>
        <p class="tiny" style="margin-bottom:3px">{md_inline(title_line)}</p>
        <p class="t-body" style="margin-bottom:3px">{md_inline(bio)}</p>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="label">核心资历</div>
        <ol style="margin-top:1px" class="t-note">{cred_ol}</ol>
      </div>
    </div>
    <div class="s vf">
      {"".join(course_cards)}
      <p class="t-note" style="color:#8a9aa8;text-align:center;letter-spacing:1px">体系越扎实，进阶层收益越大</p>
    </div>
  </div>
</div>""",
    )


def render_painpoints_and_roles(l1: dict[str, str]) -> str:
    pains = extract_pain_points(l1.get("一、企业的四个真实痛点", ""))
    left = pains[:2]
    right = pains[2:]

    def pp_block(idx: int, title: str, text: str) -> str:
        sym = "①②③④"[idx] if idx < 4 else str(idx + 1)
        return f'<div class="s pp"><strong>{sym} {html.escape(title)}</strong><div class="pd">{md_inline(text)}</div></div>'

    sec2 = l1.get("二、企业主与受训者的立场差异", "")
    table_rows = parse_table_block(sec2)
    table_html = render_table(table_rows, ["18%", "41%", "41%"])

    contradiction = ""
    bridge = ""
    if "**矛盾点：**" in sec2:
        part = sec2.split("**矛盾点：**", 1)[1]
        if "**打通的方式：**" in part:
            contra_body, bridge_body = part.split("**打通的方式：**", 1)
            contradiction = " ".join(
                re.sub(r"^-\s*", "", l.strip())
                for l in contra_body.splitlines()
                if l.strip().startswith("-")
            )
            bridge = bridge_body.strip().split("\n\n")[0].strip()

    return page_wrap(
        2,
        f"""  <div class="cf">
  <h2 class="s">企业的四个真实痛点 · 角色矛盾与需求差异</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:6;min-height:0;gap:10px">
    <div>{"".join(pp_block(i, t, x) for i, (t, x) in enumerate(left))}</div>
    <div>{"".join(pp_block(i + 2, t, x) for i, (t, x) in enumerate(right))}</div>
  </div>
  <hr class="s sdiv">
  <div class="s two" style="flex:4;min-height:0;gap:10px">
    <div class="s vf">
      <h3>企业主与受训者的立场差异</h3>
      {table_html}
      <div class="card" style="padding:3px 6px;margin:1px 0">
        <div class="label">矛盾点</div>
        <p class="t-note">{md_inline(contradiction)}</p>
      </div>
      <div class="card gold" style="padding:3px 6px">
        <div class="label">打通方式</div>
        <p class="t-note">{md_inline(bridge)}</p>
      </div>
    </div>
    <div class="s vf">
      <h3>培训机构 / 课程常见交付形态</h3>
      <div class="card" style="padding:6px 8px;margin:0 0 2px">
        <div class="label">传统交付</div>
        <p class="t-note">条款解读 + 方法论模板 + 考试/证书导向。学员回到企业容易变成“知道标准，但不会诊断业务”。</p>
      </div>
      <div class="card gold" style="padding:6px 8px">
        <div class="label">你真正需要的交付</div>
        <p class="t-note"><strong>以业务流为主线</strong>，把评价标准当成一套“看业务风险”的眼睛。学完能落地、能闭环、能拿到业务结果。</p>
      </div>
      <div class="flow t-note" style="margin-top:2px">
        你不是在为审核而工作，你是在为业务而工作。通过审核只是自然结果。
      </div>
    </div>
  </div>
</div>""",
    )


def render_differences(l1: dict[str, str]) -> str:
    sec5 = l1.get("五、与传统培训的本质区别", "")
    cmp_rows = parse_table_block(sec5)
    cmp_table = render_table(cmp_rows, ["18%", "41%", "41%"])

    path_blocks = re.findall(r"```[^\n]*\n(.*?)```", sec5, re.S)
    trad_flow = ""
    course_flow = ""
    if len(path_blocks) >= 2:
        trad_flow = path_blocks[-2].strip().replace("\n", " → ").replace("→", '<span class="arrow">→</span>')
        course_flow = path_blocks[-1].strip().replace("\n", "<br>")

    path_items = "".join(
        f'<div style="display:flex;gap:4px;align-items:flex-start">'
        f'<span style="font-weight:600;color:{color};min-width:12px" class="t-note">{label}</span>'
        f'<span class="t-note" style="color:#6a7a8a">{md_inline(text)}</span></div>'
        for label, color, text in CONFIG["paths"]
    )

    sec9 = l1.get("九、与传统 VDA 6.8 培训的区别", "")
    exp_rows = parse_table_block(sec9)
    exp_cards = ""
    for row in exp_rows[1:]:
        if len(row) >= 3:
            topic, trad, ours = row[0], row[1], row[2]
            exp_cards += f'''<div class="s ccard">
  <div class="cch"><span class="cct">{md_inline(topic)}</span></div>
  <div class="ccb"><div class="ccl">{md_inline(trad)}</div><div class="ccr">{md_inline(ours)}</div></div>
</div>'''

    return page_wrap(
        3,
        f"""  <div class="cf">
  <h2 class="s">传统课程 vs 本课程：差异与解决方案</h2>
  <div class="s accent-line"></div>
  <div class="s row2" style="flex:1">
    <div class="row loose">
      <div class="s two" style="flex:1;gap:12px">
        <div class="s vf">
          <h3>两条完全不同的内容路径</h3>
          <div class="flow t-note" style="border-left-color:#8a9aa8">
            <span style="font-size:8.5px;color:#8a9aa8;letter-spacing:.5px">传统路径</span><br>
            {trad_flow}
          </div>
          <div class="flow t-note">
            <span style="font-size:8.5px;color:#c8a45c;letter-spacing:.5px">本课程路径</span><br>
            {course_flow}
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;margin:1px 0">{path_items}</div>
          <div class="card gold" style="padding:3px 6px">
            <p class="t-note" style="margin:0"><strong>结论</strong>：如果你要“拿项目/做优化”，就必须从业务流切入，而不是从条款切入。</p>
          </div>
        </div>
        <div class="s vf">
          <h3>传统培训 vs 本课程（内容对比）</h3>
          {cmp_table}
        </div>
      </div>
    </div>
    <div class="row tight">
      <h3 class="s">学员体验对比（结果层）</h3>
      <div class="s two" style="gap:12px">
        <div>{exp_cards}</div>
        <div class="card gold" style="padding:10px 12px">
          <div class="label">一句话定位</div>
          <p class="t-note" style="margin:2px 0"><strong>不是“标准解读员”，而是“经验输出者”。</strong></p>
          <p class="t-note" style="margin:0">20年+、100+供应商审核积累的判断基线，用来直接解决业务断点。</p>
        </div>
      </div>
    </div>
  </div>
</div>""",
    )


def render_philosophy(l1: dict[str, str]) -> str:
    sec3 = l1.get("三、课程哲学与核心理念", "")
    subs = parse_subsections(sec3)
    ceiling = subs.get('把 VDA 6.8 从"天花板"变成"地板"', subs.get("把 VDA 6.8 从“天花板”变成“地板”", ""))

    ceiling_paras = [p.strip() for p in re.split(r"\n\n+", ceiling) if p.strip() and not p.startswith(">")]
    quote = ""
    if ">" in ceiling:
        qm = re.search(r">\s*(.+)", ceiling, re.S)
        if qm:
            quote = qm.group(1).strip().split("\n>")[0].strip()

    core = subs.get("核心理念", "")
    core_lines = [l.strip() for l in core.splitlines() if l.strip()]
    core_statement = core_lines[0] if core_lines else ""
    core_body = " ".join(core_lines[1:3]) if len(core_lines) > 1 else ""

    gaps = extract_cognition_gaps(l1.get("四、常被忽略的供应链概念 — 从业者的认知断层", ""))
    gap_html = "".join(
        f'<div class="cgi"><span class="cgt">{html.escape(f"①②③④⑤⑥"[i] if i < 6 else str(i+1))} {html.escape(title)}</span> {md_inline(desc)}</div>'
        for i, (title, desc) in enumerate(gaps)
    )

    flow_intro = ""
    for p in ceiling_paras[:3]:
        if "天花板" in p or "审核本质" in p or "这门课" in p:
            flow_intro += f'<p class="t-note" style="margin:1px 0">{md_inline(p)}</p>'

    return page_wrap(
        4,
        f"""  <div class="cf">
  <h2 class="s">课程哲学 · 核心理念 · 常见问题（审核量总结）</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:5;min-height:0;gap:12px">
    <div class="s vf">
      <h3>把 VDA 6.8 从"天花板"变成"地板"</h3>
      <div class="flow t-note">绝大多数人认为VDA 6.8是<strong>"一根线，努力够到它"</strong>——逐条对标、临时突击、审核过了松一口气，下次来了重新紧张。</div>
      {flow_intro}
      <div class="card gold" style="padding:3px 6px;margin:1px 0">
        <div class="label">核心路径</div>
        <p class="t-note" style="margin:0"><strong>将供应链业务与 VDA 6.8 并轨</strong>——不是用条款去套业务，而是用业务的投影去对应条款。</p>
      </div>
      <blockquote class="t-note">{md_inline(quote)}</blockquote>
    </div>
    <div class="s vf">
      <h3>核心理念</h3>
      <div class="card dark" style="padding:5px 8px;margin-bottom:2px">
        <div class="label" style="color:rgba(255,255,255,.6);font-size:8.5px">核心认知</div>
        <p style="font-weight:700;color:#fff;margin:2px 0">{md_inline(core_statement)}</p>
      </div>
      <p class="t-note">{md_inline(core_body)}</p>
      <div class="card gold" style="padding:4px 8px;margin:2px 0">
        <div class="label">课程目标</div>
        <p class="t-note" style="font-weight:600;margin:1px 0;color:#0f1a2e">懂审核员如何思考的供应链从业者</p>
        <p class="t-note" style="margin:0">知道评审者的目光会落在哪里、那条判断基线在哪。然后，反过来把自己的业务做到经得起看。</p>
      </div>
    </div>
  </div>
  <hr class="s sdiv">
  <div style="flex:4;display:flex;flex-direction:column;min-height:0">
    <h3 class="s">六层认知断层（100+供应商审核反复出现）</h3>
    <div class="s cg2x3">{gap_html}</div>
    <div class="card" style="padding:6px 8px;margin-top:2px;border-left-color:#c8a45c">
      <div class="label">你会在审核中不断遇到的本质问题</div>
      <p class="t-note">不是“条款没背熟”，而是<strong>业务边界不完整、流不连续、时间刻度不清、系统与现场两张皮</strong>。本课程把这些问题变成可诊断、可落地的改进路径。</p>
    </div>
  </div>
</div>""",
    )


def render_outline(l1: dict[str, str]) -> str:
    sec7 = l1.get("七、课程内容结构 — 以业务流为线索", "")
    sec8 = l1.get("八、课程大纲（3天）", "")

    flow_rows = parse_table_block(sec7)
    flow_table = render_table(flow_rows, ["22%", "42%", "36%"])

    day1 = ""
    if "### Day 1" in sec8:
        day1 = sec8.split("### Day 1", 1)[1].split("### Day 2", 1)[0]

    morning = "供应链全局观 · 信息流与实物流协同 · 六层认知断层"
    afternoon = "VDA 6.8本质 · 四个真实痛点 · 业务流思维 · 三条路径 · 引出贯穿案例"
    for line in day1.splitlines():
        if "上午" in line and "—" in line:
            pass
        if line.strip().startswith("- ") and "供应链全局观" in line:
            morning = line.strip()[2:]
        if "下午" in line or "从概念到标准" in line:
            pass

    day2_content = sec8.split("### Day 2", 1)[1].split("### Day 3", 1)[0] if "### Day 2" in sec8 else ""
    day3_content = sec8.split("### Day 3", 1)[1].split("## ", 1)[0] if "### Day 3" in sec8 else ""

    mods_d2 = extract_modules(day2_content)
    mods_d3 = extract_modules(day3_content)

    d2_html = "".join(render_accordion(m) for m in mods_d2)
    d3_html = "".join(render_accordion(m) for m in mods_d3)

    expand_flow = (
        "业务模块 × 负责人 <span class='arrow'>→</span> 业务流（从头到尾串起来）"
        "<span class='arrow'>→</span> 对应VDA 6.8条款 <span class='arrow'>→</span> "
        "常见断点分析 <span class='arrow'>→</span> 实战建议（20年判断基线）"
    )

    return page_wrap(
        5,
        f"""  <div class="cf no-clip">
  <h2 class="s">课程大纲 — Day 1 认知重塑 · Day 2-3 案例贯穿</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:1;min-height:0;gap:12px">
    <div style="flex:0 0 34%;min-width:0;display:flex;flex-direction:column">
      <h3 class="s">Day 1 — 认知重塑 + 供应链概念基础</h3>
      <div class="s t-note" style="color:#8a9aa8;margin-bottom:1px">目标：建立概念框架，打通认知断层。不涉及具体条款。</div>
      <div class="s d1agenda">
        <div class="d1t">上午</div>
        <div class="d1c">{md_inline(morning)}</div>
        <div class="d1t">下午</div>
        <div class="d1c">{md_inline(afternoon)}</div>
      </div>
      <div class="s flow t-note" style="text-align:center;margin:0 0 1px">1天概念基础 + 2天案例贯穿——先开一个项目，用这个项目带进所有评价条款</div>
      <div class="s t-note" style="color:#8a9aa8;text-align:center;letter-spacing:1px;margin:0 0 1px">不同工艺过程和供应链模式的大纲可定向调整</div>
      <h3 class="s">课程展开方式</h3>
      <div class="s flow t-note">{expand_flow}</div>
    </div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column">
      <h3 class="s">Day 2 — 案例贯穿：L1~L4 多向映射</h3>
      <div class="s t-note" style="color:#8a9aa8;margin-bottom:1px">点击模块标题展开详情</div>
      {d2_html}
      <div class="s t-note" style="color:#8a9aa8;padding-top:1px;border-top:1px dashed #e8e4df;margin:1px 0">
        Day2走通"目标→资源→执行"上游闭环。项目目标(L1)同时驱动物流规划(L2)和现场(L6)。
      </div>
      <h3 class="s">Day 3 — 案例贯穿：L5~L7 + 综合实战</h3>
      {d3_html}
      <div class="s card gold" style="padding:3px 6px;margin:2px 0">
        <div class="label">综合模拟实战</div>
        <div class="t-note" style="color:#4a5a6a;line-height:1.5;padding-left:6px">
          1. 发布综合案例 · 2. 学员分组从L1→L7全流程识别断点与风险<br>
          3. 每组输出断点/模块/等级 · 4. 讲师逐一反馈 · 5. 回到起点：拿项目、做优化
        </div>
      </div>
    </div>
  </div>
</div>""",
    )

def render_business_flows(l1: dict[str, str]) -> str:
    sec7 = l1.get("七、课程内容结构 — 以业务流为线索", "")
    flow_rows = parse_table_block(sec7)
    flow_table = render_table(flow_rows, ["22%", "42%", "36%"])
    return page_wrap(
        6,
        f"""  <div class="cf">
  <h2 class="s">L1-L7 串起来：业务流与评审者视角</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:1;gap:12px">
    <div class="s vf">
      <h3>一条业务流会穿过多个条款</h3>
      <div class="flow t-note">供应链不是被拆成 L1-L7 分别管理的，业务是连续流动的。<strong>你做一个决策，它会沿着业务流影响上下游。</strong></div>
      {render_pflow()}
      <div class="card gold" style="padding:8px 10px;margin-top:2px">
        <div class="label">审核员的抓手</div>
        <p class="t-note" style="margin:2px 0">评审者并不只看“你填没填表”，而是顺着<strong>因果链</strong>追问：你的流哪里会断？量变时哪里先崩？时间刻度模糊时哪里先失序？</p>
      </div>
    </div>
    <div class="s vf">
      <h3>五条业务流（横跨多个L）</h3>
      <div class="s">{flow_table}</div>
      <div class="card" style="padding:6px 8px;margin-top:2px;border-left-color:#c8a45c">
        <p class="t-note" style="margin:0"><strong>结论</strong>：用“业务流”做记忆锚点，学完能自然调用，不需要临时突击。</p>
      </div>
    </div>
  </div>
</div>""",
    )


def render_value_pricing(l1: dict[str, str], l1_info: dict[str, str], pricing: dict, packages: list) -> str:
    sec6 = l1.get("六、两个价值目标（递进）", "")
    val_rows = parse_table_block(sec6)
    # 仅展示：阶段 / 目标 / 企业价值（不展开“对应课程”的细节）
    val_rows_3col = []
    if val_rows:
        val_rows_3col.append(val_rows[0][:3])
        for r in val_rows[1:]:
            val_rows_3col.append(r[:3])
    val_table = render_table(val_rows_3col, ["16%", "40%", "44%"])

    pkg_html = "".join(
        f'<div class="s prow"><span class="pn">{html.escape(n)}</span>'
        f'<span class="pi">{html.escape(desc)}</span>'
        f'<span class="ptm">{html.escape(days)}</span>'
        f'<span class="pnote">{html.escape(note)}</span></div>'
        for n, desc, days, note in packages
    )

    p = pricing
    l2_subs = "".join(
        f'<div class="l-sub"><span class="lsn">{html.escape(n)}</span><span class="lsv">{html.escape(v)}</span></div>'
        for n, v in p["l2"][1]
    )

    info_rows = ""
    for k, v in l1_info.items():
        info_rows += f'<tr><td style="width:24%;font-weight:600;border:none;padding:1px 3px">{html.escape(k)}</td><td style="border:none;padding:1px 3px">{md_inline(v)}</td></tr>'

    tags = "".join(
        f'<span class="tag">▸ {html.escape(t)}</span>'
        for t in ["核心课程：L1 VDA6.8迎审实战", "L2：预审核与问题整改", "L3：端到端降本实战"]
    )

    return page_wrap(
        7,
        f"""  <div class="cf">
  <h2 class="s">价值目标 · 课程组合 · 定价</h2>
  <div class="s accent-line"></div>
  <div class="s two" style="flex:1;gap:12px">
    <div>
      <h3 class="s">两个价值目标（递进）</h3>
      <div class="s">{val_table}</div>
      <div class="s t-note" style="color:#8a9aa8;text-align:center;letter-spacing:1px;margin:2px 0 3px">没有①的根基，②就是空中楼阁</div>
      <div style="display:flex;gap:6px;margin-bottom:3px">
        <div class="s card" style="flex:1;padding:3px 6px;text-align:center">
          <div class="t-note" style="font-weight:600;color:#0f1a2e">拿项目</div>
          <div style="font-size:8.5px;color:#8a9aa8">核心课程 + L2 预审核与整改</div>
        </div>
        <div class="s card" style="flex:1;padding:3px 6px;text-align:center">
          <div class="t-note" style="font-weight:600;color:#0f1a2e">做优化</div>
          <div style="font-size:8.5px;color:#8a9aa8">L3 端到端降本实战<span style="color:#c8a45c">（需前一阶段打底）</span></div>
        </div>
      </div>
      <h3 class="s">课程组合建议</h3>
      <div class="s pgrid">{pkg_html}</div>
    </div>
    <div>
      <h3 class="s">课程定价（人民币）</h3>
      <div class="s price-box">
        <div class="pbh">{p["schedule"]}</div>
        <div class="l-row">
          <span class="ln">{p["l1"][0]}</span>
          <span class="lv">{p["l1"][1]}</span>
        </div>
        <div class="l-row" style="flex-direction:column;align-items:stretch;padding:2px 8px">
          <span class="ln t-body" style="margin-bottom:1px">{p["l2"][0]}</span>
          <div class="l-row-sub" style="padding:0;border:none">{l2_subs}</div>
        </div>
        <div class="l-row">
          <span class="ln">{p["l3"][0]}</span>
          <span class="lv">{p["l3"][1]} <span class="sml">{p["l3"][2]}</span></span>
        </div>
      </div>
      <div class="s t-note" style="color:#8a9aa8;margin-top:3px;text-align:center">企业可根据需求选择不同阶段组合，两层递进——拿项目、做优化</div>
      <div class="s tags">{tags}</div>
      <div class="s card" style="margin-top:2px;border-left-color:#c8a45c">
        <div class="label">课程信息</div>
        <div class="tbl-wrap"><table class="t-note" style="margin:1px 0 0">{info_rows}</table></div>
      </div>
    </div>
  </div>
</div>""",
    )


def render_back(intro_md: str) -> str:
    subtitle = "大众集团供应链管理专家 · VDA 6.8 / 6.3 双证审核员"
    for line in intro_md.splitlines():
        if "**李嘉俊**" in line and "|" in line:
            subtitle = line.split("|", 1)[1].strip().replace("**", "")
            break
    return page_wrap(
        8,
        f"""  <div class="s"><h2>感谢聆听</h2></div>
  <div class="s divider"></div>
  <div class="s bn">李嘉俊</div>
  <div class="s bs">{md_inline(subtitle)}</div>
  <div class="s"><span class="t-note" style="opacity:.45">{CONFIG["tagline"]}</span></div>
  <div class="s bt">{CONFIG["contact"]}</div>""",
        "back",
    )


def parse_pricing(intro_md: str) -> tuple[dict, list[tuple[str, str, str, str]]]:
    sections = parse_sections(intro_md)
    pricing_sec = sections.get("二、课程定价（人民币）", "")
    schedule = CONFIG["pricing"]["schedule"]
    for line in pricing_sec.splitlines():
        if "标准授课日" in line or "7小时" in line:
            schedule = line.strip()
            break

    rows = parse_table_block(pricing_sec)
    l1 = CONFIG["pricing"]["l1"]
    l2_title = CONFIG["pricing"]["l2"][0]
    l2_subs = list(CONFIG["pricing"]["l2"][1])
    l3 = CONFIG["pricing"]["l3"]

    for row in rows[1:]:
        if len(row) < 2:
            continue
        name, price = row[0], row[1]
        if "Level 1" in name:
            l1 = (name, price.replace(" ", ""))
        elif "不含整改" in name:
            l2_subs[0] = ("不含整改方案", price.replace(" ", ""))
        elif "含整改" in name:
            l2_subs[1] = ("含整改方案", price.replace(" ", ""))
        elif "Level 3" in name:
            parts = price.split("或")
            main = parts[0].strip().replace(" ", "")
            sub = ("或" + parts[1].strip()) if len(parts) > 1 else CONFIG["pricing"]["l3"][2]
            l3 = (name, main, sub)

    pkg_sec = sections.get("三、课程组合建议", "")
    pkg_rows = parse_table_block(pkg_sec)
    packages = []
    for row in pkg_rows[1:]:
        if len(row) >= 4:
            packages.append((row[0], row[1], row[2], row[3]))
    if not packages:
        packages = CONFIG["packages"]

    pricing = {
        "schedule": schedule,
        "l1": l1,
        "l2": (l2_title, l2_subs),
        "l3": l3,
    }
    return pricing, packages


def parse_course_info(l1_text: str) -> dict[str, str]:
    sections = parse_sections(l1_text)
    sec10 = sections.get("十、课程信息", "")
    rows = parse_table_block(sec10)
    info = {}
    for row in rows[1:]:
        if len(row) >= 2:
            info[row[0].strip("*")] = row[1]
    return info


def build() -> str:
    intro_md = read_md("讲师介绍.md")
    l1_text = read_md("L1_VDA6.8迎审实战-把你的供应链业务投影到过程标准.md")
    l1 = parse_sections(l1_text)
    l1_info = parse_course_info(l1_text)
    pricing, packages = parse_pricing(intro_md)

    pages = [
        render_cover(intro_md),
        render_intro(intro_md),
        render_painpoints_and_roles(l1),
        render_differences(l1),
        render_philosophy(l1),
        render_outline(l1),
        render_business_flows(l1),
        render_value_pricing(l1, l1_info, pricing, packages),
        render_back(intro_md),
    ]

    template = TEMPLATE.read_text(encoding="utf-8")
    if "<!-- PAGES -->" not in template:
        raise SystemExit("Template missing <!-- PAGES --> placeholder")
    html_out = template.replace("<!-- PAGES -->", "\n".join(pages))
    return html_out


def main() -> None:
    out = build()
    OUTPUT.write_text(out, encoding="utf-8")
    page_count = out.count('class="page')
    print(f"Built {OUTPUT} ({len(out):,} bytes, {page_count} pages)")


if __name__ == "__main__":
    main()
