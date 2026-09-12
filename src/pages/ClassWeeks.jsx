import { useEffect, useState } from 'react';
import { listWeeksForClass, createWeek, copyWeek, deleteWeekWithData, countActiveActionsForWeek, copySelectedSkillsToNewWeek } from '../lib/weeksApi';
import { listSkillsForWeek } from '../lib/skillsApi';
import { SCHOOL_WEEK_NAMES } from '../lib/schoolWeekNames';
import WeekDetail from './WeekDetail';
import StudentReport from './StudentReport';
import ClassReport from './ClassReport';
import { colors, font, radius, spacing } from '../lib/theme';

const TYPE_LABELS = { measurement: 'قياس', remediation: 'معالجة' };

export default function ClassWeeks({ schoolId, classId, teacherUid, teacherName, className, subject, onBack }) {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [type, setType] = useState('measurement');
  const [enrichmentLink, setEnrichmentLink] = useState('');
  const [creating, setCreating] = useState(false);

  const [copySourceId, setCopySourceId] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copyType, setCopyType] = useState('remediation');
  const [copying, setCopying] = useState(false);

  const [expandedWeekIds, setExpandedWeekIds] = useState(new Set());
  const [skillsByWeek, setSkillsByWeek] = useState({});
  const [selectedSkillIds, setSelectedSkillIds] = useState(new Set());
  const [mergeName, setMergeName] = useState('');
  const [mergeType, setMergeType] = useState('remediation');
  const [merging, setMerging] = useState(false);

  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [showClassReport, setShowClassReport] = useState(false);
  const [deletingWeekId, setDeletingWeekId] = useState(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const rows = await listWeeksForClass(schoolId, classId, teacherUid);
      setWeeks(rows);
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الأسابيع الدراسية.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createWeek(schoolId, { classId, teacherUid, name, type, enrichmentLink });
      setName('');
      setType('measurement');
      setEnrichmentLink('');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الأسبوع الدراسي.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(e) {
    e.preventDefault();
    setError('');
    if (!copySourceId || !copyName.trim() || copying) return;
    setCopying(true);
    try {
      await copyWeek(schoolId, copySourceId, { classId, teacherUid, name: copyName, type: copyType });
      setCopySourceId('');
      setCopyName('');
      setCopyType('remediation');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر نسخ الأسبوع الدراسي.');
    } finally {
      setCopying(false);
    }
  }

  async function toggleWeekExpand(weekId) {
    setExpandedWeekIds((prev) => {
      const next = new Set(prev);
      if (next.has(weekId)) next.delete(weekId);
      else next.add(weekId);
      return next;
    });
    if (!skillsByWeek[weekId]) {
      try {
        const rows = await listSkillsForWeek(schoolId, weekId);
        setSkillsByWeek((prev) => ({ ...prev, [weekId]: rows }));
      } catch (err) {
        setError(err.message || 'تعذّر تحميل مهارات هذا الأسبوع.');
      }
    }
  }

  function toggleSkillSelected(skillId) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  async function handleMerge(e) {
    e.preventDefault();
    setError('');
    if (selectedSkillIds.size === 0 || !mergeName.trim() || merging) return;
    setMerging(true);
    try {
      await copySelectedSkillsToNewWeek(schoolId, {
        classId,
        teacherUid,
        name: mergeName,
        type: mergeType,
        selectedSkillIds: Array.from(selectedSkillIds),
      });
      setSelectedSkillIds(new Set());
      setExpandedWeekIds(new Set());
      setMergeName('');
      setMergeType('remediation');
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر تجميع المهارات المحدَّدة.');
    } finally {
      setMerging(false);
    }
  }

  async function handleDeleteWeek(week) {
    setError('');
    setDeletingWeekId(week.id);
    try {
      const activeActionsCount = await countActiveActionsForWeek(schoolId, week.id);
      let message = `سيتم حذف "${week.name}" (${TYPE_LABELS[week.type]}) مع كل المهارات والتقييمات والتوصيات المسجَّلة بهذا الأسبوع نهائيًا، ولا يمكن التراجع عن هذا الإجراء. هل الرغبة في المتابعة مؤكدة؟`;
      if (activeActionsCount > 0) {
        message += `\n\nتنبيه: يوجد ${activeActionsCount} إجراء (علاجي/إثرائي) نشط مرتبط بهذا الأسبوع، وسيبقى هذا الإجراء كما هو دون حذف.`;
      }
      const confirmed = window.confirm(message);
      if (!confirmed) {
        setDeletingWeekId(null);
        return;
      }
      await deleteWeekWithData(schoolId, week.id);
      await refresh();
    } catch (err) {
      setError(err.message || 'تعذّر حذف الأسبوع الدراسي.');
    } finally {
      setDeletingWeekId(null);
    }
  }

  if (showReport) {
    return (
      <StudentReport
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        className={className}
        subject={subject}
        teacherName={teacherName}
        onBack={() => setShowReport(false)}
      />
    );
  }

  if (showClassReport) {
    return (
      <ClassReport
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        className={className}
        subject={subject}
        teacherName={teacherName}
        onBack={() => setShowClassReport(false)}
      />
    );
  }

  if (selectedWeekId) {
    const week = weeks.find((w) => w.id === selectedWeekId);
    return (
      <WeekDetail
        schoolId={schoolId}
        classId={classId}
        teacherUid={teacherUid}
        week={week}
        onBack={() => { setSelectedWeekId(null); refresh(); }}
      />
    );
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
        ← العودة إلى الفصول الدراسية
      </button>
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>{className} — الأسابيع الدراسية</h1>
      <button onClick={() => setShowReport(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: radius.button, fontSize: 13, marginBottom: 8, marginLeft: 8 }}>
        تقرير طالبة
      </button>
      <button onClick={() => setShowClassReport(true)} style={{ padding: '8px 14px', background: '#f2f2f2', border: 'none', borderRadius: radius.button, fontSize: 13, marginBottom: spacing.md }}>
        تقرير الفصل
      </button>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }}>
        <h3 style={{ marginTop: 0, fontFamily: font.family }}>إضافة أسبوع دراسي جديد</h3>
        <form onSubmit={handleCreate}>
          <label>اسم الأسبوع</label>
          <select value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
            <option value="">اختيار اسم الأسبوع</option>
            {SCHOOL_WEEK_NAMES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <label>النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }}>
            <option value="measurement">قياس</option>
            <option value="remediation">معالجة</option>
          </select>
          <label>الرابط الإثرائي (اختياري)</label>
          <input type="text" value={enrichmentLink} onChange={(e) => setEnrichmentLink(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} />
          <button type="submit" disabled={creating} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
            {creating ? '...' : 'إضافة'}
          </button>
        </form>
      </div>

      {weeks.length > 0 && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }}>
          <h3 style={{ marginTop: 0, fontFamily: font.family }}>نسخ من أسبوع سابق (كامل)</h3>
          <form onSubmit={handleCopy}>
            <label>الأسبوع المصدر</label>
            <select value={copySourceId} onChange={(e) => setCopySourceId(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
              <option value="">اختيار أسبوع</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({TYPE_LABELS[w.type]})</option>
              ))}
            </select>
            <label>اسم الأسبوع الجديد</label>
            <select value={copyName} onChange={(e) => setCopyName(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
              <option value="">اختيار اسم الأسبوع</option>
              {SCHOOL_WEEK_NAMES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <label>النوع</label>
            <select value={copyType} onChange={(e) => setCopyType(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }}>
              <option value="measurement">قياس</option>
              <option value="remediation">معالجة</option>
            </select>
            <button type="submit" disabled={copying} style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button }}>
              {copying ? '...' : 'نسخ'}
            </button>
          </form>
        </div>
      )}

      {weeks.length > 0 && (
        <div style={{ border: `1px solid ${colors.amberBorder}`, background: colors.amberTint, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.lg }}>
          <h3 style={{ marginTop: 0, fontFamily: font.family, color: colors.amber }}>تجميع مهارات محدَّدة من عدة أسابيع</h3>
          <p style={{ fontSize: 12, color: colors.amber, marginTop: 0, marginBottom: spacing.sm }}>
            حددي الأسابيع أدناه لعرض مهاراتها، ثم اختاري المهارات المحدَّدة اللي تبين تجميعها بأسبوع معالجة جديد — تُنسخ مع تقييماتها كما هي.
          </p>

          {weeks.map((w) => (
            <div key={w.id} style={{ borderBottom: `1px solid ${colors.amberBorder}`, paddingBottom: spacing.sm, marginBottom: spacing.sm }}>
              <button
                type="button"
                onClick={() => toggleWeekExpand(w.id)}
                style={{ background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 14, textAlign: 'right', cursor: 'pointer', fontFamily: font.family }}
              >
                {expandedWeekIds.has(w.id) ? '▼' : '◀'} {w.name} — {TYPE_LABELS[w.type]}
              </button>

              {expandedWeekIds.has(w.id) && (
                <div style={{ marginTop: 6, paddingRight: 12 }}>
                  {!skillsByWeek[w.id] ? (
                    <p style={{ fontSize: 12, color: colors.textMuted }}>...جارٍ تحميل المهارات</p>
                  ) : skillsByWeek[w.id].length === 0 ? (
                    <p style={{ fontSize: 12, color: colors.textMuted }}>لا توجد مهارات بهذا الأسبوع.</p>
                  ) : (
                    skillsByWeek[w.id].map((skill) => (
                      <label key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '4px 0', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedSkillIds.has(skill.id)}
                          onChange={() => toggleSkillSelected(skill.id)}
                        />
                        {skill.title}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {selectedSkillIds.size > 0 && (
            <form onSubmit={handleMerge} style={{ marginTop: spacing.md, borderTop: `1px solid ${colors.amberBorder}`, paddingTop: spacing.md }}>
              <p style={{ fontSize: 13, fontWeight: 'bold', color: colors.amber, marginBottom: spacing.sm }}>
                {selectedSkillIds.size} مهارة محدَّدة
              </p>
              <label>اسم الأسبوع الجديد</label>
              <select value={mergeName} onChange={(e) => setMergeName(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }} required>
                <option value="">اختيار اسم الأسبوع</option>
                {SCHOOL_WEEK_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <label>النوع</label>
              <select value={mergeType} onChange={(e) => setMergeType(e.target.value)} style={{ width: '100%', padding: spacing.sm, marginBottom: spacing.sm }}>
                <option value="measurement">قياس</option>
                <option value="remediation">معالجة</option>
              </select>
              <button type="submit" disabled={merging} style={{ padding: '10px 16px', background: colors.amber, color: '#fff', border: 'none', borderRadius: radius.button }}>
                {merging ? '...جارٍ التجميع' : 'إنشاء الأسبوع من المهارات المحدَّدة'}
              </button>
            </form>
          )}
        </div>
      )}

      <h3 style={{ fontFamily: font.family }}>الأسابيع الدراسية ({weeks.length})</h3>
      {weeks.length === 0 ? (
        <p style={{ color: colors.textMuted }}>لا توجد أسابيع دراسية بعد.</p>
      ) : (
        weeks.map((w) => (
          <div key={w.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.button, marginBottom: 8, padding: spacing.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setSelectedWeekId(w.id)} style={{ background: 'none', border: 'none', color: colors.ink, fontWeight: 'bold', fontSize: 16, textAlign: 'right', cursor: 'pointer', fontFamily: font.family }}>
                {w.name} — {TYPE_LABELS[w.type]}
              </button>
              <button
                onClick={() => handleDeleteWeek(w)}
                disabled={deletingWeekId === w.id}
                style={{ padding: '4px 10px', background: colors.redTint, border: `1px solid ${colors.redBorder}`, color: colors.red, borderRadius: 6, fontSize: 12 }}
              >
                {deletingWeekId === w.id ? '...' : 'حذف'}
              </button>
            </div>
            {w.enrichmentLink && (
              <div style={{ fontSize: 13, marginTop: 4 }}>
                <a href={w.enrichmentLink} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>الرابط الإثرائي</a>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
