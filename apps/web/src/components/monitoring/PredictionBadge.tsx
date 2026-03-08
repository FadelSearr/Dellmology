'use client';

import { useEffect, useState } from "react";

interface Prediction {
    prediction: 'UP' | 'DOWN';
    confidence_up: number;
    confidence_down: number;
}

export function PredictionBadge({ symbol }: { symbol: string }) {
    const [prediction, setPrediction] = useState<Prediction | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPrediction() {
            if (!symbol) return;
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(`/api/prediction?symbol=${symbol}`);
                const result = (await response.json()) as { success?: boolean; data?: unknown; message?: string } | null;

                if (!response.ok || !result?.success) {
                    throw new Error(result?.message || 'Prediction not available.');
                }

                const dRaw = result.data;
                const d = dRaw && typeof dRaw === 'object' ? (dRaw as Record<string, unknown>) : null;
                if (!d) throw new Error('Malformed prediction payload');

                setPrediction({
                    prediction: d.prediction === 'UP' ? 'UP' : 'DOWN',
                    confidence_up: typeof d.confidence_up === 'number' ? d.confidence_up : 0,
                    confidence_down: typeof d.confidence_down === 'number' ? d.confidence_down : 0,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        fetchPrediction();
    }, [symbol]);

    if (loading) {
        return <div className="text-sm text-gray-500 animate-pulse">Loading AI Prediction...</div>;
    }

    if (error) {
        return <div className="text-sm text-yellow-500">Prediction: Not Available</div>;
    }

    if (!prediction) {
        return null;
    }
    
    const isUp = prediction.prediction === 'UP';
    const confidence = isUp ? prediction.confidence_up : prediction.confidence_down;

    return (
        <div className={`p-2 rounded-lg border text-center ${isUp ? 'bg-green-900/50 border-green-700' : 'bg-red-900/50 border-red-700'}`}>
            <div className="text-xs font-bold text-gray-400">AI PATTERN PREDICTION</div>
            <div className={`text-2xl font-extrabold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                {prediction.prediction}
            </div>
            <div className={`text-xs font-mono ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                Confidence: {(confidence * 100).toFixed(1)}%
            </div>
        </div>
    );
}
