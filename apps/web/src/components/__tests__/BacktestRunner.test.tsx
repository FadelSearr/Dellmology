import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BacktestRunner from '../dashboard/BacktestRunner';

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        result: {
          symbol: 'BBCA',
          period_days: 1,
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          win_rate: 0,
          total_profit_loss: 0,
          avg_profit: 0,
          avg_loss: 0,
          profit_factor: 0,
          max_drawdown: 0,
          sharpe_ratio: 0,
          trades: [],
          timestamp: new Date().toISOString(),
        },
      }),
  } as unknown as Response)
) as jest.Mock;

describe('BacktestRunner', () => {
  it('renders input fields and buttons', () => {
    render(<BacktestRunner />);
    expect(screen.getByPlaceholderText(/Symbol/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });

  it('shows lock message when backtest API returns 423', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 423,
      json: async () => ({ error: 'Immutable audit chain lock active; backtest blocked' }),
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<BacktestRunner />);
    fireEvent.click(screen.getByRole('button', { name: /Run/i }));

    await waitFor(() => {
      expect(screen.getByText(/Backtest locked: Immutable audit chain lock active; backtest blocked/i)).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });
});
