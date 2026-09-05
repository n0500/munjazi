import { useEffect, useState } from 'react';
import { listActionsForTeacher } from '../lib/actionEngine';
import { listClasses, listTeacherAssignments } from '../lib/classesApi';
import { colors, font, radius, spacing } from '../lib/theme';

const TYPE_LABEL = {
  remedial: { icon: '⚠', text: 'علاجي' },
  enrichment: { icon: '⭐', text: 'إثرائي' },
};

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDateTime(value) {
  if (!value) return null;
  try {
    const date = value.toDate ? value.toDate() : new Date(value);
    return date.toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

function StatCard({ value, label, bg, border, text }) {
  return (
    <div style={{ flex: '1 1 90px', textAlign: 'center', border: `1px solid ${border}`, borderRadius: radius.card, padding: '10px 4px', background: bg }}>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: text }}>{value}</div>
      <div style={{ fontSize: 11, color: text }}>{label}</div>
    </div>
  );
}

export default function AckTracking({ schoolId, teacherUid, onBack }) {
  const [actions, setActions] = useState([]);
  const [classNames, setClassNames] = useState({});
  const [subjects, setSubjects] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [actionRows, classRows, assignRows] = await Promise.all([
          listActionsForTeacher(schoolId, teacherUid),
          listClasses(schoolId),
          listTeacherAssignments(schoolId, teacherUid),
        ]);
        const activeOnly = actionRows.filter((a) => a.status === 'active');
        activeOnly.sort((a, b) => (b.activatedAt?.seconds || 0) - (a.activatedAt?.seconds || 0));
        setActions(activeOnly);

        const nameMap = {};
        classRows.forEach((c) => { nameMap[c.id] = c.name; });
        setClassNames(nameMap);

        const subjMap = {};
        assignRows.forEach((a) => { subjMap[a.classId] = a.subject || 'بدون مادة'; });
        setSubjects(subjMap);
      } catch (err) {
        setError(err.message || 'تعذر تحميل بيانات المتابعة.');
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, teacherUid]);

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  // "متكررة" = إجراء علاجي استمر لأكثر من رصد واحد (مهارة تكررت ضعفها بأسبوع لاحق أيضًا)
  function isRepeated(a) {
    return (a.followUpLog?.length || 0) > 0;
  }

  const remedialActions = actions.filter((a) => a.type === 'remedial');
  const viewedCount = remedialActions.filter((a) => a.parentAcknowledgment?.viewedAt).length;
  const pendingCount = remedialActions.length - viewedCount;
  const viewRate = remedialActions.length > 0 ? Math.round((viewedCount / remedialActions.length) * 100) : null;
  const repeatedPendingCount = remedialActions.filter((a) => isRepeated(a) && !a.parentAcknowledgment?.viewedAt).length;

  const filteredActions = actions.filter((a) => {
    if (filter === 'remedial') return a.type === 'remedial';
    if (filter === 'pending') return a.type === 'remedial' && !a.parentAcknowledgment?.viewedAt;
    if (filter === 'repeatedPending') return a.type === 'remedial' && isRepeated(a) && !a.parentAcknowledgment?.viewedAt;
    return true;
  });

  return (
    <div style={{ maxWidth: 700, margin: '20px auto', padding: spacing.lg }} dir="rtl">
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: colors.primary, marginBottom: spacing.sm }}>
          ← العودة إلى لوحة المعلّمة
        </button>
      )}
      <h1 style={{ fontFamily: font.family, color: colors.ink }}>متابعة الاطلاع</h1>
      <p style={{ color: colors.textMuted, fontSize: 13 }}>
        هذا الجدول يوثّق اطّلاع أولياء الأمور على الإجراءات النشطة — يُسجَّل تلقائيًا عند فتح الصفحة، بدون حاجة لتأكيد يدوي منهم.
      </p>

      {error && <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>{error}</div>}

      {remedialActions.length > 0 && (
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg }}>
          <StatCard value={viewedCount} label="اطّلعوا" bg={colors.primaryTint} border={colors.primary} text="#0b5c33" />
          <StatCard value={pendingCount} label="لم يطّلعوا بعد" bg={colors.redTint} border={colors.redBorder} text={colors.red} />
          <StatCard value={viewRate !== null ? `${viewRate}٪` : '—'} label="نسبة الاطلاع" bg="#eef2f7" border="#a9c0d9" text="#3d5a80" />
        </div>
      )}

      {repeatedPendingCount > 0 && (
        <div
          style={{
            background: colors.redTint, border: `1px solid ${colors.redBorder}`, color: colors.red,
            borderRadius: radius.button, padding: spacing.md, marginBottom: spacing.lg, fontSize: 13,
          }}
        >
          <strong>⚠ أولوية عاجلة:</strong> توجد {repeatedPendingCount} من الحالات تتضمن مهارة متكررة الضعف (استمرت لأكثر من أسبوع)، ولم يطّلع وليّ أمرها عليها بعد — وتستحق متابعة مباشرة.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `الكل (${actions.length})` },
          { key: 'remedial', label: 'علاجي فقط' },
          { key: 'pending', label: `لم يُطّلع بعد (${pendingCount})` },
          { key: 'repeatedPending', label: `متكررة ولم يُطّلع (${repeatedPendingCount})` },
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

      {filteredActions.length === 0 ? (
        <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30 }}>لا توجد إجراءات تطابق هذا الفلتر.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>الطالبة</th>
              <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>المادة</th>
              <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>الإجراء</th>
              <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>تاريخ التفعيل</th>
              <th style={{ textAlign: 'right', borderBottom: `2px solid ${colors.border}`, padding: 8 }}>حالة الاطلاع</th>
            </tr>
          </thead>
          <tbody>
            {filteredActions.map((a) => {
              const label = TYPE_LABEL[a.type];
              const ackAt = formatDateTime(a.parentAcknowledgment?.viewedAt);
              const isRemedial = a.type === 'remedial';
              const repeated = isRepeated(a);
              const urgent = isRemedial && repeated && !ackAt;
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', background: urgent ? colors.redTint : 'transparent' }}>
                  <td style={{ padding: 8 }}>{a.studentName}</td>
                  <td style={{ padding: 8 }}>{subjects[a.classId] || '—'} ({classNames[a.classId] || '؟'})</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ color: isRemedial ? colors.amber : '#0b5c33' }}>
                      {label.icon} {a.affectedSkillTitles?.join('، ')}
                    </span>
                    {isRemedial && repeated && (
                      <span style={{ marginRight: 6, fontSize: 11, background: colors.red, color: '#fff', borderRadius: 4, padding: '1px 6px' }}>
                        متكررة
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>{formatDate(a.activatedAt)}</td>
                  <td style={{ padding: 8 }}>
                    {!isRemedial ? (
                      <span style={{ color: '#bbb' }}>— (غير إلزامي)</span>
                    ) : ackAt ? (
                      <span style={{ color: '#0b5c33' }}>✓ {ackAt}</span>
                    ) : (
                      <span style={{ color: colors.red, fontWeight: urgent ? 'bold' : 'normal' }}>⏳ لم يُطّلع بعد</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
