import { describe, it, expect, beforeEach } from 'vitest';
import { texts } from '../../config/texts.config.js';
import { createStatus } from './status.js';

function makeEl() {
  const el = document.createElement('p');
  el.innerHTML = '<span class="admin-status__badge"></span><span class="admin-status__text"></span><span class="admin-status__time"></span>';
  return el;
}

describe('createStatus', () => {
  let el;
  beforeEach(() => { el = makeEl(); });

  it('say() senza flag: badge "Ultima azione eseguita", nessuna classe errore', () => {
    const { say } = createStatus(el);
    say('Sito salvato.');
    expect(el.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.lastAction);
    expect(el.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(false);
    expect(el.querySelector('.admin-status__text').textContent).toBe('Sito salvato.');
  });

  it('say(msg, true): badge "Errore" con classe errore', () => {
    const { say } = createStatus(el);
    say('Titolo non valido.', true);
    expect(el.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.error);
    expect(el.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(true);
    expect(el.querySelector('.admin-status__text').textContent).toBe('Titolo non valido.');
  });

  it('chiamate successive aggiornano badge e testo, non si accumulano', () => {
    const { say } = createStatus(el);
    say('Titolo non valido.', true);
    say('Sito salvato.');
    expect(el.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.lastAction);
    expect(el.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(false);
    expect(el.querySelector('.admin-status__text').textContent).toBe('Sito salvato.');
  });

  it('run(): fn che risolve non tocca lo stato', async () => {
    const { run } = createStatus(el);
    await run(async () => {});
    expect(el.querySelector('.admin-status__badge').textContent).toBe('');
  });

  it('run(): fn che rifiuta mostra il messaggio dell\'errore con badge errore', async () => {
    const { run } = createStatus(el);
    await run(async () => { throw new Error('Rete non disponibile'); });
    expect(el.querySelector('.admin-status__badge').textContent).toBe(texts.admin.status.error);
    expect(el.querySelector('.admin-status__badge').classList.contains('admin-status__badge--error')).toBe(true);
    expect(el.querySelector('.admin-status__text').textContent).toBe('Rete non disponibile');
  });

  it('say() imposta un timestamp leggibile in .admin-status__time', () => {
    const { say } = createStatus(el);
    say('Sito salvato.');
    const time = el.querySelector('.admin-status__time').textContent;
    expect(time).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });

  it('chiamate successive aggiornano il timestamp (non si accumula testo)', () => {
    const { say } = createStatus(el);
    say('Primo.');
    const first = el.querySelector('.admin-status__time').textContent;
    say('Secondo.');
    const second = el.querySelector('.admin-status__time').textContent;
    expect(second).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
    expect(first).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });
});
