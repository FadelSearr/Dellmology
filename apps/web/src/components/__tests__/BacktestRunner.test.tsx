import { render, screen } from '@testing-library/react';
import BacktestRunner from '../BacktestRunner';

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
  } as any)
) as jest.Mock;

describe('BacktestRunner', () => {
  it('renders input fields and buttons', () => {
    render(<BacktestRunner />);
    expect(screen.getByPlaceholderText(/Symbol/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });
});
