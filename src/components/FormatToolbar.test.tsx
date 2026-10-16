// @vitest-environment jsdom
// The formatting toolbar drives a plain textarea — these assert the TEXT it
// produces, because that text is exactly what lands in Blobs and in Slack.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import FormatToolbar, { continueList, formatHotkey } from './FormatToolbar';
import RichText from './RichText';

afterEach(cleanup);

function Harness({ initial = '' }: { initial?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [v, setV] = useState(initial);
  return (
    <>
      <FormatToolbar taRef={ref} value={v} onChange={setV} label="Note" />
      <textarea
        ref={ref}
        aria-label="Note"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (formatHotkey(e, ref, v, setV)) return;
          continueList(e, ref, v, setV);
        }}
      />
    </>
  );
}

const ta = () => screen.getByLabelText('Note') as HTMLTextAreaElement;
const select = (from: number, to: number) => {
  ta().setSelectionRange(from, to);
};

describe('inline marks', () => {
  it('wraps the selection in bold', () => {
    render(<Harness initial="make this loud" />);
    select(5, 9);
    fireEvent.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(ta().value).toBe('make *this* loud');
  });

  it('unwraps when the selection is already bold', () => {
    render(<Harness initial="make *this* loud" />);
    select(6, 10);
    fireEvent.click(screen.getByTitle('Bold (Ctrl+B)'));
    expect(ta().value).toBe('make this loud');
  });

  it('marks the word under a collapsed caret', () => {
    render(<Harness initial="trench depth" />);
    select(3, 3);
    fireEvent.click(screen.getByTitle('Italic (Ctrl+I)'));
    expect(ta().value).toBe('_trench_ depth');
  });

  it('strikes through', () => {
    render(<Harness initial="old spec" />);
    select(0, 3);
    fireEvent.click(screen.getByTitle('Strikethrough'));
    expect(ta().value).toBe('~old~ spec');
  });
});

describe('line leaders', () => {
  it('bullets every line the selection touches', () => {
    render(<Harness initial={'one\ntwo'} />);
    select(0, 7);
    fireEvent.click(screen.getByTitle('Bulleted list'));
    expect(ta().value).toBe('• one\n• two');
  });

  it('toggles bullets back off', () => {
    render(<Harness initial={'• one\n• two'} />);
    select(0, 11);
    fireEvent.click(screen.getByTitle('Bulleted list'));
    expect(ta().value).toBe('one\ntwo');
  });

  it('numbers from 1 regardless of what was there', () => {
    render(<Harness initial={'a\nb\nc'} />);
    select(0, 5);
    fireEvent.click(screen.getByTitle('Numbered list'));
    expect(ta().value).toBe('1. a\n2. b\n3. c');
  });

  it('swaps one leader kind for another', () => {
    render(<Harness initial={'• a\n• b'} />);
    select(0, 7);
    fireEvent.click(screen.getByTitle('Numbered list'));
    expect(ta().value).toBe('1. a\n2. b');
  });

  it('adds a checkbox, then ticks it', () => {
    render(<Harness initial="call the AHJ" />);
    select(0, 0);
    fireEvent.click(screen.getByTitle('Checkbox'));
    expect(ta().value).toBe('☐ call the AHJ');
    select(4, 4);
    fireEvent.click(screen.getByTitle('Checkbox'));
    expect(ta().value).toBe('☑ call the AHJ');
  });
});

describe('Enter continues a list', () => {
  it('carries the bullet to the next line', () => {
    render(<Harness initial="• one" />);
    select(5, 5);
    fireEvent.keyDown(ta(), { key: 'Enter' });
    expect(ta().value).toBe('• one\n• ');
  });

  it('increments the number', () => {
    render(<Harness initial={'1. one\n2. two'} />);
    select(13, 13);
    fireEvent.keyDown(ta(), { key: 'Enter' });
    expect(ta().value).toBe('1. one\n2. two\n3. ');
  });

  it('an empty item ends the list', () => {
    render(<Harness initial={'• one\n• '} />);
    select(8, 8);
    fireEvent.keyDown(ta(), { key: 'Enter' });
    expect(ta().value).toBe('• one\n');
  });

  it('leaves ordinary prose alone', () => {
    render(<Harness initial="just text" />);
    select(9, 9);
    fireEvent.keyDown(ta(), { key: 'Enter' });
    expect(ta().value).toBe('just text'); // default newline is the browser's job
  });
});

describe('Ctrl+B / Ctrl+I hotkeys', () => {
  it('bolds the selection', () => {
    render(<Harness initial="loud now" />);
    select(0, 4);
    fireEvent.keyDown(ta(), { key: 'b', ctrlKey: true });
    expect(ta().value).toBe('*loud* now');
  });
});

describe('RichText renders real elements for the Slack paste', () => {
  it('draws a list, not literal bullet characters', () => {
    const { container } = render(<RichText text={'• a\n• b'} />);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.textContent).not.toContain('•');
  });

  it('draws marks as real tags', () => {
    const { container } = render(<RichText text="*b* _i_ ~s~" />);
    expect(container.querySelector('strong')?.textContent).toBe('b');
    expect(container.querySelector('em')?.textContent).toBe('i');
    expect(container.querySelector('s')?.textContent).toBe('s');
  });

  it('leaves part numbers alone', () => {
    const { container } = render(<RichText text="PV_MOD_01 at 2*3" />);
    expect(container.textContent).toBe('PV_MOD_01 at 2*3');
    expect(container.querySelector('em')).toBeNull();
  });
});
