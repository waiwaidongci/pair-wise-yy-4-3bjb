/* 判定层（js/rules.js）与档案层（js/archive.js）的独立测试：node tests/care.test.js */
"use strict";
const assert = require("assert");
const Rules = require("../js/rules.js");
const { createArchive } = require("../js/archive.js");

const MIN = 60000;
const NOW = Date.now();
const ago = ms => new Date(NOW - ms).toISOString();

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
function careOf(outAgoMin, moisture, container) {
  return { outAt: ago(outAgoMin * MIN), moisture, container, segments: [{ container, from: ago(outAgoMin * MIN), to: null, keeper: "", note: "出水登记" }], handovers: [] };
}
const wood = (outAgoMin, container) => ({ id: "w", code: "W", type: "wood", care: careOf(outAgoMin, 35, container) });
const ceramic = (outAgoMin, moisture, container) => ({ id: "c", code: "C", type: "ceramic", care: careOf(outAgoMin, moisture, container) });

/* ---- 判定：木质件 30 分钟时限 ---- */
{
  const r = Rules.evaluate(wood(20, "deck"), NOW);
  assert.strictEqual(r.risks.length, 0);
  assert.strictEqual(r.todos.length, 1);
  assert.ok(Math.abs(r.todos[0].remainMs - 10 * MIN) < 1000, "剩余约10分钟");
}
{
  const r = Rules.evaluate(wood(31, "deck"), NOW);
  assert.strictEqual(r.risks.length, 1, "超半小时未入保湿箱进风险清单");
  assert.strictEqual(r.todos.length, 0);
}
{
  const r = Rules.evaluate(wood(120, "humidity_box"), NOW);
  assert.strictEqual(r.risks.length + r.todos.length, 0, "已入保湿箱无风险无待办");
}

/* ---- 判定：陶片含水率 18% 上限 ---- */
{
  const r = Rules.evaluate(ceramic(30, 21, "deck"), NOW);
  assert.strictEqual(r.risks.length, 0);
  assert.strictEqual(r.todos.length, 1);
  assert.strictEqual(r.todos[0].kind, "ceramic_shade", "含水率超标先阴干");
}
{
  const r = Rules.evaluate(ceramic(30, 21, "humidity_cabinet"), NOW);
  assert.strictEqual(r.risks.length, 1, "超标入恒湿柜进风险清单");
  assert.strictEqual(r.risks[0].kind, "ceramic_cabinet");
}
{
  const r = Rules.evaluate(ceramic(30, 21, "shade_rack"), NOW);
  assert.strictEqual(r.risks.length + r.todos.length, 0, "阴干中无待办");
}
{
  const r = Rules.evaluate(ceramic(30, 16, "shade_rack"), NOW);
  assert.strictEqual(r.todos.length, 1);
  assert.strictEqual(r.todos[0].remainMs, null, "达标可入柜，无硬时限");
}
{
  const r = Rules.evaluate(ceramic(120, 21, "deck"), NOW);
  assert.strictEqual(r.risks.length, 1, "逾宽限未阴干进风险清单");
}

/* ---- 判定：换容器拦截 ---- */
assert.strictEqual(Rules.canEnter(ceramic(30, 21, "deck"), "humidity_cabinet").ok, false, "超标禁入恒湿柜");
assert.strictEqual(Rules.canEnter(ceramic(30, 18, "deck"), "humidity_cabinet").ok, true, "18% 不超标");
assert.strictEqual(Rules.canEnter(ceramic(30, 21, "deck"), "humidity_cabinet", 12).ok, true, "复测达标放行");
assert.strictEqual(Rules.canEnter(wood(10, "deck"), "humidity_cabinet").ok, true, "木质件不受陶片规则限制");

/* ---- 判定：看板按剩余时限升序，超时在前 ---- */
{
  const rows = Rules.board([wood(40, "deck"), wood(25, "deck"), ceramic(30, 21, "deck")], NOW);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].level, "risk");
  assert.ok(rows[0].remainMs < 0, "超时风险排最前");
  assert.ok(rows[1].remainMs > 0 && rows[1].remainMs <= rows[2].remainMs, "剩余时限升序");
}

/* ---- 档案：出水登记 ---- */
{
  const archive = createArchive(memStorage());
  archive.upsert({ id: "m1", code: "W-001", type: "wood" });
  archive.registerCare("m1", { outAt: ago(10 * MIN), moisture: "36.5", container: "deck", keeper: "张三" });
  const mark = archive.find("m1");
  assert.strictEqual(mark.care.container, "deck");
  assert.strictEqual(mark.care.moisture, 36.5);
  assert.strictEqual(mark.care.segments.length, 1);
  assert.strictEqual(mark.care.segments[0].from, mark.care.outAt, "首段自出水时刻起");
  assert.strictEqual(archive.prevStepAt(mark), mark.care.outAt);
}

/* ---- 档案：交接核对与换容器保留旧段 ---- */
{
  const store = memStorage();
  const archive = createArchive(store);
  archive.upsert({ id: "m1", code: "W-001", type: "wood" });
  archive.registerCare("m1", { outAt: ago(10 * MIN), moisture: 36.5, container: "deck", keeper: "张三" });

  let res = archive.handover("m1", { keeper: "李四", confirmedContainer: false, confirmedPrevAt: true, newContainer: "humidity_box" });
  assert.strictEqual(res.ok, false, "未核对容器不得交接");
  res = archive.handover("m1", { keeper: "", confirmedContainer: true, confirmedPrevAt: true });
  assert.strictEqual(res.ok, false, "保管员必填");

  res = archive.handover("m1", { keeper: "李四", confirmedContainer: true, confirmedPrevAt: true, newContainer: "humidity_box", moisture: 33.2, at: ago(5 * MIN) });
  assert.strictEqual(res.ok, true);
  const mark = archive.find("m1");
  assert.strictEqual(mark.care.container, "humidity_box");
  assert.strictEqual(mark.care.segments.length, 2, "换容器另起新段");
  assert.strictEqual(mark.care.segments[0].to, ago(5 * MIN), "旧段封闭保留");
  assert.strictEqual(mark.care.segments[0].container, "deck");
  assert.strictEqual(mark.care.segments[1].container, "humidity_box");
  assert.strictEqual(mark.care.moisture, 33.2, "复测含水率入档");
  assert.strictEqual(mark.care.handovers.length, 1);
  assert.strictEqual(mark.care.handovers[0].containerExpected, "deck", "记录核对时的容器");
  assert.strictEqual(archive.prevStepAt(mark), ago(5 * MIN), "上一步时间更新为新段起点");

  res = archive.handover("m1", { keeper: "王五", confirmedContainer: true, confirmedPrevAt: true, at: ago(1 * MIN) });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(mark.care.segments.length, 2, "不换容器不起新段");
  assert.strictEqual(mark.care.handovers.length, 2);

  const archive2 = createArchive(store);
  assert.strictEqual(archive2.find("m1").care.segments.length, 2, "持久化后可读回");
}

console.log("全部测试通过");
