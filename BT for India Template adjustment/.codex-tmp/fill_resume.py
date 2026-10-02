from copy import deepcopy
from pathlib import Path
import zipfile
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Resume.docx"
OUTPUT = ROOT / "outputs" / "visa_resume_itinerary" / "English_Resume_Li_Jiajun.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}


def paragraph_text(p):
    return "".join(p.xpath(".//w:t/text()", namespaces=NS)).strip()


def replace_paragraph(p, lines, font_size_half_points=None):
    if isinstance(lines, str):
        lines = [lines]
    first_run = p.find(f"{{{W}}}r")
    rpr = None
    if first_run is not None:
        source_rpr = first_run.find(f"{{{W}}}rPr")
        if source_rpr is not None:
            rpr = deepcopy(source_rpr)
    if font_size_half_points is not None:
        if rpr is None:
            rpr = etree.Element(f"{{{W}}}rPr")
        for tag in ("sz", "szCs"):
            node = rpr.find(f"{{{W}}}{tag}")
            if node is None:
                node = etree.SubElement(rpr, f"{{{W}}}{tag}")
            node.set(f"{{{W}}}val", str(font_size_half_points))
    for child in list(p):
        if child.tag != f"{{{W}}}pPr":
            p.remove(child)
    for index, line in enumerate(lines):
        run = etree.SubElement(p, f"{{{W}}}r")
        if rpr is not None:
            run.append(deepcopy(rpr))
        text = etree.SubElement(run, f"{{{W}}}t")
        text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        text.text = line
        if index < len(lines) - 1:
            etree.SubElement(run, f"{{{W}}}br")


def widen_contact_box(p):
    """Give the shared address/date text box enough width without moving it."""
    node = p
    while node is not None:
        local = etree.QName(node).localname
        if local == "wsp":
            ext = node.find(".//{http://schemas.openxmlformats.org/drawingml/2006/main}ext")
            if ext is not None:
                ext.set("cx", "1841500")  # 145 pt
            anchor = node.getparent().getparent().getparent()
            wp_ext = anchor.find("{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent")
            if wp_ext is not None:
                wp_ext.set("cx", "1841500")
            return
        if local == "shape":
            style = node.get("style", "")
            parts = [part for part in style.split(";") if part]
            parts = ["width:145pt" if part.startswith("width:") else part for part in parts]
            node.set("style", ";".join(parts) + ";")
            return
        node = node.getparent()


replacements = {
    "NAME": ["Li Jiajun"],
    "ADDRESS": ["Rm8542, B2, 15 Beihuqu Rd., Beijing"],
    "BIRTH DATE": ["08 Dec 1983"],
    "Phone :": ["Phone: +86-13761058893"],
    "E-mail :": ["E-mail: jiajun.li@audi.com.cn"],
    "YYYY.MM-YYYY.MM      UNIVERSITY OF XXXX       Profession": [
        "2002.09-2006.06   Shanghai Maritime University   B.Eng., Marine Engineering"
    ],
    "LIST ALL DEGREES ATTAINED, START FROM THE MOST RECENT": [
        "Bachelor's degree in Marine Engineering"
    ],
    "IF ANY - PLEASE LIST ALL": ["N/A"],
    "YYYY.MM-YYYY.MM     COMPANY NAME                OCCUPATION": [
        "2022.05-Present | Audi China Enterprise Management Co., Ltd. | Supply Chain Planner",
        "2006.07-2022.05 | SAIC Volkswagen | Expert of Supply Chain Management",
    ],
    "JOB DESCRIPTION - LIST ALL WORK EXPERIENCE": [
        "Audi China: Global supplier qualification; strategic supplier development and maturity assessment.",
        "SAIC Volkswagen: Supply chain risk prediction and mitigation; risk framework development.",
    ],
    "Fluent English in writing and speaking and pass the CET-4": [
        "Certified VDA 6.3 and VDA 6.8 Auditor"
    ],
    "NCRE Certificate, Grade 2 (C language), Office MS": [
        "20 years of supply chain management, supplier audit and risk mitigation experience"
    ],
}

font_sizes = {
    "NAME": 32,
    "ADDRESS": 11,
    "BIRTH DATE": 20,
    "Phone :": 20,
    "E-mail :": 20,
}

with zipfile.ZipFile(SOURCE, "r") as src:
    document_xml = src.read("word/document.xml")
    root = etree.fromstring(document_xml)
    counts = {key: 0 for key in replacements}
    for p in root.xpath("//w:p", namespaces=NS):
        text = paragraph_text(p)
        if text in replacements:
            replace_paragraph(p, replacements[text], font_sizes.get(text))
            if text == "ADDRESS":
                widen_contact_box(p)
            counts[text] += 1
    missing = [key for key, count in counts.items() if count == 0]
    if missing:
        raise RuntimeError(f"Template slots not found: {missing}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True) if info.filename == "word/document.xml" else src.read(info.filename)
            dst.writestr(info, data)

print(OUTPUT)
