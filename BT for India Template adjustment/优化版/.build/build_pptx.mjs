import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";
import { fileURLToPath } from "node:url";

const p=Presentation.create({slideSize:{width:794,height:1123}});
const navy="#17365D", blue="#D9EAF7", yellow="#FFF2CC", gray="#666666", line="#B4C6E7";
function box(slide,name,x,y,w,h,text,opts={}) {
  const s=slide.shapes.add({geometry:"rect",name,position:{left:x,top:y,width:w,height:h},fill:opts.fill??"#FFFFFF",line:{style:"solid",fill:opts.line??line,width:opts.lineWidth??1}});
  s.text=text; s.text.style={fontSize:opts.size??16,bold:opts.bold??false,color:opts.color??"#222222",alignment:opts.align??"left",verticalAlignment:opts.vAlign??"middle"}; return s;
}
function start(title,subtitle,page) {
  const s=p.slides.add(); s.background.fill="#FFFFFF";
  box(s,"top-band",0,0,794,86,"",{fill:navy,line:navy}); box(s,"title",46,17,650,42,title,{fill:"none",line:"none",lineWidth:0,size:30,bold:true,color:"#FFFFFF"});
  box(s,"page",710,22,42,34,String(page),{fill:"none",line:"none",lineWidth:0,size:16,bold:true,color:"#FFFFFF",align:"right"});
  box(s,"subtitle",46,104,702,48,subtitle,{fill:blue,line:blue,size:16,color:"#244062"});
  box(s,"footer",46,1080,702,22,"编辑预览版｜黄色文本框可直接改写｜正式递交请使用生成的 Word/PDF",{fill:"none",line:"none",lineWidth:0,size:12,color:gray,align:"center"});
  return s;
}
function field(slide,label,token,y,h=42) { box(slide,`label-${label}-${y}`,46,y,190,h,label,{fill:blue,bold:true}); box(slide,`input-${label}-${y}`,236,y,512,h,token,{fill:yellow,line:line,size:16}); }

let s=start("印度商务签证｜可视化编辑包","这份 PPTX 用于所见即所得地整理与预览内容；Excel 仍是唯一数据源。",1);
box(s,"lead",46,190,702,118,"推荐流程\n1. 在 Excel 黄色单元格一次性填写\n2. 用 PPTX 快速预览文案结构\n3. 双击“生成签证文档.command”输出 Word\n4. 复核、签字、盖章后转 PDF/打印",{fill:"#F3F6FA",line:line,size:20});
box(s,"scope",46,340,702,240,"本编辑包包含：\n• 派遣函版式\n• 邀请函版式\n• 行程单版式\n• 简历版式\n• 信息便签版式\n• Proforma 字段导览\n\n注意：PPTX 本身不是签证递交文件。",{fill:"#FFFFFF",line:line,size:20});
box(s,"source",46,620,702,86,"官方核对来源\nhttps://www.eoibeijing.gov.in/page/business-visa-sports-visa/",{fill:blue,line:line,size:16});

s=start("派遣函｜Dispatch Letter","公司抬头、签字和公章应在最终 Word/打印件中完成。",2);
field(s,"Date","<<dispatch_date>>",182); field(s,"To","The Embassy of India, Beijing",230);
box(s,"body",46,294,702,430,"Subject: Dispatch Letter in Support of Business Visa Application\n\nThis is to certify that <<applicant_name>>, passport No. <<passport_no>>, is employed by <<cn_company_name>> as <<job_title>> in <<department>>.\n\nThe applicant will visit <<in_company_name>> in India from <<trip_start>> to <<trip_end>> for <<business_purpose>>. All expenses will be borne by <<cost_bearer>>. The applicant will return to China before the authorized stay expires.",{fill:"#FFFFFF",line:line,size:17});
field(s,"Authorized signatory","<<signatory_name / title / email / phone>>",760,62); field(s,"Signature & seal","（留白，最终打印后签字盖章）",840,94);

s=start("邀请函｜Invitation Letter","邀请方信息、访问日期和费用承担方必须与派遣函一致。",3);
field(s,"Indian company","<<in_company_name>>",182); field(s,"Address","<<in_company_address>>",230,62); field(s,"Inviter","<<inviter_name / title / department>>",310,54); field(s,"Contact","<<inviter_mobile / inviter_email>>",382,54);
box(s,"invite-body",46,470,702,310,"We hereby invite <<applicant_name>>, passport No. <<passport_no>>, <<job_title>> of <<cn_company_name>>, to visit our company from <<trip_start>> to <<trip_end>> for <<business_purpose>>.\n\nAll expenses will be borne by <<cost_bearer>>. We respectfully request that the appropriate Business Visa be granted.",{fill:"#FFFFFF",line:line,size:18});
field(s,"Signature / seal","（由印度邀请方签署）",820,92);

