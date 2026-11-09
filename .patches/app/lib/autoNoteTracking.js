import { getWeek, listWeeksForClass } from './weeksApi.js';
import { listSkillsForWeek } from './skillsApi.js';
import { listAssessmentsForWeek } from './assessmentsApi.js';
import { listClassStudents } from './studentsApi.js';

// Keep Firestore's strict adminNotes schema unchanged: tracking metadata lives only in context.
const TOKEN = /\s*\[MONJAZI_AUTO:(completion|remediation|reassessment):([a-zA-Z0-9_-]{1,120})\]\s*$/;
export const AUTO_ACTIONS = {
  completion: 'استكمال الرصد',
  remediation: 'تنفيذ المعالجة',
  reassessment: 'إعادة القياس',
};
export function encodeAutoContext(context, action, sourceWeekId) {
  const clean = String(context || '').trim();
  if (!AUTO_ACTIONS[action] || !/^[a-zA-Z0-9_-]{1,120}$/.test(sourceWeekId || '')) return clean.slice(0, 600);
  const suffix = ' [MONJAZI_AUTO:' + action + ':' + sourceWeekId + ']';
  return clean.slice(0, 600 - suffix.length) + suffix;
}
export function readAutoContext(context) {
  const match = String(context || '').match(TOKEN);
  return match ? { action: match[1], sourceWeekId: match[2] } : null;
}
export function visibleNoteContext(context) {
  return String(context || '').replace(TOKEN, '').trim();
}
export function noteAutoLabel(note) {
  const meta = readAutoContext(note.context);
  return meta ? AUTO_ACTIONS[meta.action] : null;
}

const millis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
export function calculateRecordProgress(skills, studentIds, bySkill, sentAt) {
  const students = [...new Set(studentIds.filter(Boolean))];
  const total = students.length * skills.length;
  let recorded = 0, updatedAfterNotice = false;
  for (const skill of skills) {
    const map = bySkill[skill.id] || {};
    for (const studentId of students) {
      const assessment = map[studentId];
      if (!assessment?.status) continue;
      recorded++;
      if (sentAt > 0 && millis(assessment.updatedAt) >= sentAt) updatedAfterNotice = true;
    }
  }
  return { recorded, total, updatedAfterNotice, complete: total > 0 && recorded === total };
}
function evidenceFrom(week, progress) {
  return {
    weekId: week.id, weekName: week.name, weekType: week.type,
    classId: week.classId, assignmentId: week.assignmentId,
    teacherUid: week.teacherUid, recorded: progress.recorded, total: progress.total,
  };
}
export function decideAutoStatus(action, source, candidates, noteTime) {
  if (!noteTime) return { state: 'unverified', reason: 'تعذّر تحديد تاريخ إرسال الملاحظة' };
  const eligible = action === 'completion' ? [source] : candidates;
  if (!eligible.length) return { state: 'waiting', reason: action === 'completion' ? 'لم يبدأ تحديث الرصد بعد إرسال الملاحظة' : 'لم يُعثر على تقرير مرتبط موثق' };
  const completed = eligible.filter(e => e.progress.complete && e.progress.updatedAfterNotice);
  if (completed.length) {
    const hit = completed[completed.length - 1];
    return { state: 'complete', evidence: evidenceFrom(hit.week, hit.progress), reason: 'اكتمل الرصد بعد إرسال الملاحظة' };
  }
  const progressed = eligible.filter(e => e.progress.recorded > 0 && e.progress.updatedAfterNotice);
  if (progressed.length) {
    const hit = progressed[progressed.length - 1];
    return { state: 'progress', evidence: evidenceFrom(hit.week, hit.progress), reason: 'رُصدت نتائج بعد الملاحظة ولم يكتمل الرصد' };
  }
  return { state: 'waiting', reason: 'لا يوجد رصد جديد مثبت بعد تاريخ الملاحظة' };
}

export async function loadAutoNoteStatuses(schoolId, notes) {
  const tracked = notes.filter(n => n.kind === 'action' && readAutoContext(n.context));
  const results = {};
  const weekCache = new Map(), historyCache = new Map(), progressCache = new Map();
  const cached = (cache, key, run) => {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(run));
    return cache.get(key);
  };
  async function progressFor(week, sentAt) {
    const key = week.id + '|' + sentAt;
    return cached(progressCache, key, async () => {
      const [skills, bySkill, students] = await Promise.all([
        listSkillsForWeek(schoolId, week.id),
        listAssessmentsForWeek(schoolId, week.id),
        week.studentSnapshot?.length ? Promise.resolve(week.studentSnapshot) : listClassStudents(schoolId, week.classId),
      ]);
      return calculateRecordProgress(skills, students.map(s => s.id), bySkill, sentAt);
    });
  }
  async function evaluate(note) {
    const meta = readAutoContext(note.context);
    const sentAt = millis(note.createdAt);
    if (!sentAt) return { state: 'unverified', reason: 'تاريخ الملاحظة غير متوفر' };
    const source = await cached(weekCache, meta.sourceWeekId, () => getWeek(schoolId, meta.sourceWeekId));
    if (source.deleted || source.teacherUid !== note.teacherUid || !note.assignmentId) {
      return { state: 'unverified', reason: 'تعذّر التحقق من مصدر التقرير أو إسناده' };
    }
    const key = source.classId + '|' + note.teacherUid + '|' + note.assignmentId;
    const weeks = await cached(historyCache, key, () => listWeeksForClass(schoolId, source.classId, note.teacherUid, note.assignmentId));
    if (!weeks.some(w => w.id === source.id)) {
      return { state: 'unverified', reason: 'التقرير خارج إسناد المعلمة' };
    }
    const original = { week: source, progress: await progressFor(source, sentAt) };
    if (meta.action === 'completion') return decideAutoStatus(meta.action, original, [], sentAt);
    if (source.type !== 'measurement') return { state: 'unverified', reason: 'يتطلب هذا الإجراء أسبوع قياس أصليًا' };
    // A documented relationship is mandatory: never infer a source from week number alone.
    const linked = weeks.filter(w => w.type === 'remediation' && w.sourceMeasurementWeekId === source.id && !w.deleted);
    const candidates = await Promise.all(linked.map(async week => ({ week, progress: await progressFor(week, sentAt) })));
    // Recorded results of a linked remediation week constitute the follow-up measurement.
    return decideAutoStatus(meta.action, original, candidates, sentAt);
  }
  // Bound concurrent Firestore reads; the status is derived on each visit, never written as a false approval.
  let index = 0;
  async function worker() {
    while (index < tracked.length) {
      const note = tracked[index++];
      try { results[note.id] = await evaluate(note); }
      catch (err) { results[note.id] = { state: 'unverified', reason: err?.code === 'permission-denied' ? 'لا توجد صلاحية كافية للتحقق من نتائج الرصد' : (err.message || 'تعذّر قراءة بيانات الرصد') }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, tracked.length) }, () => worker()));
  return results;
}
