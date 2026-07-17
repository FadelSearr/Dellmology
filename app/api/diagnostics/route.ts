import { NextResponse } from 'next/server';

export async function GET() {
  let cnnOnline = false;
  let nlpOnline = false;
  let lstmOnline = false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); 

  try {
    // Ping CNN on port 8002 (cnn-worker)
    const cnnRes = await fetch('http://localhost:8002/health', {
      method: 'GET',
      signal: controller.signal
    });
    if (cnnRes.ok) cnnOnline = true;
  } catch (e) {
    cnnOnline = false;
  }

  try {
    // Ping NLP and LSTM on port 8000 (ml_server)
    const mlRes = await fetch('http://localhost:8000/health', {
      method: 'GET',
      signal: controller.signal
    });
    if (mlRes.ok) {
      const data = await mlRes.json();
      nlpOnline = data.nlp || false;
      lstmOnline = data.lstm || false;
    }
  } catch (e) {
    nlpOnline = false;
    lstmOnline = false;
  }

  clearTimeout(timeoutId);

  return NextResponse.json({
    success: true,
    cnnOnline,
    nlpOnline,
    lstmOnline
  });
}
