import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outDir = new URL("../01_结构化录入/", import.meta.url);
await fs.mkdir(outDir, { recursive: true });
const wb = Workbook.create();

const navy = "#17365D", blue = "#D9EAF7", input = "#FFF2CC", green = "#E2F0D9", gray = "#F2F2F2", red = "#FCE4D6";
function setup(sheet, title, subtitle, widths=[18,30,42,18]) {
  sheet.showGridLines = false;
  sheet.getRange("A1:D1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:D1").format = { fill: navy, font: { bold:true, color:"#FFFFFF", size:16 }, rowHeight:28, verticalAlignment:"center" };
  sheet.getRange("A2:D2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2:D2").format = { fill: blue, font:{ color:"#244062", italic:true }, wrapText:true, rowHeight:34, verticalAlignment:"center" };
  widths.forEach((w,i)=>sheet.getRangeByIndexes(0,i,80,1).format.columnWidth=w);
  sheet.freezePanes.freezeRows(3);
}
function kvSheet(name,title,subtitle,rows) {
  const s=wb.worksheets.add(name); setup(s,title,subtitle);
  s.getRange("A4:D4").values=[["字段 ID","字段 / Field","填写内容（黄色）","说明 / 要求"]];
  s.getRange("A4:D4").format={fill:navy,font:{bold:true,color:"#FFFFFF"},rowHeight:24,verticalAlignment:"center"};
  const data=rows.map(r=>[r[0],r[1],r[2]??"",r[3]??""]);
  s.getRangeByIndexes(4,0,data.length,4).values=data;
  s.getRangeByIndexes(4,0,data.length,4).format={wrapText:true,verticalAlignment:"center",borders:{preset:"inside",style:"thin",color:"#D9E2F3"}};
  s.getRangeByIndexes(4,2,data.length,1).format={fill:input,font:{color:"#7F6000"},wrapText:true};
  s.getRangeByIndexes(4,0,data.length,1).format={fill:gray,font:{color:"#666666"}};
  for(let i=0;i<data.length;i++) s.getRangeByIndexes(4+i,0,1,4).format.rowHeight=34;
  return s;
}

const guide=wb.worksheets.add("00_使用说明"); setup(guide,"印度商务签证材料 - 结构化录入工作簿","只在黄色单元格填写；其他页和最终文档应从这里生成。日期统一使用 yyyy-mm-dd。",[18,34,42,24]);
guide.getRange("A4:D11").values=[
 ["步骤","操作","目的","注意"],
 ["1","依次填写 01-07 页黄色单元格","建立唯一数据源","不知道的内容先留空，不要猜"],
 ["2","在 08_材料清单 更新准备状态","跟踪原件、签字、盖章和复印件","官方要求与 agency 补充要求已区分"],
 ["3","查看 09_一致性检查","发现漏填和矛盾","红色/未完成项必须处理"],
 ["4","运行“生成签证文档.command”","生成派遣函、邀请函、行程单、简历和便签","正式提交前由 agency/公司复核"],
 ["5","将生成的 Word 转 PDF 或打印","锁定最终版式","签字和盖章后再扫描留档"],
 ["颜色","黄色=填写；绿色=自动/已完成；灰色=说明","降低误编辑风险","请勿改变字段 ID"],
 ["官方来源","https://www.eoibeijing.gov.in/page/business-visa-sports-visa/","印度驻华使馆商务签页面","页面更新可能改变要求"]
 ];
guide.getRange("A4:D4").format={fill:navy,font:{bold:true,color:"#FFFFFF"}}; guide.getRange("A5:D11").format={wrapText:true,verticalAlignment:"center"}; guide.getRange("A4:D11").format.borders={preset:"inside",style:"thin",color:"#D9E2F3"};

