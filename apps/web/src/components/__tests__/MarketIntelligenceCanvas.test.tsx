import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MarketIntelligenceCanvas } from '../dashboard/MarketIntelligenceCanvas';

jest.mock('../dashboard/TradingViewWidget', () => ({
  __esModule: true,
  default: () => <div data-testid="tv-widget">TradingView</div>,
}));

describe('MarketIntelligenceCanvas', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockBaseFetch = (overrides?: {
    cnnResponse?: (init?: RequestInit) => Response;
    xaiResponse?: () => Response;
    predictionResponse?: () => Response;
  }) => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/market-intelligence')) {
        return {
          ok: true,
          json: async () => ({
            symbol: 'BBCA',
            timeframe: '1h',
            metrics: {
              haka_volume: 500000,
              haki_volume: 300000,
              total_volume: 800000,
              haka_ratio: 62.5,
              pressure_index: 12,
            },
            volatility: {
              percentage: 1.5,
              classification: 'NORMAL',
            },
            unified_power_score: {
              score: 72,
              signal: 'BUY',
              components: {
                haka_strength: 70,
                volume_momentum: 68,
                price_strength: 74,
                consistency: 66,
              },
            },
            timestamp: new Date().toISOString(),
          }),
        } as Response;
      }

      if (url.includes('/api/prediction')) {
        return overrides?.predictionResponse?.() ||
          ({
            ok: true,
            json: async () => ({ success: false }),
          } as Response);
      }

      if (url.includes('/api/cnn')) {
        if (overrides?.cnnResponse) {
          return overrides.cnnResponse(init);
        }

        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.action === 'train') {
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      if (url.includes('/api/xai')) {
        return overrides?.xaiResponse?.() ||
          ({
            ok: true,
            json: async () => ({ explanation: { top_features: [] } }),
          } as Response);
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as jest.Mock;
  };

  it('shows inline success message when Train CNN starts', async () => {
    mockBaseFetch();

    render(<MarketIntelligenceCanvas symbol="BBCA" timeframe="1h" />);

    await waitFor(() => {
      expect(screen.getByText('BBCA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Train CNN/i }));

    await waitFor(() => {
      expect(screen.getByText('Training started')).toBeInTheDocument();
    });
  });

  it('shows inline success message when Refresh CNN completes', async () => {
    mockBaseFetch({
      predictionResponse: () =>
        ({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              prediction: 'UP',
              confidence_up: 0.74,
            },
          }),
        } as Response),
    });

    render(<MarketIntelligenceCanvas symbol="BBCA" timeframe="1h" />);

    await waitFor(() => {
      expect(screen.getByText('BBCA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Refresh CNN/i }));

    await waitFor(() => {
      expect(screen.getByText('CNN refreshed')).toBeInTheDocument();
    });
  });

  it('shows inline lock message when Explain API is locked', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockBaseFetch({
      xaiResponse: () =>
        ({
          ok: false,
          json: async () => ({ error: 'Explain locked by cooling-off' }),
        } as Response),
    });

    render(<MarketIntelligenceCanvas symbol="BBCA" timeframe="1h" />);

    await waitFor(() => {
      expect(screen.getByText('BBCA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Explain/i }));

    await waitFor(() => {
      expect(screen.getByText('Explain locked by cooling-off')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
