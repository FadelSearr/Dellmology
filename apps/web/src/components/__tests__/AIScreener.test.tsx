import { render, screen, waitFor } from '@testing-library/react';
import { AIScreener, filterByPrice } from '../intelligence/AIScreener';

type SampleRow = { symbol: string; price: number };

describe('AIScreener helper functions', () => {
  it('filterByPrice excludes results outside range', () => {
    const sample: SampleRow[] = [
      { symbol: 'A', price: 100 },
      { symbol: 'B', price: 500 },
      { symbol: 'C', price: 1000 },
    ];
    const filtered = filterByPrice(sample, { min: 200, max: 800 });
    expect(filtered.map((r) => r.symbol)).toEqual(['B']);
  });

  it('shows lock message when screener API returns 423', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;
    const mockedFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 423,
      json: async () => ({ error: 'Cooling-off active: screener temporarily locked' }),
    } as Response);

    (globalThis as { fetch?: typeof fetch }).fetch = mockedFetch as unknown as typeof fetch;

    render(<AIScreener />);

    await waitFor(() => {
      expect(screen.getByText(/Error: Screener locked: Cooling-off active: screener temporarily locked/i)).toBeInTheDocument();
    });

    if (originalFetch === undefined) {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    } else {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }

    consoleErrorSpy.mockRestore();
  });

  it('renders custom mode results from custom screener API', async () => {
    const originalFetch = (globalThis as { fetch?: typeof fetch }).fetch;

    const mockedFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            symbol: 'BBCA',
            score: 82,
            last_price: 9200,
            change_pct: 1.4,
            total_net_accumulation: 12000000000,
            status: 'Range Accumulation',
          },
        ],
      }),
    } as Response);

    (globalThis as { fetch?: typeof fetch }).fetch = mockedFetch as unknown as typeof fetch;

    render(
      <AIScreener
        mode="CUSTOM"
        customPriceRange={{ min: 100, max: 10000 }}
        hideInternalControls={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('BBCA')).toBeInTheDocument();
      expect(screen.getByText(/Range Accumulation/i)).toBeInTheDocument();
    });

    if (originalFetch === undefined) {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    } else {
      (globalThis as { fetch?: typeof fetch }).fetch = originalFetch;
    }
  });
});
