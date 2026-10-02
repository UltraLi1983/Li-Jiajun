const pptxgen=require('/Users/lijiajun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs');
const p=new pptxgen();p.layout='LAYOUT_WIDE';p.author='Codex';p.title='五阶段讨论｜无品牌底板';p.subject='白底、天蓝与草绿的无品牌演示底板';
const S=p.ShapeType,B='2CA4D9',G='88C22F',W='FFFFFF';
function band(slide,cover){
 slide.background={color:W};
 const y=cover?6.32:7.11,h=cover?.62:.39,split=cover?9.3:4.27;
 slide.addShape(S.rect,{x:0,y,w:split,h,line:{color:cover?B:G,transparency:100},fill:{color:cover?B:G}});
 slide.addShape(S.rect,{x:split+.36,y,w:13.33-split-.36,h,line:{color:cover?G:B,transparency:100},fill:{color:cover?G:B}});
 slide.addShape(S.parallelogram,{x:split-.08,y:y-.02,w:.48,h:h+.04,rotate:0,line:{color:W,transparency:100},fill:{color:W}});
}
band(p.addSlide(),true);band(p.addSlide(),false);
p.writeFile({fileName:'/tmp/海威配色_去品牌底板.pptx'});
