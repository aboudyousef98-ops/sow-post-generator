// @vitest-environment jsdom
// Tick chips (Aboud 2026-11-17, after the cost-driver row shipped with eight
// chips whose two-word labels broke in half).
//
// The checked state is an `on` CLASS set by React, not a `:has(input:checked)`
// selector — the stylesheet uses :has() nowhere else, and a class is the thing
// a test can hold onto. These tests exist because a tick group that forgets
// the class looks permanently unchecked, and nothing else would catch that.
//
// The no-wrap rule itself lives in theme.css (`white-space: nowrap` on the
// chip, `flex-wrap: wrap` on the row) and cannot be asserted here — jsdom
// applies no stylesheet and computes no layout.
//
// Deliberately TWO renders, not one per assertion: App.integration.test.tsx
// already runs long enough to time out under full-suite load on this laptop,
// and every extra <App /> mount makes that worse.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const chip = (label: string) =>
  [...document.querySelectorAll('label.service-tick')].find((l) => l.textContent?.trim() === label);

const allChipsAreLabels = () => {
  const chips = [...document.querySelectorAll('label.service-tick')];
  expect(chips.length).toBeGreaterThan(0);
  for (const c of chips) {
    // The whole pill is the hit area, which is what gets the target over the
    // 24x24 CSS px floor (WCAG 2.2 AA) even though the native box is ~13px.
    expect(c.tagName).toBe('LABEL');
    expect(c.querySelector('input[type="checkbox"]')).toBeTruthy();
    // "long SER run" must reach the DOM as ONE text run. A label split into
    // spans could not be held together by white-space: nowrap.
    const textNodes = [...c.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    expect(textNodes.length).toBe(1);
  }
};

describe('tick chips carry their checked state as a class', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, hasKey: false }), { status: 200 })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('SOW card: `on` tracks the box both ways, and every chip is a label', () => {
    render(<App />);
    allChipsAreLabels();

    const mpu = chip('MPU');
    expect(mpu).toBeTruthy();
    expect(mpu!.className).not.toContain('on');

    fireEvent.click(mpu!.querySelector('input')!);
    expect(chip('MPU')!.className).toContain('on');

    // Untick puts it back — `on` is not one-way.
    fireEvent.click(chip('MPU')!.querySelector('input')!);
    expect(chip('MPU')!.className).not.toContain('on');
  });

  it('SVT card ticks its groups the same way', () => {
    render(<App />);
    fireEvent.click(screen.getByText('SVT — Pre-Design'));
    allChipsAreLabels();

    const attic = chip('Attic run');
    expect(attic).toBeTruthy();
    expect(attic!.className).not.toContain('on');

    fireEvent.click(attic!.querySelector('input')!);
    expect(chip('Attic run')!.className).toContain('on');
  });
});
