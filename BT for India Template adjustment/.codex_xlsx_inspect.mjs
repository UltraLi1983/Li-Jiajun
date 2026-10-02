import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("行程单.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const result = await workbook.inspect({
  kind: "workbook,sheet,table,region,formula",
  maxChars: 18000,
  tableMaxRows: 50,
  tableMaxCols: 20,
  tableMaxCellChars: 200,
  options: { maxResults: 200 },
});
console.log(result.ndjson);
