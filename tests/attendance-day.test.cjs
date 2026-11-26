const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const { attendanceDay } = load("lib/attendance-day.ts");

test("monthly rankings use the attended session even when entered or approved next month", () => {
  const timestamp = new Date("2026-11-07T09:00:00Z");
  const activity = { date: "2026-09-30", sessions: [{id:"second", date:"2026-10-31"}] };
  assert.equal(attendanceDay({sessionDate:"2026-10-31", timestamp}, activity), "2026-10-31");
  assert.equal(attendanceDay({sessionId:"second", timestamp}, activity), "2026-10-31");
  assert.equal(attendanceDay({sessionId:"2026-10-31-1", timestamp}), "2026-10-31");
  assert.equal(attendanceDay({timestamp}, activity), "2026-09-30");
  assert.equal(attendanceDay({timestamp: new Date("2026-12-31T17:00:00Z")}), "2027-01-01");
});

test("public ranking retrieves late legacy attendance in the activity month and counts overlapping queries once", async () => {
  const recorded = new Date("2026-12-07T01:00:00Z");
  const data = {
    activities: { november: {date:"2026-11-30", points:7} },
    attendance: {
      old: {studentId:"demo", activityId:"november", timestamp:recorded},
      recent: {studentId:"demo", activityId:"november", sessionDate:"2026-11-30", timestamp:recorded},
      removed: {studentId:"demo", activityId:"november", archived:true, timestamp:recorded},
    },
    department_tasks: {},
  };
  const document = (name,id) => ({id, exists:true, data:()=>data[name][id]});
  function collection(name, filters = []) {
    return {
      where(field, op, value) { return collection(name,[...filters, row => {
        const v = row[field];
        if (v == null) return false;
        if (op === "in") return value.includes(v);
        if (op === ">=") return v >= value;
        if (op === "<=") return v <= value;
        return v < value;
      }]); },
      select() { return this; },
      doc(id) { return document(name,id); },
      async get() { return {docs:Object.entries(data[name]).filter(([,row]) => filters.every(f=>f(row))).map(([id]) => document(name,id))}; },
    };
  }
  const {GET} = load("app/api/public/member-report/route.ts", {
    "@/lib/firebase-admin": {adminDb:()=>({collection,getAll:async (...refs)=>refs.slice(0,-1)})},
    "@/lib/attendance-day":{attendanceDay},
    "@/lib/monthly-report":load("lib/monthly-report.ts"),
  });
  async function ranking(month) {
    const response = await GET(new Request("http://localhost/?month="+month));
    assert.equal(response.status,200);
    return (await response.json()).rows;
  }
  const rows = await ranking("2026-11");
  assert.equal(rows.length,1);
  assert.equal(rows[0].group,2);
  assert.equal(rows[0].points,14);
  assert.deepEqual(await ranking("2026-12"),[]);
});
