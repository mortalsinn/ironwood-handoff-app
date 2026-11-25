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
    assert.ok(Math.abs(tasks[3].minutes - 5 * tasks[1].minutes) <= 60);   // ends fall on the quarter hour
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
    assert.equal(S.fmt.zohoTime(b.tasks[2].start), '08:00');        // close out from 8:00 the next working day
    assert.ok(b.tasks[2].start > b.installEnd);
    // Wrap-up after the last close out.
    assert.equal(r.tail.start, S.nextWorkStart(a.tasks[3].end));
    assert.equal(r.finish, r.tail.end);
    // Same stretch rate: the shorter lane's production stretches by the same factor.
    const fA = a.tasks[1].minutes / (24 * 60), fB = b.tasks[1].minutes / (8 * 60);
    assert.ok(Math.abs(b.tasks[1].minutes - 8 * 60 * fA) <= 30, fA + ' vs ' + fB);   // within the quarter-hour rounding
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
    // 175 h: scheduling down to 15 minutes first, then orders and checks; production untouched.
    f = F(175);
    assert.equal(f.mins[1], 15);
    assert.ok(f.mins[2] < 18 * 60 && f.mins[2] >= 9 * 60);
    assert.ok(f.mins[4] < 9 * 60 && f.mins[4] >= 60);              // a QA check keeps at least an hour
    assert.equal(f.mins[3], 45 * 60);
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
        'Review Drawing and Take Off': 'checks', 'Install Site Protection': 'fixed',
        'Manufacture Railing Package': 'production', 'Assemble Finished Stair': 'production', 'Schedule Fabrication': 'production',
        'Receive Glass': 'supplierWait', 'Receive Coated Spindles': 'supplierWait', 'Confirm Schedule Manufacture': 'supplierWait',
        'Order Glass': 'ordering', 'Order Standoffs / Base Shoe': 'supplierWait', 'Order Custom Metal / Steel': 'ordering', 'Spindle Coating Drop Off': 'ordering',
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
    assert.equal(f.mins[0], 15);                      // scheduling down to 15 minutes
    assert.equal(f.mins[1], 60);                      // a QA check keeps its hour
    assert.equal(f.mins[3], 18 * 60);                 // fixed untouched
    assert.equal(f.mins.reduce((a, b) => a + b, 0), 3000);
    assert.ok(f.mins[2] > 45 * 60 * 0.55);
});

test('close out: follow up a working day after the install, then the invoice, then the review', () => {
    const T = (hours, cat) => ({ hours, cat });
    const lane = [T(9, 'fixed'), T(45, 'production'), T(18, 'fixed'), T(2, 'checks'), T(9, 'closeout'), T(2, 'closeout'), T(1, 'closeout')];
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2026-12-02', nowMs: NOW });
    const t = r.lanes[0].tasks;
    assert.equal(t[3].end, wall(2026, 12, 2, 17));                 // install work finished on the date
    assert.equal(t[4].start, wall(2026, 12, 3, 8));                // follow up: the next working day
    assert.equal(t[4].end, wall(2026, 12, 3, 17));
    assert.equal(t[5].start, wall(2026, 12, 4, 8));                // invoice 2 h after it
    assert.equal(t[5].end, wall(2026, 12, 4, 10));
    assert.equal(t[6].end, wall(2026, 12, 4, 11));                 // review an hour after the invoice
    t.slice(4).forEach(x => assert.ok(x.start >= r.end, 'close out never before the install'));
});

test('QA checks shrink to an hour, never below', () => {
    const f = S.fit([{ p: 180, cat: 'checks' }, { p: 120, cat: 'checks' }, { p: 60, cat: 'checks' }, { p: 540, cat: 'fixed' }], 540 + 180);
    assert.equal(JSON.stringify(f.mins), '[60,60,60,540]');
    assert.equal(f.belowFloor, false);
});

test('default durations in the plan', () => {
    const arch = /const ARCHETYPES = \[[\s\S]*?\n        \];/.exec(html)[0];
    const dur = (n) => { const m = new RegExp("\\{ name: '" + n.replace(/[.()]/g, '\\$&') + "', (days|hours): ([\\d.]+)").exec(arch); return m && m[1] + ' ' + m[2]; };
    assert.equal(dur('Send Final Invoice'), 'hours 2');
    assert.equal(dur('Follow Up with Customer'), 'days 1');
    assert.equal(dur('Google Review Request'), 'hours 1');
    assert.equal(dur('QA - Materials'), 'hours 2');
    assert.equal(dur('QA - Install'), 'hours 2');
    assert.equal(dur('Railing Take Off Sheet'), 'hours 2');
    // Follow up, then the invoice, then the review.
    assert.ok(arch.indexOf("key: 'sales-followup'") < arch.indexOf("key: 'accounting'"));
    assert.ok(arch.indexOf("key: 'accounting'") < arch.indexOf("key: 'review-request'"));
});