kvSheet("01_申请人","01 申请人信息","姓名、证件号和日期将复用于派遣函、邀请函、简历、便签和 Proforma。",[
 ["applicant_name","英文姓名（与护照一致）","","必填；注意姓/名顺序"], ["gender","性别","","Male / Female"], ["dob","出生日期","","yyyy-mm-dd"], ["passport_no","护照号码","","必填"], ["passport_issue_date","护照签发日期","","yyyy-mm-dd"], ["passport_expiry_date","护照有效期至","","离计划入境日不少于6个月"], ["national_id","身份证号码","","派遣函可能需要"], ["mobile","手机","","含国家代码"], ["email","个人邮箱","","常用邮箱"], ["home_address","住址（英文）","","与申请表一致"], ["job_title","英文职位","","所有材料一致"], ["department","英文部门","","所有材料一致"], ["employment_start","入职日期","","yyyy-mm-dd"], ["annual_salary_cny","税前年薪（CNY）","","数字"], ["visa_entries","申请入境次数","Single","Single / Double / Multiple"], ["trip_start","计划入境日期","","yyyy-mm-dd"], ["trip_end","计划离境日期","","yyyy-mm-dd"], ["business_purpose","商务访问目的（英文）","","具体到会议/讨论/培训，不写 work"], ["cost_bearer","费用承担方","Chinese employer","与邀请函和派遣函一致"]
]);
kvSheet("02_中方公司","02 中方公司与签字人","用于派遣函、Proforma 和信息便签。",[
 ["cn_company_name","公司英文全称","Audi China Enterprise Management Co., Ltd.","必须与营业执照译文一致"], ["cn_company_address","英文地址","","必填"], ["cn_company_phone","公司电话","","固定电话优先"], ["cn_company_fax","传真","N/A","无则填 N/A"], ["cn_company_email","公司公共邮箱","","可核验"], ["establishment_year","成立年份","","YYYY"], ["ownership_type","所有制","Private Enterprise","Private / State Owned / Joint Venture"], ["listed_status","上市状态","","Listed / Non-Listed"], ["stock_exchange","交易所","N/A","不适用填 N/A"], ["business_sector","业务领域","","英文"], ["company_brief","公司简介（英文）","","2-4句"], ["india_presence","在印度的实体/投资情况","","无则 N/A"], ["turnover_y1","最近第1年营业额","","注明年份和币种"], ["turnover_y2","最近第2年营业额","","注明年份和币种"], ["turnover_y3","最近第3年营业额","","注明年份和币种"], ["signatory_name","授权签字人英文姓名","","拼音全名"], ["signatory_title","授权签字人职位","","英文"], ["signatory_department","授权签字人部门","","英文"], ["signatory_mobile","授权签字人手机","","可能被核验"], ["signatory_phone","授权签字人座机","","必填"], ["signatory_email","授权签字人邮箱","","公司域名邮箱"], ["dispatch_date","派遣函日期","","yyyy-mm-dd"]
]);
kvSheet("03_印度公司","03 印度公司与邀请人","用于邀请函、行程单、便签和 Proforma。",[
 ["in_company_name","印度公司法定英文名称","","与注册证明/PAN一致"], ["in_company_address","注册地址","","完整英文地址"], ["in_company_phone","公司电话","","含区号"], ["in_company_email","公司邮箱","","公司域名优先"], ["in_establishment_year","成立年份","","YYYY"], ["in_ownership_type","所有制","","Private / State Owned / Joint Venture"], ["foreign_ownership","是否有外资","","Y / N"], ["beneficial_owner","受益所有人国籍及比例","N/A","无则 N/A"], ["inviter_name","邀请人姓名","","英文"], ["inviter_title","邀请人职位","","英文"], ["inviter_department","邀请人部门","","英文"], ["inviter_mobile","邀请人电话","","必填"], ["inviter_email","邀请人邮箱","","必填"], ["invitation_date","邀请函日期","","yyyy-mm-dd"], ["relationship","双方业务关系","business partner","避免仅写 partner"], ["registration_doc","注册证明类型/编号","","Certificate of Incorporation 或 PAN"]
]);

const itinerary=wb.worksheets.add("04_行程"); setup(itinerary,"04 印度行程","按天或连续日期段填写；城市、拜访公司和活动必须与邀请函及申请表一致。",[15,15,20,28]);
itinerary.getRange("A4:F4").values=[["开始日期","结束日期","城市","拜访公司/地点","商务活动（英文）","航班/酒店/交通"]]; itinerary.getRange("A4:F4").format={fill:navy,font:{bold:true,color:"#FFFFFF"},wrapText:true};
itinerary.getRange("A5:F24").values=Array.from({length:20},()=>["","","","","",""]); itinerary.getRange("A5:F24").format={fill:input,wrapText:true,verticalAlignment:"center",borders:{preset:"inside",style:"thin",color:"#D9E2F3"}}; itinerary.getRange("A5:B24").format.numberFormat="yyyy-mm-dd"; itinerary.getRange("E:E").format.columnWidth=38; itinerary.getRange("F:F").format.columnWidth=35;

