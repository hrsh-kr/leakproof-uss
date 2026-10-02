import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmail, normalizeEmail, isHttpUrl, normalizeUrl, maskEmail, FORMATS } from '../src/js/validators.mjs';

test('emails: ordinary addresses are accepted, including plus tags, dots, subdomains and IIIT-style domains', () => {
  for (const e of ['asha@example.com', 'asha.kumar@iiitd.ac.in', 'a+tag@sub.example.co.in', 'first_last@my-site.org', 'x1@a.io', '  padded@example.com  ', 'UPPER@Example.COM', 'name-with-dash@example.com', 'a@b.cc']) assert.equal(isEmail(e), e.trim().length >= 6, e);
  assert.ok(isEmail('2022198@iiitd.ac.in'));
});

test('emails: malformed, dangerous and oversized input is refused', () => {
  const bad = ['', 'plain', '@example.com', 'a@', 'a@b', 'a@b.', 'a@.com', 'a b@example.com', 'a@exa mple.com', 'a@@example.com', 'a@b@c.com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    '"quoted"@example.com', 'a@example..com', 'a@-example.com', 'a@example-.com', '<script>@example.com', 'a(b)@example.com', 'a,b@example.com', 'a;b@example.com', 'a@exam_ple.com', 'a@example.c', 'a@example.123',
    'x'.repeat(65) + '@example.com', 'a@' + 'x'.repeat(200) + '.com', 'a@b.com\nBcc: evil@example.com', 'mailto:a@b.com', 'ａ@example.com'];
  for (const e of bad) assert.equal(isEmail(e), false, JSON.stringify(e));
  for (const v of [undefined, null, 5, {}, [], true]) assert.equal(isEmail(v), false);
});

test('emails are normalised to lowercase without padding (a trailing newline is just trimmed)', () => {
  assert.equal(isEmail('a@b.com\r\n'), true);
  assert.equal(normalizeEmail('a@b.com\r\n'), 'a@b.com');
  assert.equal(normalizeEmail('  Asha.Kumar@IIITD.ac.in '), 'asha.kumar@iiitd.ac.in');
  assert.equal(FORMATS.email.normalize(' A@B.CO '), 'a@b.co');
});

test('links: https and http links with a real host are accepted', () => {
  for (const u of ['https://forms.gle/abc123', 'https://tally.so/r/wMXXXX', 'http://example.com/survey', 'https://docs.google.com/forms/d/e/1FAIpQLSc/viewform?usp=sf_link', 'https://uss-ten-theta.vercel.app/review', 'https://my-study.example.co.in/path?a=1&b=2#top', 'http://localhost:3000/x']) assert.equal(isHttpUrl(u), true, u);
});

test('links: other schemes, credentials, spaces, missing hosts and oversized input are refused', () => {
  const bad = ['', 'forms.gle/abc', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://example.com/file', 'file:///etc/passwd', 'vbscript:x', 'https://', 'https://user:pass@example.com/', 'https://user@example.com/', 'https://exa mple.com/', 'https://example.com/a b', 'https://nodot', 'https://exa_mple.com', 'https://-bad.com', 'x'.repeat(301), 'https://example.com/' + 'a'.repeat(300), '//example.com/path', 'https:example.com', 'https://example.com\nhttps://evil.com'];
  for (const u of bad) assert.equal(isHttpUrl(u), false, JSON.stringify(u).slice(0, 60));
  for (const v of [undefined, null, 5, {}, []]) assert.equal(isHttpUrl(v), false);
});

test('links are normalised by the URL parser', () => {
  assert.equal(normalizeUrl(' https://Example.com '), 'https://example.com/');
  assert.equal(FORMATS.url.normalize('https://forms.gle/AbC'), 'https://forms.gle/AbC');
});

test('masked email for the on-screen receipt hides most of the address but keeps it recognisable', () => {
  assert.equal(maskEmail('asha.kumar@gmail.com'), 'as***@gmail.com');
  assert.equal(maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(maskEmail('ab@b.co'), 'a***@b.co');
  assert.equal(maskEmail('not-an-email'), '');
});