test('a day is a working day: day tasks end at close, even on a Friday', () => {
    // advanceDays: from opening, 1 day ends at that day's close; Friday closes at 4.
    assert.equal(S.advanceDays(wall(2026, 11, 27, 8), 1), wall(2026, 11, 27, 16));
    assert.equal(S.advanceDays(wall(2026, 11, 26, 8), 2), wall(2026, 11, 27, 16));
    assert.equal(S.advanceDays(wall(2026, 11, 27, 8), 1.5), wall(2026, 11, 30, 12, 30));
    // Part way into Friday (4 of 8 h): one day later is half way into Monday.
    assert.equal(S.advanceDays(wall(2026, 11, 27, 12), 1), wall(2026, 11, 30, 12, 30));
    // Close out after a Thursday install: the 1 day follow up runs all of Friday and ends at 4,
    // not Monday 9:00; the invoice (2 h) and review (1 h) follow on Monday.
    const r = S.schedule({ lanes: [[{ days: 1, cat: 'fixed' }, { days: 1, cat: 'closeout' }, { hours: 2, cat: 'closeout' }, { hours: 1, cat: 'closeout' }]],
                           tail: null, installDate: '2026-11-26', nowMs: NOW });
    const t = r.lanes[0].tasks;
    assert.equal(t[1].start, wall(2026, 11, 27, 8));
    assert.equal(t[1].end, wall(2026, 11, 27, 16));
    assert.equal(t[2].end, wall(2026, 11, 30, 10));
    assert.equal(t[3].end, wall(2026, 11, 30, 11));
    // Before the install, a fixed day task that keeps its length runs whole days; the elastic
    // task takes up the difference and the lane still ends at the install date's close.
    const r2 = S.schedule({ lanes: [[{ days: 1, cat: 'fixed' }, { days: 5, cat: 'production' }, { days: 1, cat: 'fixed' }]],
                            tail: null, installDate: '2026-12-04', nowMs: ab(2026, 11, 26, 8) });
    const u = r2.lanes[0].tasks;
    assert.equal(u[2].end, wall(2026, 12, 4, 16));
    assert.equal(u[2].start, wall(2026, 12, 4, 8));                // the last day task is all of Friday
    assert.equal(u[2].keptDays, 1);
    assert.equal(u[0].end, wall(2026, 11, 26, 17));
});

test('squeezing below the minimums: everything else goes to a minute before site work shrinks', () => {
    const ts = [['fixed', 9], ['fixed', 27], ['fixed', 2], ['fixed', 9], ['fixed', 9], ['checks', 1], ['scheduling', 27], ['scheduling', 9],
        ['checks', 2], ['production', 63], ['checks', 3], ['fixed', 18], ['checks', 1], ['checks', 2]].map(([c, h]) => ({ cat: c, p: h * 60 }));
    // Fixed work is 74 h; 77 h are available: fixed keeps every minute.
    const f = S.fit(ts, 77 * 60);
    assert.equal(f.squeezed, false);
    ts.forEach((t, i) => { if (t.cat === 'fixed') assert.equal(f.mins[i], t.p); });
    assert.equal(f.mins.reduce((a, b) => a + b, 0), 77 * 60);
    assert.ok(f.short.every(x => ts[x.index].cat !== 'fixed'));
    // 70 h: the fixed work alone does not fit; now it shrinks and is what gets listed.
    const g = S.fit(ts, 70 * 60);
    assert.equal(g.squeezed, true);
    assert.ok(g.short.length && g.short.every(x => ts[x.index].cat === 'fixed'));
    ts.forEach((t, i) => { if (t.cat !== 'fixed') assert.equal(g.mins[i], 15); });
    assert.equal(g.mins.reduce((a, b) => a + b, 0), 70 * 60);
});

test('notes behind a task name do not change its category', () => {
    assert.equal(S.categoryOf('[Stairs] Finished Stair Install Photos [Stair 1]'), 'checks');
    assert.equal(S.categoryOf('[Stairs] Drop Off Photos [Western, Straight - Stair 2]'), 'checks');
    assert.equal(S.categoryOf('[Stairs] [ESA] Install Finished Stair [Western, Straight - Stair 1]'), 'fixed');
    assert.equal(S.categoryOf('[Rails] Review (Drawing, Take Off)'), 'checks');
    assert.equal(S.categoryOf('[Welding] Install Full Metal Railing (Framework)'), 'fixed');
});

