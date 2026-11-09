import { useEffect, useState } from 'react';
import { listWeeksForClass } from '../lib/weeksApi.js';
import { listSkillsForWeek } from '../lib/skillsApi.js';
import { listAssessmentsForSkill } from '../lib/assessmentsApi.js';
import { listClassStudents } from '../lib/studentsApi.js';
import { colors } from '../lib/theme.js';

const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const stamp = (w) => w.createdAt?.seconds || 0;
const buttonStyle = { border: '1px solid #b9cec3', borderRadius: 7, padding: '6px 12px', color: colors.primary, background: '#fff', cursor: 'pointer' };

async function loadTeacherHistory(schoolId, assignments) {
  const histories = await Promise.all(assignments.map(async (a) => {
    const [weeks, students] = await Promise.all([
      listWeeksForClass(schoolId, a.classId, a.teacherUid, a.id),
      listClassStudents(schoolId, a.classId),
    ]);
    const entries = await Promise.all(weeks.map(async (week) => {
      const skills = await listSkillsForWeek(schoolId, week.id);
      const assessments = await Promise.all(skills.map((skill) => listAssessmentsForSkill(schoolId, skill.id)));
      const recorded = assessments.reduce((n, map) => n + students.filter((student) => Boolean(map[student.id]?.status)).length, 0);
      const total = students.length * skills.length;
      const mastered = assessments.reduce((n, map) => n + students.filter((student) => map[student.id]?.status === 'mastered').length, 0);
      return { week, skills, recorded, completion: total ? Math.round(recorded * 100 / total) : null,
        mastery: recorded ? Math.round(mastered * 100 / recorded) : null, assignment: a };
    }));
    return entries.filter((e) => e.recorded > 0);
  }));
  return histories.flat();
}

function buildRows(entries) {
  const measurements = entries.filter((e) => e.week.type !== 'remediation');
  const remediations = entries.filter((e) => e.week.type === 'remediation');
  const used = new Set();
  const rows = measurements.map((measurement) => {
    const sourceTitles = new Set(measurement.skills.map((s) => normalize(s.title)));
    const linked = remediations.filter((r) => {
      if (r.assignment.classId !== measurement.assignment.classId || r.assignment.teacherUid !== measurement.assignment.teacherUid) return false;
      if (r.week.sourceMeasurementWeekId) return r.week.sourceMeasurementWeekId === measurement.week.id;
      if (stamp(r.week) < stamp(measurement.week)) return false;
      return r.skills.some((skill) => normalize(skill.sourceWeekName) === normalize(measurement.week.name) &&
        (skill.sourceWeekType === 'measurement' || !skill.sourceWeekType) && sourceTitles.has(normalize(skill.title)));
    });
    linked.forEach((r) => used.add(r.week.id));
    return { measurement, linked };
  });
  remediations.filter((r) => !used.has(r.week.id)).forEach((r) => rows.push({ measurement: null, linked: [r] }));
  return rows.sort((a, b) => stamp(b.measurement?.week || b.linked[0]?.week) - stamp(a.measurement?.week || a.linked[0]?.week));
}

