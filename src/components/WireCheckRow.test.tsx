// @vitest-environment jsdom
// Wire material check row (Aboud 2026-11-11) — the two dropdowns that write
// the Design Feedback verdict, and the strip that shows what they wrote.

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
    return <WireCheckRow record={record} update={(fn) => setRecord(fn)} toast={() => {}} />;
  }
  render(<Host />);
}

afterEach(cleanup);

const designSelect = () => screen.getByLabelText(/Design SLD shows/i);
const bosSelect = () => screen.getByLabelText(/BOS \/ install uses/i);
const ratingSelect = () => screen.getByLabelText(/Service rating/i);
const strip = () => document.querySelector('.wire-strip')!;

describe('WireCheckRow', () => {
  it('asks for both picks before it will state anything', () => {
    mount();
    expect(strip().textContent).toContain('Pick both to state the match in Design Feedback');
    expect(strip().className).toContain('unknown');
  });

  it('still says nothing when only one half is picked', () => {
    mount();
    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    expect(strip().className).toContain('unknown');
  });

  it('shows the match, and the exact sentence Design Feedback will carry', () => {
    mount({ wire: { serviceAmps: 200 } });
    fireEvent.change(designSelect(), { target: { value: 'AL' } });
    fireEvent.change(bosSelect(), { target: { value: 'AL' } });
    expect(strip().className).toContain('match');
    expect(strip().textContent).toContain('Match — aluminum in both');
    expect(strip().textContent).toContain(
      'Wire material unchanged — the design SLD and the BOS both specify aluminum conductors ' +
        '(4/0 AWG for the 200 A service, NEC Table 310.12).',
    );
  });

  it('shows the mismatch and the ask', () => {
    mount({ wire: { serviceAmps: 200 } });
    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    fireEvent.change(bosSelect(), { target: { value: 'AL' } });
    expect(strip().className).toContain('mismatch');
    expect(strip().textContent).toContain('Mismatch — SLD copper, BOS aluminum');
    expect(strip().textContent).toContain('Please update the design SLD to 4/0 AWG aluminum');
    expect(screen.getByRole('button', { name: /Copy ask/i })).toBeTruthy();
  });

  it('quotes Table 310.12 for the picked rating', () => {
    mount();
    fireEvent.change(ratingSelect(), { target: { value: '225' } });
    // 3/0, not the "30/" typo in the reference graphic.
    expect(screen.getByText(/Copper 3\/0 AWG · Aluminum 250 kcmil/)).toBeTruthy();
  });

  it('has no size hint until a rating is picked', () => {
    mount();
    expect(document.querySelector('.wire-size-hint')).toBeNull();
  });

  it('"Same as design" copies the design pick into BOS in one click', () => {
    mount();
    expect(screen.getByRole('button', { name: /Same as design/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(designSelect(), { target: { value: 'CU' } });
    fireEvent.click(screen.getByRole('button', { name: /Same as design/i }));
    expect((bosSelect() as HTMLSelectElement).value).toBe('CU');
    expect(strip().className).toContain('match');
  });

  it('never pre-fills BOS on its own — a silent default is how the rejections started', () => {
    mount();
    fireEvent.change(designSelect(), { target: { value: 'AL' } });
    expect((bosSelect() as HTMLSelectElement).value).toBe('');
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
