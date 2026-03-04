import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TelegramSettings from '../settings/TelegramSettings';

describe('TelegramSettings', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows inline success message after saving settings', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ alerts: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) as jest.Mock;

    render(<TelegramSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));

    await waitFor(() => {
      expect(screen.getByText('Alert settings saved!')).toBeInTheDocument();
    });
  });
});
