const pptxgen = require('/Users/lijiajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs');
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Codex';
pptx.subject = '浙江海威第三轮交流｜作业一';
pptx.title = '五阶段组织与能力演进';
pptx.lang = 'zh-CN';
pptx.theme = {headFontFace:'Hiragino Sans GB', bodyFontFace:'Hiragino Sans GB', lang:'zh-CN'};
const S = pptx.ShapeType;
const C = {navy:'153044',dark:'1E3440',teal:'14898A',mint:'DCEFED',coral:'D65F49',pale:'F3F7F8',white:'FFFFFF',gray:'657680',light:'E4EAED',gold:'E3AE4B'};
const W=13.333,H=7.5;
const txt=(s,t,x,y,w,h,o={})=>s.addText(t,{x,y,w,h,fontFace:'Hiragino Sans GB',fontSize:16,color:C.dark,margin:0,breakLine:false,fit:'shrink',...o});
const rect=(s,x,y,w,h,fill=C.white,line='none',radius=.15)=>s.addShape(radius?S.roundRect:S.rect,{x,y,w,h,rectRadius:radius,fill:{color:fill},line:line==='none'?{color:fill,transparency:100}:{color:line,width:1}});
const line=(s,x1,y1,x2,y2,color=C.light,width=1,dash)=>s.addShape(S.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width,dashType:dash}});
const arrow=(s,x1,y1,x2,y2,color=C.teal,width=2)=>s.addShape(S.line,{x:x1,y:y1,w:x2-x1,h:y2-y1,line:{color,width,beginArrowType:'none',endArrowType:'triangle'}});
const dot=(s,x,y,r,color)=>s.addShape(S.ellipse,{x:x-r,y:y-r,w:r*2,h:r*2,line:{color},fill:{color}});
function base(n,period,title,subtitle){
  const s=pptx.addSlide();s.background={color:C.white};
  rect(s,.45,.39,1.28,.34,C.navy,'none',.05);txt(s,'CEO 讨论稿',.58,.46,1.02,.16,{fontSize:10,color:C.white,bold:true});
  txt(s,period,1.92,.47,2.25,.19,{fontSize:11,color:C.teal,bold:true});
  txt(s,title,.6,.94,12.1,.56,{fontSize:28,bold:true,color:C.navy});
  txt(s,subtitle,.62,1.54,12.0,.36,{fontSize:14,color:C.gray});
  for(let i=0;i<5;i++){const xx=8.54+i*.94;dot(s,xx,.58,.075,i===n-1?C.coral:C.light);if(i<4)line(s,xx+.09,.58,xx+.85,.58,C.light,1.1)}
  txt(s,String(n).padStart(2,'0')+' / 05',11.93,7.07,.85,.17,{fontSize:10,color:C.gray,align:'right'});
  return s;
}
function label(s,t,x,y,w=3){txt(s,t,x,y,w,.25,{fontSize:11,bold:true,color:C.teal,charSpacing:1});}
function card(s,x,y,w,h,title,body,fill=C.pale,number){rect(s,x,y,w,h,fill,'none',.13);if(number)txt(s,number,x+.2,y+.2,.38,.38,{fontSize:24,bold:true,color:C.coral});txt(s,title,x+.2,y+(number?.68:.23),w-.4,.34,{fontSize:18,bold:true,color:C.navy});txt(s,body,x+.2,y+(number?1.08:.69),w-.4,h-(number?1.25:.85),{fontSize:12.5,color:C.dark,breakLine:false});}
function footer(s,t){rect(s,.59,6.67,12.12,.27,C.mint,'none',.06);txt(s,t,.76,6.72,11.75,.16,{fontSize:10.5,color:C.navy,bold:true});}

