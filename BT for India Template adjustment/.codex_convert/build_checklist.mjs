import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputPath = "/Users/lijiajun/Documents/GitHub/python-document/Template adjustment/印度商务签证材料清单.xlsx";
const previewPath = "/Users/lijiajun/Documents/GitHub/python-document/Template adjustment/.codex_convert/印度商务签证材料清单_双语预览.png";

const bilingualRows = [
  ["印度公司\nIndian company", "1", "邀请信原件\nOriginal invitation letter", "使用英语的带有公司名称、地址、电话、传真的信头纸打印；需包含：邀请函开具日期，注明被邀请人姓名、护照号码、职务、中方公司名、出访时间、访问目的、访问的印方公司名和地址；落款处为邀请人的姓名、职位、公司名、邮箱、电话，并亲笔签名。\nPrint in English on the Indian company's letterhead showing its name, address, telephone and fax. The letter must include the date of issue; invitee's name, passport number and position; Chinese company name; travel dates; purpose of visit; and the name and address of the Indian host company. The closing must state the inviter's name, position, company, email and telephone number, and bear the inviter's handwritten signature."],
  ["印度公司\nIndian company", "2", "印方公司注册证明\nIndian company registration certificate", "Certificate of Incorporation复印件1份，包括更名的注册证书复印件1份；或PAN Card复印件一份。\nProvide one copy of the Certificate of Incorporation, including a copy of any certificate of change of name; alternatively, provide one copy of the PAN Card."],
  ["中方公司\nChinese company", "1", "派遣信\nDispatch letter", "使用英语、带有公司名称、地址、电话、传真的信头纸打印；需包含：派遣函开具日期，申请人姓名、护照号、身份证号、职务、年薪、访问目的及时间、印方公司名及地址，申请人会按时回国、公司费用承担；落款处为部门负责人拼音全名、职务、公司名、邮箱、电话，并亲笔签名加盖公司公章。\nPrint in English on the Chinese company's letterhead showing its name, address, telephone and fax. The letter must include the date of issue; applicant's name, passport number, Chinese national ID number, position and annual salary; purpose and dates of visit; Indian company name and address; confirmation that the applicant will return on time; and confirmation that the company will bear the expenses. The closing must state the responsible department head's full name in Pinyin, position, company, email and telephone number, and bear a handwritten signature and the company seal."],
  ["中方公司\nChinese company", "2", "营业执照复印件加盖公章和翻译件\nBusiness license copy with company seal and translation", "提供营业执照复印件，加盖公司公章，并附翻译件。\nProvide a copy of the business license bearing the company seal, together with an English translation."],
  ["中方公司\nChinese company", "3", "Proforma信息详情表\nProforma information form", "表格需完整填写；不适用项填N/A；由负责人亲笔签名并加盖公章。\nComplete all fields; enter N/A where not applicable. The responsible person must sign by hand and affix the company seal."],
  ["申请人\nApplicant", "1", "在线申请表\nOnline visa application form", "申请表需完整填写，不带*号的栏目也需填写。填写完成后打印并在下方签名，签名字迹与护照签名保持一致。填表网址：https://indianvisaonline.gov.in/visa/Registration\nComplete every field, including fields without an asterisk. After completion, print the form and sign at the bottom; the signature must match the passport signature. Application website: https://indianvisaonline.gov.in/visa/Registration"],
  ["申请人\nApplicant", "2", "2张白底彩色照片\nTwo color photographs with white background", "与上传照片一致，近6个月内拍摄；尺寸50×50mm；清晰露出五官，不能露牙、不能戴眼镜。\nThe printed photographs must match the uploaded photo, have been taken within the last six months, and measure 50 × 50 mm. Facial features must be clearly visible; do not show teeth or wear glasses."],
  ["申请人\nApplicant", "3", "护照原件\nOriginal passport", "护照个人信息页复印件2份；签证页和盖章页复印件1份；护照有效期不少于6个月，至少2页空白页；如有旧护照，也提供旧护照原件及个人信息页、签证页和盖章页复印件1份。\nProvide two copies of the passport biodata page and one copy of all visa and immigration-stamp pages. The passport must be valid for at least six months and have at least two blank pages. If applicable, also provide the original previous passport plus one copy of its biodata, visa and immigration-stamp pages."],
  ["申请人\nApplicant", "4", "英文简历\nCV in English", "包含截至目前所有工作及教育经历。\nInclude the complete employment and education history up to the present."],
  ["申请人\nApplicant", "5", "最高学历毕业证和无犯罪证明公证书\nNotarized highest-degree certificate and no-criminal-record certificate", "提供公证书原件及复印件；公证需附英文翻译。\nProvide the original notarized documents and copies. The notarizations must include English translations."],
  ["申请人\nApplicant", "6", "英文行程单\nItinerary in English", "覆盖整个印度行程，写明城市、拜访公司名称、商务会谈内容，并由申请人亲笔签名。\nCover the entire stay in India and specify each city, company to be visited and subject of the business meetings. The applicant must sign it by hand."],
  ["申请人\nApplicant", "7", "在职证明\nEmployment certificate", "需体现年收入且年收入大于25万元；加盖公章并由负责人签名。\nState an annual income exceeding RMB 250,000. The certificate must bear the company seal and the responsible person's signature."],
  ["申请人\nApplicant", "8", "个人银行流水\nPersonal bank statement", "递交前7天内打印的近6个月工资卡流水，且余额不低于10万元。\nProvide statements for the payroll account covering the latest six months, printed within seven days before submission, with a balance of at least RMB 100,000."],
  ["申请人\nApplicant", "9", "身份证正反面复印件\nCopy of both sides of Chinese national ID card", "身份证正反面打印在同一张纸。\nPrint the front and back of the Chinese national ID card on the same sheet of paper."],
  ["申请人\nApplicant", "10", "商务材料清单\nBusiness visa document checklist", "按要求准备商务材料清单。\nPrepare the business visa document checklist as required."],
  ["申请人\nApplicant", "11", "信息便签条\nApplicant information note", "包含个人姓名、印度公司名、在职公司名、个人电话及邮箱。\nInclude the applicant's name, Indian company name, current employer's name, personal telephone number and email address."],
];

