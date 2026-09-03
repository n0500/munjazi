import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getClass } from '../lib/classesApi';
import { buildParentOverviewData, buildSubjectWeekSkills } from '../lib/reportsApi';
import { logParentAcknowledgment } from '../lib/actionEngine';
import { colors, font, radius, spacing } from '../lib/theme';

const STATUS_COLORS = {
  mastered: { bg: colors.primaryTint, text: '#0b5c33', border: colors.primary },
  needsSupport: { bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  notMastered: { bg: colors.redTint, text: colors.red, border: colors.redBorder },
  absent: { bg: '#f2f2f2', text: colors.textMuted, border: colors.border },
};

function SkillBadge({ status, statusLabel }) {
  const c = STATUS_COLORS[status] || { bg: '#f2f2f2', text: colors.textMuted, border: colors.border };
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
      {statusLabel}
    </span>
  );
}

// تصنيف دقيق لكل مادة (للشارة العلوية فقط)، من الأخطر إلى الأفضل:
// إجراء نشط (رسمي موثّق) > غير متقنة > تحتاج دعمًا > ممتازة > غائبة بالكامل > غائبة جزئيًا > لم تُرصد
function classifySubject(subject) {
  const hasActiveRemedial = subject.activeActions.some((a) => a.type === 'remedial');
  if (hasActiveRemedial) return 'activeAction';

  if (!subject.skillRows || subject.skillRows.length === 0) return 'notTracked';

  const hasNotMastered = subject.skillRows.some((sk) => sk.status === 'notMastered');
  if (hasNotMastered) return 'notMastered';

  const hasNeedsSupport = subject.skillRows.some((sk) => sk.status === 'needsSupport');
  if (hasNeedsSupport) return 'needsSupport';

  if (subject.totalSkills > 0 && subject.masteredCount === subject.totalSkills) return 'excellent';

  const absentCount = subject.skillRows.filter((sk) => sk.status === 'absent').length;
  if (absentCount === subject.skillRows.length) return 'absentOnly';
  if (absentCount > 0) return 'partiallyAbsent';

  return 'notTracked';
}

// المواد بهذي الحالات تحتاج انتباهًا فوريًا، فتُفتح تلقائيًا بدون ضغط من ولي الأمر
const AUTO_EXPAND_CLASSIFICATIONS = ['activeAction', 'notMastered', 'absentOnly', 'partiallyAbsent'];

const BADGE_CONFIG = {
  activeAction: { label: 'إجراء نشط', bg: colors.amberTint, text: colors.amber, border: colors.amberBorder },
  notMastered: { label: 'غير متقنة', bg: colors.redTint, text: colors.red, border: colors.redBorder },
  needsSupport: { label: 'تحتاج دعمًا', bg: '#fff7e0', text: '#8a6d00', border: '#d9b400' },
  excellent: { label: 'ممتازة', bg: colors.primaryTint, text: '#0b5c33', border: colors.primary },
  absentOnly: { label: 'غائبة', bg: '#eef2f7', text: '#3d5a80', border: '#a9c0d9' },
  partiallyAbsent: { label: 'غياب جزئي', bg: '#eef2f7', text: '#3d5a80', border: '#a9c0d9' },
};

function weakSkillsFor(subject) {
  return (subject.skillRows || []).filter((sk) => sk.status === 'notMastered');
}

function absentSkillsFor(subject) {
  return (subject.skillRows || []).filter((sk) => sk.status === 'absent');
}

