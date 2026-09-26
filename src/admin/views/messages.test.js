import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderMessages } from './messages.js';
import { texts } from '../../../config/texts.config.js';

const M = [
  { id: 'b', name: 'Lucia', email: 'l@e.it', message: 'Secondo', receivedAt: 2000 },
  { id: 'a', name: 'Mario', email: 'm@e.it', subject: 'Matrimonio', message: 'Primo', receivedAt: 1000 },
];

let root, deps;
beforeEach(() => {
  root = document.createElement('div');
  deps = {
    api: { listMessages: vi.fn(async () => ({ ok: true, data: { messages: M } })),
           deleteMessage: vi.fn(async () => ({ ok: true })) },
    confirm: () => true,
    say: vi.fn(),
  };
});

describe('renderMessages', () => {
  it('mostra un elemento per messaggio, con nome e testo', async () => {
    await renderMessages(root, deps, texts);
    expect(root.querySelectorAll('.admin-message')).toHaveLength(2);
    expect(root.textContent).toContain('Lucia');
    expect(root.textContent).toContain('Secondo');
  });

  it('mostra il subject quando c e', async () => {
    await renderMessages(root, deps, texts);
    expect(root.textContent).toContain('Matrimonio');
  });

  it('offre un mailto per rispondere', async () => {
    await renderMessages(root, deps, texts);
    const link = root.querySelector('a[href^="mailto:"]');
    expect(link.getAttribute('href')).toContain('l@e.it');
  });

  it('mostra come testo, mai come HTML, ciò che arriva dal form pubblico', async () => {
    const evil = '<meta http-equiv="refresh" content="0;url=https://evil.example"><img src=x onerror="alert(1)">';
    deps.api.listMessages = async () => ({ ok: true, data: { messages: [
      { id: 'x', name: evil, email: 'a@b.c" onmouseover="alert(1)', subject: evil, message: evil, receivedAt: 1 },
    ] } });
    await renderMessages(root, deps, texts);
    expect(root.querySelector('meta, img, [onmouseover]')).toBeNull();
    expect(root.querySelector('.admin-message__name').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__subject').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__body').textContent).toBe(evil);
    expect(root.querySelector('.admin-message__reply').getAttribute('href')).toBe('mailto:a@b.c" onmouseover="alert(1)');
  });

  it('nasconde la scritta di elenco vuoto con hidden, senza stili inline bloccati dalla CSP', async () => {
    await renderMessages(root, deps, texts);
    expect(root.querySelector('.admin-messages-empty').hidden).toBe(true);
    expect(root.querySelector('[style]')).toBeNull();
  });

  it('elimina un messaggio e lo toglie dall elenco', async () => {
    await renderMessages(root, deps, texts);
    root.querySelector('.admin-message__delete').click();
    await vi.waitFor(() => expect(deps.api.deleteMessage).toHaveBeenCalledWith('b'));
  });

  it('non elimina se l utente annulla', async () => {
    deps.confirm = () => false;
    await renderMessages(root, deps, texts);
    root.querySelector('.admin-message__delete').click();
    expect(deps.api.deleteMessage).not.toHaveBeenCalled();
  });

  it('mostra il messaggio di elenco vuoto', async () => {
    deps.api.listMessages = async () => ({ ok: true, data: { messages: [] } });
    await renderMessages(root, deps, texts);
    expect(root.textContent).toContain(texts.admin.messages.empty);
    expect(root.querySelector('.admin-messages-empty').hidden).toBe(false);
  });

  it('avvisa se il caricamento fallisce', async () => {
    deps.api.listMessages = async () => ({ ok: false });
    await renderMessages(root, deps, texts);
    expect(deps.say).toHaveBeenCalledWith(texts.admin.messages.loadError, true);
  });
});