const statusMap = new Map([
  ["未开始", "未开始 / Not started"],
  ["准备中", "准备中 / In progress"],
  ["待签字/盖章", "待签字/盖章 / Pending signature/seal"],
  ["待复核", "待复核 / Pending review"],
  ["已完成", "已完成 / Completed"],
  ["不适用", "不适用 / Not applicable"],
]);
const bilingualStatuses = [...statusMap.values()];

const input = await FileBlob.load(outputPath);
const wb = await SpreadsheetFile.importXlsx(input);
const sheet = wb.worksheets.getItem("材料清单");
const existing = sheet.getRange("A7:G22").values;

const updatedRows = bilingualRows.map((row, index) => {
  const old = existing[index] ?? [];
  const oldStatus = old[4] ?? "未开始";
  const status = statusMap.get(oldStatus) ?? (bilingualStatuses.includes(oldStatus) ? oldStatus : "未开始 / Not started");
  return [...row, status, old[5] ?? null, old[6] ?? ""];
});

sheet.getRange("A1").values = [["印度商务签证材料清单 / India Business Visa Document Checklist"]];
sheet.getRange("A2").values = [["签证类型：商务签证 / Visa type: Business visa    ｜    原Word清单标注出签时间：3–4周 / Processing time stated in the original Word checklist: 3–4 weeks    ｜    黄色列可更新 / Yellow columns are editable"]];
sheet.getRange("A3").values = [["材料总数\nTotal items"]];
sheet.getRange("C3").values = [["已完成\nCompleted"]];
sheet.getRange("D3").formulas = [["=COUNTIF(E7:E22,\"已完成 / Completed\")"]];
sheet.getRange("E3").values = [["完成率\nCompletion rate"]];
sheet.getRange("A5").values = [["使用说明：更新“状态”和“计划完成日”；正式递交前按下方备注检查打印方式及领区。 / Instructions: Update “Status” and “Planned completion date”. Before formal submission, check the printing requirements and consular jurisdiction in the notes below."]];
sheet.getRange("A6:G6").values = [["提供方/类别\nProvider / Category", "序号\nNo.", "材料名称\nDocument", "原清单具体要求\nRequirements in original checklist", "状态\nStatus", "计划完成日\nPlanned completion date", "备注\nNotes"]];
sheet.getRange("A7:G22").values = updatedRows;

