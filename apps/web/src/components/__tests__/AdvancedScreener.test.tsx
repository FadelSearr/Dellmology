import { render, screen } from '@testing-library/react';
import { AdvancedScreener } from '../AdvancedScreener';

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        mode: 'DAYTRADE',
        timestamp: new Date().toISOString(),
        total_scanned: 0,
        results: [],
        top_pick: null,
        statistics: {},
      }),
  } as any)
) as jest.Mock;

describe('AdvancedScreener', () => {
  it('renders mode buttons', () => {
    render(<AdvancedScreener />);
    expect(screen.getByText('DAYTRADE')).toBeInTheDocument();
    expect(screen.getByText('SWING')).toBeInTheDocument();
  });
});