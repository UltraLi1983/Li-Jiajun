import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const sourcePath = "/Users/lijiajun/Documents/GitHub/python-document/浙江海威/海威集团信息系统方案说明260617.pptx";
const outDir = "/tmp/haiwei-ppt-inspect";
await fs.mkdir(outDir, { recursive: true });

const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
const snapshot = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit,rows,cols,alt,isPlaceholder,placeholders",
  maxChars: 20000,
});
await fs.writeFile(path.join(outDir, "inspect.ndjson"), snapshot.ndjson);

const montage = await presentation.export({ format: "png", montage: true, scale: 1 });
await fs.writeFile(path.join(outDir, "montage.png"), new Uint8Array(await montage.arrayBuffer()));

for (let i = 0; i < presentation.slides.length; i += 1) {
  const slide = presentation.slides.getItem(i);
  const png = await slide.export({ format: "png", scale: 1 });
  await fs.writeFile(path.join(outDir, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(outDir, `slide-${i + 1}.layout.json`), await layout.text());
}

console.log(JSON.stringify({ slides: presentation.slides.length, outDir }, null, 2));
