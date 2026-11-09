import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, noteWhatsAppUrl } from '../.patches/app/lib/noteWhatsApp.js';
test('Saudi, international and Arabic numerals normalize without losing country code', () => {
 for (const phone of ['0501234567','٠٥٠١٢٣٤٥٦٧','۰۵۰۱۲۳۴۵۶۷','+966 50 123 4567','00966501234567']) assert.equal(normalizePhone(phone), '966501234567');
 assert.equal(normalizePhone('+44 7700 900123'), '447700900123');
 for (const phone of ['', '050123', 'abc0501234567', '9660501234567', '0501234567890123']) assert.throws(() => normalizePhone(phone));
});
test('WhatsApp preserves Arabic note and sends teacher to notes, without inheriting parent routing', () => {
 const note = {teacherName:'نهى',adminName:'الإدارة',text:'ملاحظة & متابعة\nسطر ثان',context:'أول ثانوي · الأسبوع ١١',kind:'action'};
 const result = new URL(noteWhatsAppUrl('0501234567', note, 'https://n0500.github.io/munjazi/?role=parent#x'));
 assert.equal(result.hostname,'wa.me');
 assert.equal(result.pathname,'/966501234567');
 const message = result.searchParams.get('text');
 assert.ok(message.includes(note.text));
 assert.ok(message.includes('يتطلب إجراء'));
 assert.ok(message.includes('https://n0500.github.io/munjazi/?role=teacher&notes=1'));
 assert.ok(!message.includes('role=parent'));
});
