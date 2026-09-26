import { describe, expect, it } from 'vitest';
import { SafeHtml, escapeHtml, html } from './html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('html', () => {
  it('escapes interpolated values', () => {
    expect(String(html`<p title="${'"x"'}">${'<b>&</b>'}</p>`)).toBe('<p title="&quot;x&quot;">&lt;b&gt;&amp;&lt;/b&gt;</p>');
  });

  it('inserts nested html templates and arrays of them as they are', () => {
    const items = ['a', '<b>'].map(v => html`<li>${v}</li>`);
    expect(String(html`<ul>${items}</ul>`)).toBe('<ul><li>a</li><li>&lt;b&gt;</li></ul>');
    expect(String(html`<div>${html`<br>`}</div>`)).toBe('<div><br></div>');
  });

  it('renders null, undefined and false as nothing, numbers as text', () => {
    expect(String(html`${null}${undefined}${false}${0}`)).toBe('0');
  });

  it('behaves like a string and can be assigned to innerHTML', () => {
    const safe = html`<p>${'x'}</p>`;
    expect(safe).toBeInstanceOf(SafeHtml);
    expect(safe.includes('<p>')).toBe(true);
    const div = document.createElement('div');
    div.innerHTML = html`<img src=x onerror="${'alert(1)'}"><span>${'<i>'}</span>`;
    expect(div.querySelector('i')).toBeNull();
    expect(div.querySelector('span').textContent).toBe('<i>');
  });
});
