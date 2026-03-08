import 'jest-canvas-mock';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderFlowHeatmap } from '../dashboard/OrderFlowHeatmap';

// Mock fetch
// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        heatmap: { prices: [], bidVolumes: [], askVolumes: [], netVolumes: [], bidAskRatios: [], intensities: [] },
        marketDepth: null,
        anomalies: [],
      }),
  } as unknown as Response)
) as jest.Mock;

describe('OrderFlowHeatmap Component', () => {
  it('renders header and toggle', async () => {
    await act(async () => {
      render(<OrderFlowHeatmap symbol="TEST" />);
    });

    await waitFor(() => expect(screen.getByText('Market Depth Heatmap')).toBeInTheDocument());
    // toggle checkbox appears after data load
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument());
    expect(screen.getByText('1‑min Aggregated')).toBeInTheDocument();
  });

  it('toggle switches aggregate state', async () => {
    await act(async () => {
      render(<OrderFlowHeatmap symbol="TEST" />);
    });
    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
