import { Document, Page, Text, View, StyleSheet, Font, PDFDownloadLink } from '@react-pdf/renderer';

Font.register({
  family: 'Amiri',
  src: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf',
});

const styles = StyleSheet.create({
  page: { fontFamily: 'Amiri', padding: 30, paddingTop: 60, paddingBottom: 50, fontSize: 12 },
  header: {
    position: 'absolute', top: 20, left: 30, right: 30,
    textAlign: 'center', fontSize: 18, borderBottom: 2, borderBottomColor: '#0b7a4b', paddingBottom: 8,
  },
  footer: {
    position: 'absolute', bottom: 20, left: 30, right: 30,
    textAlign: 'center', fontSize: 9, color: '#999',
  },
  row: { flexDirection: 'row-reverse', borderBottom: 1, borderBottomColor: '#eee', paddingVertical: 4 },
  cell: { flex: 1, textAlign: 'right' },
});

const baseNames = [
  'أميرة نافع غزاي الحري', 'الجوهره عبدالله عبدالعزيز الخليفه', 'العنود عبدالعزيز هلال الدحيان',
  'الينوف يوسف بن صالح الصويان', 'تالا عبدالعزيز عبدالرحمن البطي', 'تولين محمد الحميدي الحري',
  'جمانه خالد مهجي المطيري', 'داليا خليل حمدي الحري', 'دانة اسامه بن عبدالعزيز ابوعباة',
  'رهف راشد بن وديان المظيبري',
];
const dummyNames = Array.from({ length: 60 }, (_, i) => `${baseNames[i % baseNames.length]} ${Math.floor(i / baseNames.length) + 1}`);

function TestDocument() {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header} fixed>منجزي — اختبار الخط العربي والرأس المتكرر</Text>
        {dummyNames.map((name, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cell}>{name}</Text>
            <Text style={styles.cell}>متقنة</Text>
          </View>
        ))}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `صادر من منجزي — صفحة ${pageNumber} من ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export default function PdfTestPage() {
  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 16, textAlign: 'center' }} dir="rtl">
      <h2 style={{ fontFamily: 'sans-serif' }}>صفحة اختبار PDF المعزولة</h2>
      <p style={{ fontFamily: 'sans-serif', fontSize: 13, color: '#666' }}>
        هذا اختبار مستقل تمامًا، ما يمس أي تقرير حالي بالنظام.
      </p>
      <PDFDownloadLink document={<TestDocument />} fileName="اختبار-منجزي.pdf">
        {({ loading }) => (
          <button style={{ padding: '12px 24px', background: '#0b7a4b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, marginTop: 16 }}>
            {loading ? '...جارٍ التجهيز' : 'تحميل ملف الاختبار'}
          </button>
        )}
      </PDFDownloadLink>
    </div>
  );
}
