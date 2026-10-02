from copy import deepcopy
from pathlib import Path
import zipfile
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "信息便签条.docx"
OUTPUT = ROOT / "outputs" / "visa_resume_itinerary" / "Information_Note_Slip_Li_Jiajun.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}

replacements = {
    "Name:": "Name: Li Jiajun",
    "Indian company:": "Indian company: ANAND NVH PRODUCTS PVT. LTD.",
    "Chinese Company:": "Chinese Company: Audi China Enterprise Management Co., Ltd.",
    "Tel.:": "Tel.: +86-13761058893",
    "Email:": "Email: jiajun.li@audi.com.cn",
}


def paragraph_text(p):
    return "".join(p.xpath(".//w:t/text()", namespaces=NS)).strip()


def replace_text(p, value):
    first_run = p.find(f"{{{W}}}r")
    rpr = None
    if first_run is not None:
        source_rpr = first_run.find(f"{{{W}}}rPr")
        if source_rpr is not None:
            rpr = deepcopy(source_rpr)
    for child in list(p):
        if child.tag != f"{{{W}}}pPr":
            p.remove(child)
    run = etree.SubElement(p, f"{{{W}}}r")
    if rpr is not None:
        run.append(rpr)
    text = etree.SubElement(run, f"{{{W}}}t")
    text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text.text = value


with zipfile.ZipFile(SOURCE, "r") as src:
    root = etree.fromstring(src.read("word/document.xml"))
    counts = {key: 0 for key in replacements}
    for p in root.xpath("//w:p", namespaces=NS):
        original = paragraph_text(p)
        if original in replacements:
            replace_text(p, replacements[original])
            counts[original] += 1
    missing = [key for key, count in counts.items() if count == 0]
    if missing:
        raise RuntimeError(f"Template slots not found: {missing}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = (
                etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                if info.filename == "word/document.xml"
                else src.read(info.filename)
            )
            dst.writestr(info, data)

print(OUTPUT)
