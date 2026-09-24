/* 档案层：标记与晾护档案的存取、容器段与交接日志。不接触规则与界面。 */
(function (global) {
  "use strict";

  const KEY = "zfl30Marks";

  function createArchive(storage) {
    let marks = load();

    function load() {
      try {
        const raw = storage.getItem(KEY);
        const data = raw ? JSON.parse(raw) : [];
        return Array.isArray(data) ? data : [];
      } catch (err) { return []; }
    }
    function save() { storage.setItem(KEY, JSON.stringify(marks)); }
    function all() { return marks; }
    function find(id) { return marks.find(m => m.id === id); }
    function upsert(mark) {
      const i = marks.findIndex(m => m.id === mark.id);
      if (i >= 0) marks[i] = mark; else marks.push(mark);
      save();
      return mark;
    }
    function remove(id) { marks = marks.filter(m => m.id !== id); save(); }
    function replaceAll(next) { marks = next; save(); }

    /* 出水登记：建立晾护档案，首个容器段自出水时刻起。 */
    function registerCare(markId, opts) {
      const mark = find(markId);
      if (!mark) return null;
      const moisture = opts.moisture === "" || opts.moisture == null ? null : Number(opts.moisture);
      mark.care = {
        outAt: opts.outAt,
        moisture,
        container: opts.container,
        segments: [{ container: opts.container, from: opts.outAt, to: null, keeper: opts.keeper || "", note: opts.note || "出水登记" }],
        handovers: []
      };
      save();
      return mark;
    }

    /* 保管员交接：须先核对当前容器与上一步时间；换容器时封闭旧段、另起新段（旧段保留）。 */
    function handover(markId, opts) {
      const mark = find(markId);
      if (!mark || !mark.care) return { ok: false, reason: "未找到晾护档案" };
      if (!opts.keeper) return { ok: false, reason: "请填写保管员" };
      if (!opts.confirmedContainer || !opts.confirmedPrevAt) return { ok: false, reason: "接手前须核对当前容器和上一步时间" };
      const care = mark.care;
      const at = opts.at || new Date().toISOString();
      const current = care.segments[care.segments.length - 1];
      const record = {
        at,
        keeper: opts.keeper,
        containerExpected: care.container,
        prevAtExpected: current ? current.from : care.outAt,
        changedContainer: false,
        note: opts.note || ""
      };
      if (opts.newContainer && opts.newContainer !== care.container) {
        if (current && !current.to) current.to = at;   // 保留旧段：封闭而非删除
        care.segments.push({ container: opts.newContainer, from: at, to: null, keeper: opts.keeper, note: opts.note || "交接换容器" });
        care.container = opts.newContainer;
        record.changedContainer = true;
        record.newContainer = opts.newContainer;
      }
      if (opts.moisture !== undefined && opts.moisture !== null && opts.moisture !== "") {
        record.moisture = Number(opts.moisture);
        care.moisture = Number(opts.moisture);
      }
      care.handovers.push(record);
      save();
      return { ok: true, mark };
    }

    /* 上一步时间：当前容器段的起点。 */
    function prevStepAt(mark) {
      const care = mark && mark.care;
      if (!care) return null;
      const current = care.segments[care.segments.length - 1];
      return current ? current.from : care.outAt;
    }

    return { all, find, upsert, remove, replaceAll, save, registerCare, handover, prevStepAt };
  }

  const api = { KEY, createArchive };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CareArchive = api;
})(typeof window !== "undefined" ? window : globalThis);
