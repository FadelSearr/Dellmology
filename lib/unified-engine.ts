import { calculateTechnicalScore } from './technical-scorer';

export interface AnalysisInput {
  emiten: string;
  chartData: any[];
  brokerData: any;
  sentimentScore?: number;
}

export interface AnalysisOutput {
  emiten: string;
  unifiedPowerScore: number;
  technicalScore: number;
  bandarmologyScore: number;
  sentimentScore: number;
  cnnScore: number;
  consensus: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export async function runUnifiedAnalysis(input: AnalysisInput): Promise<AnalysisOutput> {
  const technicalScore = calculateTechnicalScore(input.chartData);

  let bandarmologyScore = 50;
  let foreignFlowIndex = 50; // Neutral 0-100
  
  if (input.brokerData) {
     const accdist = input.brokerData?.top1?.accdist || '';
     if (accdist.includes('Accum')) bandarmologyScore = 80;
     else if (accdist.includes('Dist')) bandarmologyScore = 20;
     
     // Simulation of FFI based on broker participation
     // In prod: fetch from idx.co.id foreign transaction data
     const isForeignParticipated = Math.random() > 0.6; 
     if (isForeignParticipated) foreignFlowIndex = 75; // Foreign Accumulation
  }

  const sentimentScore = input.sentimentScore || 50;

  let cnnScore = 50;
  let cnnPattern = 'Neutral';
  try {
    const res = await fetch(`http://localhost:8000/analyze/timeseries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.chartData.slice(-50))
    });
    const cnnData = await res.json();
    cnnScore = cnnData.confidence * 100;
    cnnPattern = cnnData.pattern;
  } catch (e) {}

  // Weights: Technical (10%), Bandarmology (50%), FFI (25%), Sentiment (5%), CNN (10%)
  const unifiedPowerScore = Math.round(
    (technicalScore * 0.1) +
    (bandarmologyScore * 0.5) +
    (foreignFlowIndex * 0.25) +
    (sentimentScore * 0.05) +
    (cnnScore * 0.1)
  );

  let consensus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (unifiedPowerScore >= 65) consensus = 'BULLISH';
  else if (unifiedPowerScore <= 35) consensus = 'BEARISH';

  return {
    emiten: input.emiten,
    unifiedPowerScore,
    technicalScore,
    bandarmologyScore,
    sentimentScore,
    cnnScore,
    consensus,
    // @ts-ignore - adding FFI and pattern to output
    ffi: foreignFlowIndex,
    cnnPattern
  };
}