sheet.getRange("E7:E22").dataValidation = { rule: { type: "list", values: bilingualStatuses } };
sheet.getRange("E7:E22").conditionalFormats.deleteAll();
sheet.getRange("E7:E22").conditionalFormats.add("containsText", { text: "已完成 / Completed", format: { fill: "#E2F0D9", font: { color: "#006100", bold: true } } });
sheet.getRange("E7:E22").conditionalFormats.add("containsText", { text: "未开始 / Not started", format: { fill: "#FCE4D6", font: { color: "#9C0006" } } });

sheet.getRange("A24").values = [["原清单备注 / Notes from the original checklist"]];
sheet.getRange("A25").values = [["1. 所有递交材料需彩色单面打印，不可装订。 / All submitted documents must be printed in color, single-sided, and must not be bound or stapled."]];
sheet.getRange("A26").values = [["2. 领区划分：根据居住地所属使领馆领区递交申请。 / Consular jurisdiction: Submit the application to the embassy or consulate responsible for the applicant's place of residence."]];
sheet.getRange("A27").values = [["3. 北京驻华印度大使馆领区：北京、天津、河北、安徽、甘肃、贵州、黑龙江、河南、湖北、江西、吉林、辽宁、青海、陕西、山东、山西、重庆、内蒙古、宁夏、西藏、新疆。 / Jurisdiction of the Embassy of India in Beijing: Beijing, Tianjin, Hebei, Anhui, Gansu, Guizhou, Heilongjiang, Henan, Hubei, Jiangxi, Jilin, Liaoning, Qinghai, Shaanxi, Shandong, Shanxi, Chongqing, Inner Mongolia, Ningxia, Tibet and Xinjiang."]];
sheet.getRange("A29").values = [["来源文件：印度商务签材料清单.docx（本Excel为结构化双语转换版本，原Word文件保持不变） / Source: 印度商务签材料清单.docx (This Excel workbook is a structured bilingual conversion; the original Word file remains unchanged.)"]];

sheet.getRange("A1:G29").format.wrapText = true;
sheet.getRange("A2:G2").format.rowHeight = 38;
sheet.getRange("A3:F3").format.rowHeight = 38;
sheet.getRange("A5:G5").format.rowHeight = 42;
sheet.getRange("A6:G6").format.rowHeight = 42;
for (let r = 7; r <= 22; r++) sheet.getRange(`A${r}:G${r}`).format.rowHeight = 105;
sheet.getRange("A7:G7").format.rowHeight = 150;
sheet.getRange("A9:G9").format.rowHeight = 175;
sheet.getRange("A12:G12").format.rowHeight = 135;
sheet.getRange("A14:G14").format.rowHeight = 145;
sheet.getRange("A25:G27").format.rowHeight = 42;
sheet.getRange("A27:G27").format.rowHeight = 56;
sheet.getRange("A29:G29").format.rowHeight = 34;
sheet.getRange("A:A").format.columnWidth = 20;
sheet.getRange("C:C").format.columnWidth = 36;
sheet.getRange("D:D").format.columnWidth = 92;
sheet.getRange("E:E").format.columnWidth = 28;
sheet.getRange("F:F").format.columnWidth = 22;
sheet.getRange("G:G").format.columnWidth = 32;
sheet.getRange("A7:G29").format.font = { size: 9 };
sheet.getRange("A6:G6").format.font = { bold: true, color: "#FFFFFF", size: 10 };
sheet.getRange("A24:G24").format.font = { bold: true, color: "#FFFFFF", size: 10 };

const preview = await wb.render({ sheetName: "材料清单", range: "A1:G29", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const check = await wb.inspect({ kind: "table", range: "材料清单!A1:G29", include: "values,formulas", tableMaxRows: 35, tableMaxCols: 8, tableMaxCellChars: 220, maxChars: 18000 });
console.log(check.ndjson);
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(outputPath);
