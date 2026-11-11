// @vitest-environment jsdom
// Wire material check row (Aboud 2026-11-11) — the two dropdowns that write
// the Design Feedback verdict, and the one-line flag that reports it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeRecord } from '../lib/__fixtures__/makeRecord';
import type { PostRecord } from '../types';
import WireCheckRow from './WireCheckRow';

/** Mounts the row with real state, the way ComposeTab drives it. */
function mount(initial: Partial<PostRecord> = {}) {
  function Host() {
    const [record, setRecord] = useState<PostRecord>(makeRecord(initial));
    return <WireCheckRow record={record} update={(fn) => setRecord(fn)} />;
  }
  render(<Host />);
}

afterEach(cleanup);

const designSelect = () => screen.getByLabelText(/Design SLD shows/i);
const bosSelect = () => screen.getByLabelText(/BOS \/ install uses/i) as HTMLSelectElement;
const ratingSelect = () => screen.getByLabelText(/Service rating/i) as HTMLSelectElement;
const flag = () => document.querySelector('.wire-flag')!;

describe('WireCheckRow', () => {
  it('reads "Not confirmed" until both halves are picked', () => {
    mount();
    expect(flag().textContent).toBe('Not confirmed');
    expect(flag().className).toContain('unknown');

    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    expect(flag().textContent).toBe('Not confirmed');
  });

  it('flags a match', () => {
    mount({ wire: { serviceAmps: 200 } });
    fireEvent.change(designSelect(), { target: { value: 'AL' } });
    fireEvent.change(bosSelect(), { target: { value: 'AL' } });
    expect(flag().className).toContain('match');
    expect(flag().textContent).toBe('✓ Match — aluminum');
  });

  it('flags a mismatch, naming which side is which', () => {
    mount({ wire: { serviceAmps: 200 } });
    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    fireEvent.change(bosSelect(), { target: { value: 'AL' } });
    expect(flag().className).toContain('mismatch');
    expect(flag().textContent).toBe('✗ Mismatch — SLD copper, BOS aluminum');
  });

  // Aboud 2026-11-11, on seeing the first version: "i want it, but only a flag
  // saying if we match or not, no need for this long things". The generated
  // sentence is already on screen in the Slack preview and the SF field.
  it('is a FLAG, not a restatement — no sentence, no strip, no copy button', () => {
    mount({ wire: { design: 'CU', bos: 'AL', serviceAmps: 200 } });
    expect(flag().textContent).not.toContain('Please update');
    expect(flag().textContent!.length).toBeLessThan(60);
    expect(document.querySelector('.wire-strip')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy ask/i })).toBeNull();
  });

  it('quotes Table 310.12 for the picked rating', () => {
    mount();
    fireEvent.change(ratingSelect(), { target: { value: '225' } });
    // #3/0, not the "30/" typo in the reference graphic. kcmil takes no #.
    expect(screen.getByText(/Copper #3\/0 AWG · Aluminum 250 kcmil/)).toBeTruthy();
  });

  // Aboud 2026-11-11: "remove 250A and above from the drop down we dont use them".
  it('offers 100–225 A only', () => {
    mount();
    expect([...ratingSelect().options].map((o) => o.value)).toEqual([
      '',
      '100',
      '110',
      '125',
      '150',
      '175',
      '200',
      '225',
    ]);
  });

  it('has no size hint until a rating is picked, and no scope footnote after', () => {
    mount();
    expect(document.querySelector('.wire-size-hint')).toBeNull();
    cleanup();
    mount({ wire: { serviceAmps: 200 } });
    expect(document.querySelector('.wire-size-hint')!.textContent).not.toMatch(/adjustment or correction/);
  });

  it('"Same as design" copies the design pick into BOS in one click', () => {
    mount();
    expect(screen.getByRole('button', { name: /Same as design/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    fireEvent.click(screen.getByRole('button', { name: /Same as design/i }));
    expect(bosSelect().value).toBe('CU');
    expect(flag().className).toContain('match');
  });

  it('never pre-fills BOS on its own — a silent default is how the rejections started', () => {
    mount();
    fireEvent.change(designSelect(), { target: { value: 'AL' } });
    expect(bosSelect().value).toBe('');
  });

  it('warns when the BOS picks aluminum in a jurisdiction that restricts it', () => {
    // Pasadena is "Restricted: …" in Othman's list (aluminumWiringData.ts).
    mount({ wire: { design: 'AL', bos: 'AL' } });
    expect(document.querySelector('.wire-alu-flag')!.textContent).toMatch(/Pasadena.*Restricted/);
  });

  it('stays quiet about the jurisdiction when the BOS is copper', () => {
    mount({ wire: { design: 'CU', bos: 'CU' } });
    expect(document.querySelector('.wire-alu-flag')).toBeNull();
  });
});
