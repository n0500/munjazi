import { useEffect, useState } from 'react';
import { listClasses, listTeacherAssignments } from '../lib/classesApi';
import { getLatestWeekSummary, getWeeksTrend } from '../lib/overviewApi';
import { STATUS_LABELS, STATUS_ICONS, STATUS_COLORS } from '../lib/recommendationsApi';

const STATUS_ORDER = ['mastered', 'needsSupport', 'notMastered', 'absent'];

function DonutChart({ counts }) {
  const total = STATUS_ORDER.reduce((sum, k) => sum + counts[k], 0);
  if (total === 0) return <p style={{ fontSize: 12, color: '#999' }}>لا توجد بيانات بعد.</p>;

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        {STATUS_ORDER.map((key) => {
          const value = counts[key];
          if (value === 0) return null;
          const fraction = value / total;
          const dash = fraction * circumference;
          const circle = (
            <circle
              key={key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={STATUS_COLORS[key].border}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetAcc}
            />
          );
          offsetAcc += dash;
          return circle;
        })}
      </g>
      <text x="60" y="65" textAnchor="middle" fontSize="16" fontWeight="bold">{total}</text>
    </svg>
  );
}

function TrendChart({ trend }) {
  if (trend.length === 0) return <p style={{ fontSize: 12, color: '#999' }}>لا توجد أسابيع بعد.</p>;
  const maxCount = Math.max(1, ...trend.flatMap((w) => STATUS_ORDER.map((k) => w.counts[k])));
  const barMaxHeight = 60;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', overflowX: 'auto', padding: '8px 0' }}>
      {trend.map((w, i) => (
        <div key={i} style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: barMaxHeight }}>
            {STATUS_ORDER.map((key) => (
              <div
                key={key}
                title={`${STATUS_LABELS[key]}: ${w.counts[key]}`}
                style={{
                  width: 8,
                  height: Math.max(2, (w.counts[key] / maxCount) * barMaxHeight),
                  background: STATUS_COLORS[key].border,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 4, whiteSpace: 'nowrap' }}>{w.weekName}</div>
        </div>
      ))}
    </div>
  );
}

function ClassOverviewCard({ schoolId, classId, teacherUid, className, subject }) {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedStatus, setExpandedStatus] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, t] = await Promise.all([
        getLatestWeekSummary(schoolId, classId, teacherUid),
        getWeeksTrend(schoolId, classId, teacherUid),
      ]);
      setSummary(s);
      setTrend(t);
      setLoading(false);
    })();
  }, [schoolId, classId, teacherUid]);

  if (loading) return <p style={{ fontSize: 13, color: '#999' }}>...جارٍ التحميل</p>;

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{className} — {subject || 'دون تحديد مادة'}</h3>

      {!summary ? (
        <p style={{ fontSize: 13, color: '#999' }}>لا توجد أسابيع دراسية بعد لهذا الفصل.</p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#666' }}>آخر أسبوع: {summary.weekName}</p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <DonutChart counts={summary.counts} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUS_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => setExpandedStatus(expandedStatus === key ? null : key)}
                  style={{
                    padding: '6px 10px',
                    background: STATUS_COLORS[key].bg,
                    color: STATUS_COLORS[key].text,
                    border: `1px solid ${STATUS_COLORS[key].border}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 'bold',
                  }}
                >
                  {STATUS_ICONS[key]} {STATUS_LABELS[key]}: {summary.counts[key]}
                </button>
              ))}
            </div>
          </div>

          {expandedStatus && (
            <div style={{ marginTop: 10, background: '#f9f9f9', borderRadius: 8, padding: 10 }}>
              {summary.studentsByStatus[expandedStatus].length === 0 ? (
                <p style={{ fontSize: 13, color: '#999' }}>لا توجد طالبات بهذه الحالة.</p>
              ) : (
                <ul style={{ margin: 0, paddingRight: 18, fontSize: 13 }}>
                  {summary.studentsByStatus[expandedStatus].map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h4 style={{ marginBottom: 4 }}>مقارنة عبر الأسابيع</h4>
          <TrendChart trend={trend} />
        </>
      )}
    </div>
  );
}

export default function TeacherOverview({ schoolId, teacherUid, onBack }) {
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [assignRows, classRows] = await Promise.all([
          listTeacherAssignments(schoolId, teacherUid),
          listClasses(schoolId),
        ]);
        setAssignments(assignRows);
        setClasses(classRows);
      } catch (err) {
        setError(err.message || 'تعذّر تحميل البيانات.');
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId, teacherUid]);

  const classNameFor = (classId) => classes.find((c) => c.id === classId)?.name || '؟';

  if (loading) return <p style={{ textAlign: 'center', marginTop: 60 }}>...جارٍ التحميل</p>;

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16 }} dir="rtl">
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0b7a4b', marginBottom: 10 }}>
          ← العودة إلى لوحة المعلّمة
        </button>
      )}
      <h1>نظرة عامة</h1>
      {error && <div style={{ background: '#fdecea', color: '#a10000', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {assignments.length === 0 ? (
        <p style={{ color: '#666' }}>لم يتم ربط أي فصل دراسي بعد.</p>
      ) : (
        assignments.map((a) => (
          <ClassOverviewCard
            key={a.id}
            schoolId={schoolId}
            classId={a.classId}
            teacherUid={teacherUid}
            className={classNameFor(a.classId)}
            subject={a.subject}
          />
        ))
      )}
    </div>
  );
}
