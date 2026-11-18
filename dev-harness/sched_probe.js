const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('/home/devserver/Projects/ironwood-handoff-app/index.html', 'utf8');
const m = /\/\* ==== SCHEDULER: BEGIN[\s\S]*?\/\* ==== SCHEDULER: END ==== \*\//.exec(html);
const { HandoffScheduler: S } = vm.runInNewContext(m[0] + '\n;({ SCHEDULE_CONFIG, HandoffScheduler })', {});
const F = S.fmt;
const ab = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h + 6, mi);
// 1. fit() where fixed fits but checks' 1 h minimums push it over
const ts = [['fixed',9],['fixed',27],['fixed',2],['fixed',9],['fixed',9],['checks',1],['scheduling',27],['scheduling',9],['checks',2],['production',63],['checks',3],['fixed',18],['checks',1],['checks',2]].map(([c,h])=>({cat:c,p:h*60}));
const r = S.fit(ts, 77*60);
console.log('fit squeezed', r.squeezed, 'fixed', r.fixed/60, 'mins(h)', r.mins.map(x=>(x/60).toFixed(1)).join(' '));
// 2. holidays
[2026,2027,2028].forEach(y => console.log(y, JSON.stringify(S.holidaysOfYear(y))));
// 3. install-date edge cases, now = Wed Nov 18 10:00
const lane = [[{hours:9,cat:'fixed'},{hours:45,cat:'production'},{hours:18,cat:'fixed'},{hours:9,cat:'closeout'}]];
const show = (lbl, o) => { const x = S.schedule(Object.assign({ lanes: lane, tail: null }, o)); console.log(lbl, x.status, 'avail', x.availableMinutes/60, 'end', F.dayTime(x.end), x.lanes[0] ? x.lanes[0].tasks.map(t => F.dayTime(t.start) + '->' + F.dayTime(t.end)).join(' ; ') : ''); };
show('today before close', { installDate: '2026-11-18', nowMs: ab(2026,11,18,10) });
show('today after close', { installDate: '2026-11-18', nowMs: ab(2026,11,18,17,30) });
show('today 16:59:30', { installDate: '2026-11-18', nowMs: ab(2026,11,18,16,59) + 30000 });
show('yesterday', { installDate: '2026-11-17', nowMs: ab(2026,11,18,10) });
show('sat install', { installDate: '2026-12-05', nowMs: ab(2026,11,18,10) });
show('xmas install', { installDate: '2026-12-25', nowMs: ab(2026,11,18,10) });
show('boxing observed Mon Dec 28', { installDate: '2026-12-28', nowMs: ab(2026,11,18,10) });
show('year end Jan 4', { installDate: '2027-01-04', nowMs: ab(2026,12,18,10) });
show('now saturday', { installDate: '2026-12-15', nowMs: ab(2026,11,21,10) });
show('now friday 15:30 install mon', { installDate: '2026-11-23', nowMs: ab(2026,11,20,15,30) });
show('Fri install friday close', { installDate: '2026-11-27', nowMs: ab(2026,11,18,10) });
// 4. Good Friday 2027
console.log('Easter 2027', F.iso(S.easter(2027)*1440), 'GF', S.holidayOfIso('2027-03-26'));
// 5. allocate / percents with long tails
console.log(S.percents([0.01,0.01,1000]), S.allocate([1,1,1,1],3));
// 6. Midnight UTC edge: now 23:30 Alberta Nov 18 => utc Nov 19 05:30
console.log('todayIso at 23:30 AB', S.todayIso(ab(2026,11,18,23,30)), ' at 00:30 AB', S.todayIso(ab(2026,11,19,0,30)));
// 7. Follow up after a Thursday install
const x = S.schedule({ lanes: [[{hours:9,cat:'fixed'},{hours:9,cat:'closeout'},{hours:2,cat:'closeout'},{hours:1,cat:'closeout'}]], tail: null, installDate: '2026-11-26', nowMs: ab(2026,11,18,10) });
console.log('closeout after Thu install', x.lanes[0].tasks.map(t => t.after ? F.dayTime(t.start) + '->' + F.dayTime(t.end) : '').join(' | '));
// 8. sub-projects: two lanes + tail
const y = S.schedule({ lanes: [[{hours:9,cat:'fixed'},{hours:45,cat:'production'},{hours:18,cat:'fixed'},{hours:9,cat:'closeout'},{hours:2,cat:'closeout'}],[{hours:9,cat:'fixed'},{hours:9,cat:'production'},{hours:9,cat:'fixed'},{hours:9,cat:'closeout'},{hours:2,cat:'closeout'}]], tail: 1, installDate: '2026-12-23', nowMs: ab(2026,11,18,10) });
y.lanes.forEach((l,i) => console.log('lane', i, 'installEnd', F.dayTime(l.installEnd), 'end', F.dayTime(l.end)));
console.log('tail', F.dayTime(y.tail.start), F.dayTime(y.tail.end), y.status);
