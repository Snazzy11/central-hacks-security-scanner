// Run: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/detectors.js');

const types = (text) => D.findPII(text).map((m) => m.type);

test('detects common PII', () => {
  assert.deepStrictEqual(types('mail jane.doe@example.co.uk now'), ['EMAIL_ADDRESS']);
  assert.deepStrictEqual(types('SSN 123-45-6789'), ['US_SSN']);
  assert.deepStrictEqual(types('card 4111 1111 1111 1111 exp'), ['CREDIT_CARD']);
  assert.deepStrictEqual(types('card 4111-1111-1111-1111'), ['CREDIT_CARD']);
  assert.deepStrictEqual(types('call (555) 867-5309 today'), ['PHONE_NUMBER']);
  assert.deepStrictEqual(types('call +44 20 7946 0958'), ['PHONE_NUMBER']);
  assert.deepStrictEqual(types('server 192.168.10.4'), ['IP_ADDRESS']);
  assert.deepStrictEqual(types('IBAN GB82 WEST 1234 5698 7654 32'), ['IBAN_CODE']);
  const dob = D.findPII('DOB: 03/14/1985');
  assert.strictEqual(dob[0].type, 'DATE_OF_BIRTH');
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

test('skips disabled types', () => {
  assert.deepStrictEqual(D.findPII('a@b.com', ['EMAIL_ADDRESS']), []);
});

test('redact uses the same marker and result shape as the server', () => {
  const result = D.redact('Email a@b.com or call 555-867-5309.');
  assert.strictEqual(result.text, 'Email [-----] or call [----------].');
  assert.deepStrictEqual(result.findings, [
    { type: 'EMAIL_ADDRESS', value: 'a@b.com', replacement: '[-----]' },
    { type: 'PHONE_NUMBER', value: '555-867-5309', replacement: '[----------]' },
  ]);
});

test('maskForDisplay never shows the full value', () => {
  const m = D.maskForDisplay('123-45-6789');
  assert.notStrictEqual(m, '123-45-6789');
  assert.ok(m.includes('•'));
});
