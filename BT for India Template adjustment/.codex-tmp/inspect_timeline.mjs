import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("../India visa tracking plan.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

await fs.mkdir("previews", { recursive: true });
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log(sheets.ndjson);
for (const name of ["Sheet2", "Tabelle1"]) {
  try {
    const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1.5, format: "png" });
    await fs.writeFile(`previews/${name}.png`, new Uint8Array(await preview.arrayBuffer()));
    console.log(`RENDERED ${name}`);
  } catch {}
}
