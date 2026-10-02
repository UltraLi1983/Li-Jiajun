import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "../行程单.xlsx";
const outputDir = "../outputs/visa_resume_itinerary";
const outputPath = `${outputDir}/English_Business_Itinerary_Li_Jiajun.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("Sheet1");

sheet.getRange("A3:D6").values = [
  [new Date("2026-09-15T00:00:00"), "Gurugram", "Arrival in India; transfer to Gurugram and hotel check-in.", "Flight, hotel and local transport: To be confirmed."],
  [new Date("2026-09-16T00:00:00"), "Gurugram", "Formal supply chain process audit at ANAND NVH PRODUCTS PVT. LTD., Plot No. 33, Sector 35, HSIIDC, Gurugram, Haryana 122001, India - opening meeting, document review and on-site audit.", "Hotel and local transport: To be confirmed."],
  [new Date("2026-09-17T00:00:00"), "Gurugram", "Formal supply chain process audit - process verification, findings review and closing discussion.", "Hotel and local transport: To be confirmed."],
  [new Date("2026-09-18T00:00:00"), "Gurugram", "Hotel check-out; transfer to airport and return to China.", "Return flight and airport transfer: To be confirmed."],
];
sheet.getRange("A3:A6").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("A3:D6").format.wrapText = true;
sheet.getRange("A3:D6").format.verticalAlignment = "center";
sheet.getRange("A3:A6").format.horizontalAlignment = "center";
sheet.getRange("B3:B6").format.horizontalAlignment = "center";

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
