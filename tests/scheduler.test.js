// Install-date scheduler (index.html, the SCHEDULER block). Run: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = /\/\* ==== SCHEDULER: BEGIN[\s\S]*?\/\* ==== SCHEDULER: END ==== \*\//.exec(html);
assert.ok(m, 'SCHEDULER block not found in index.html');
const load = () => vm.runInNewContext(m[0] + '\n;({ SCHEDULE_CONFIG, HandoffScheduler })', {});
const { SCHEDULE_CONFIG: CFG, HandoffScheduler: S } = load();

// Alberta wall clock (UTC-6) -> epoch ms, and -> scheduler wall minutes.
const ab = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h + 6, mi, s);
const wall = (y, mo, d, h = 0, mi = 0) => Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 60000);
const NOW = ab(2026, 11, 18, 10, 0); // Wed Nov 18 2026, 10:00 AM

test('working week: Mon to Thu 8 to 5, Fri 8 to 4, no weekends', () => {
    assert.deepEqual(CFG.workingHours[0], null);
    assert.deepEqual(CFG.workingHours[6], null);
    // One whole week, Mon Nov 23 00:00 to Mon Nov 30 00:00: 4 x 9 h + 8 h.
    assert.equal(S.workBetween(wall(2026, 11, 23), wall(2026, 11, 30)), 4 * 540 + 480);
    // Friday closes at 4.
    assert.equal(S.workBetween(wall(2026, 11, 27), wall(2026, 11, 28)), 480);
    assert.equal(S.prevWorkEnd(wall(2026, 11, 28, 12)), wall(2026, 11, 27, 16));
    // Saturday and Sunday are skipped.
    assert.equal(S.nextWorkStart(wall(2026, 11, 28, 9)), wall(2026, 11, 30, 8));
    assert.equal(S.nextWorkStart(wall(2026, 11, 27, 16)), wall(2026, 11, 30, 8));
    assert.equal(S.workBetween(wall(2026, 11, 28), wall(2026, 11, 30)), 0);
});

test('percentages always total exactly 100', () => {
    const cases = [[1], [1, 1, 1], [3, 3, 3, 1, 1, 1, 5, 1, 1, 2, 1, 1, 4, 1, 1, 1], [0.5, 14, 1, 1], [20, 1, 2, 1, 1, 1, 1], [7, 7, 7]];
    cases.forEach(w => {
        const p = S.percents(w);
        assert.equal(p.reduce((a, b) => a + b, 0), 100, JSON.stringify(w));
        assert.equal(p.length, w.length);
    });
    assert.deepEqual(S.percents([1, 1, 1]), [34, 33, 33]);
});

test('minutes are whole and add up exactly (rounding to the minute)', () => {
    assert.deepEqual(S.allocate([1, 1, 1], 100), [34, 33, 33]);
    const a = S.allocate([3, 1, 1, 5, 0.5], 997);
    assert.equal(a.reduce((x, y) => x + y, 0), 997);
    a.forEach(n => assert.ok(Number.isInteger(n) && n > 0));
    // No task is left at zero while there are minutes to give: 5 tasks, 5 minutes.
    assert.deepEqual(S.allocate([100, 1, 1, 1, 1], 5), [1, 1, 1, 1, 1]);
});

test('backward schedule: last task ends at close on the install date, first starts now', () => {
    const weights = [24, 8, 8, 40, 8, 16, 8, 8, 8]; // planned hours
    const r = S.schedule({ lanes: [weights], tail: null, installDate: '2026-12-02', nowMs: NOW });
    const tasks = r.lanes[0].tasks;
    // Nov 18 10-5 (7) + Nov 19 (9) + Nov 20 (8) + week of Nov 23 (44) + Nov 30 to Dec 2 (27) = 95 h.
    assert.equal(r.availableMinutes, 95 * 60);
    assert.equal(tasks[0].start, wall(2026, 11, 18, 10));
    assert.equal(tasks[tasks.length - 1].end, wall(2026, 12, 2, 17));
    assert.equal(S.fmt.zohoDate(r.end), '12-02-2026');
    assert.equal(S.fmt.zohoTime(r.end), '17:00');
    assert.equal(tasks.reduce((a, t) => a + t.minutes, 0), r.availableMinutes);
    // Back to back: each starts at the next working minute after the one before ends.
    for (let i = 1; i < tasks.length; i++) assert.equal(tasks[i].start, S.nextWorkStart(tasks[i - 1].end));
    // Every task inside working hours, times whole minutes.
    tasks.forEach(t => {
        assert.ok(Number.isInteger(t.start) && Number.isInteger(t.end));
        assert.equal(S.workBetween(t.start, t.end), t.minutes);
        assert.ok(S.nextWorkStart(t.start) === t.start);
    });
    // Shares follow the planned lengths: the 40 h task gets 5 times the 8 h one (to the minute).
    assert.ok(Math.abs(tasks[3].minutes - 5 * tasks[1].minutes) <= 5);
    assert.equal(r.lanes[0].tasks.reduce((a, t) => a + t.percent, 0), 100);
    assert.equal(r.status, 'tight'); // 95 h for 128 planned
});

test('plenty of time: tasks stretch, status ok', () => {
    const r = S.schedule({ lanes: [[8, 8]], tail: null, installDate: '2027-01-29', nowMs: NOW });
    assert.equal(r.status, 'ok');
    assert.equal(r.lanes[0].tasks[1].end, wall(2027, 1, 29, 16)); // a Friday: closes at 4
    assert.ok(r.ratio > 1);
});

