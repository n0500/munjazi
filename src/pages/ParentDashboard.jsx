import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getClass } from '../lib/classesApi';
import { buildParentOverviewData } from '../lib/reportsApi';
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

function formatDate(seconds) {
  if (!seconds) return '';
  try {
    return new Date(seconds * 1000).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

// النص التوجيهي المناسب لمهارة تحتاج متابعة: نص الإجراء العلاجي لو موجود ومغطي لهذي المهارة،
// وإلا نص التوصية الأسبوعية العامة للطالبة بهذي المادة، وإلا رسالة افتراضية
function skillGuidance(subject, skill) {
  const remedial = (subject.activeActions || []).find(
    (a) => a.type === 'remedial' && (a.affectedSkillTitles || []).some((t) => (t || '').trim() === skill.title.trim()),
  );
  if (remedial) return { type: 'remedial', text: remedial.text };
  if (subject.weekRecommendation) return { type: 'general', text: subject.weekRecommendation };
  return { type: 'none', text: 'لم تُضف توصية بعد.' };
}

export default function ParentDashboard({ schoolId, profile, logout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');

      const maxAttempts = 4;
      let attempt = 0;

      while (attempt < maxAttempts) {
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

          setLoading(false);
          return;
        } catch (err) {
          const isPermissionError = err.code === 'permission-denied';
          attempt += 1;
          if (isPermissionError && attempt < maxAttempts) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          setError(err.message || 'تعذّر تحميل بيانات المتابعة.');
          setLoading(false);
          return;
        }
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

  function toggleSubject(teacherUid) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(teacherUid)) next.delete(teacherUid);
      else next.add(teacherUid);
      return next;
    });
  }

  const trackedSubjects = data.subjects.filter((s) => s.latestWeekId);

  // إجماليات البطاقات الثلاث — من كل المهارات المرصودة بآخر أسبوع لكل مادة
  let masteredSkillsCount = 0;
  let needsAttentionSkillsCount = 0;
  trackedSubjects.forEach((s) => {
    (s.skillRows || []).forEach((sk) => {
      if (sk.status === 'mastered') masteredSkillsCount += 1;
      else if (sk.status === 'notMastered' || sk.status === 'needsSupport') needsAttentionSkillsCount += 1;
    });
  });

  const newRecommendationsCount = trackedSubjects
    .flatMap((s) => s.activeActions)
    .filter((a) => a.type === 'remedial' && !a.parentAcknowledgment?.viewedAt).length;

  // قائمة كل مهارة تحتاج متابعة عبر كل المواد، مع نصها التوجيهي
  const attentionItems = [];
  trackedSubjects.forEach((s) => {
    (s.skillRows || []).forEach((sk) => {
      if (sk.status === 'notMastered' || sk.status === 'needsSupport') {
        attentionItems.push({ subjectName: s.subject, skill: sk, guidance: skillGuidance(s, sk) });
      }
    });
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: spacing.lg }} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0, fontFamily: font.family, color: colors.ink }}>مرحبًا</h1>
          <p style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, marginBottom: 0 }}>
            إليك ملخص متابعة {data.studentName} — {data.className} — {data.schoolName}
          </p>
          {data.lastUpdatedAt && (
            <p style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 0 }}>
              آخر تحديث: {formatDate(data.lastUpdatedAt)}
            </p>
          )}
        </div>
        <button onClick={logout} style={{ padding: '6px 14px', background: colors.red, color: '#fff', border: 'none', borderRadius: radius.button, fontSize: 12, whiteSpace: 'nowrap' }}>
          تسجيل الخروج
        </button>
      </div>

      <div style={{ height: spacing.lg }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.sm, marginBottom: spacing.xl }}>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.primary}`, borderRadius: radius.card, padding: '12px 4px', background: colors.primaryTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#0b5c33' }}>{masteredSkillsCount}</div>
          <div style={{ fontSize: 11, color: '#0b5c33' }}>متقنة</div>
        </div>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.redBorder}`, borderRadius: radius.card, padding: '12px 4px', background: colors.redTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: colors.red }}>{needsAttentionSkillsCount}</div>
          <div style={{ fontSize: 11, color: colors.red }}>تحتاج متابعة</div>
        </div>
        <div style={{ textAlign: 'center', border: `1px solid ${colors.amberBorder}`, borderRadius: radius.card, padding: '12px 4px', background: colors.amberTint }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: colors.amber }}>{newRecommendationsCount}</div>
          <div style={{ fontSize: 11, color: colors.amber }}>توصيات جديدة</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, margin: '0 0 10px', fontFamily: font.family }}>يحتاج متابعتك</h3>

      {attentionItems.length === 0 ? (
        <div style={{ background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.xl, textAlign: 'center', fontSize: 13 }}>
          ✓ ممتاز، لا توجد مهارات تحتاج متابعة حاليًا
        </div>
      ) : (
        <div style={{ marginBottom: spacing.xl }}>
          {attentionItems.map((item, i) => (
            <div key={i} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.sm }}>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>{item.subjectName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 14 }}>{item.skill.title}</span>
                <SkillBadge status={item.skill.status} statusLabel={item.skill.statusLabel} />
              </div>
              {item.guidance.type === 'remedial' && (
                <div style={{ background: colors.amberTint, border: `1px solid ${colors.amberBorder}`, color: colors.amber, borderRadius: radius.button, padding: '8px 10px', fontSize: 12 }}>
                  <strong>⚠ إجراء علاجي:</strong> {item.guidance.text}
                </div>
              )}
              {item.guidance.type === 'general' && (
                <div style={{ background: '#eef2f7', border: '1px solid #a9c0d9', color: '#3d5a80', borderRadius: radius.button, padding: '8px 10px', fontSize: 12 }}>
                  <strong>توصية:</strong> {item.guidance.text}
                </div>
              )}
              {item.guidance.type === 'none' && (
                <div style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>{item.guidance.text}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 16, margin: '0 0 10px', fontFamily: font.family }}>المواد الدراسية</h3>

      {trackedSubjects.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20 }}>لا توجد مواد مرصودة بعد.</p>
      ) : (
        trackedSubjects.map((s) => {
          const isExpanded = expandedSubjects.has(s.teacherUid);
          const enrichment = s.activeActions.find((a) => a.type === 'enrichment');
          const absentCount = (s.skillRows || []).filter((sk) => sk.status === 'absent').length;
          const fullyAbsent = s.totalSkills > 0 && absentCount === s.totalSkills;
          const needsAttentionCount = (s.skillRows || []).filter((sk) => sk.status === 'notMastered' || sk.status === 'needsSupport').length;
          const isFullyMastered = s.totalSkills > 0 && needsAttentionCount === 0 && !fullyAbsent;

          return (
            <div key={s.teacherUid} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, marginBottom: spacing.sm, overflow: 'hidden' }}>
              <button
                onClick={() => toggleSubject(s.teacherUid)}
                style={{ width: '100%', background: '#fff', border: 'none', padding: spacing.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'right' }}
              >
                <span style={{ color: colors.textMuted, fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                <div style={{ flex: 1, marginRight: 10 }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14, fontFamily: font.family, color: colors.ink }}>{s.subject}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>
                    {fullyAbsent ? 'غائبة بالكامل هذا الأسبوع' : `${s.masteredCount} متقنة، ${needsAttentionCount} تحتاج متابعة`}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${colors.border}`, padding: spacing.md }}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm }}>{s.teacherName}</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: spacing.sm }}>
                    {(s.skillRows || []).map((sk, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                        <SkillBadge status={sk.status} statusLabel={sk.statusLabel} />
                        <span>{sk.title}</span>
                      </div>
                    ))}
                  </div>

                  {isFullyMastered && s.weekRecommendation && (
                    <div style={{ background: colors.primaryTint, border: `1px solid ${colors.primary}`, color: '#0b5c33', borderRadius: radius.button, padding: '8px 10px', fontSize: 12, marginBottom: spacing.sm }}>
                      🎉 {s.weekRecommendation}
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

                  {!enrichment?.enrichmentLink && s.enrichmentLink && (
                    <a
                      href={s.enrichmentLink}
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