for (const [name,title,headers,rows] of [
 ["05_教育经历","05 教育经历",["开始年月","结束年月","学校英文名称","专业/学历","备注"],12],
 ["06_工作经历","06 工作经历",["开始年月","结束年月","公司英文名称","职位","职责（英文）"],18]
]) { const s=wb.worksheets.add(name); setup(s,title,"从最近一段开始，覆盖全部经历；空档期需能够解释。",[16,16,30,24]); s.getRange("A4:E4").values=[headers]; s.getRange("A4:E4").format={fill:navy,font:{bold:true,color:"#FFFFFF"}}; s.getRangeByIndexes(4,0,rows,5).values=Array.from({length:rows},()=>["","","","",""]); s.getRangeByIndexes(4,0,rows,5).format={fill:input,wrapText:true,verticalAlignment:"center",borders:{preset:"inside",style:"thin",color:"#D9E2F3"}}; s.getRange("E:E").format.columnWidth=42; }

kvSheet("07_Proforma补充","07 Proforma 补充字段","所有字段必填；不适用请明确写 N/A。",[
 ["skills_experience","专业技能/相关经验","","英文具体描述"], ["years_experience","相关领域工作年限","","数字+years"], ["worked_abroad","是否曾在其他国家工作","No","Yes / No"], ["foreign_company","境外公司名称","N/A","No则N/A"], ["foreign_company_contact","境外公司地址及联系方式","N/A","No则N/A"], ["foreign_project","境外项目详情","N/A","No则N/A"], ["shareholders_5pct","持股5%以上股东","","公司提供"], ["india_entity_name_address","在印实体名称和地址","N/A","无则N/A"], ["india_investment_nature","在印投资性质","N/A","无则N/A"]
]);

const list=wb.worksheets.add("08_材料清单"); setup(list,"08 材料清单与进度","状态可选：未开始 / 准备中 / 已完成 / 不适用。官方核心要求与 agency 补充项分开标注。",[16,34,20,32]);
const checklist=[
 ["官方核心","在线申请表打印并签名","未开始","所有栏目填写；照片51×51mm"], ["官方核心","护照及复印件","未开始","有效期至少6个月"], ["官方核心","中方公司派遣函","未开始","签字+公章"], ["官方核心","营业执照及认证英文翻译/CCPIT证明","未开始","按签证中心口径"], ["官方核心","Business Visa Proforma","未开始","授权人签字+指定位置盖章"], ["官方核心","印度公司注册证明或PAN","未开始","与邀请方一致"], ["官方核心","印度行程单","未开始","申请人签字"], ["官方核心","银行担保或近6个月流水","未开始","使馆页面写RMB100,000"], ["Agency补充","印度公司邀请函原件","未开始","公司抬头纸+邀请人签字"], ["Agency补充","英文简历","未开始","全部教育和工作经历"], ["Agency补充","最高学历及无犯罪证明公证/翻译","未开始","向agency确认适用性"], ["Agency补充","在职证明/年收入证明","未开始","签字+公章"], ["Agency补充","身份证正反面复印件","未开始","同页"], ["Agency补充","信息便签","未开始","联系方式一致"], ["Agency补充","照片2张","未开始","建议51×51mm白底"]
];
list.getRange("A4:D4").values=[["来源","材料","状态","备注"]]; list.getRange("A4:D4").format={fill:navy,font:{bold:true,color:"#FFFFFF"}}; list.getRangeByIndexes(4,0,checklist.length,4).values=checklist; list.getRangeByIndexes(4,0,checklist.length,4).format={wrapText:true,verticalAlignment:"center",borders:{preset:"inside",style:"thin",color:"#D9E2F3"}}; list.getRangeByIndexes(4,2,checklist.length,1).format={fill:input}; list.getRangeByIndexes(4,2,checklist.length,1).dataValidation={rule:{type:"list",values:["未开始","准备中","已完成","不适用"]}};