test('very short timeline: squeezed in proportion, asks first', () => {
    const weights = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? 40 : 8)); // 336 h planned
    const r = S.schedule({ lanes: [weights], tail: null, installDate: '2026-11-20', nowMs: NOW });
    // Wed 10-5 (7) + Thu (9) + Fri (8) = 24 h for 336 planned.
    assert.equal(r.availableMinutes, 24 * 60);
    assert.equal(r.status, 'confirm');
    const t = r.lanes[0].tasks;
    assert.equal(t[t.length - 1].end, wall(2026, 11, 20, 16));
    assert.equal(t.reduce((a, x) => a + x.minutes, 0), 24 * 60);
    t.forEach(x => assert.ok(x.minutes >= 1));
    // Less than one working day in total also asks.
    const today = S.schedule({ lanes: [[8, 8, 8]], tail: null, installDate: '2026-11-18', nowMs: ab(2026, 11, 18, 14, 0) });
    assert.equal(today.availableMinutes, 180);
    assert.equal(today.status, 'confirm');
    assert.equal(today.lanes[0].tasks[2].end, wall(2026, 11, 18, 17));
});

test('no time left, and an install date in the past', () => {
    const late = S.schedule({ lanes: [[8, 8]], tail: null, installDate: '2026-11-18', nowMs: ab(2026, 11, 18, 17, 5) });
    assert.equal(late.status, 'none');
    assert.equal(late.availableMinutes, 0);
    assert.equal(late.lanes.length, 0);
    const past = S.schedule({ lanes: [[8, 8]], tail: null, installDate: '2026-11-13', nowMs: NOW });
    assert.equal(past.status, 'past');
});

test('install date on a weekend ends the Friday before', () => {
    const r = S.schedule({ lanes: [[8, 16, 8]], tail: null, installDate: '2026-12-05', nowMs: NOW }); // Saturday
    assert.equal(r.endsBeforeInstallDay, true);
    assert.equal(r.lanes[0].tasks[2].end, wall(2026, 12, 4, 16));
    const weekday = S.schedule({ lanes: [[8]], tail: null, installDate: '2026-12-03', nowMs: NOW });
    assert.equal(weekday.endsBeforeInstallDay, false);
});

test('sub-projects: shared start, the longest fills the window, the wrap-up ends on the install date', () => {
    const r = S.schedule({ lanes: [[8, 24, 8], [8, 8]], tail: 8, installDate: '2026-12-02', nowMs: NOW });
    const [a, b] = r.lanes;
    assert.equal(a.tasks[0].start, wall(2026, 11, 18, 10));
    assert.equal(b.tasks[0].start, wall(2026, 11, 18, 10));
    assert.equal(r.tail.end, wall(2026, 12, 2, 17));
    assert.equal(r.tail.start, S.nextWorkStart(a.tasks[2].end));
    assert.ok(b.tasks[1].end < a.tasks[2].end, 'shorter sub-project finishes earlier');
    // Same rate of minutes per planned hour in both lanes.
    assert.ok(Math.abs(b.minutes / 16 - a.minutes / 40) < 1);
    assert.equal(a.minutes + r.tail.minutes, r.availableMinutes);
});

test('UTC-6 all year, whatever the computer clock zone says', () => {
    // Dec 1 07:59:30 in Alberta (winter). With UTC-7 it would read 06:59.
    const r = S.schedule({ lanes: [[8]], tail: null, installDate: '2026-12-01', nowMs: ab(2026, 12, 1, 7, 59, 30) });
    assert.equal(S.fmt.zohoTime(r.lanes[0].tasks[0].start), '08:00');
    assert.equal(S.fmt.zohoDate(r.lanes[0].tasks[0].start), '12-01-2026');
    assert.equal(r.availableMinutes, 540);
    // 5:30 PM in Alberta is already the next day in UTC; the schedule starts the next morning.
    assert.equal(S.todayIso(ab(2026, 12, 1, 19, 30)), '2026-12-01');
    const eve = S.schedule({ lanes: [[8]], tail: null, installDate: '2026-12-04', nowMs: ab(2026, 12, 1, 17, 30) });
    assert.equal(S.fmt.zohoDate(eve.start), '12-02-2026');
    assert.equal(S.fmt.zohoTime(eve.start), '08:00');
    // Same answer under any process time zone.
    const before = process.env.TZ;
    const runs = ['America/Edmonton', 'Asia/Tokyo', 'UTC'].map(tz => {
        process.env.TZ = tz;
        const { HandoffScheduler: X } = load();
        const s = X.schedule({ lanes: [[8, 16]], tail: null, installDate: '2026-12-02', nowMs: NOW });
        return JSON.stringify(s);
    });
    process.env.TZ = before;
    assert.equal(runs[0], runs[1]);
    assert.equal(runs[1], runs[2]);
});

test('labels read as dates and times people use', () => {
    const t = wall(2026, 12, 1, 15, 5);
    assert.equal(S.fmt.dayTime(t), 'Tue, Dec 1, 3:05 PM');
    assert.equal(S.fmt.dayTime(wall(2026, 12, 2, 8)), 'Wed, Dec 2, 8:00 AM');
    assert.equal(S.fmt.minutes(95), '1 h 35 min');
    assert.equal(S.plannedHours({ amount: 3, unit: 'days' }), 24);
    assert.equal(S.plannedHours({ amount: 4, unit: 'hrs' }), 4);
});

test('the working week reads back from the config', () => {
    assert.equal(S.describeWeek(), 'Mon to Thu 8:00 AM to 5:00 PM, Fri 8:00 AM to 4:00 PM');
});
