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
      listWeeksForClass(schoolId, a.classId, a.teacherUid),
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
  const rows = buildRows(entries);
  const open = (e) => onReport({
    classId: e.assignment.classId, teacherUid: e.assignment.teacherUid, assignmentId: e.assignment.id,
    className: e.assignment.className || '', teacherName: e.assignment.teacherName || '',
    subject: e.assignment.subject || '', weekId: e.week.id, weekName: e.week.name,
  });
  return <section dir="rtl" style={{ border: '1px solid #dce5de', borderRadius: 12, padding: 16, marginBottom: 20 }}>
    <h3 style={{ marginTop: 0 }}>السجل التراكمي للقياس والمعالجة</h3>
    <p style={{ fontSize: 13, color: colors.textMuted }}>يعرض القياسات المسجلة فعليًا فقط، وكل قياس في صف مستقل. لا تُربط المعالجة بالقياس إلا عند توثيق مصدر المهارة.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
      <label htmlFor="cumulative-teacher">المعلمة</label>
      <select id="cumulative-teacher" value={teacherUid} onChange={(e) => setTeacherUid(e.target.value)} style={{ padding: 9, minWidth: 200 }}>
        <option value="">اختاري المعلمة</option>
        {teachers.map((t) => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}
      </select>
      <button type="button" onClick={load} disabled={!teacherUid || loading} style={buttonStyle}>{loading ? 'جارٍ التحميل...' : 'عرض السجل / تحديث'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    {!loading && teacherUid && !entries.length && <p style={{ color: colors.textMuted }}>لا توجد قياسات محمّلة لهذه المعلمة. اضغطي «عرض السجل / تحديث» للتحقق.</p>}
    {!!rows.length && <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850, textAlign: 'right', fontSize: 13 }}>
      <thead><tr>{['الفصل / المادة','أسبوع القياس','اكتمال الرصد','الإتقان','تقرير القياس','أسبوع المعالجة','نتائج المعالجة','تقرير المعالجة'].map((h) => <th key={h} style={{ padding: 10, borderBottom: '2px solid #c8d7ce', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => {
        const m = row.measurement;
        const treatments = row.linked;
        const ref = m || treatments[0];
        return <tr key={(m?.week.id || 'orphan') + '-' + i} style={{ background: i % 2 ? '#f7faf8' : '#fff' }}>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{ref.assignment.className || ref.assignment.classId} / {ref.assignment.subject || '—'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{m?.week.name || '—'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{m?.completion == null ? '—' : m.completion + '%'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{m?.mastery == null ? '—' : m.mastery + '%'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{m && <button type="button" style={buttonStyle} onClick={() => open(m)}>عرض التقرير</button>}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{treatments.length ? treatments.map((t) => t.week.name).join('، ') : '—'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{treatments.length ? 'توجد معالجة مسجلة؛ النتيجة غير مثبتة في هذا السجل' : 'لم تُسجل معالجة مرتبطة'}</td>
          <td style={{ padding: 9, borderBottom: '1px solid #e4ebe6' }}>{treatments.map((t) => <button type="button" key={t.week.id} style={{ ...buttonStyle, margin: 2 }} onClick={() => open(t)}>عرض التقرير</button>)}</td>
        </tr>;
      })}</tbody>
    </table></div>}
    {!!rows.length && <p style={{ fontSize: 12, color: colors.textMuted }}>المعالجات التي لا تتضمن رابط مصدر موثق تظهر في صف مستقل، ولا يُفترض أنها نتيجة لقياس محدد.</p>}
  </section>;
}
