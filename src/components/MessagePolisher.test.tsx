// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessagePolisher from './MessagePolisher';

const polishMessageMock = vi.fn();
vi.mock('../lib/api', () => ({
  MAX_NOTE_CHARS: 3000,
  polishMessage: (...a: unknown[]) => polishMessageMock(...a),
}));

afterEach(() => {
  cleanup();
  polishMessageMock.mockReset();
});

const open = () => render(<MessagePolisher aiAvailable={true} onClose={() => {}} />);

describe('MessagePolisher', () => {
  it('polishes the pasted message and shows the result', async () => {
    polishMessageMock.mockResolvedValue('Salam Team, the elevation is missing the expansion unit.');
    open();
    fireEvent.change(screen.getByLabelText(/Your message/i), {
      target: { value: 'salam team, elevation missing expansion unit' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Polish this message/i }));
    await waitFor(() =>
      expect((screen.getByLabelText(/Polished/i) as HTMLTextAreaElement).value).toBe(
        'Salam Team, the elevation is missing the expansion unit.',
      ),
    );
    expect(polishMessageMock).toHaveBeenCalledWith('salam team, elevation missing expansion unit');
  });

  it('will not call the AI for an empty message', () => {
    open();
    expect((screen.getByRole('button', { name: /Polish this message/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks a message over the character ceiling', () => {
    open();
    fireEvent.change(screen.getByLabelText(/Your message/i), { target: { value: 'x'.repeat(3001) } });
    expect(screen.getByText(/too long/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Polish this message/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces an API error without clearing the input', async () => {
    polishMessageMock.mockRejectedValue({ status: 502, message: 'AI request failed' });
    open();
    fireEvent.change(screen.getByLabelText(/Your message/i), { target: { value: 'something' } });
    fireEvent.click(screen.getByRole('button', { name: /Polish this message/i }));
    await waitFor(() => expect(screen.getByText('AI request failed')).toBeTruthy());
    expect((screen.getByLabelText(/Your message/i) as HTMLTextAreaElement).value).toBe('something');
  });

  it('is disabled while the AI is offline', () => {
    render(<MessagePolisher aiAvailable={false} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Your message/i), { target: { value: 'hi' } });
    expect((screen.getByRole('button', { name: /Polish this message/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
