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
        'Review Drawing and Take Off': 'checks', 'Existing Railing Removal': 'fixed', 'Install Site Protection': 'fixed',
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