test('M3: a day task is days x 9 h and runs whole working days whenever it gets its planned time', () => {
    assert.equal(CFG.categories.fixed.stretch, 0);
    assert.equal(CFG.categories.checks.stretch, 0);
    // Plenty of time (stretch): a 1 day site measure starting Fri 8:00 ends Fri 4:00 PM, not Monday.
    const r = S.schedule({ lanes: [[{ days: 1, cat: 'fixed' }, { days: 5, cat: 'production' }, { days: 2, cat: 'fixed' }, { days: 1, cat: 'closeout' }]],
                           tail: null, installDate: '2027-01-15', nowMs: ab(2026, 11, 27, 8, 0) });
    assert.equal(r.status, 'ok');
    assert.equal(r.plannedMinutes, 8 * 540);                     // days x 9 h
    const t = r.lanes[0].tasks;
    assert.equal(t[0].start, wall(2026, 11, 27, 8));
    assert.equal(t[0].end, wall(2026, 11, 27, 16));
    assert.equal(t[0].keptDays, 1); assert.equal(t[0].delta, 0);
    // The 2 day install is two whole working days ending at the install date's close (Fri 4:00 PM).
    assert.equal(t[2].keptDays, 2); assert.equal(t[2].delta, 0);
    assert.equal(t[2].end, wall(2027, 1, 15, 16));
    assert.equal(t[2].start, wall(2027, 1, 14, 8));
    assert.equal(S.workDaysBetween(t[2].start, t[2].end), 2);
    // Production took all the extra time.
    assert.ok(t[1].delta > 0);
    // Due times fall on the quarter hour.
    t.forEach(x => assert.equal(x.end % 15, 0, S.fmt.dayTime(x.end)));
});

test('M3: never "planned 2 days, scheduled 1 day 8 h": kept day tasks report their days', () => {
    const lane = [{ days: 1, cat: 'fixed' }, { days: 3, cat: 'fixed' }, { hours: 2, cat: 'fixed' }, { days: 3, cat: 'scheduling' },
                  { days: 5, cat: 'production' }, { days: 2, cat: 'fixed' }, { hours: 2, cat: 'checks' }, { days: 1, cat: 'closeout' }];
    [['2026-12-23', NOW], ['2027-05-21', NOW], ['2026-12-11', NOW]].forEach(([d, now]) => {
        const r = S.schedule({ lanes: [lane], tail: null, installDate: d, nowMs: now });
        r.lanes[0].tasks.forEach((x, i) => {
            if (lane[i].cat === 'fixed' && lane[i].days) {
                assert.equal(x.keptDays, lane[i].days, d + ' task ' + i);
                assert.equal(S.workDaysBetween(x.start, x.end), lane[i].days, d + ' task ' + i);
            }
        });
    });
});

test('M2: duration boxes step by a quarter from a quarter (5 to 5.25, 2 h to 1.75)', () => {
    const inputs = html.match(/<input type="number"[^>]*class="task-days-input[^"]*"[^>]*>/g) || [];
    assert.ok(inputs.length >= 3);
    inputs.forEach(tag => { assert.ok(/min="0.25"/.test(tag), tag); assert.ok(/step="0.25"/.test(tag), tag); });
});

