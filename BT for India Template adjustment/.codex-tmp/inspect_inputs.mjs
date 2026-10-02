import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

for (const path of [
  "../行程单.xlsx",
  "../优化版/01_结构化录入/印度商务签证_信息采集主表.xlsx",
]) {
  console.log(`\n### ${path}`);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
  const result = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 30000,
    tableMaxRows: 40,
    tableMaxCols: 12,
    tableMaxCellChars: 250,
  });
  console.log(result.ndjson);
  if (path.endsWith("行程单.xlsx")) {
    const preview = await workbook.render({ sheetName: "Sheet1", range: "A1:D8", scale: 2, format: "png" });
    await fs.writeFile("itinerary-template.png", new Uint8Array(await preview.arrayBuffer()));
  }
}