export default function ParentDashboard({ schoolId, profile, logout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [focusMap, setFocusMap] = useState({});

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

        const autoExpand = new Set();
        const autoFocus = {};
        overview.subjects.forEach((s) => {
          const classification = classifySubject(s);
          if (AUTO_EXPAND_CLASSIFICATIONS.includes(classification)) {
            autoExpand.add(s.teacherUid);
            if (classification === 'notMastered') autoFocus[s.teacherUid] = 'weak';
            else if (classification === 'absentOnly' || classification === 'partiallyAbsent') autoFocus[s.teacherUid] = 'absent';
          }
        });
        setExpandedSubjects(autoExpand);
        setFocusMap(autoFocus);

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

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  if (error) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', padding: spacing.lg, textAlign: 'center' }} dir="rtl">
        <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.lg }}>{error}</div>
        <button onClick={logout} style={{ padding: '10px 20px', background: colors.red, color: '#fff', border: 'none', borderRadius: radius.button }}>
          تسجيل الخروج
        </button>
      </div>
    );
  }

  function toggleSubject(teacherUid, focusMode) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(teacherUid) && !focusMode) {
        next.delete(teacherUid);
      } else {
        next.add(teacherUid);
      }
      return next;
    });
    if (focusMode) {
      setFocusMap((prev) => ({ ...prev, [teacherUid]: focusMode }));
    }
  }

  function clearFocus(teacherUid) {
    setFocusMap((prev) => ({ ...prev, [teacherUid]: null }));
  }

  // المواد اللي ما رُصدت أصلاً (المعلمة ما أنشأت أسبوعًا بعد) لا تهم ولي الأمر، فلا تظهر إطلاقًا
  const trackedSubjects = data.subjects
    .map((s) => ({ ...s, classification: classifySubject(s) }))
    .filter((s) => s.classification !== 'notTracked');

  const activeActionCount = trackedSubjects.filter((s) => s.classification === 'activeAction').length;
  // نحسب "غير متقنة" و"تحتاج دعمًا" من وجود مهارة فعلية بهذي الحالة، بغض النظر عن التصنيف
  // الحصري للمادة (بدون كذا، مادة فيها مهارة غير متقنة تولّد عنها إجراء نشط كانت تختفي من هذا
  // العدّاد لأن التصنيف الحصري يعطي أولوية أعلى لـ"إجراء نشط")
  const notMasteredCount = trackedSubjects.filter((s) => weakSkillsFor(s).length > 0).length;
  const needsSupportCount = trackedSubjects.filter((s) => (s.skillRows || []).some((sk) => sk.status === 'needsSupport')).length;
  const excellentCount = trackedSubjects.filter((s) => s.classification === 'excellent').length;

  const filteredSubjects = trackedSubjects.filter((s) => {
    if (filter === 'needsAttention') return ['activeAction', 'notMastered', 'needsSupport'].includes(s.classification);
    return true;
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: spacing.lg }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0, fontFamily: font.family, color: colors.ink }}>مرحبًا</h1>
          <p style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, marginBottom: 0 }}>
            إليك ملخص متابعة {data.studentName} — {data.className}
          </p>
        </div>
        <button onClick={logout} style={{ padding: '6px 14px', background: colors.red, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 12, whiteSpace: 'nowrap' }}>
          تسجيل الخروج
        </button>
      </div>

      <div style={{ height: spacing.lg }} />

      {data.priority && (
        <div style={{ background: colors.amberTint, border: `1px solid ${colors.amberBorder}`, color: colors.amber, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg }}>
          <div style={{ fontWeight: font.weightMedium, fontSize: 13, marginBottom: 4 }}>⚠ الأولوية الآن</div>
          <div style={{ fontSize: 13 }}>
            {data.priority.subject}: {data.priority.text}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.xl }}>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.amberBorder}`, borderRadius: radius.card, padding: '12px 4px', background: colors.amberTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: colors.amber }}>{activeActionCount}</div>
          <div style={{ fontSize: 11, color: colors.amber }}>إجراء نشط</div>
        </div>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.redBorder}`, borderRadius: radius.card, padding: '12px 4px', background: colors.redTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: colors.red }}>{notMasteredCount}</div>
          <div style={{ fontSize: 11, color: colors.red }}>غير متقنة</div>
        </div>
        <div style={{ textAlign: 'center', border: '1px solid #d9b400', borderRadius: radius.card, padding: '12px 4px', background: '#fff7e0' }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#8a6d00' }}>{needsSupportCount}</div>
          <div style={{ fontSize: 11, color: '#8a6d00' }}>تحتاج دعمًا</div>
        </div>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.primary}`, borderRadius: radius.card, padding: '12px 4px', background: colors.primaryTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#0b5c33' }}>{excellentCount}</div>
          <div style={{ fontSize: 11, color: '#0b5c33' }}>ممتازة</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <span style={{ fontSize: 12, color: colors.textMuted }}>المواد اللي تحتاج انتباهك مفتوحة تلقائيًا أدناه</span>
        <h3 style={{ fontSize: 15, margin: 0, fontFamily: font.family }}>المواد الدراسية</h3>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: spacing.md }}>
        {[
          { key: 'all', label: 'الكل' },
          { key: 'needsAttention', label: 'تحتاج متابعة' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: radius.pill, fontSize: 12, border: filter === f.key ? 'none' : `1px solid ${colors.border}`,
              background: filter === f.key ? colors.primary : '#fff', color: filter === f.key ? '#fff' : '#555',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredSubjects.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>لا توجد مواد تطابق هذا الفلتر.</p>
      ) : (
        filteredSubjects.map((s) => {
          const badge = BADGE_CONFIG[s.classification];
          const isExpanded = expandedSubjects.has(s.teacherUid);
          const focusMode = focusMap[s.teacherUid] || null;
          const remedial = s.activeActions.find((a) => a.type === 'remedial');
          const enrichment = s.activeActions.find((a) => a.type === 'enrichment');
          const weakSkills = weakSkillsFor(s);
          const absentSkills = absentSkillsFor(s);
          const fallbackLink = s.enrichmentLink;

          return (
            <div key={s.teacherUid} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: spacing.sm, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <button
                  onClick={() => toggleSubject(s.teacherUid, null)}
                  style={{ flex: 1, background: '#fff', border: 'none', padding: spacing.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right' }}
                >
                  <span style={{ background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`, borderRadius: radius.pill, padding: '3px 10px', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {badge.label}
                  </span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 14, fontFamily: font.family, color: colors.ink }}>{s.subject}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>
                      {`${s.masteredCount} من ${s.totalSkills} متقنة`}
                    </div>
                  </div>
                </button>

                <div style={{ display: 'flex' }}>
                  {weakSkills.length > 0 && (
                    <button
                      onClick={() => toggleSubject(s.teacherUid, 'weak')}
                      style={{
                        background: colors.redTint, border: 'none', borderRight: `1px solid ${colors.border}`,
                        padding: '0 12px', color: colors.red, fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap',
                      }}
                    >
                      ⚠ {weakSkills.length}
                    </button>
                  )}
                  {absentSkills.length > 0 && (
                    <button
                      onClick={() => toggleSubject(s.teacherUid, 'absent')}
                      style={{
                        background: '#eef2f7', border: 'none', borderRight: `1px solid ${colors.border}`,
                        padding: '0 12px', color: '#3d5a80', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap',
                      }}
                    >
                      ⭕ {absentSkills.length}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${colors.border}`, padding: spacing.md }}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>{s.teacherName}</div>

                  {remedial && (
                    <div style={{ background: colors.amberTint, border: `1px solid ${colors.amberBorder}`, color: colors.amber, borderRadius: radius.button, padding: '8px 10px', fontSize: 12, marginBottom: spacing.sm }}>
                      <strong>⚠ إجراء علاجي — {remedial.affectedSkillTitles.join('، ')}</strong>
                      <div style={{ marginTop: 4 }}>{remedial.text}</div>
                    </div>
                  )}
                  {enrichment && (
                    <div style={{ background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.button, padding: '6px 10px', fontSize: 11, marginBottom: spacing.sm }}>
                      <strong>⭐ إجراء إثرائي — {enrichment.affectedSkillTitles.join('، ')}</strong>
                      <div style={{ marginTop: 3 }}>{enrichment.text}</div>
                      {enrichment.enrichmentLink && (
                        <a
                          href={enrichment.enrichmentLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'inline-block', marginTop: 6, color: '#0b5c33', fontWeight: 'bold', textDecoration: 'underline' }}
                        >
                          فتح رابط هذا النشاط الإثرائي
                        </a>
                      )}
                    </div>
                  )}

                  {focusMode === 'weak' && weakSkills.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, color: colors.red, fontWeight: 'bold', marginBottom: 6 }}>
                        مهارات غير متقنة بآخر أسبوع:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: spacing.sm }}>
                        {weakSkills.map((sk, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                            <SkillBadge status={sk.status} statusLabel={sk.statusLabel} />
                            <span>{sk.title}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => clearFocus(s.teacherUid)} style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 12, padding: 0, marginBottom: spacing.sm }}>
                        عرض كل المهارات
                      </button>
                    </>
                  )}

                  {focusMode === 'absent' && absentSkills.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, color: '#3d5a80', fontWeight: 'bold', marginBottom: 6 }}>
                        مهارات غائبة بآخر أسبوع:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: spacing.sm }}>
                        {absentSkills.map((sk, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                            <SkillBadge status={sk.status} statusLabel={sk.statusLabel} />
                            <span>{sk.title}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => clearFocus(s.teacherUid)} style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 12, padding: 0, marginBottom: spacing.sm }}>
                        عرض كل المهارات
                      </button>
                    </>
                  )}

                  {!focusMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: spacing.sm }}>
                      {(s.skillRows || []).map((sk, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                          <SkillBadge status={sk.status} statusLabel={sk.statusLabel} />
                          <span>{sk.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!enrichment?.enrichmentLink && fallbackLink && (
                    <a
                      href={fallbackLink}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'block', textAlign: 'center', background: colors.primary, color: '#fff', borderRadius: radius.button, padding: '10px', fontSize: 13, textDecoration: 'none' }}
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