test('M1: opening another sub-project keeps the draft schedule version', () => {
    const fn = /window\.openSubProject = \(j\) => \{[\s\S]*?window\.location\.reload\(\);/.exec(html);
    assert.ok(fn, 'openSubProject not found');
    assert.ok(/next\.scheduleVersion = cur\.scheduleVersion;/.test(fn[0]));
});


test('minimums are on the quarter hour (never "4 h 3 min")', () => {
    const lane = [['scheduling', 27], ['ordering', 7], ['production', 13], ['checks', 3], ['fixed', 9]].map(([cat, h]) => ({ p: h * 60, cat }));
    const f = S.fit(lane, 30 * 60);
    // Every floor reported is a multiple of 15 minutes.
    const g = S.fit(lane, 12 * 60);
    g.short.forEach(x => assert.equal(x.floor % 15, 0, String(x.floor)));
    assert.equal(S.fmt.duration(g.short[0].floor).indexOf(' 3 min'), -1);
});

test('every due time lands on the quarter hour, and checks keep their time unless squeezed', () => {
    const T = (hours, cat, days) => days ? { days, cat } : { hours, cat };
    const lanes = [
        [T(0, 'fixed', 1), T(0, 'fixed', 3), T(2, 'fixed'), T(0, 'scheduling', 3), T(2, 'checks'), T(0, 'production', 5), T(3, 'checks'),
         T(0, 'fixed', 2), T(1, 'checks'), T(2, 'checks'), T(0, 'closeout', 1), T(2, 'closeout')],
        [T(0, 'fixed', 1), T(2, 'fixed'), T(0, 'scheduling', 1), T(0, 'production', 3), T(3, 'checks'), T(0, 'fixed', 2), T(2, 'checks'), T(0, 'closeout', 1), T(2, 'closeout')],
        [T(0, 'fixed', 1), T(0, 'supplierWait', 14), T(0, 'scheduling', 1), T(1, 'checks'), T(0, 'closeout', 1)]
    ];
    ['2026-12-23', '2027-01-15', '2027-05-21', '2026-12-11'].forEach(d => {
        const r = S.schedule({ lanes, tail: 1, installDate: d, nowMs: NOW });
        if (r.status === 'none' || r.status === 'past') return;
        const squeezed = r.status === 'confirm';
        r.lanes.forEach((l, li) => l.tasks.forEach((t, i) => {
            assert.equal(t.start % 15, 0, d + ' lane ' + li + ' task ' + i + ' start ' + S.fmt.dayTime(t.start));
            assert.equal(t.end % 15, 0, d + ' lane ' + li + ' task ' + i + ' end ' + S.fmt.dayTime(t.end));
            if (!squeezed && lanes[li][i].cat === 'checks') assert.equal(t.minutes, lanes[li][i].hours * 60, d + ' check lane ' + li + ' task ' + i);
        }));
        assert.equal(r.tail.end % 15, 0);
    });
});

test('squeezed: no task under 15 minutes, ends on the quarter hour', () => {
    const lane = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? { hours: 40, cat: 'fixed' } : { hours: 8, cat: 'production' }));
    const r = S.schedule({ lanes: [lane], tail: null, installDate: '2026-11-20', nowMs: NOW });
    assert.equal(r.status, 'confirm');
    r.lanes[0].tasks.forEach(t => { assert.ok(t.minutes >= 15); assert.equal(t.end % 15, 0); });
});

test('sub-projects that fit: every check keeps its time in every lane; close out starts at 8:00 the next working day', () => {
    const T = (h, cat, days) => days ? { days, cat } : { hours: h, cat };
    const stair = [T(2, 'fixed'), T(0, 'fixed', 3), T(2, 'fixed'), T(0, 'scheduling', 3), T(0, 'production', 20), T(4, 'checks'),
                   T(0, 'fixed', 2), T(1, 'checks'), T(2, 'checks'), T(0, 'closeout', 1), T(2, 'closeout')];
    const rail = [T(0, 'fixed', 1), T(0, 'fixed', 3), T(2, 'fixed'), T(1, 'checks'), T(0, 'scheduling', 3), T(0, 'scheduling', 1), T(2, 'checks'),
                  T(0, 'production', 5), T(3, 'checks'), T(0, 'fixed', 2), T(1, 'checks'), T(2, 'checks'), T(0, 'closeout', 1), T(2, 'closeout')];
    ['2027-01-15', '2026-12-23', '2027-02-26', '2027-04-30'].forEach(d => {
        const r = S.schedule({ lanes: [stair, rail], tail: 1, installDate: d, nowMs: NOW });
        assert.ok(r.status === 'ok' || r.status === 'tight', d + ' ' + r.status);
        [stair, rail].forEach((lane, li) => {
            const tasks = r.lanes[li].tasks;
            lane.forEach((t, i) => {
                if (t.cat === 'checks' && r.status === 'ok') assert.equal(tasks[i].minutes, t.hours * 60, d + ' lane ' + li + ' check ' + i);
                if (t.cat === 'checks') assert.ok(tasks[i].minutes >= Math.min(60, t.hours * 60));
                assert.equal(tasks[i].end % 15, 0, d + ' lane ' + li + ' task ' + i);
            });
            const first = lane.findIndex(t => t.cat === 'closeout');
            const fc = tasks[first];
            assert.equal(S.fmt.zohoTime(fc.start), '08:00', d + ' lane ' + li + ' close out start');
            assert.ok(fc.start > r.lanes[li].installEnd);
            assert.equal(fc.end, S.advanceDays(fc.start, 1), 'follow up runs the whole day');
        });
    });
});

// ---- v15.79: every sub-project has its own start and install date ----
const W = (o) => S.scheduleWindows(Object.assign({ nowMs: NOW }, o));
const railLane = [{ days: 1, cat: 'fixed' }, { hours: 2, cat: 'fixed' }, { days: 3, cat: 'scheduling' }, { days: 5, cat: 'production' }, { hours: 3, cat: 'checks' },
                  { days: 2, cat: 'fixed' }, { hours: 2, cat: 'checks' }, { days: 1, cat: 'closeout' }, { hours: 2, cat: 'closeout' }];

