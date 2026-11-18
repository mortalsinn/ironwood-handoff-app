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

test('very short timeline: the fixed work does not fit, so it asks first', () => {
    // 336 h planned, 240 h of it fixed site work and drawings.
    const lane = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? { hours: 40, cat: 'fixed' } : { hours: 8, cat: 'production' }));
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2026-11-20', nowMs: NOW });
    // Wed 10-5 (7) + Thu (9) + Fri (8) = 24 h for 336 planned.
    assert.equal(r.availableMinutes, 24 * 60);
    assert.equal(r.status, 'confirm');
    assert.equal(r.fixedShort, true);
    assert.equal(r.fixedMinutes, 240 * 60);
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

test('sub-projects: shared start, the longest fills the time, close out after each install, wrap-up last', () => {
    const T = (hours, cat) => ({ hours, cat });
    const r = S.schedule({ lanes: [[T(8, 'fixed'), T(24, 'production'), T(8, 'fixed'), T(8, 'closeout')],
                                   [T(8, 'fixed'), T(8, 'production'), T(8, 'closeout')]],
                           tail: 8, installDate: '2026-12-02', nowMs: NOW });
    const [a, b] = r.lanes;
    assert.equal(a.tasks[0].start, wall(2026, 11, 18, 10));
    assert.equal(b.tasks[0].start, wall(2026, 11, 18, 10));
    // The longest lane's install work ends at close on the install date.
    assert.equal(a.tasks[2].end, wall(2026, 12, 2, 17));
    assert.equal(a.installEnd, wall(2026, 12, 2, 17));
    // Its close out follows, at its planned 8 hours: Dec 3 8:00 to 4:00 PM.
    assert.equal(a.tasks[3].after, true);
    assert.equal(a.tasks[3].start, wall(2026, 12, 3, 8));
    assert.equal(a.tasks[3].end, wall(2026, 12, 3, 16));
    // The shorter sub-project finishes earlier and closes out right after its own install.
    assert.ok(b.installEnd < a.installEnd);
    assert.equal(b.tasks[2].start, S.nextWorkStart(b.installEnd));
    // Wrap-up after the last close out.
    assert.equal(r.tail.start, S.nextWorkStart(a.tasks[3].end));
    assert.equal(r.finish, r.tail.end);
    // Same stretch rate: the shorter lane's production stretches by the same factor.
    const fA = a.tasks[1].minutes / (24 * 60), fB = b.tasks[1].minutes / (8 * 60);
    assert.ok(Math.abs(fA - fB) < 0.01, fA + ' vs ' + fB);
});

test('close out comes after the install date, at its planned length', () => {
    const T = (hours, cat) => ({ hours, cat });
    const lane = [T(8, 'fixed'), T(40, 'production'), T(16, 'fixed'), T(8, 'closeout'), T(8, 'closeout'), T(8, 'closeout')];
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2026-12-02', nowMs: NOW });
    const t = r.lanes[0].tasks;
    assert.equal(t[2].end, wall(2026, 12, 2, 17));            // install finished on the date
    assert.equal(JSON.stringify(t.slice(3).map(x => x.minutes)), '[480,480,480]');
    assert.equal(t[3].start, wall(2026, 12, 3, 8));
    assert.equal(t[5].end, wall(2026, 12, 7, 15));             // 24 h back to back from Thu 8:00 (Fri closes at 4)
    assert.equal(r.finish, t[5].end);
    // Shares of the time before the install total 100; close out is not in them.
    assert.equal(t.slice(0, 3).reduce((x, y) => x + y.percent, 0), 100);
});

test('more time than planned: production and orders absorb it, site work keeps its length', () => {
    const T = (hours, cat) => ({ hours, cat });
    const lane = [T(8, 'fixed'), T(24, 'fixed'), T(8, 'fixed'), T(24, 'scheduling'), T(8, 'ordering'),
                  T(40, 'production'), T(8, 'checks'), T(16, 'fixed'), T(8, 'closeout')];
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2027-05-21', nowMs: NOW }); // about 6 months
    const t = r.lanes[0].tasks;
    assert.equal(r.status, 'ok');
    assert.equal(t[7].end, wall(2027, 5, 21, 16));             // a Friday
    // Site measure grows by under 30% even with six times the planned time.
    assert.ok(t[0].minutes < 480 * 1.3, 'site measure ' + t[0].minutes);
    assert.ok(t[7].minutes < 960 * 1.3, 'install ' + t[7].minutes);
    // Production gets more extra than the order, in proportion to its planned length.
    assert.ok(t[5].delta > t[4].delta * 4);
    assert.ok(t[5].delta > 50 * t[0].delta);
    // The extra time is listed, biggest first.
    assert.equal(lane[r.absorbed[0].index].cat, 'production');
});

