import { useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { buildAllClassesAnalysis } from '../lib/allClassesAnalysisApi';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/recommendationsApi';
import { colors, font, radius, spacing, shadow } from '../lib/theme';
import AllClassesAnalysisDocument from './AllClassesAnalysisDocument';

const STATUS_ORDER = ['mastered', 'needsSupport', 'notMastered', 'absent'];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function MetricCard({ value, label, hint }) {
  return (
    <div
      style={{
        flex: '1 1 150px',
        minWidth: 145,
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        padding: spacing.md,
        boxShadow: shadow.card,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 24, fontWeight: font.weightBold, color: colors.primary }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.text, marginTop: 3 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        padding: spacing.lg,
        marginBottom: spacing.lg,
        boxShadow: shadow.card,
      }}
    >
      <div style={{ borderRight: `4px solid ${colors.primary}`, paddingRight: 10, marginBottom: spacing.md }}>
        <h3 style={{ margin: 0, fontFamily: font.family, color: colors.ink, fontSize: 18 }}>{title}</h3>
        {subtitle && <div style={{ marginTop: 3, fontSize: 12, color: colors.textMuted }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function DonutChart({ counts }) {
  const total = STATUS_ORDER.reduce((sum, key) => sum + (counts?.[key] || 0), 0);
  if (!total) return <div style={{ color: colors.textMuted, fontSize: 12 }}>لا توجد بيانات كافية للرسم.</div>;

  const radiusValue = 52;
  const circumference = 2 * Math.PI * radiusValue;
  let offsetAcc = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-label="توزيع حالات الرصد">
        <g transform="rotate(-90 75 75)">
          {STATUS_ORDER.map((key) => {
            const value = counts?.[key] || 0;
            if (!value) return null;
            const fraction = value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={key}
                cx="75"
                cy="75"
                r={radiusValue}
                fill="none"
                stroke={STATUS_COLORS[key].border}
                strokeWidth="22"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offsetAcc}
              />
            );
            offsetAcc += dash;
            return circle;
          })}
        </g>
        <text x="75" y="72" textAnchor="middle" fontSize="24" fontWeight="700" fill={colors.ink}>{total}</text>
        <text x="75" y="92" textAnchor="middle" fontSize="11" fill={colors.textMuted}>حالة رصد</text>
      </svg>

      <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
        {STATUS_ORDER.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: colors.text, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[key].border }} />
              {STATUS_LABELS[key]}
            </span>
            <strong style={{ color: STATUS_COLORS[key].text }}>{counts?.[key] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassesComparison({ classes }) {
  if (!classes.length) return <div style={{ color: colors.textMuted }}>لا توجد فصول مرتبطة بعد.</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {classes.map((row) => {
        const direction = row.direction === 'up'
          ? { icon: '↑', label: 'تحسن', color: colors.primary }
          : row.direction === 'down'
            ? { icon: '↓', label: 'تراجع', color: colors.red }
            : { icon: '→', label: 'مستقر', color: colors.amber };

        return (
          <div key={row.assignmentId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, alignItems: 'baseline' }}>
              <div style={{ fontWeight: font.weightBold, color: colors.ink, fontSize: 13 }}>
                {row.className} <span style={{ fontWeight: 400, color: colors.textMuted }}>— {row.subject}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, whiteSpace: 'nowrap' }}>
                <strong style={{ color: colors.primary }}>{row.latestMastery}%</strong>
                <span style={{ color: direction.color }}>{direction.icon} {direction.label}</span>
                <span style={{ color: colors.textMuted }}>الرصد {row.completenessPercent}%</span>
              </div>
            </div>
            <div style={{ height: 12, background: '#edf0ee', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, row.latestMastery))}%`,
                  background: colors.primary,
                  borderRadius: 99,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ trend }) {
  if (!trend.length) return <div style={{ color: colors.textMuted, fontSize: 12 }}>لا توجد أسابيع كافية لإظهار الاتجاه.</div>;

  const maxCount = Math.max(
    1,
    ...trend.flatMap((week) => STATUS_ORDER.map((key) => week.counts?.[key] || 0)),
  );
  const chartHeight = 88;

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', minWidth: Math.max(700, trend.length * 78) }}>
        {trend.map((week) => (
          <div key={week.weekName} style={{ minWidth: 64, textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'flex-end', height: chartHeight }}>
              {STATUS_ORDER.map((key) => (
                <div
                  key={key}
                  title={`${STATUS_LABELS[key]}: ${week.counts?.[key] || 0}`}
                  style={{
                    width: 10,
                    minHeight: 2,
                    height: Math.max(2, ((week.counts?.[key] || 0) / maxCount) * chartHeight),
                    background: STATUS_COLORS[key].border,
                    borderRadius: '3px 3px 0 0',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 6, whiteSpace: 'nowrap' }}>{week.weekName}</div>
            <div style={{ fontSize: 11, fontWeight: font.weightBold, color: colors.primary, marginTop: 2 }}>{week.masteryPercent}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RemediationChart({ rows }) {
  if (!rows.length) {
    return <div style={{ color: colors.textMuted, fontSize: 12 }}>لا توجد بيانات قياس ومعالجة مترابطة كافية حتى الآن.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map((row, index) => (
        <div key={`${row.className}-${index}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 10 }}>
            <strong style={{ fontSize: 13 }}>{row.className}</strong>
            <span
              style={{
                fontSize: 12,
                fontWeight: font.weightBold,
                color: row.impact > 0 ? colors.primary : row.impact < 0 ? colors.red : colors.amber,
              }}
            >
              الأثر {row.impact > 0 ? '+' : ''}{row.impact} نقطة
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 42px', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: colors.textMuted }}>قبل</span>
            <div style={{ height: 10, background: '#f0f0f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${row.beforePercent}%`, height: '100%', background: colors.textMuted }} />
            </div>
            <span style={{ fontSize: 11 }}>{row.beforePercent}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 42px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: colors.primary }}>بعد</span>
            <div style={{ height: 10, background: '#f0f0f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${row.afterPercent}%`, height: '100%', background: colors.primary }} />
            </div>
            <span style={{ fontSize: 11, color: colors.primary, fontWeight: font.weightBold }}>{row.afterPercent}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function heatColor(value) {
  if (value === null || value === undefined) return { bg: '#f4f4f4', text: colors.textMuted };
  if (value >= 80) return { bg: colors.primaryTint, text: colors.primaryDark };
  if (value >= 60) return { bg: colors.amberTint, text: colors.amber };
  return { bg: colors.redTint, text: colors.red };
}

function Heatmap({ skills, rows }) {
  if (!skills.length) {
    return <div style={{ color: colors.textMuted, fontSize: 12 }}>لا توجد بيانات مهارات كافية لبناء الخريطة الحرارية.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'right', padding: 8, background: colors.ink, color: '#fff', borderRadius: 6 }}>الفصل</th>
            {skills.map((skill) => (
              <th
                key={skill.key}
                style={{
                  padding: 8,
                  background: colors.ink,
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 11,
                  minWidth: 110,
                }}
              >
                {skill.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.className}-${index}`}>
              <td style={{ padding: 8, fontWeight: font.weightBold, whiteSpace: 'nowrap' }}>{row.className}</td>
              {row.cells.map((cell) => {
                const c = heatColor(cell.masteryPercent);
                return (
                  <td
                    key={cell.key}
                    title={cell.total ? `تم تحليل ${cell.total} حالة رصد` : 'لا توجد بيانات'}
                    style={{
                      padding: 10,
                      textAlign: 'center',
                      background: c.bg,
                      color: c.text,
                      borderRadius: 6,
                      fontWeight: font.weightBold,
                    }}
                  >
                    {cell.masteryPercent === null ? '—' : `${cell.masteryPercent}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementCards({ movement }) {
  const cards = [
    { key: 'improved', label: 'تحسن مستوى الحالة', value: movement.improved, color: colors.primary },
    { key: 'toMastered', label: 'انتقلن إلى الإتقان', value: movement.toMastered, color: colors.primary },
    { key: 'stable', label: 'استقرار', value: movement.stable, color: colors.amber },
    { key: 'declined', label: 'تراجع', value: movement.declined, color: colors.red },
  ];

  return (
    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
      {cards.map((card) => (
        <div
          key={card.key}
          style={{
            flex: '1 1 140px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.card,
            padding: spacing.md,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: font.weightBold, color: card.color }}>{card.value || 0}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{card.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function AllClassesAnalysis({ schoolId, teacherUid, teacherName, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await buildAllClassesAnalysis(schoolId, teacherUid, teacherName);
      setData(result);
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء تحليل جميع الفصول.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, teacherUid]);

  async function handleDownloadPdf() {
    if (!data || generating) return;
    setGenerating(true);
    setError('');
    try {
      const blob = await pdf(<AllClassesAnalysisDocument data={data} />).toBlob();
      await downloadBlob(blob, `تحليل-نتائج-جميع-الفصول-${data.teacherName || 'المعلمة'}.pdf`);
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء ملف PDF.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted }}>
        ...جارٍ تحليل بيانات جميع الفصول
        <div style={{ fontSize: 11, marginTop: 6 }}>قد يستغرق ذلك قليلًا لأن التقرير يحلل الرصد والمهارات وأثر المعالجة.</div>
      </div>
    );
  }

  if (!data) {
    return <div style={{ color: colors.red }}>{error || 'تعذّر تحميل التحليل.'}</div>;
  }

  return (
    <div dir="rtl" style={{ fontFamily: font.family }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.lg }}>
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'none', border: 'none', color: colors.primary, padding: 0, marginBottom: 6, cursor: 'pointer' }}
            >
              ← العودة إلى الرئيسية
            </button>
          )}
          <h2 style={{ margin: 0, color: colors.ink, fontSize: 26 }}>تحليل جميع الفصول</h2>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            {data.schoolName} — آخر تحديث للتحليل: {data.generatedDate}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={load}
            style={{ padding: '10px 14px', background: '#fff', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: radius.button }}
          >
            تحديث التحليل
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={generating || data.summary.classesCount === 0}
            style={{ padding: '10px 16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: radius.button, opacity: generating ? 0.65 : 1 }}
          >
            {generating ? '...جارٍ إعداد PDF' : 'تحميل التقرير PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, marginBottom: spacing.md }}>
          {error}
        </div>
      )}

      {data.summary.classesCount === 0 ? (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: spacing.xl, color: colors.textMuted }}>
          لا توجد فصول مرتبطة بحساب المعلّمة حتى الآن.
        </div>
      ) : (
        <>
          <Section title="الملخص التنفيذي" subtitle="قراءة سريعة تساعد على معرفة الوضع قبل الدخول في التفاصيل">
            <div style={{ background: colors.primaryTint, borderRight: `4px solid ${colors.primary}`, borderRadius: radius.button, padding: spacing.md, marginBottom: spacing.md }}>
              {data.executiveSummary.map((line, index) => (
                <div key={index} style={{ color: colors.text, lineHeight: 1.8, fontSize: 13 }}>{line}</div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <MetricCard value={`${data.summary.masteryPercent}%`} label="الإتقان العام" />
              <MetricCard value={`${data.summary.completenessPercent}%`} label="اكتمال الرصد" />
              <MetricCard value={data.summary.classesCount} label="الفصول المحللة" />
              <MetricCard value={data.summary.studentsCount} label="الطالبات" />
              <MetricCard value={data.summary.uniqueSkillsCount} label="المهارات المحللة" />
              <MetricCard
                value={`${data.summary.remediationImpact > 0 ? '+' : ''}${data.summary.remediationImpact}`}
                label="متوسط أثر المعالجة"
                hint="نقطة مئوية"
              />
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(360px, 1.6fr)', gap: spacing.lg, alignItems: 'stretch' }}>
            <Section title="توزيع الحالات" subtitle="نفس قراءة نظرة عامة ولكن لجميع الفصول">
              <DonutChart counts={data.statusCounts} />
            </Section>

            <Section title="مقارنة الفصول" subtitle="نسبة الإتقان في آخر رصد متاح لكل فصل">
              <ClassesComparison classes={data.classes} />
            </Section>
          </div>

          <Section title="الاتجاه عبر الأسابيع" subtitle="تغير حالات الرصد ونسبة الإتقان على امتداد الأسابيع">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: 11 }}>
              {STATUS_ORDER.map((key) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, color: colors.textMuted }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[key].border }} />
                  {STATUS_LABELS[key]}
                </span>
              ))}
            </div>
            <TrendChart trend={data.trend} />
          </Section>

          <Section title="أثر المعالجة" subtitle="مقارنة آخر معالجة بقياس سابق داخل كل فصل">
            <div style={{ marginBottom: spacing.md }}>
              <MovementCards movement={data.remediation.movement} />
            </div>
            <RemediationChart rows={data.remediation.rows} />
          </Section>

          <Section title="الخريطة الحرارية للفصول × المهارات" subtitle="توضح بسرعة إن كانت المشكلة في فصل واحد أم في مهارة مشتركة بين عدة فصول">
            <Heatmap skills={data.problemSkills} rows={data.heatmap} />
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg }}>
            <Section title="المهارات الأكثر احتياجًا للمعالجة">
              <div style={{ display: 'grid', gap: 8 }}>
                {data.problemSkills.length === 0 ? (
                  <div style={{ color: colors.textMuted, fontSize: 12 }}>لا توجد بيانات كافية.</div>
                ) : data.problemSkills.slice(0, 5).map((skill, index) => (
                  <div key={skill.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: colors.redTint, color: colors.red, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{index + 1}</span>
                    <span style={{ fontSize: 12 }}>{skill.title}</span>
                    <strong style={{ color: skill.masteryPercent < 60 ? colors.red : colors.amber }}>{skill.masteryPercent}%</strong>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="أفضل تقدم" subtitle="لا يعتمد على أعلى نتيجة فقط بل على مقدار التحسن">
              {data.summary.bestProgressClass ? (
                <div>
                  <div style={{ fontSize: 22, fontWeight: font.weightBold, color: colors.primary }}>
                    {data.summary.bestProgressClass.progress > 0 ? '+' : ''}{data.summary.bestProgressClass.progress} نقطة
                  </div>
                  <div style={{ fontSize: 14, color: colors.ink, marginTop: 4 }}>{data.summary.bestProgressClass.className}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 5 }}>
                    من بداية الرصد المتاح إلى آخر رصد
                  </div>
                </div>
              ) : (
                <div style={{ color: colors.textMuted }}>لا توجد بيانات كافية.</div>
              )}
            </Section>
          </div>

          <Section title="ما الذي يحتاج تدخلاً الآن؟" subtitle="ثلاث أولويات فقط حتى تكون التوصيات قابلة للتنفيذ">
            <div style={{ display: 'grid', gap: 10 }}>
              {data.priorities.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '34px 1fr',
                    gap: 10,
                    alignItems: 'start',
                    background: colors.primaryTint,
                    borderRadius: radius.button,
                    padding: spacing.md,
                  }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: colors.primary, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{index + 1}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.7, color: colors.ink }}>{item}</span>
                </div>
              ))}
            </div>
          </Section>

          {data.alerts.length > 0 && (
            <Section title="تنبيهات مبكرة" subtitle="تظهر فقط عندما تكشف البيانات ما يستحق المتابعة">
              <div style={{ display: 'grid', gap: 8 }}>
                {data.alerts.map((item, index) => (
                  <div key={index} style={{ background: colors.redTint, color: colors.red, padding: 10, borderRadius: radius.button, fontSize: 12, lineHeight: 1.6 }}>
                    {item}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="توصيات مبنية على البيانات">
            <div style={{ display: 'grid', gap: 8 }}>
              {data.recommendations.length === 0 ? (
                <div style={{ color: colors.textMuted }}>لا توجد توصيات إضافية حاليًا.</div>
              ) : data.recommendations.map((item, index) => (
                <div key={index} style={{ fontSize: 13, lineHeight: 1.7, color: colors.text }}>
                  <strong style={{ color: colors.primary }}>{index + 1}.</strong> {item}
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