test('windows: two sub-projects with their own dates overlap, each grown or shrunk on its own', () => {
    const r = W({ lanes: [{ tasks: railLane, startDate: '2026-11-23', endDate: '2027-01-29' },      // long window: grows
                          { tasks: railLane, startDate: '2026-12-07', endDate: '2026-12-14' }],     // short window: shrinks
                  tail: 1 });
    const [a, b] = r.lanes;
    assert.equal(a.status, 'ok'); assert.ok(b.status === 'tight' || b.status === 'confirm', b.status);
    assert.equal(a.lanes[0].tasks[0].start, wall(2026, 11, 23, 8));
    assert.equal(b.lanes[0].tasks[0].start, wall(2026, 12, 7, 8));
    assert.equal(a.end, wall(2027, 1, 29, 16)); assert.equal(b.end, wall(2026, 12, 14, 17));
    assert.ok(b.lanes[0].tasks[0].start < a.end && b.end > a.lanes[0].tasks[0].start, 'windows overlap');
    // Production stretched in the long window, shortened in the short one; checks keep their time in the long one.
    assert.ok(a.lanes[0].tasks[3].minutes > 5 * 540); assert.ok(b.lanes[0].tasks[3].minutes < 5 * 540);
    assert.equal(a.lanes[0].tasks[4].minutes, 180);
    [a, b].forEach(x => x.lanes[0].tasks.forEach(t => assert.equal(t.end % 15, 0)));
});

test('windows: the Google review follows the latest lane, wherever it is', () => {
    const r = W({ lanes: [{ tasks: railLane, endDate: '2027-02-26' }, { tasks: railLane, endDate: '2026-12-18' }], tail: 1 });
    const lastClose = Math.max(r.lanes[0].lanes[0].end, r.lanes[1].lanes[0].end);
    assert.equal(lastClose, r.lanes[0].lanes[0].end);                  // the first lane runs later
    assert.equal(r.tail.start, S.nextWorkStart(lastClose));
    assert.equal(r.finish, r.tail.end);
});

test('windows: a blank install date runs planned times from the start, no stretching', () => {
    const r = W({ lanes: [{ tasks: railLane, startDate: '2026-11-30' }] });
    const x = r.lanes[0];
    assert.equal(x.status, 'planned');
    const t = x.lanes[0].tasks;
    assert.equal(t[0].start, wall(2026, 11, 30, 8));
    assert.equal(t[0].end, wall(2026, 11, 30, 17));                    // 1 day: Monday 8 to 5
    assert.equal(t[1].minutes, 120);                                    // 2 h stays 2 h
    assert.equal(t[3].workDays, 5);
    t.forEach(z => assert.equal(z.end % 15, 0));
    // Blank start too: from now.
    const n = W({ lanes: [{ tasks: railLane }] }).lanes[0];
    assert.equal(n.lanes[0].tasks[0].start, wall(2026, 11, 18, 10));
});

test('windows: a start in the past schedules from now and says so; an install date before the start is flagged', () => {
    const p = W({ lanes: [{ tasks: railLane, startDate: '2026-11-10', endDate: '2027-01-15' }] }).lanes[0];
    assert.equal(p.pastStart, true);
    assert.equal(p.lanes[0].tasks[0].start, wall(2026, 11, 18, 10));
    const o = W({ lanes: [{ tasks: railLane, startDate: '2026-12-15', endDate: '2026-12-01' }] }).lanes[0];
    assert.equal(o.status, 'order');
    assert.equal(o.lanes[0].tasks[0].start, wall(2026, 12, 15, 8));    // planned from its start
    // mode 'planned' ignores every install date.
    const q = W({ mode: 'planned', lanes: [{ tasks: railLane, endDate: '2026-11-20' }] }).lanes[0];
    assert.equal(q.status, 'planned');
});

const jd = /\/\* ==== JOB DATES: BEGIN[\s\S]*?\/\* ==== JOB DATES: END ==== \*\//.exec(html);
const { HandoffJobDates: JD } = vm.runInNewContext(jd[0] + '\n;({ HandoffJobDates })', { Date });