test('a holiday switched off is worked; closed dates are skipped', () => {
    const src = m[0].replace('boxingDay: true', 'boxingDay: false').replace("closedDates: []", "closedDates: ['2028-12-28']");
    const { HandoffScheduler: X } = vm.runInNewContext(src + '\n;({ HandoffScheduler })', {});
    assert.equal(X.holidayOfIso('2028-12-26'), '');
    assert.equal(X.holidayOfIso('2028-12-28'), 'Shop closed');
    assert.equal(X.workBetween(wall(2028, 12, 25), wall(2028, 12, 30)), 540 + 540 + 480); // Tue, Wed, Fri
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

test('the working week reads back from the config', () => {
    assert.equal(S.describeWeek(), 'Mon to Thu 8:00 AM to 5:00 PM, Fri 8:00 AM to 4:00 PM');
});

test('no tasks yet (an empty sub-project) does not break anything', () => {
    const r = S.schedule({ lanes: [], tail: null, installDate: '2026-12-02', nowMs: NOW });
    assert.equal(r.lanes.length, 0);
    const r2 = S.schedule({ lanes: [], tail: 8, installDate: '2026-12-02', nowMs: NOW });
    assert.equal(r2.lanes.length, 0);
});

test('a planned day is 9 working hours; durations read as people say them', () => {
    assert.equal(CFG.plannedHoursPerDay, 9);
    assert.equal(S.plannedHours({ amount: 3, unit: 'days' }), 27);
    assert.equal(S.plannedHours({ amount: 2, unit: 'hrs' }), 2);
    assert.equal(S.plannedHours({ amount: 0.5, unit: 'days' }), 4.5);
    assert.equal(S.fmt.duration(120), '2 h');
    assert.equal(S.fmt.duration(540), '1 day');
    assert.equal(S.fmt.duration(540 + 180), '1 day 3 h');
    assert.equal(S.fmt.duration(3 * 540 + 90), '3 days 1 h 30 min');
    assert.equal(S.fmt.duration(45), '45 min');
    assert.equal(S.fmt.dayTime(wall(2026, 12, 1, 15, 5)), 'Tue, Dec 1, 3:05 PM');
    assert.equal(S.fmt.minutes(95), '1 h 35 min');
});

test('less time than planned: scheduling squeezes hard, production keeps 75%, supplier waits and site work never shrink', () => {
    const lane = [['fixed', 9], ['scheduling', 27], ['ordering', 18], ['production', 45], ['checks', 9], ['supplierWait', 90], ['fixed', 18]]
        .map(([cat, h]) => ({ p: h * 60, cat }));                  // 216 h planned
    const F = (h) => S.fit(lane, h * 60);
    // 200 h: only scheduling gives up time.
    let f = F(200);
    assert.equal(JSON.stringify(f.mins.map(m => m / 60)), '[9,11,18,45,9,90,18]');
    // 175 h: scheduling to its floor (15%), then orders and checks to half, then production.
    f = F(175);
    assert.equal(f.mins[1], Math.ceil(27 * 60 * 0.15));
    assert.equal(f.mins[2], 9 * 60); assert.equal(f.mins[4], Math.ceil(9 * 60 * 0.5));
    assert.ok(f.mins[3] < 45 * 60 && f.mins[3] >= 45 * 60 * 0.75);
    assert.equal(f.mins[5], 90 * 60); assert.equal(f.mins[0], 540); assert.equal(f.mins[6], 18 * 60);
    assert.equal(f.belowFloor, false);
    assert.equal(f.mins.reduce((a, b) => a + b, 0), 175 * 60);
    // 150 h: under the floors. Elastic work goes lower, fixed and supplier waits keep theirs,
    // and the tasks that cannot get their minimum are named, biggest first.
    f = F(150);
    assert.equal(f.belowFloor, true); assert.equal(f.squeezed, false);
    assert.equal(f.mins[5], 90 * 60); assert.equal(f.mins[0], 540); assert.equal(f.mins[6], 18 * 60);
    assert.equal(f.short[0].index, 3);                             // production needs the most
    // 100 h: the fixed work and supplier waits (117 h) do not fit on their own.
    f = F(100);
    assert.equal(f.squeezed, true);
    assert.equal(f.mins.reduce((a, b) => a + b, 0), 6000);
});

test('the install date check opens when the floors do not fit, and names the tasks', () => {
    const T = (hours, cat) => ({ hours, cat });
    const lane = [T(9, 'fixed'), T(27, 'fixed'), T(27, 'scheduling'), T(45, 'production'), T(126, 'supplierWait'), T(18, 'fixed'), T(9, 'closeout')];
    // Two weeks: 92 h, but the glass wait alone is 126 h.
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2026-12-02', nowMs: NOW });
    assert.equal(r.status, 'confirm');
    assert.equal(r.fixedShort, true);
    assert.equal(lane[r.shortTasks[0].index].cat, 'supplierWait');
    // Plenty of time for the floors: no question, production keeps at least 75%.
    const r2 = S.schedule({ lanes: [[T(9, 'fixed'), T(27, 'scheduling'), T(45, 'production'), T(18, 'fixed'), T(9, 'closeout')]],
                            tail: null, installDate: '2026-11-27', nowMs: NOW });   // 7+9+8+9+9+9+9+8 = 68 h
    assert.equal(r2.availableMinutes, 68 * 60);
    assert.equal(r2.status, 'tight');
    const t = r2.lanes[0].tasks;
    assert.ok(t[2].minutes >= 45 * 60 * 0.75, 'production ' + t[2].minutes);
    assert.equal(t[0].minutes, 540); assert.equal(t[3].minutes, 1080);
    assert.equal(t[3].end, wall(2026, 11, 27, 16));
});

test('every task the plan can create has a category', () => {
    const arch = /const ARCHETYPES = \[[\s\S]*?\n        \];/.exec(html)[0];
    const names = [...new Set([...arch.matchAll(/\{ name: '([^']+)'/g)].map(x => x[1]))];
    assert.ok(names.length > 100);
    assert.equal(JSON.stringify(names.filter(n => S.categoryOf(n) === 'other')), '[]');
    const expect = {
        'Railing Site Measure': 'fixed', 'Railing Take Off Sheet': 'fixed', 'Stair Drawing': 'fixed',
        'Approve Shop Drawing': 'fixed', 'Install Railing': 'fixed', 'QA - Install': 'checks', 'Railing Install Photos': 'checks',
        'Review Drawing and Take Off': 'checks', 'Existing Railing Removal': 'fixed', 'Install Site Protection': 'fixed',
        'Manufacture Railing Package': 'production', 'Assemble Finished Stair': 'production', 'Schedule Fabrication': 'production',
        'Receive Glass': 'supplierWait', 'Receive Coated Spindles': 'supplierWait', 'Confirm Schedule Manufacture': 'supplierWait',
        'Order Glass': 'ordering', 'Order Standoffs / Base Shoe': 'ordering', 'Spindle Coating Drop Off': 'ordering',
        'Schedule Install': 'scheduling', 'Schedule Const. Stair Drop Off': 'scheduling',
        'QA - Materials': 'checks', 'Dry Fit - Spindles': 'checks', 'Follow Up with Customer': 'closeout',
        'Send Final Invoice': 'closeout', 'Google Review Request': 'closeout', 'Standoffs, Template, Order Glass': 'fixed'
    };
    Object.keys(expect).forEach(n => assert.equal(S.categoryOf(n), expect[n], n));
    assert.equal(S.categoryOf('[Rails] [ESA] Install Railing'), 'fixed');
    assert.equal(S.categoryOf('[Custom] Touch up paint'), 'other');
    // Floors as Jeff set them.
    assert.equal(CFG.categories.production.floor, 0.75);
    assert.equal(CFG.categories.supplierWait.floor, 1);
    assert.equal(CFG.categories.scheduling.order, 1);
});

test('stat holidays: computed for any year, skipped like weekends', () => {
    assert.equal(S.holidayOfIso('2026-04-03'), 'Good Friday');
    assert.equal(S.holidayOfIso('2027-03-26'), 'Good Friday');
    assert.equal(S.holidayOfIso('2028-04-14'), 'Good Friday');
    assert.equal(S.holidayOfIso('2026-02-16'), 'Family Day');
    assert.equal(S.holidayOfIso('2026-05-18'), 'Victoria Day');
    assert.equal(S.holidayOfIso('2027-05-24'), 'Victoria Day');   // May 24 itself is a Monday
    assert.equal(S.holidayOfIso('2026-08-03'), 'Heritage Day');
    assert.equal(S.holidayOfIso('2026-09-07'), 'Labour Day');
    assert.equal(S.holidayOfIso('2026-10-12'), 'Thanksgiving');
    assert.equal(S.holidayOfIso('2026-12-24'), '');
    // A schedule across Christmas and Boxing Day 2028 (Mon and Tue) skips both.
    assert.equal(S.workBetween(wall(2028, 12, 22), wall(2028, 12, 28)), 540 + 540 - 60);
    const r = S.schedule({ lanes: [[{ hours: 16, cat: 'fixed' }]], tail: null, installDate: '2028-12-27', nowMs: ab(2028, 12, 22, 8, 0) });
    assert.equal(r.availableMinutes, 480 + 540);
    assert.equal(r.lanes[0].tasks[0].end, wall(2028, 12, 27, 17));
    const h = S.schedule({ lanes: [[8]], tail: null, installDate: '2026-12-25', nowMs: NOW });
    assert.equal(h.end, wall(2026, 12, 24, 17));
    assert.equal(h.installDayNote, 'Christmas Day');
});

test('a holiday on a weekend is observed on the next free weekday', () => {
    // 2026: Boxing Day is a Saturday, observed Monday Dec 28.
    assert.equal(S.holidayOfIso('2026-12-28'), 'Boxing Day (observed)');
    assert.equal(S.isWorkDayIso('2026-12-28'), false);
    assert.equal(S.isWorkDayIso('2026-12-29'), true);
    // 2027: Christmas Saturday and Boxing Day Sunday: Monday and Tuesday.
    assert.equal(S.holidayOfIso('2027-12-27'), 'Christmas Day (observed)');
    assert.equal(S.holidayOfIso('2027-12-28'), 'Boxing Day (observed)');
    // 2022: Christmas Sunday, Boxing Day Monday: Christmas moves to Tuesday.
    assert.equal(S.holidayOfIso('2022-12-26'), 'Boxing Day');
    assert.equal(S.holidayOfIso('2022-12-27'), 'Christmas Day (observed)');
    // Canada Day on a Sunday (2029) and a Saturday (2028), New Year's and Remembrance Day on a Saturday.
    assert.equal(S.holidayOfIso('2029-07-02'), 'Canada Day (observed)');
    assert.equal(S.holidayOfIso('2028-07-03'), 'Canada Day (observed)');
    assert.equal(S.holidayOfIso('2028-01-03'), "New Year's Day (observed)");
    assert.equal(S.holidayOfIso('2028-11-13'), 'Remembrance Day (observed)');
    // A schedule over Christmas 2027: Fri Dec 24 is worked, Mon 27 and Tue 28 are not.
    assert.equal(S.workBetween(wall(2027, 12, 24), wall(2027, 12, 30)), 480 + 540);
});

test('below the floors, scheduling goes first and production last', () => {
    const lane = [['scheduling', 27], ['checks', 9], ['production', 45], ['fixed', 18]].map(([cat, h]) => ({ p: h * 60, cat }));
    // Floors: 4.05 + 4.5 + 33.75 + 18 = 60.3 h. At 50 h production loses the least share.
    const f = S.fit(lane, 50 * 60);
    assert.equal(f.belowFloor, true);
    assert.equal(f.mins[0], 1);                       // scheduling down to a minute
    assert.equal(f.mins[1], 1);                       // checks next
    assert.equal(f.mins[3], 18 * 60);                 // fixed untouched
    assert.equal(f.mins.reduce((a, b) => a + b, 0), 3000);
    assert.ok(f.mins[2] > 45 * 60 * 0.6);
});