s=start("行程单｜Business Itinerary","每行填写一段连续行程；不要只写 “Meeting”。",4);
const cols=[46,138,230,326,490,620,748], heads=["Start","End","City","Company / place","Activities","Hotel / flight"];
for(let k=0;k<heads.length;k++) box(s,`h${k}`,cols[k],182,cols[k+1]-cols[k],54,heads[k],{fill:navy,line:"#FFFFFF",size:14,bold:true,color:"#FFFFFF",align:"center"});
for(let r=0;r<7;r++) for(let k=0;k<heads.length;k++) box(s,`r${r}c${k}`,cols[k],236+r*92,cols[k+1]-cols[k],92,`<<${heads[k]}>>`,{fill:yellow,line:line,size:k>=3?13:14});
box(s,"sign",46,916,702,92,"Applicant's signature: ____________________    Date: ____________________",{fill:"#FFFFFF",line:line,size:17});

s=start("英文简历｜Resume","按时间倒序填写全部教育和工作经历；空档期需可解释。",5);
field(s,"Applicant","<<name / DOB / phone / email / address>>",182,74);
box(s,"edu-title",46,280,702,42,"EDUCATION",{fill:navy,line:navy,size:18,bold:true,color:"#FFFFFF"});
for(let r=0;r<3;r++) box(s,`edu${r}`,46,322+r*92,702,92,"<<YYYY.MM-YYYY.MM | University | Degree / Major | Notes>>",{fill:yellow,line:line,size:16});
box(s,"work-title",46,620,702,42,"PROFESSIONAL EXPERIENCE",{fill:navy,line:navy,size:18,bold:true,color:"#FFFFFF"});
for(let r=0;r<3;r++) box(s,`work${r}`,46,662+r*106,702,106,"<<YYYY.MM-YYYY.MM | Company | Position | Responsibilities>>",{fill:yellow,line:line,size:16});

s=start("信息便签与 Proforma｜最后复核","所有不适用字段明确写 N/A，不留空。",6);
field(s,"Name","<<applicant_name>>",182); field(s,"Indian company","<<in_company_name>>",230); field(s,"Chinese company","<<cn_company_name>>",278); field(s,"Telephone","<<mobile>>",326); field(s,"Email","<<email>>",374);
box(s,"proforma-title",46,460,702,42,"PROFORMA 重点字段",{fill:navy,line:navy,size:18,bold:true,color:"#FFFFFF"});
box(s,"proforma-list",46,502,702,430,"• 申请人的专业技能与工作年限\n• 是否曾在其他国家工作；如否，其余三项填 N/A\n• 当前雇主的成立年份、所有制、股东、三年营业额\n• 上市状态、业务领域、公司简介、在印度的实体/投资\n• 印度合作公司的成立年份、所有制和外资受益所有人\n• 授权签字人姓名、职位、手机、座机、邮箱\n• 仅在指定区域签字盖章",{fill:"#FFFFFF",line:line,size:19});

const out=fileURLToPath(new URL("../01_结构化录入/印度商务签证_可视化编辑模板.pptx",import.meta.url));
const pptx=await PresentationFile.exportPptx(p); await pptx.save(out);
const dir=new URL("ppt_preview/",import.meta.url); await fs.mkdir(dir,{recursive:true});
for(const [idx,slide] of p.slides.items.entries()) { const png=await p.export({slide,format:"png",scale:1}); await fs.writeFile(fileURLToPath(new URL(`slide-${idx+1}.png`,dir)),new Uint8Array(await png.arrayBuffer())); const layout=await slide.export({format:"layout"}); await fs.writeFile(fileURLToPath(new URL(`slide-${idx+1}.layout.json`,dir)),await layout.text()); }
const montage=await p.export({format:"webp",montage:true,scale:1}); await fs.writeFile(fileURLToPath(new URL("ppt_montage.webp",import.meta.url)),new Uint8Array(await montage.arrayBuffer()));
console.log((await p.inspect({kind:"slide,textbox,shape",maxChars:10000})).ndjson);