test('draft migration: an older sub-project draft gives every sub-project the job install date', () => {
    const d = { scheduleVersion: 2, form: { preferredInstall: '2027-01-15' },
                subProjects: { snaps: { 0: { draft: { form: {} } }, 1: { draft: { form: { preferredInstall: '2027-03-01' } } } } } };
    JD.migrate(d);
    assert.equal(d.subProjects.snaps[0].draft.form.preferredInstall, '2027-01-15');
    assert.equal(d.subProjects.snaps[1].draft.form.preferredInstall, '2027-03-01');   // its own date stays
    assert.equal(d.subProjects.snaps[0].draft.form.prefStart, undefined);              // start stays blank
    // A v15.79 draft is left alone.
    const e = { scheduleVersion: 3, form: { preferredInstall: '2027-01-15' }, subProjects: { snaps: { 0: { draft: { form: {} } } } } };
    JD.migrate(e);
    assert.equal(e.subProjects.snaps[0].draft.form.preferredInstall, undefined);
});

test('milestone dates: every task falls inside its milestone, close out included', () => {
    // A real job: three sub-projects with their own windows plus the Job Wrap-Up review.
    const lanes = [{ tasks: railLane, endDate: '2027-01-29' }, { tasks: railLane, startDate: '2026-12-07', endDate: '2026-12-31' }, { tasks: railLane, startDate: '2027-01-04' }];
    const r = S.scheduleWindows({ nowMs: NOW, lanes, tail: 1 });
    const local = (m) => { const q = S.fmt.parts(m); return new Date(q[0], q[1] - 1, q[2]); };
    const key = (z) => z.slice(6) + z.slice(0, 2) + z.slice(3, 5);                  // MM-DD-YYYY to sortable
    const check = (tasks, ms, label) => tasks.forEach((t, i) => {
        const s0 = key(S.fmt.zohoDate(t.start)), e0 = key(S.fmt.zohoDate(t.end));
        assert.ok(s0 >= key(ms.start_date) && e0 <= key(ms.end_date), label + ' task ' + i + ' ' + s0 + '-' + e0 + ' outside ' + ms.start_date + ' to ' + ms.end_date);
    });
    r.lanes.forEach((x, li) => {
        const tasks = x.lanes[0].tasks;
        const ms = JD.milestone(tasks.map(t => ({ _start: local(t.start), _end: local(t.end) })));
        check(tasks, ms, 'lane ' + li);
        assert.equal(ms.end_date, S.fmt.zohoDate(tasks[tasks.length - 1].end));     // ends with the close out
    });
    const wrap = JD.milestone([{ _start: local(r.tail.start), _end: local(r.tail.end) }]);
    check([r.tail], wrap, 'wrap-up');
});

test('planned times for one sub-project only: the others keep their install dates', () => {
    const lanes = [{ tasks: railLane, startDate: '2026-11-23', endDate: '2027-01-29' }, { tasks: railLane, startDate: '2026-12-07', endDate: '2026-12-08' }];
    const first = S.scheduleWindows({ nowMs: NOW, lanes, tail: 1 });
    assert.equal(first.lanes[0].status, 'ok'); assert.equal(first.lanes[1].status, 'confirm');
    // The failing one switches; the one that fits keeps its window and every due time.
    const fail = first.lanes.map(r => ['confirm', 'none', 'past', 'order'].indexOf(r.status) !== -1);
    const second = S.scheduleWindows({ nowMs: NOW, lanes: lanes.map((l, i) => Object.assign({}, l, { planned: fail[i] })), tail: 1 });
    assert.equal(second.lanes[0].status, 'ok');
    assert.equal(second.lanes[1].status, 'planned');
    assert.equal(JSON.stringify(second.lanes[0].lanes[0].tasks.map(t => [t.start, t.end])), JSON.stringify(first.lanes[0].lanes[0].tasks.map(t => [t.start, t.end])));
    assert.equal(second.lanes[1].lanes[0].tasks[0].start, wall(2026, 12, 7, 8));      // planned from its own start
});

