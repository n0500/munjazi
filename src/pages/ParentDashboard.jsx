import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getClass } from '../lib/classesApi';
import { buildParentOverviewData, buildSubjectWeekSkills } from '../lib/reportsApi';
import { logParentAcknowledgment } from '../lib/actionEngine';
import { SCHOOL_WEEK_NAMES } from '../lib/schoolWeekNames';

const STATUS_COLORS = {
  mastered: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  needsSupport: { bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  notMastered: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
  absent: { bg: '#f2f2f2', text: '#666', border: '#ccc' },
};

const LATEST_VALUE = '__latest__';

function SkillBadge({ status, statusLabel }) {
  const colors = STATUS_COLORS[status] || { bg: '#f2f2f2', text: '#666', border: '#ccc' };
  return (
    <span style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
      {statusLabel}
    </span>
  );
}

function statusChip(statusKey) {
  if (statusKey === 'needsAttention') return { label: 'تحتاج متابعة', bg: '#fdf3e2', text: '#8a5a00', border: '#e0b25c' };
  if (statusKey === 'notTracked') return { label: 'لم تُرصد', bg: '#f2f2f2', text: '#888', border: '#ddd' };
  return { label: 'مستقرة', bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' };
}

export default function ParentDashboard({ schoolId, profile, logout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [globalWeek, setGlobalWeek] = useState(LATEST_VALUE);
  const [skillsCache, setSkillsCache] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const studentSnap = await getDoc(doc(db, 'schools', schoolId, 'students', profile.studentId));
        if (!studentSnap.exists()) throw new Error('لم يتم العثور على بيانات الطالبة.');
        const student = studentSnap.data();
        const classId = student.currentClassId;
        const classInfo = await getClass(schoolId, classId);

        const overview = await buildParentOverviewData(schoolId, {
          classId,
          className: classInfo.name,
          studentId: profile.studentId,
          studentName: student.name,
        });
        setData(overview);

        overview.subjects.forEach((s) => {
          s.activeActions
            .filter((a) => a.type === 'remedial')
            .forEach((a) => {
              logParentAcknowledgment(schoolId, { actionId: a.id, parentUid: profile.uid }).catch(() => {});
            });
        });
      } catch (err) {
        setError(err.message || 'تعذّر تحميل بيانات المتابعة.');
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, profile.studentId, profile.uid]);

  async function ensureWeekSkills(subject, weekId) {
    const key = `${subject.teacherUid}__${weekId}`;
    if (skillsCache[key]) return;
    setLoadingKey(key);
    try {
      const rows = await buildSubjectWeekSkills(schoolId, { weekId, classId: subject.classId, studentId: profile.studentId });
      setSkillsCache((prev) => ({ ...prev, [key]: rows }));
    } catch (err) {
      setError(err.message || 'تعذّر تحميل بيانات الأسبوع.');
    } finally {
      setLoadingKey(null);
    }
  }

  useEffect(() => {
    if (!data || !expandedSubject) return;
    const subject = data.subjects.find((s) => s.teacherUid === expandedSubject);
    if (!subject) return;

    if (globalWeek === LATEST_VALUE) {
      if (subject.latestWeekId) ensureWeekSkills(subject, subject.latestWeekId);
    } else {
      const match = subject.weekOptions.find((w) => w.name === globalWeek);
      if (match) ensureWeekSkills(subject, match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, expandedSubject, globalWeek]);

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (error) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', padding: 16, textAlign: 'center' }} dir="rtl">
        <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>
        <button onClick={logout} style={{ padding: '10px 20px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8 }}>
          تسجيل الخروج
        </button>
      </div>
    );
  }

  const filteredSubjects = data.subjects.filter((s) => {
    if (filter === 'needsAttention') return s.statusKey === 'needsAttention';
    if (filter === 'notTracked') return s.statusKey === 'notTracked';
    return true;
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>مرحبًا</h1>
        <button onClick={logout} style={{ padding: '6px 14px', background: '#a10000', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12 }}>
          تسجيل الخروج
        </button>
      </div>
      <p style={{ color: '#666', fontSize: 14, marginTop: 0, marginBottom: 16 }}>
        إليك ملخص متابعة {data.studentName} — {data.className}
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>الأسبوع</label>
        <select
          value={globalWeek}
          onChange={(e) => setGlobalWeek(e.target.value)}
          style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 8, border: '1px solid #ddd' }}
        >
          <option value={LATEST_VALUE}>آخر أسبوع رُصد</option>
          {SCHOOL_WEEK_NAMES.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {data.priority && (
        <div style={{ background: '#fdf3e2', border: '1px solid #e0b25c', color: '#8a5a00', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>⚠ الأولوية الآن</div>
          <div style={{ fontSize: 13 }}>
            {data.priority.subject}: {data.priority.text}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ flex: 1, textAlign: 'center', border: '1px solid #eee', borderRadius: 10, padding: '12px 4px' }}>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{data.counts.needsAttention}</div>
          <div style={{ fontSize: 11, color: '#888' }}>تحتاج متابعة</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', border: '1px solid #eee', borderRadius: 10, padding: '12px 4px' }}>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{data.counts.stable}</div>
          <div style={{ fontSize: 11, color: '#888' }}>مستقرة</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center', border: '1px solid #eee', borderRadius: 10, padding: '12px 4px' }}>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{data.counts.total}</div>
          <div style={{ fontSize: 11, color: '#888' }}>مواد مرصودة</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#999' }}>اضغط على المادة للتفاصيل</span>
        <h3 style={{ fontSize: 15, margin: 0 }}>المواد الدراسية</h3>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { key: 'all', label: 'الكل' },
          { key: 'needsAttention', label: 'تحتاج متابعة' },
          { key: 'notTracked', label: 'لم تُرصد' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, border: filter === f.key ? 'none' : '1px solid #ddd',
              background: filter === f.key ? '#0b7a4b' : '#fff', color: filter === f.key ? '#fff' : '#555',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredSubjects.length === 0 ? (
        <p style={{ color: '#999', fontSize: 13, textAlign: 'center', marginTop: 20 }}>لا توجد مواد تطابق هذا الفلتر.</p>
      ) : (
        filteredSubjects.map((s) => {
          const chip = statusChip(s.statusKey);
          const isExpanded = expandedSubject === s.teacherUid;
          const remedial = s.activeActions.find((a) => a.type === 'remedial');
          const enrichment = s.activeActions.find((a) => a.type === 'enrichment');

          let content = null;
          if (isExpanded) {
            const weekId = globalWeek === LATEST_VALUE
              ? s.latestWeekId
              : s.weekOptions.find((w) => w.name === globalWeek)?.id;

            if (!weekId) {
              content = <p style={{ fontSize: 12, color: '#bbb', textAlign: 'center', padding: 10 }}>لم تُرصد هذه المادة بهذا الأسبوع.</p>;
            } else {
              const key = `${s.teacherUid}__${weekId}`;
              const cached = skillsCache[key];
              content = loadingKey === key ? (
                <p style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: 10 }}>...جارٍ التحميل</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {(cached || s.skillRows).map((sk, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <SkillBadge status={sk.status} statusLabel={sk.statusLabel} />
                      <span>{sk.title}</span>
                    </div>
                  ))}
                </div>
              );
            }
          }

          return (
            <div key={s.teacherUid} style={{ border: '1px solid #eee', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedSubject(isExpanded ? null : s.teacherUid)}
                style={{ width: '100%', background: '#fff', border: 'none', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right' }}
              >
                <span style={{ background: chip.bg, color: chip.text, border: `1px solid ${chip.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {chip.label}
                </span>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{s.subject}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {s.statusKey === 'notTracked' ? 'لا توجد بيانات بعد' : `${s.masteredCount} من ${s.totalSkills} متقنة`}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div style={{ borderTop: '1px solid #eee', padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{s.teacherName}</div>

                  {remedial && (
                    <div style={{ background: '#fdf3e2', border: '1px solid #e0b25c', color: '#8a5a00', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }}>
                      <strong>⚠ إجراء علاجي — {remedial.affectedSkillTitles.join('، ')}</strong>
                      <div style={{ marginTop: 4 }}>{remedial.text}</div>
                    </div>
                  )}
                  {enrichment && (
                    <div style={{ background: '#eaf6ee', border: '1px solid #0b7a4b', color: '#0b5c33', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }}>
                      <strong>⭐ إجراء إثرائي — {enrichment.affectedSkillTitles.join('، ')}</strong>
                      <div style={{ marginTop: 4 }}>{enrichment.text}</div>
                    </div>
                  )}

                  {content}

                  {s.enrichmentLink && (
                    <a
                      href={s.enrichmentLink}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'block', textAlign: 'center', background: '#0b7a4b', color: '#fff', borderRadius: 8, padding: '10px', fontSize: 13, textDecoration: 'none' }}
                    >
                      فتح التدريب الإثرائي
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
