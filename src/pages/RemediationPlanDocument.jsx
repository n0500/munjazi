import { Document, Page, Text, View, StyleSheet, Font, Link } from '@react-pdf/renderer';

Font.register({
  family: 'Plex',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf',
});
Font.register({
  family: 'Plex-Bold',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf',
});

const STATUS_TEXT = { active: 'نشطة', closedSuccess: 'أُغلقت — نجحت', closedFailure: 'أُغلقت — لم تنجح' };

const styles = StyleSheet.create({
  page: { fontFamily: 'Plex', paddingTop: 100, paddingBottom: 40, paddingHorizontal: 30, fontSize: 10 },

  fixedHeaderBlock: { position: 'absolute', top: 16, left: 30, right: 30 },
  schoolName: { fontFamily: 'Plex-Bold', fontSize: 13, color: '#14261e', textAlign: 'center', lineHeight: 1.3 },
  metaLine: { fontSize: 9, color: '#555', textAlign: 'center', marginTop: 3, lineHeight: 1.3 },
  reportTitle: { fontFamily: 'Plex-Bold', fontSize: 15, color: '#0b7a4b', textAlign: 'center', marginTop: 8 },

  infoLine: { fontSize: 10, marginBottom: 6, lineHeight: 1.4 },
  infoLabel: { fontFamily: 'Plex-Bold' },
  linkLine: { fontSize: 9, marginBottom: 10 },
  linkText: { color: '#0b7a4b', textDecoration: 'underline' },

  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
    borderWidth: 1, marginBottom: 10,
  },
  statusBadgeText: { fontSize: 9, fontFamily: 'Plex-Bold' },

  sectionTitle: { fontFamily: 'Plex-Bold', fontSize: 12, color: '#0b7a4b', marginTop: 14, marginBottom: 8 },
  noFollowUps: { fontSize: 9.5, color: '#999' },

  followUpItem: { borderBottomWidth: 0.75, borderBottomColor: '#eee', paddingVertical: 6 },
  followUpDate: { fontSize: 8.5, color: '#999', marginBottom: 2 },
  followUpText: { fontSize: 9.5 },

  footer: {
    position: 'absolute', bottom: 16, left: 30, right: 30,
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    fontSize: 8, color: '#333', borderTop: 0.5, borderTopColor: '#ccc', paddingTop: 6,
  },
});

const STATUS_STYLE = {
  active: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  closedSuccess: { bg: '#eaf6ee', text: '#0b5c33', border: '#0b7a4b' },
  closedFailure: { bg: '#fdecea', text: '#a10000', border: '#c62828' },
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ar-SA');
  } catch {
    return '—';
  }
}

export default function RemediationPlanDocument({ plan, followUps, schoolName, principalName, teacherName, className, subject }) {
  const statusStyle = STATUS_STYLE[plan.status] || STATUS_STYLE.active;
  const startDateValue = plan.startDate?.toDate ? plan.startDate.toDate() : plan.startDate;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.fixedHeaderBlock} fixed>
          <Text style={styles.schoolName}>{schoolName}</Text>
          <Text style={styles.metaLine}>المادة: {subject || 'غير محددة'}</Text>
          <Text style={styles.reportTitle}>خطة علاجية</Text>
        </View>

        <Text style={styles.infoLine}><Text style={styles.infoLabel}>الطالبة: </Text>{plan.studentName}</Text>
        <Text style={styles.infoLine}><Text style={styles.infoLabel}>الفصل: </Text>{className}</Text>
        <Text style={styles.infoLine}><Text style={styles.infoLabel}>المهارة المستهدفة: </Text>{plan.skillTitle}</Text>

        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
          <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{STATUS_TEXT[plan.status]}</Text>
        </View>

        {plan.action && (
          <Text style={styles.infoLine}><Text style={styles.infoLabel}>الإجراء: </Text>{plan.action}</Text>
        )}

        {plan.enrichmentLink && (
          <Text style={styles.linkLine}>
            الرابط الإثرائي: <Link src={plan.enrichmentLink} style={styles.linkText}>{plan.enrichmentLink}</Link>
          </Text>
        )}

        <Text style={styles.infoLine}>
          تاريخ البداية: {formatDate(startDateValue)} — تاريخ المراجعة المتوقّع: {formatDate(plan.reviewDate)}
        </Text>

        <Text style={styles.sectionTitle}>سجل المتابعة</Text>
        {followUps.length === 0 ? (
          <Text style={styles.noFollowUps}>لا توجد متابعات مسجَّلة حتى الآن.</Text>
        ) : (
          followUps.map((f) => {
            const dateValue = f.createdAt?.toDate ? f.createdAt.toDate() : f.createdAt;
            return (
              <View key={f.id} style={styles.followUpItem} wrap={false}>
                <Text style={styles.followUpDate}>{formatDate(dateValue)}</Text>
                <Text style={styles.followUpText}>{f.text}</Text>
              </View>
            );
          })
        )}

        <View style={styles.footer} fixed>
          <Text>مديرة المدرسة: {principalName || '—'}</Text>
          <Text>المعلّمة: {teacherName}</Text>
          <Text render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
