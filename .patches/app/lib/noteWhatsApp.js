export function normalizePhone(value) {
  let number = String(value || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[\s()+-]/g, '');
  if (number.startsWith('00')) number = number.slice(2);
  if (/^05\d{8}$/.test(number)) number = `966${number.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(number)) throw new Error('أدخلي رقم الجوال بصيغة 05xxxxxxxx أو مع رمز الدولة.');
  if (number.startsWith('966') && !/^9665\d{8}$/.test(number)) throw new Error('رقم الجوال السعودي غير صحيح.');
  return number;
}
export function noteWhatsAppUrl(phone, note, baseUrl) {
  const url = new URL(baseUrl);
  url.search = ''; url.hash = '';
  url.searchParams.set('role', 'teacher'); url.searchParams.set('notes', '1');
  const text = `أ. ${note.teacherName}\nلديك ملاحظة من ${note.adminName || 'إدارة المدرسة'} في منجزي.\n${note.context ? `${note.context}\n` : ''}${note.kind === 'action' ? 'يتطلب إجراء' : 'للاطلاع'}\n${note.text}\nللاطلاع والرد: ${url.href}`;
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
