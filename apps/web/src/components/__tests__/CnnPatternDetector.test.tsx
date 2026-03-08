import 'jest-canvas-mock';
import { render, screen, waitFor } from '@testing-library/react';
import { CnnPatternDetector } from '../analysis/CnnPatternDetector';

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        detected_patterns: [],
        confidences: { high: 0, medium: 0, low: 0 },
      }),
  } as unknown as Response)
) as jest.Mock;

describe('CnnPatternDetector', () => {
  it('renders and handles empty results', async () => {
    render(<CnnPatternDetector symbol="TEST" />);
    // Wait for the component to finish loading and display the empty state
    await waitFor(() => {
      expect(screen.getByText(/No patterns detected for/i)).toBeInTheDocument();
    });
  });
});