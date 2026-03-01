import { render, screen } from '@testing-library/react';
import TradingViewWidget from '../TradingViewWidget';

describe('TradingViewWidget', () => {
  it('renders container div with correct id', () => {
    const { container } = render(<TradingViewWidget symbol="BBCA" />);
    const el = container.querySelector('#tradingview_BBCA');
    expect(el).toBeInTheDocument();
  });
});
