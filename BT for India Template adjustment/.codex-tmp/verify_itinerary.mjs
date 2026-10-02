import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "../outputs/visa_resume_itinerary/English_Business_Itinerary_Li_Jiajun.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const check = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 20000,
  tableMaxRows: 10,
  tableMaxCols: 4,
  tableMaxCellChars: 500,
});
console.log(check.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Sheet1", range: "A1:D8", scale: 2, format: "png" });
await fs.writeFile("itinerary-final.png", new Uint8Array(await preview.arrayBuffer()));
