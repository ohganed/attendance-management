const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'attendance-enhancements.js'), 'utf8');
const start = source.indexOf('function previousHandoff(');
const end = source.indexOf('async function saveHandoff(', start);
assert.ok(start >= 0 && end > start);
const { previousHandoff, handoffSeed } = vm.runInNewContext(`${source.slice(start, end)};({previousHandoff,handoffSeed})`);

const ctx = { classId: 'class-A', schoolId: 'school-B', date: '2026-11-11' };
const previous = { classId: 'class-A', schoolId: 'school-B', date: '2026-11-10', nextTime: '硬化油' };

test('consecutive-day lessons prefill the previous next-time plan', () => {
  const prev = previousHandoff({ lessonHandoffs: [previous] }, ctx);
  assert.equal(handoffSeed({}, ctx, prev, {}).text, '硬化油');
  assert.equal(handoffSeed({}, ctx, prev, {}).carried, true);
});

test('breaks between lessons still carry the plan', () => {
  assert.equal(handoffSeed({}, ctx, { ...previous, date: '2026-11-05' }, {}).text, '硬化油');
});

test('saved empty and manually edited starts are never replaced', () => {
  assert.equal(handoffSeed({}, ctx, previous, { startWith: '' }).text, '');
  assert.equal(handoffSeed({}, ctx, previous, { startWith: '復習' }).text, '復習');
});

test('previous record selection is limited to the same class, school and past dates', () => {
  const records = [
    previous,
    { ...previous, classId: 'class-C', date: '2026-11-10', nextTime: '別クラス' },
    { ...previous, schoolId: 'school-C', date: '2026-11-10', nextTime: '別校' },
    { ...previous, date: '2026-11-11', nextTime: '同日' },
  ];
  assert.equal(previousHandoff({ lessonHandoffs: records }, ctx).nextTime, '硬化油');
});

test('no previous plan means no automatic entry', () => {
  assert.equal(handoffSeed({}, ctx, null, {}).text, '');
  assert.equal(handoffSeed({}, ctx, { ...previous, nextTime: '' }, {}).text, '');
});