// P1: Build the operating loop; economics start within the first six months.
{
const s=base(1,'0～6 个月','先把组织与运作方式建起来','以宁德项目先导，让计划、实物流、现场事实连成可执行的闭环。');
label(s,'组织动作',.65,2.08);card(s,.64,2.42,3.67,2.4,'计划职能','整合需求、评估产能、形成交付预测；明确制造执行与异常升级边界。',C.pale,'01');
card(s,4.81,2.42,3.67,2.4,'仓储／实物流','承接仓储与物流，按规划视角重新审视库位、搬运、配送和现场损失。',C.pale,'02');
card(s,8.98,2.42,3.67,2.4,'数字化与 IE','信息化人员进入业务线；IE 联合现场，1 名开发与 1 名 IE 协作人员为初期设想。',C.pale,'03');
arrow(s,4.35,3.63,4.73,3.63);arrow(s,8.52,3.63,8.9,3.63);
label(s,'能力变化',.66,5.12);txt(s,'系统维护 → 现场业务理解       仓储作业 → 实物流规划       排产经验 → 可追溯计划',.66,5.49,12,.38,{fontSize:16,bold:true,color:C.navy});
footer(s,'0～3 个月：测算原状态、梳理组织与接口   ｜   3～6 个月：机制运行，观察时间开动率、质量及作业损失变化');
s.addNotes('讲述链路：信息流提出计划，实物流执行，现场反馈修正计划。前三个月保留原产出、成本、库存及业务条件的基线；三到六个月以宁德为先导，观察经济收益形成路径。岗位人数以现有人数、能力和工作量评估后确定。');
}
// P2: Business capability and earnings verification.
{
const s=base(2,'6～12 个月','从机制运转走向收益测算','让同一团队同时讲清业务规则、系统动作与经营结果。');
label(s,'四类人员协同',.65,2.07);
card(s,.64,2.43,2.78,2.14,'计划 4～6 人','懂约束、上下游、价值目标和软件边界。',C.pale);
card(s,3.72,2.43,2.78,2.14,'数字化 2～3 人','懂现场、AI 工具与财务 controlling 口径。',C.mint);
card(s,6.8,2.43,2.78,2.14,'开发 1～2 人','懂接口、测试、部署、维护及业务必要性。',C.pale);
card(s,9.88,2.43,2.78,2.14,'体系管理 1 人','把客户要求和控制点落到真实业务。',C.pale);
rect(s,.64,5.02,12.02,1.11,C.navy,'none',.12);txt(s,'收益核算',.9,5.25,1.55,.34,{fontSize:20,color:C.white,bold:true});
txt(s,'增量贡献   ＋   实际成本节约   ＋   库存现金释放',2.52,5.24,8.68,.38,{fontSize:18,color:C.white,bold:true});
txt(s,'校正业务条件变化，扣除实施投入',9.77,5.76,2.57,.2,{fontSize:10,color:'CFDFE6',align:'right'});
footer(s,'能力变化：各职能从“完成自身任务”，进入“解释并改善共同经营结果”的业务深水区');
s.addNotes('人数均为已讨论的配置设想，不等于获批编制。仓储实物流与 IE 配置按业务量确认。计划、仓储、数字化、开发、供应链体系人员围绕同一经营问题协作；第六个月以后开始按原状态与改进状态核算真实收益。');
}
// P3: replication package and base localization.
{
const s=base(3,'1～2 年','把已验证的方法变成集团能力','先复制可解释的运营方法，再按基地条件适配。');
label(s,'集团复制包',.67,2.06);
const parts=[['业务规则','需求、产能、库存与交付'],['数据标准','现场事实、指标与异常'],['软件配置','接口、工具、AI 场景'],['培训验证','人员带教、使用和收益']];
parts.forEach((p,i)=>{const x=.66+i*3.07;rect(s,x,2.42,2.76,1.55,i===1?C.mint:C.pale,'none',.12);txt(s,'0'+(i+1),x+.18,2.62,.42,.32,{fontSize:21,bold:true,color:C.coral});txt(s,p[0],x+.76,2.6,1.75,.32,{fontSize:18,bold:true,color:C.navy});txt(s,p[1],x+.18,3.12,2.4,.46,{fontSize:12.5,color:C.dark});if(i<3)arrow(s,x+2.8,3.18,x+3.02,3.18)});
label(s,'复制之后仍需本地化',.67,4.36);
rect(s,.66,4.77,5.65,1.28,C.navy,'none',.12);txt(s,'集团',.94,5.08,1.1,.38,{fontSize:22,bold:true,color:C.white});txt(s,'方法、指标、客户要求与跨基地协调',2.01,5.13,3.96,.25,{fontSize:13,color:C.white});
rect(s,6.74,4.77,5.65,1.28,C.mint,'none',.12);txt(s,'基地',7.02,5.08,1.1,.38,{fontSize:22,bold:true,color:C.navy});txt(s,'仓储、物流、现场执行与反馈',8.09,5.13,3.97,.25,{fontSize:13,color:C.navy});
footer(s,'能力变化：个人经验 → 可配置、可培训、可验证的方法；每个基地单独建立业务与收益基线');
s.addNotes('海外项目按实际节点并行，并不等待此阶段才启动。集团保持指标与方法一致，各基地独立执行并反馈。派驻或增配人数须按实际业务量测算。');
}
// P4: reporting relationship and growth path.
{
const s=base(4,'2～3 年','集团培养骨干，基地承担执行','重点覆盖墨西哥与罗马尼亚；人员原则上来自集团相关团队。');
label(s,'派驻骨干的双重协作',.66,2.07);
rect(s,4.62,2.54,4.04,.8,C.navy,'none',.12);txt(s,'派驻计划／仓储物流骨干',4.93,2.75,3.43,.32,{fontSize:19,bold:true,color:C.white,align:'center'});
rect(s,.78,4.04,4.13,1.11,C.mint,'none',.12);txt(s,'基地 leader',1.04,4.27,3.62,.35,{fontSize:20,bold:true,color:C.navy,align:'center'});
rect(s,8.43,4.04,4.13,1.11,C.pale,'none',.12);txt(s,'集团供应链 leader',8.72,4.27,3.55,.35,{fontSize:20,bold:true,color:C.navy,align:'center'});
arrow(s,5.68,3.39,3.03,3.98,C.teal,2.5);line(s,7.62,3.39,10.49,3.99,C.coral,2,'dash');
txt(s,'实线：日常资源、执行与结果',.74,5.4,4.3,.29,{fontSize:13,color:C.teal,bold:true});
txt(s,'虚线：业务过程与指标合理性',8.35,5.4,4.4,.29,{fontSize:13,color:C.coral,bold:true});
label(s,'骨干应具备',.68,5.84);txt(s,'集团逻辑  /  系统软件  /  绩效标准  /  现场实战  /  基础开发',2.2,5.84,10.1,.27,{fontSize:16,bold:true,color:C.navy});
footer(s,'能力变化：集团业务专家 → 能嵌入海外基地、带教当地团队、统一指标并反馈偏差的骨干');
s.addNotes('基地及时决策与执行；集团通过统一口径识别偏差并提供业务支持。派驻人员的直接汇报对象为基地 leader，集团供应链 leader 保留虚线业务与指标支持。数字化映射关键物理状态，AI 分析与基础决策必须进入真实业务并验证经营改善。');
}
// P5: rotation and digital convergence.
{
const s=base(5,'3 年后','人员轮换，职能向数字化管理平台收拢','前提：数字化铺设、数据质量和运行保障基本成型。');
label(s,'人：轮换与晋升',.67,2.04);
card(s,.65,2.35,4.13,1.43,'国内 ↔ 海外基地','计划与仓储骨干轮换，海外回归人员进入晋升与继任通道。',C.pale);
card(s,.65,4.01,4.13,1.44,'业务 ↔ 开发集成','双向轮岗；AI 降低重复编码，但工程验证和稳定性仍需专业能力。',C.mint);
label(s,'平台：共性能力收拢',5.21,2.04);
rect(s,5.2,2.35,7.45,3.56,C.navy,'none',.13);
txt(s,'融合型数字化团队',5.54,2.74,4.3,.48,{fontSize:26,bold:true,color:C.white});
txt(s,'约 5 人能力验证设想',10.03,2.77,2.24,.27,{fontSize:13,color:'A9DCDD',bold:true,align:'right'});
line(s,5.56,3.39,12.27,3.39,'67818B',1);
txt(s,'数字化业务 ＋ 开发集成 ＋ 供应链体系 ＋ IE',5.56,3.69,6.65,.34,{fontSize:17,bold:true,color:C.white});
txt(s,'业务规则、精益方法、物理接口与 AI 工具共同开发；传感器、摄像头及软件补丁成为可复用方案。',5.56,4.25,6.65,.75,{fontSize:14,color:'D8E9EB'});
txt(s,'集团保留跨基地决策、治理与异常升级；基地继续负责现场执行。',5.56,5.34,6.61,.3,{fontSize:12,color:'A9DCDD'});
footer(s,'验证门槛：自主交付能力  /  平台稳定性  /  现场使用  /  外部依赖  /  全球运营收益');
s.addNotes('五人团队是设想而非编制承诺。至少两人可支持多基地，应解释为关键能力的双人备份与轮值，不是两人包办全部现场执行。选择真实功能验证团队是否能完整完成需求、配置或开发、测试、部署、维护与验收。只有平台可靠运行，才逐步减少重复的集团供应链协调岗位。');
}

pptx.writeFile({fileName:'/tmp/海威作业一_五阶段组织能力演进_讨论稿.pptx'});