const check=wb.worksheets.add("09_一致性检查"); setup(check,"09 一致性检查","自动检查关键必填项和日期逻辑。全部显示“通过”后再生成最终文档。",[30,28,20,40]);
check.getRange("A4:D4").values=[["检查项","引用字段","结果","处理建议"]]; check.getRange("A4:D4").format={fill:navy,font:{bold:true,color:"#FFFFFF"}};
const checks=[
 ["英文姓名已填写","01_申请人!C5","=IF('01_申请人'!C5<>\"\",\"通过\",\"待填写\")","与护照完全一致"],
 ["护照号已填写","01_申请人!C8","=IF('01_申请人'!C8<>\"\",\"通过\",\"待填写\")","不要包含多余空格"],
 ["行程日期完整","01_申请人!C20:C21","=IF(AND('01_申请人'!C20<>\"\",'01_申请人'!C21<>\"\"),\"通过\",\"待填写\")","填写入境及离境日期"],
 ["离境日晚于入境日","01_申请人!C20:C21","=IF(OR('01_申请人'!C20=\"\",'01_申请人'!C21=\"\"),\"待填写\",IF('01_申请人'!C21>='01_申请人'!C20,\"通过\",\"日期错误\"))","修正日期顺序"],
 ["护照至少覆盖入境后6个月","01_申请人!C10/C20","=IF(OR('01_申请人'!C10=\"\",'01_申请人'!C20=\"\"),\"待填写\",IF('01_申请人'!C10>=EDATE('01_申请人'!C20,6),\"通过\",\"有效期不足\"))","确认护照有效期"],
 ["中方公司名称已填写","02_中方公司!C5","=IF('02_中方公司'!C5<>\"\",\"通过\",\"待填写\")","与营业执照译文一致"],
 ["印度公司名称已填写","03_印度公司!C5","=IF('03_印度公司'!C5<>\"\",\"通过\",\"待填写\")","与注册证明一致"],
 ["邀请人联系方式完整","03_印度公司!C16:C17","=IF(AND('03_印度公司'!C16<>\"\",'03_印度公司'!C17<>\"\"),\"通过\",\"待填写\")","电话和公司邮箱"],
 ["至少一段行程","04_行程!A5:F5","=IF(COUNTA('04_行程'!A5:F5)>=5,\"通过\",\"待填写\")","至少填写首段完整行程"],
 ["Proforma 不留空","07_Proforma补充!C5:C13","=IF(COUNTBLANK('07_Proforma补充'!C5:C13)=0,\"通过\",\"待填写\")","不适用填 N/A"]
];
check.getRangeByIndexes(4,0,checks.length,2).values=checks.map(r=>[r[0],r[1]]); check.getRangeByIndexes(4,2,checks.length,1).formulas=checks.map(r=>[r[2]]); check.getRangeByIndexes(4,3,checks.length,1).values=checks.map(r=>[r[3]]); check.getRangeByIndexes(4,0,checks.length,4).format={wrapText:true,verticalAlignment:"center",borders:{preset:"inside",style:"thin",color:"#D9E2F3"}}; check.getRangeByIndexes(4,2,checks.length,1).conditionalFormats.addCustom("=C5=\"通过\"",{fill:green,font:{color:"#006100",bold:true}}); check.getRangeByIndexes(4,2,checks.length,1).conditionalFormats.addCustom("=C5<>\"通过\"",{fill:red,font:{color:"#9C0006",bold:true}});

for (const s of wb.worksheets.items) { const u=s.getUsedRange(); if(u) u.format.font={name:"Aptos",size:10}; }
const output=await SpreadsheetFile.exportXlsx(wb); await output.save(fileURLToPath(new URL("印度商务签证_信息采集主表.xlsx",outDir)));
for (const s of wb.worksheets.items) { const blob=await wb.render({sheetName:s.name,autoCrop:"all",scale:1,format:"png"}); await fs.writeFile(fileURLToPath(new URL(`preview_${s.name}.png`,outDir)),new Uint8Array(await blob.arrayBuffer())); }
console.log((await wb.inspect({kind:"workbook,sheet,formula",maxChars:8000,options:{maxResults:100}})).ndjson);