test('demolition and disposal: notes only, never a task', () => {
    const arch = /const ARCHETYPES = \[[\s\S]*?\n        \];/.exec(html)[0];
    assert.equal(/Removal|Disposal|Remove Existing|demoSold/.test(arch), false);
    assert.ok(arch.indexOf("name: 'Install Site Protection'") !== -1);                 // site protection stays a task
    // Every box ticked: six notes, stairs, rails, stub walls, demolition before disposal, real line breaks.
    const all = { demoStairsDemo: 1, demoStairsDisp: 1, demoRailsDemo: 1, demoRailsDisp: 1, demoStubDemo: 1, demoStubDisp: 1 };
    const n = JD.demoNotes(all);
    assert.equal(n.length, 6);
    assert.equal(n[0], 'Demolition - Stairs\nIncludes\n- Demolition of existing stairs\n- Drywall work by others\n- Rough framing additional cost');
    assert.equal(n[1], 'Disposal - Stairs\nIncludes\n- Removal of demolition waste materials\n- Disposal of demolition waste materials');
    assert.equal(n[2], 'Demolition - Rails\nIncludes\n- Demolition of existing railing\n- Electrical work by others\n- Drywall work by others');
    assert.equal(n[3], 'Disposal - Rails\nIncludes\n- Removal of demolition waste materials\n- Disposal of demolition waste materials');
    assert.equal(n[4], 'Demolition - Stub Walls\nIncludes\n- Demolition of existing stub walls\n- Electrical work by others\n- Drywall work by others');
    assert.equal(n[5], 'Disposal - Stub Walls\nIncludes\n- Removal of demolition waste materials\n- Disposal of demolition waste materials');
    assert.equal(n[0].split('\n').length, 5);
    // Nothing ticked: no notes. Every tick gives its note, one for one (Jeff's three ticks, three notes).
    assert.equal(JD.demoNotes({}).length, 0);
    const heads = (t) => JSON.stringify(JD.demoNotes(t).map(x => x.split('\n')[0]));
    assert.equal(heads({ demoStairsDemo: 1, demoRailsDemo: 1, demoStubDisp: 1 }), JSON.stringify(['Demolition - Stairs', 'Demolition - Rails', 'Disposal - Stub Walls']));
    assert.equal(heads({ demoStubDisp: 1 }), JSON.stringify(['Disposal - Stub Walls']));
    // No rule leaves a note out by job type: no row is hidden by the stairs or railing answers.
    assert.equal(/demoRowShown|jobGateAnswers/.test(html), false);
    // Section titles are read without the summary pill, so "2 notes" never joins the title.
    assert.ok(/bare\.querySelectorAll\('\.sec-chev, \.sec-badge'\)\.forEach\(x => x\.remove\(\)\)/.test(html));
    // No em dashes in the note text.
    assert.equal(/\u2014/.test(n.join('')), false);
});

test('draft migration: demolition and disposal Yes ticks Rails demolition and disposal', () => {
    const a = { demoDisposal: 'Yes' };
    JD.migrateDemo(a);
    assert.deepEqual(a, { demoConfirmed: 'Yes', demoRailsDemo: 'Yes', demoRailsDisp: 'Yes' });
    const b = { demoDisposal: 'No' };
    JD.migrateDemo(b);
    assert.deepEqual(b, { demoConfirmed: 'Yes' });
    // Already on the new boxes: left as they are.
    const c = { demoDisposal: 'Yes', demoStubDemo: 'Yes', demoRailsDisp: 'Yes' };
    JD.migrateDemo(c);
    assert.deepEqual(c, { demoStubDemo: 'Yes', demoRailsDisp: 'Yes', demoConfirmed: 'Yes' });
    const d = { projectType: 'Renovation' };
    JD.migrateDemo(d);
    assert.deepEqual(d, { projectType: 'Renovation' });
    // The question asks for exactly these six boxes, and sub-projects share them.
    ['demoStairsDemo', 'demoStairsDisp', 'demoRailsDemo', 'demoRailsDisp', 'demoStubDemo', 'demoStubDisp'].forEach(nm => {
        assert.ok(html.indexOf('name="' + nm + '"') !== -1, nm);
        assert.ok(new RegExp("SHARED_FORM = \\[[^\\]]*'" + nm + "'").test(html), nm + ' shared');
    });
});

test('demolition and disposal boxes: Production Notes entries, project only, sent once', () => {
    assert.equal(JD.demoNoteText('demoRailsDisp'), 'Disposal - Rails\nIncludes\n- Removal of demolition waste materials\n- Disposal of demolition waste materials');
    assert.equal(JD.demoNoteText('demoStubDemo').split('\n')[0], 'Demolition - Stub Walls');
    assert.equal(JD.demoKeyOf('Demolition - Stairs\nIncludes\n- edited text'), 'demoStairsDemo');
    assert.equal(JD.demoKeyOf('Disposal - Stub Walls'), 'demoStubDisp');
    assert.equal(JD.demoKeyOf('Customer wants oak'), '');
    // No hidden add at Generate: notes come from notes[] only, and the Deal gets the typed notes only.
    assert.equal(/allNotes = treadNotes\.concat\(formData\.getAll\('notes\[\]'\)\);/.test(html), true);
    assert.equal(html.indexOf('window.demoNotes'), -1);
    assert.ok(/const notesToPush = dealNotes\.filter/.test(html));
    assert.ok(/dealNotes = treadNotes\.concat\(noteAreas\.filter\(t => !t\.hasAttribute\('data-demo-key'\)\)/.test(html));
    assert.ok(/project_only_notes: demoNoteTexts/.test(html));
    // Drafts keep which notes are demolition boxes, and sub-projects share them like every note.
    assert.ok(/formState\.demoNoteKeys = /.test(html));
    assert.ok(/SHARED_FORM = \[[^\]]*'demoNoteKeys'[^\]]*'notes\[\]'/.test(html));
});