export default function TeacherCumulativeTracking({ schoolId, assignments, teachers, onReport }) {
  const [teacherUid, setTeacherUid] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setEntries([]); }, [teacherUid, schoolId]);
  const teacherAssignments = assignments.filter((a) => a.teacherUid === teacherUid && a.active !== false);
  async function load() {
    if (!teacherUid) return;
    setLoading(true); setError('');
    try { setEntries(await loadTeacherHistory(schoolId, teacherAssignments)); }
    catch (err) { setError(err.message || 'تعذّر تحميل سجل القياسات.'); }
    finally { setLoading(false); }
  }
  const rows = buildRows(entries).filter(row => classFilter === 'all' || (row.measurement || row.linked[0])?.assignment.classId === classFilter);
  const open = (e) => onReport({
    classId: e.assignment.classId, teacherUid: e.assignment.teacherUid, assignmentId: e.assignment.id,
    className: e.assignment.className || '', teacherName: e.assignment.teacherName || '',
    subject: e.assignment.subject || '', weekId: e.week.id, weekName: e.week.name,
  });
  const noteTarget = (e) => onReport({
    classId: e.assignment.classId, teacherUid: e.assignment.teacherUid, assignmentId: e.assignment.id,
    className: e.assignment.className || '', teacherName: e.assignment.teacherName || '',
    subject: e.assignment.subject || '', weekId: e.week.id, weekName: e.week.name,
  });
  const weekControl = (e) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
    <button type="button" style={{ ...buttonStyle, border: 'none', textDecoration: 'underline', fontWeight: 700 }} onClick={() => open(e)} aria-label={'فتح تقرير ' + e.week.name}>{e.week.name}</button>
    <button type="button" title="ملاحظة المديرة على هذا التقرير" aria-label={'ملاحظة على ' + e.week.name} onClick={() => noteTarget(e)} style={{ ...buttonStyle, padding: '5px 8px' }}>✎</button>
  </span>;
  return <section dir="rtl" style={{ border: '1px solid #dce5de', borderRadius: 12, padding: 16, marginBottom: 20 }}>
    <h3 style={{ marginTop: 0 }}>تجربة متابعة المعلمة — القياس والمعالجة</h3>
    <p style={{ fontSize: 13, color: colors.textMuted }}>نموذج مستقل للاختبار. اضغطي اسم الأسبوع لفتح التقرير الكامل، أو رمز القلم لكتابة ملاحظة على التقرير.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginBottom: 14 }}>
      <label>المعلمة <select value={teacherUid} onChange={(e) => {setTeacherUid(e.target.value);setClassFilter('all');}} style={{ display: 'block', padding: 9, minWidth: 160 }}>
        <option value="">اختاري المعلمة</option>{teachers.map(t => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
      </select></label>
      <label>الفصل <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ display: 'block', padding: 9, minWidth: 130 }}>
        <option value="all">جميع الفصول</option>{teacherAssignments.map(a => <option key={a.id} value={a.classId}>{a.className || a.classId}</option>)}
      </select></label>
      <button type="button" onClick={load} disabled={!teacherUid || loading} style={buttonStyle}>{loading ? 'جارٍ التحميل...' : 'عرض / تحديث'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {!loading && teacherUid && !entries.length && <p style={{ color: colors.textMuted }}>لا توجد تقارير محمّلة لهذه المعلمة.</p>}
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map((row, i) => {
        const m = row.measurement;
        const ref = m || row.linked[0];
        return <article key={(m?.week.id || 'unlinked') + i} style={{ border: '1px solid #dce5de', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: 14 }}>
            <strong>{ref.assignment.className || ref.assignment.classId} | {ref.assignment.subject || 'المادة'}</strong>
            {m && <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: colors.textMuted }}>أسبوع القياس</div>
              {weekControl(m)}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={{ padding: 9, background: '#f4f7f5', borderRadius: 7 }}>اكتمال الرصد: <b>{m.completion == null ? '—' : m.completion + '%'}</b></span>
                <span style={{ padding: 9, background: '#f4f7f5', borderRadius: 7 }}>الإتقان: <b>{m.mastery == null ? '—' : m.mastery + '%'}</b></span>
              </div>
            </div>}
          </div>
          {row.linked.length > 0 && <div style={{ borderTop: m ? '1px solid #e1e9e4' : 'none', padding: 14 }}>
            {m && <strong style={{ fontSize: 13 }}>المعالجات المرتبطة بهذا القياس</strong>}
            {row.linked.map(t => <div key={t.week.id} style={{ background: '#f7faf8', padding: 11, borderRadius: 8, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: colors.textMuted }}>أسبوع المعالجة</div>
              {weekControl(t)}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
                <span>اكتمال المعالجة: <b>{t.completion == null ? '—' : t.completion + '%'}</b></span>
                <span>الإتقان بعد المعالجة: <b>{t.mastery == null ? '—' : t.mastery + '%'}</b></span>
              </div>
            </div>)}
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
