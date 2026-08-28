import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// يحوّل عنصر HTML إلى PDF متعدد الصفحات، مع الحفاظ على أي روابط <a href> بداخله
// قابلة للنقر فعليًا داخل ملف الـPDF (يشتغل تلقائيًا لأي تقرير يستخدم هذه الدالة)
export async function exportElementToPdf(element, filename, orientation = 'p') {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  // نسبة تحويل من بكسل (حجم العنصر بالمتصفح) إلى مليمتر (حجم صفحة الـPDF)
  const ratio = imgWidth / element.offsetWidth;
  const elementRect = element.getBoundingClientRect();
  const links = Array.from(element.querySelectorAll('a[href]')).map((a) => {
    const r = a.getBoundingClientRect();
    return {
      url: a.getAttribute('href'),
      x: (r.left - elementRect.left) * ratio,
      y: (r.top - elementRect.top) * ratio,
      w: r.width * ratio,
      h: r.height * ratio,
    };
  });

  function addLinksForPage(pageTopMm) {
    links.forEach((l) => {
      if (l.y >= pageTopMm && l.y < pageTopMm + pageHeight) {
        pdf.link(l.x, l.y - pageTopMm, l.w, l.h, { url: l.url });
      }
    });
  }

  let heightLeft = imgHeight;
  let position = 0;
  let pageTopMm = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  addLinksForPage(pageTopMm);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    pageTopMm += pageHeight;
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    addLinksForPage(pageTopMm);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
