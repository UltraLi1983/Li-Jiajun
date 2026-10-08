import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("formal UI smoke test", () => {
  it("serves the formal page and compiled UI assets", async () => {
    await withStaticServer(async baseUrl => {
      const formalHtml = await fetchText(`${baseUrl}/formal.html`);
      const formalApp = await fetchText(`${baseUrl}/dist/ui/formal-app.js`);
      const sampleData = await fetchText(`${baseUrl}/dist/domain/sample-data.js`);

      assert.match(formalHtml, /产品路线设置/);
      assert.match(formalHtml, /languageSelect/);
      assert.match(formalHtml, /stationAssignmentPanel/);
      assert.match(formalHtml, /rnrPanel/);
      assert.match(formalHtml, /data-stage-nav="routing"/);
      assert.match(formalHtml, /data-stage-nav="calibration"/);
      assert.match(formalHtml, /grid-template-columns: 320px minmax\(0, 1fr\)/);
      assert.match(formalHtml, /\.nav-step > span:first-child/);
      assert.match(formalHtml, /\.nav-step > span:last-child/);
      assert.match(formalHtml, /calibrationPanel/);
      assert.match(formalHtml, /stationSelect/);
      assert.match(formalApp, /syncStationSelector/);
      assert.match(formalApp, /plannedSaContexts/);
      assert.match(formalApp, /freezeStandardWindow/);
      assert.match(formalApp, /copyStandardWindowToWeek/);
      assert.match(formalApp, /generateCopyProjection/);
      assert.match(formalApp, /长周期投影 \/ 日历展开/);
      assert.match(formalApp, /连续四周编排/);
      assert.match(formalApp, /data-following-week/);
      assert.match(formalApp, /复制第 1 周/);
      assert.match(formalApp, /暂不排产/);
      assert.doesNotMatch(formalApp, /copyStartingProduct/);
      const projectionPanelIndex = formalApp.indexOf("${renderCopyProjectionPanel(productId, stationId, frozenWindow, frozenCurrent)}");
      const plannedEditorIndex = formalApp.indexOf("${renderPlannedBlockForm()}");
      assert.ok(projectionPanelIndex >= 0 && projectionPanelIndex < plannedEditorIndex, "projection controls should appear before the long planned-SA editor");
      assert.match(formalApp, /rnrDrafts/);
      assert.match(formalApp, /renderRnrBaselineReference/);
      assert.match(formalApp, /renderRnrComparisonTimeline/);
      assert.match(formalApp, /异常证据与推断损失/);
      assert.match(formalApp, /buildRnrEvidence/);
      assert.match(formalApp, /R&R 可恢复证据包/);
      assert.match(formalApp, /buildRnrEvidencePackageSnapshot/);
      assert.match(formalApp, /Current browser-session draft/);
      assert.match(formalApp, /参数更新建议/);
      assert.match(formalApp, /Actual SA 待纠偏 \/ 诊断/);
      assert.match(formalApp, /休息超时、维保、计划停机及换型差异只进入 Actual SA 和待纠偏/);
      assert.match(formalApp, /未来规则按单次切换方向定义/);
      assert.match(formalApp, /data-confirm-suggestion/);
      assert.match(formalApp, /data-cancel-suggestion/);
      assert.match(formalApp, /data-publish-parameters/);
      assert.match(formalApp, /data-window-demand/);
      assert.match(formalApp, /data-one-to-one/);
      assert.match(formalApp, /同窗工序能力/);
      assert.match(formalApp, /globalThis\.confirm\(confirmation\)/);
      assert.match(formalApp, /已发布 · 已生效/);
      assert.match(formalApp, /已发布 · 待生效/);
      assert.match(formalApp, /发布 CT\/P\/Q 到计划参数/);
      assert.match(formalApp, /data-load-rnr-validation/);
      assert.match(formalApp, /Best case 与实跑对比/);
      assert.match(formalApp, /Actual 时间开动率/);
      assert.match(formalApp, /标准时间开动率（扣计划休息\/停机）/);
      assert.match(formalApp, /Actual 时间开动率（扣实际休息\/停机\/推断）/);
      assert.match(formalApp, /实录生产时间占比（扣实际休息\/停机）/);
      assert.match(formalApp, /Best case 理论 OK（件）/);
      assert.match(formalApp, /标准 CT（秒\/循环）/);
      assert.match(formalApp, /Actual CT（秒\/循环）/);
      assert.match(formalApp, /Actual Q/);
      assert.match(formalApp, /待补录分钟/);
      assert.match(formalApp, /原因待查（不影响 SA 计算）/);
      assert.match(formalApp, /class="actual-kind"/);
      assert.match(formalHtml, /\.kind-dot \{ display: inline-block;/);
      assert.match(formalApp, /rnrActualEventsByContext/);
      assert.match(formalApp, /data-rnr-save/);
      assert.match(formalApp, /data-rnr-edit/);
      assert.match(formalApp, /data-rnr-delete/);
      assert.match(formalApp, /实际时间开动率/);
      assert.match(formalApp, /reconcileCurrentRnrSpeed/);
      assert.match(formalApp, /全程平均节拍/);
      assert.match(formalApp, /本段平均节拍/);
      assert.match(formalApp, /相对全程差异/);
      assert.match(formalApp, /calculateRnrPaceSummary/);
      assert.match(formalApp, /原因待查不阻止 Best\/Actual SA/);
      assert.match(formalApp, /界面语言/);
      assert.match(formalHtml, /英文/);
      assert.match(formalApp, /年化需求（按52周）/);
      assert.match(formalApp, /product\.weeklyDemand \* 52/);
      assert.match(formalApp, /formatNumber\(product\.weeklyDemand \* 52\)/);
      assert.match(formalApp, /formatNumber\(event\.okQty \?\? 0\)/);
      assert.match(formalApp, /formatNumber\(item\.quantity\)/);
      assert.match(formalApp, /工站分配配置/);
      assert.match(formalApp, /标准 SA 设定 \/ 日历基准/);
      assert.match(formalApp, /最佳情形SA/);
      assert.match(formalApp, /最大48小时窗口/);
      assert.match(formalApp, /开始日期/);
      assert.match(formalApp, /开始时间/);
      assert.match(formalApp, /计划时间轴/);
      assert.match(formalApp, /含休息最佳情形SA/);
      assert.match(formalApp, /不含休息最佳情形SA/);
      assert.match(formalApp, /计划停机分钟/);
      assert.match(formalApp, /未排产/);
      assert.match(formalApp, /空档提醒/);
      assert.match(formalApp, /新增时间段/);
      assert.match(formalApp, /先选时间段/);
      assert.match(formalApp, /计划动作 \/ 计划损失/);
      assert.match(formalApp, /设备故障、工装问题、物流等待、质量隔离、人员问题/);
      assert.match(formalApp, /结束时间必须大于开始时间/);
      assert.match(formalApp, /所有时间段的整体跨度不能超过48小时/);
      assert.match(formalApp, /需要例外审批/);
      assert.match(formalApp, /data-planned-delete-event/);
      assert.match(formalApp, /data-planned-draft-field/);
      assert.match(formalApp, /startMinuteOfHour/);
      assert.match(formalApp, /endMinuteOfHour/);
      assert.match(formalApp, /derivePlannedSaWindow/);
      assert.match(formalApp, /findStandardSaDayGaps/);
      assert.match(formalApp, /standardDayStartHour/);
      assert.match(formalApp, /standardDayStartMinute/);
      assert.match(formalApp, /standardShiftMinutes/);
      assert.match(formalApp, /standardShiftsPerDay/);
      assert.match(formalApp, /formatWeekday\(date\)/);
      assert.match(formalApp, /"周日", "周一", "周二", "周三", "周四", "周五", "周六"/);
      assert.doesNotMatch(formalApp, /type="time"/);
      assert.match(formalApp, /将空档填为未排产/);
      assert.match(formalApp, /data-planned-event-field/);
      assert.match(formalApp, /R&R真实追踪/);
      assert.match(formalApp, /生产段必须录入 OK \/ NOK 数量/);
      assert.match(formalApp, /设备故障 \/ 工装问题 \/ 物流等待 \/ 质量隔离 \/ 人员问题/);
      assert.match(formalApp, /完成现场记录后，在第四阶段复核参数/);
      assert.match(formalApp, /生产段记录/);
      assert.match(formalApp, /节拍样本记录/);
      assert.match(formalApp, /calculateProductionSegment/);
      assert.match(formalApp, /data-rnr-field/);
      assert.match(formalApp, /参数检查 \/ 产能预检/);
      assert.match(sampleData, /Product A Housing/);
      assert.match(sampleData, /Future Machining 03/);
      assert.match(sampleData, /Customer approval pending/);
    });
  });

  it("does not hardcode Product A operation quantity in the formal UI preflight input", async () => {
    await withStaticServer(async baseUrl => {
      const formalApp = await fetchText(`${baseUrl}/dist/ui/formal-app.js`);

      assert.doesNotMatch(formalApp, /plannedQuantityByOperation:\s*\{\s*["']op-a-10["']:\s*250\s*\}/);
      assert.match(formalApp, /buildPlannedQuantityByOperation/);
      assert.match(formalApp, /selectedRouteId/);
    });
  });
});

async function withStaticServer(run) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/formal.html" : decodeURIComponent(url.pathname);
    const filePath = normalize(join(projectRoot, pathname));

    if (!filePath.startsWith(normalize(projectRoot))) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Not a file");
      response.writeHead(200, { "content-type": contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} should return 200`);
  return response.text();
}

function contentType(filePath) {
  if (extname(filePath) === ".html") return "text/html";
  if (extname(filePath) === ".js") return "text/javascript";
  return "text/plain";
}