test('switching to renovation asks site protection and demolition open, then folds back', () => {
    // Demolition is answered only once confirmed (None sold / Continue); travel waits for it.
    assert.ok(/name="demoConfirmed"/.test(html) && /id="demoContinue"/.test(html));
    assert.ok(/qTravel:[\s\S]{0,200}demoConfirmed/.test(html));
    assert.equal(/data-q-until="input\[name=&quot;jobHasTravel/.test(html), false);
    // A new project type clears both renovation answers; an answer folds the bar; the count box hides once answered.
    assert.ok(/e\.target\.name === 'projectType'\) \{[\s\S]{0,300}siteProtection[\s\S]{0,300}demoConfirmed/.test(html));
    assert.ok(/window\.foldAnswers = \(\) => \{ answersExpanded = false; \}/.test(html));
    assert.ok(/\.q-answered > \.sub-count-row \{ display: none !important; \}|\.q-answered > \.sub-count-row/.test(html));
});

test('project description: built in the widget with real line breaks; Deluge uses it', () => {
    const notes = 'Demolition - Rails\nIncludes\n- Demolition of existing railing\n\n---\n\nCustomer wants oak';
    const d = JD.projectDescription({ address: '12 Elm St, Calgary', dateTitle: 'Install date', dateLabel: 'Wed, Dec 23, 2026', notes });
    assert.equal(d, 'Site: 12 Elm St, Calgary\nInstall date: Wed, Dec 23, 2026\nProduction notes:\n' + notes);
    assert.equal(d.indexOf('\\n'), -1);                                   // no backslash-n characters
    assert.equal(/Auto-generated/.test(d), false);
    // Lines only when set: no address, no date, no notes.
    assert.equal(JD.projectDescription({ dateTitle: 'Pickup date', dateLabel: 'Fri, Dec 18, 2026', notes: '' }), 'Pickup date: Fri, Dec 18, 2026');
    assert.equal(JD.projectDescription({ notes: 'Only a note' }), 'Production notes:\nOnly a note');
    assert.equal(JD.projectDescription({}), '');
    assert.ok(/capturedData\.project_description = HandoffJobDates\.projectDescription\(/.test(html));
    // The function: a real line break from urlDecode, the widget's text first, no backslash-n left in any text it writes.
    const dg = fs.readFileSync(path.join(__dirname, '..', 'deluge_handoff_function.dg'), 'utf8');
    assert.ok(/NL = zoho\.encryption\.urlDecode\("%0A"\);/.test(dg));
    assert.ok(/projDesc = ifnull\(payloadData\.get\("project_description"\),""\);/.test(dg));
    const code = dg.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.equal(/(^|[^\\])\\n/.test(code), false);       // a "\n" literal; "\\n" (a regex) is fine
});

test('CRM notes: one Status post per note on the project, no CRM Notes.txt', () => {
    const dg = fs.readFileSync(path.join(__dirname, '..', 'deluge_handoff_function.dg'), 'utf8');
    // CRM Notes.txt only holds notes that could not be posted.
    assert.equal((dg.match(/"CRM Notes\.txt"/g) || []).length, 2);
    assert.ok(/if\(notPosted != "" && docFolder != ""\)/.test(dg));
    assert.ok(/"\/projects\/" \+ newProjectId \+ "\/status"/.test(dg));               // v3 project Status
    assert.ok(/noteKeys = noteKeys\.sort\(true\);/.test(dg));                            // oldest first (the API ignores sort_by)
    ['IRONWOOD_DRAFT', 'Zoho Project - ', 'Handoff diagnostics', '[Handoff Feedback]', 'Production Handoff Note']
        .forEach(t => assert.ok(dg.indexOf('!cnTitle.startsWith("' + t + '")') !== -1, t));
    assert.ok(/cnTitle = "Note";/.test(dg));
    // Counted in the result line, never failing the handoff; a re-run skips posts already there.
    assert.ok(/" Notes: " \+ noteOk \+ " posted, " \+ noteFail \+ " failed"/.test(dg));
    assert.ok(/existingPosts\.contains\("<b>" \+ titleEsc \+ "<\/b>"\)/.test(dg));
    // No break or continue (Deluge has neither).
    const code = dg.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.equal(/\bcontinue;|\bbreak;/.test(code), false);
});
