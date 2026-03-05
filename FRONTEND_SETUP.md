# Frontend Setup & Local Development Guide

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- VS Code (recommended)

### 1. Install Dependencies

```bash
cd apps/web
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_STREAMER_URL=http://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main dashboard
│   │   ├── layout.tsx         # Root layout
│   │   ├── globals.css        # Global styles
│   │   └── api/               # API routes
│   │
│   ├── components/
│   │   ├── common/            # Reusable components (Card, Button, etc)
│   │   ├── sections/          # 6 main section components
│   │   ├── dashboard/         # Dashboard widgets
│   │   ├── tables/            # Table components
│   │   ├── layout/            # Layout components
│   │   ├── analysis/          # Analysis components
│   │   ├── intelligence/      # AI/ML components
│   │   ├── monitoring/        # Monitoring components
│   │   └── metrics/           # Metrics components
│   │
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility libraries
│   ├── types/                 # TypeScript type definitions
│   ├── config/                # Configuration files
│   └── utils/                 # Utility functions
│
├── public/                    # Static assets
├── package.json               # Dependencies
├── next.config.ts             # Next.js configuration
├── tsconfig.json              # TypeScript config
├── tailwind.config.ts         # Tailwind CSS config
└── jest.config.js             # Jest testing config
```

---

## Key Technologies

| Technology | Purpose |
|-----------|---------|
| **Next.js 16** | React framework, API routes, SSR |
| **React 19** | UI component library |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Styling & utility-first CSS |
| **Lucide React** | Icon library |
| **Lightweight Charts** | Real-time charting |
| **Supabase** | Database & auth |
| **Google Gemini** | AI/LLM integration |

---

## Available Scripts

```bash
# Development
npm run dev              # Start dev server (port 3000)

# Production
npm run build           # Build for production
npm run start           # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run type-check      # TypeScript type checking
npm test               # Run Jest tests

# Database
npm run db:push        # Sync Supabase schema
npm run db:studio      # Open Supabase Studio
```

---

## Components Documentation

### Section 0: CommandBar
[Section0_CommandBar.tsx](./src/components/sections/Section0_CommandBar.tsx)

**Features:**
- Symbol search with autocomplete
- Market regime badge (Bullish/Bearish/Sideways)
- Global correlation ticker
- System health indicators (LED lights)
- API rate limit tracker

**Props:**
```tsx
interface Section0Props {
  onSymbolChange?: (symbol: string) => void;
  marketRegime?: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  volatility?: 'HIGH' | 'MEDIUM' | 'LOW';
  systemHealth?: { sse: boolean; db: boolean; shield: boolean };
  rateLimitUsage?: number; // 0-100
}
```

### Section 1: Market Intelligence Canvas
[Section1_MarketIntelligence.tsx](./src/components/sections/Section1_MarketIntelligence.tsx)

**Features:**
- TradingView advanced chart
- CNN pattern overlay
- Order flow heatmap
- Exit whale detection
- Unified Power Score (0-100)

### Section 2: Broker Flow Engine
[Section2_BrokerFlow.tsx](./src/components/sections/Section2_BrokerFlow.tsx)

**Features:**
- Broker flow control bar
- Daily heatmap (D-6 to D0)
- Net value & consistency scoring
- Z-Score detection
- Wash sale alerts

### Section 3: Neural Narrative Hub
[Section3_NeuralNarrative.tsx](./src/components/sections/Section3_NeuralNarrative.tsx)

**Features:**
- AI Screener (Daytrade/Swing/Custom)
- Custom price range filters
- Gemini AI narratives
- Retail sentiment divergence
- Multi-model voting

### Section 4: Risk & Tactical Dock
[Section4_RiskDock.tsx](./src/components/sections/Section4_RiskDock.tsx)

**Features:**
- Smart position sizing (ATR-based)
- Risk metrics
- Action dock (Telegram, alerts, PDF)
- Real-time trades feed

### Section 5: Performance Lab
[Section5_Performance.tsx](./src/components/sections/Section5_Performance.tsx)

**Features:**
- System health dashboard
- Model performance metrics
- Backtesting rig with XAI
- Infrastructure logs
- Model comparison tools

---

## Styling & Theme

### Color Palette (Dark Tech)
- **Background**: `gray-900` (base)
- **Cards**: `gray-800/50` with `border-gray-700`
- **Primary**: `cyan-400`, `cyan-600`
- **Success**: `green-400`, `green-600`
- **Warning**: `yellow-400`, `yellow-600`
- **Danger**: `red-400`, `red-600`
- **Info**: `blue-400`, `blue-600`

### Responsive Design
- **Mobile**: Single column layout
- **Tablet**: 2-column grid
- **Desktop**: 3+ column grid with sidebars

---

## State Management

### Local States (per component)
- Symbol selection
- Timeframe selection
- Filter states
- Modal/dropdown states

### Global Context (if needed)
```tsx
// Future: UserContext, MarketDataContext, NotificationContext
```

## Common Patterns

### Async Data Loading
```tsx
const [data, setData] = useState(null);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<Error | null>(null);

useEffect(() => {
  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/endpoint');
      setData(await res.json());
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };
  loadData();
}, []);
```

### Error Boundary Usage
```tsx
<ErrorBoundary fallback={(error) => <ErrorUI error={error} />}>
  <YourComponent />
</ErrorBoundary>
```

### Conditional Rendering
```tsx
if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
return <Content {...data} />;
```

---

## Performance Optimization

### Code Splitting
- Dynamic imports for heavy components
- Lazy loading for modals/tabs

### Image Optimization
- Use `next/image` for images
- WebP format preferred

### Caching
- SSR for initial page load
- SWR for real-time data
- Browser cache for static assets

---

## Testing

### Run Tests
```bash
npm test
```

### Test Structure
```tsx
// components/__tests__/Section0.test.tsx
describe('Section0_CommandBar', () => {
  it('should render with default props', () => {
    render(<Section0_CommandBar />);
    expect(screen.getByText(/GLOBAL CORRELATION/i)).toBeInTheDocument();
  });
});
```

---

## API Integration

### Streaming (SSE)
```tsx
useEffect(() => {
  const eventSource = new EventSource('/api/stream');
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Handle data
  };
  return () => eventSource.close();
}, []);
```

### REST Endpoints
```tsx
const response = await fetch('/api/broker-flow?symbol=BBCA');
const data = await response.json();
```

---

## Troubleshooting

### SSE Connection Failed
```
Error: Failed to connect to streamer
✓ Check if Go engine is running on localhost:8080
✓ Check NEXT_PUBLIC_STREAMER_URL in .env.local
✓ Check browser console for CORS errors
```

### TypeScript Errors
```bash
# Clear cache and rebuild
rm -rf .next
npm run build
```

### Port Already in Use
```bash
# Kill process on port 3000
lsof -i :3000
kill -9 <PID>
```

---

## Deployment (see DEPLOYMENT.md)

Ready for Vercel, Netlify, or self-hosted deployment.

---

**Questions? Issues?** Check FRONTEND_STRUCTURE.md for detailed architecture.
