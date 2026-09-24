/* 判定层：出水晾护规则与阈值。纯函数，不接触存储与界面。 */
(function (global) {
  "use strict";

  const MATERIALS = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
  const CONTAINERS = {
    deck: "甲板暂存",
    seawater: "海水槽",
    humidity_box: "保湿箱",
    shade_rack: "阴干架",
    humidity_cabinet: "恒湿柜"
  };

  // 规则参数：阈值调整只改这里
  const WOOD_LIMIT_MS = 30 * 60 * 1000;            // 木质件离水后入保湿箱时限
  const WOOD_SAFE_CONTAINERS = ["humidity_box"];   // 木质件的安全容器
  const CERAMIC_MOISTURE_LIMIT = 18;               // 陶片可入恒湿柜的含水率上限(%)
  const CERAMIC_SHADE_GRACE_MS = 60 * 60 * 1000;   // 陶片出水后转阴干的宽限

  function materialName(id) { return MATERIALS[id] || id || "未知"; }
  function containerName(id) { return CONTAINERS[id] || id || "未登记"; }

  function currentSegmentFrom(care) {
    const segs = care.segments || [];
    return segs.length ? segs[segs.length - 1].from : care.outAt;
  }

  /* 评估单个出水件：risks 进风险清单，todos 为带剩余时限的待办。 */
  function evaluate(mark, now) {
    const risks = [];
    const todos = [];
    const care = mark && mark.care;
    if (!care || !care.outAt) return { risks, todos };
    const outAt = new Date(care.outAt).getTime();
    if (Number.isNaN(outAt)) return { risks, todos };
    const container = care.container;
    const moisture = care.moisture == null ? NaN : Number(care.moisture);

    // 木质件：离水半小时内须入保湿箱，否则进风险清单
    if (mark.type === "wood" && !WOOD_SAFE_CONTAINERS.includes(container)) {
      const dueAt = outAt + WOOD_LIMIT_MS;
      const remainMs = dueAt - now;
      if (remainMs <= 0) risks.push({ kind: "wood_late", text: "木质件离水超30分钟未入保湿箱", dueAt, remainMs });
      else todos.push({ kind: "wood_box", text: "木质件转入保湿箱", dueAt, remainMs });
    }

    // 陶片：含水率高于上限先阴干，不能进恒湿柜
    if (mark.type === "ceramic" && !Number.isNaN(moisture)) {
      if (moisture > CERAMIC_MOISTURE_LIMIT) {
        if (container === "humidity_cabinet") {
          const since = new Date(currentSegmentFrom(care)).getTime();
          risks.push({ kind: "ceramic_cabinet", text: "陶片含水率" + moisture + "%超" + CERAMIC_MOISTURE_LIMIT + "%上限，须立即移出恒湿柜转阴干", dueAt: since, remainMs: since - now });
        } else if (container !== "shade_rack") {
          const dueAt = outAt + CERAMIC_SHADE_GRACE_MS;
          const remainMs = dueAt - now;
          if (remainMs <= 0) risks.push({ kind: "ceramic_shade_late", text: "陶片含水率" + moisture + "%，逾期未转阴干架", dueAt, remainMs });
          else todos.push({ kind: "ceramic_shade", text: "陶片含水率" + moisture + "%＞" + CERAMIC_MOISTURE_LIMIT + "%，先阴干", dueAt, remainMs });
        }
      } else if (container !== "humidity_cabinet") {
        todos.push({ kind: "ceramic_ready", text: "陶片含水率达标，可入恒湿柜", dueAt: null, remainMs: null });
      }
    }
    return { risks, todos };
  }

  /* 换容器校验：陶片含水率超上限不得进恒湿柜。moisture 为复测值，缺省用档案值。 */
  function canEnter(mark, containerId, moisture) {
    const care = mark && mark.care;
    const raw = moisture == null || moisture === "" ? (care && care.moisture) : moisture;
    const value = raw == null ? NaN : Number(raw);
    if (mark && mark.type === "ceramic" && containerId === "humidity_cabinet" && !Number.isNaN(value) && value > CERAMIC_MOISTURE_LIMIT) {
      return { ok: false, reason: "陶片含水率" + value + "%高于" + CERAMIC_MOISTURE_LIMIT + "%，须先阴干，不能进恒湿柜" };
    }
    return { ok: true };
  }

  /* 汇总看板：风险与待办统一按剩余时限升序（超时在前，无时限最后）。 */
  function board(marks, now) {
    const rows = [];
    (marks || []).forEach(mark => {
      const result = evaluate(mark, now);
      result.risks.forEach(r => rows.push(Object.assign({ mark, level: "risk" }, r)));
      result.todos.forEach(t => rows.push(Object.assign({ mark, level: "todo" }, t)));
    });
    return rows.sort((a, b) => remain(a) - remain(b));
    function remain(row) { return row.remainMs == null ? Infinity : row.remainMs; }
  }

  const api = {
    MATERIALS, CONTAINERS,
    WOOD_LIMIT_MS, WOOD_SAFE_CONTAINERS, CERAMIC_MOISTURE_LIMIT, CERAMIC_SHADE_GRACE_MS,
    materialName, containerName, evaluate, canEnter, board
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CareRules = api;
})(typeof window !== "undefined" ? window : globalThis);
