import test from 'node:test';
import assert from 'node:assert/strict';
import { UrlNormalizer } from '../src/engine/url-normalizer.js';

test('UrlNormalizer - canonicalizeDomain variations and trailing dots', () => {
  assert.equal(UrlNormalizer.canonicalizeDomain('example.com'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('www.example.com'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('m.example.com'), 'm.example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('a.b.example.com'), 'a.b.example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('example.com.'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('EXAMPLE.COM'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('http://example.com'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('https://example.com'), 'example.com');
  assert.equal(UrlNormalizer.canonicalizeDomain('https://example.com:443'), 'example.com');
});

test('UrlNormalizer - canonicalizeKeyword percent-decoding & deterministic bounds', () => {
  assert.equal(UrlNormalizer.canonicalizeKeyword('sex'), 'sex');
  assert.equal(UrlNormalizer.canonicalizeKeyword('SEX'), 'sex');
  assert.equal(UrlNormalizer.canonicalizeKeyword('%73%65%78'), 'sex'); // %73%65%78 -> sex
  assert.equal(UrlNormalizer.canonicalizeKeyword('%53%45%58'), 'sex'); // Uppercase percent encoding
  assert.equal(UrlNormalizer.canonicalizeKeyword('  /porn/ '), 'porn');
});

test('UrlNormalizer - pathological input protection (CPU/memory safety)', () => {
  // Strings longer than 253 chars rejected as domains
  const longStr = 'a'.repeat(300) + '.com';
  assert.equal(UrlNormalizer.isValidDomain(longStr), false);
  assert.equal(UrlNormalizer.canonicalizeDomain(longStr), null);

  // Single character keywords rejected
  assert.equal(UrlNormalizer.canonicalizeKeyword('a'), null);
});

test('UrlNormalizer - buildKeywordRegexFilter scopes & false positive prevention', () => {
  // Scope: path_query
  const pathRegexStr = UrlNormalizer.buildKeywordRegexFilter('sex', 'path_query');
  const pathRegex = new RegExp(pathRegexStr, 'i');

  // Must match path/query contains keyword
  assert.equal(pathRegex.test('https://moviesite.com/videos/sex/123'), true);
  assert.equal(pathRegex.test('https://moviesite.com/search?q=sex'), true);
  assert.equal(pathRegex.test('https://moviesite.com/item#sex'), true);

  // MUST NOT match hostname when scope is path_query
  assert.equal(pathRegex.test('https://sexeducation.example.com/'), false);
  assert.equal(pathRegex.test('https://sexeducation.example.com/article/1'), false);
  assert.equal(pathRegex.test('https://essex.example.com/'), false);

  // Legitimate false positive prevention in path
  assert.equal(pathRegex.test('https://example.com/assessment'), false);
  assert.equal(pathRegex.test('https://example.com/section'), false);
});

test('UrlNormalizer & PageGuard - Hostname keyword matching semantics & false positive prevention', () => {
  const hostRegexStr = UrlNormalizer.buildKeywordRegexFilter('sex', 'hostname');
  const hostRegex = new RegExp(hostRegexStr, 'i');

  const matchHostKeyword = (host, pattern) => {
    const hostLabels = host.toLowerCase().split('.');
    return host.toLowerCase() === pattern || hostLabels.includes(pattern);
  };

  // Valid intended hostname matching
  assert.equal(hostRegex.test('http://sex.example.com/'), true);
  assert.equal(hostRegex.test('http://example.sex/'), true);
  assert.equal(matchHostKeyword('sex.example.com', 'sex'), true);
  assert.equal(matchHostKeyword('example.sex', 'sex'), true);

  // MUST NOT match under hostname scope
  assert.equal(hostRegex.test('http://sexeducation.example.com/'), false);
  assert.equal(hostRegex.test('http://essex.example.com/'), false);
  assert.equal(hostRegex.test('http://mysexexample.com/'), false);
  assert.equal(matchHostKeyword('sexeducation.example.com', 'sex'), false);
  assert.equal(matchHostKeyword('essex.example.com', 'sex'), false);
  assert.equal(matchHostKeyword('mysexexample.com', 'sex'), false);
});

