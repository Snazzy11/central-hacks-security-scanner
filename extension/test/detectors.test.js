// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/detectors.js');
const Z = require('../src/zip.js');
const S = require('../src/office.js');

const types = (text) => D.findPII(text).map((m) => m.type);

test('detects common PII', () => {
  assert.deepStrictEqual(types('mail jane.doe@example.co.uk now'), ['EMAIL']);
  assert.deepStrictEqual(types('SSN 123-45-6789'), ['SSN']);
  assert.deepStrictEqual(types('card 4111 1111 1111 1111 exp'), ['CREDIT_CARD']);
  assert.deepStrictEqual(types('card 4111-1111-1111-1111'), ['CREDIT_CARD']);
  assert.deepStrictEqual(types('call (555) 867-5309 today'), ['PHONE']);
  assert.deepStrictEqual(types('call +44 20 7946 0958'), ['PHONE']);
  assert.deepStrictEqual(types('server 192.168.10.4'), ['IP_ADDRESS']);
  assert.deepStrictEqual(types('IBAN GB82 WEST 1234 5698 7654 32'), ['IBAN']);
  const dob = D.findPII('DOB: 03/14/1985');
  assert.strictEqual(dob[0].type, 'DOB');
  assert.strictEqual(dob[0].value, '03/14/1985');
});

test('avoids common false positives', () => {
  assert.deepStrictEqual(types('order 4111 1111 1111 1112'), []);  // fails Luhn
  assert.deepStrictEqual(types('SSN 000-12-3456'), []);
  assert.deepStrictEqual(types('version 1.2.3.4.5'), []);
  assert.deepStrictEqual(types('released 2024-01-15'), []);
  assert.deepStrictEqual(types('total 1,234,567.89'), []);
  assert.deepStrictEqual(types('id 0000000000000000'), []);
});

test('respects enabled types', () => {
  assert.deepStrictEqual(D.findPII('a@b.com', { EMAIL: false }), []);
});

test('redactText', () => {
  const t = 'Email a@b.com or call 555-867-5309.';
  assert.strictEqual(D.redactText(t, D.findPII(t)), 'Email [REDACTED:EMAIL] or call [REDACTED:PHONE].');
});

test('maskForDisplay never shows the full value', () => {
  const m = D.maskForDisplay('123-45-6789');
  assert.notStrictEqual(m, '123-45-6789');
  assert.ok(m.includes('•'));
});

test('redactXmlRuns handles PII split across runs', () => {
  const xml = '<w:p><w:r><w:t>Mail jane</w:t></w:r><w:r><w:t>.doe@exa</w:t></w:r><w:r><w:t>mple.com ok</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">no pii &amp; fine</w:t></w:r></w:p>';
  const { xml: out, findings } = S.redactXmlRuns(xml, '</w:p>', 'w:t', D.DEFAULT_ENABLED);
  assert.strictEqual(findings.length, 1);
  assert.ok(out.includes('<w:t>Mail [REDACTED:EMAIL]</w:t>'));
  assert.ok(out.includes('<w:t></w:t>'));
  assert.ok(out.includes('<w:t xml:space="preserve"> ok</w:t>'));
  assert.ok(out.includes('no pii &amp; fine'));
});

test('zip round-trip', async () => {
  const enc = new TextEncoder();
  const entries = [{ name: 'a.txt', flags: 0, method: 0, time: 0, date: 0, crc: 0, size: 0, compressed: new Uint8Array() }];
  await Z.setEntryBytes(entries[0], enc.encode('hello hello hello'));
  const blob = Z.writeZip(entries);
  const back = Z.readZip(await blob.arrayBuffer());
  assert.strictEqual(new TextDecoder().decode(await Z.entryBytes(back[0])), 'hello hello hello');
  assert.strictEqual(back[0].crc, Z.crc32(enc.encode('hello hello hello')));
});
