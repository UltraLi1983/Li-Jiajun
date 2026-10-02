from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

import openpyxl
from oletools.olevba import VBA_Parser

OLD = Path("2025-11-17_XXXX_Supply Chain Audit_VDA 6.8_.xlsm")
NEW = Path("Supply Chain Audit_VDA 6.8_EN_20260210.xlsm")


def formulas(path: Path):
    wb = openpyxl.load_workbook(path, data_only=False, read_only=False, keep_vba=True)
    result = {}
    for ws in wb.worksheets:
        cells = {}
        for row in ws.iter_rows():
            for cell in row:
                if cell.data_type == "f" or (isinstance(cell.value, str) and cell.value.startswith("=")):
                    value = cell.value
                    if hasattr(value, "text"):
                        value = value.text
                    cells[cell.coordinate] = str(value)
        result[ws.title] = cells
    return result


def macros(path: Path):
    parser = VBA_Parser(str(path))
    result = {}
    try:
        for _, _, filename, code in parser.extract_macros():
            text = code.decode("utf-8", errors="replace") if isinstance(code, bytes) else code
            text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
            result[filename] = text
    finally:
        parser.close()
    return result


def procedures(code: str):
    pat = re.compile(r"(?im)^\s*(?:Public\s+|Private\s+|Friend\s+|Static\s+)?(Sub|Function|Property\s+(?:Get|Let|Set))\s+([\wÀ-ÿ]+)")
    return [m.group(2) for m in pat.finditer(code)]


def main():
    oldf, newf = formulas(OLD), formulas(NEW)
    formula_diff = []
    all_sheets = list(dict.fromkeys([*oldf, *newf]))
    for sheet in all_sheets:
        a, b = oldf.get(sheet, {}), newf.get(sheet, {})
        for cell in sorted(set(a) | set(b)):
            if a.get(cell) != b.get(cell):
                formula_diff.append({"sheet": sheet, "cell": cell, "old": a.get(cell), "new": b.get(cell)})

    oldm, newm = macros(OLD), macros(NEW)
    macro_diff = []
    for module in sorted(set(oldm) | set(newm)):
        a, b = oldm.get(module), newm.get(module)
        if a != b:
            macro_diff.append({
                "module": module,
                "status": "removed" if b is None else "added" if a is None else "changed",
                "old_procedures": procedures(a or ""),
                "new_procedures": procedures(b or ""),
                "diff": list(difflib.unified_diff((a or "").splitlines(), (b or "").splitlines(), lineterm="")),
            })

    output = {
        "old_sheets": {k: len(v) for k, v in oldf.items()},
        "new_sheets": {k: len(v) for k, v in newf.items()},
        "formula_differences": formula_diff,
        "old_macro_modules": {k: procedures(v) for k, v in oldm.items()},
        "new_macro_modules": {k: procedures(v) for k, v in newm.items()},
        "macro_differences": macro_diff,
    }
    Path("comparison_result.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "old_formula_count": sum(map(len, oldf.values())),
        "new_formula_count": sum(map(len, newf.values())),
        "formula_diff_count": len(formula_diff),
        "old_macro_module_count": len(oldm),
        "new_macro_module_count": len(newm),
        "macro_diff_count": len(macro_diff),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
