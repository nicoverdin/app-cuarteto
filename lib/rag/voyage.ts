// Embeddings de consulta con Voyage AI (Anthropic no ofrece API de embeddings).
export const voyageEnabled = () => !!process.env.VOYAGE_API_KEY;

export async function embedQuery(text: string, model: string): Promise<Float32Array> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: [text], model, input_type: 'query', truncation: true }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}`);
  const json = (await res.json()) as { data?: { embedding: number[] }[]; embeddings?: number[][] };
  const v = json.data?.[0]?.embedding ?? json.embeddings?.[0];
  if (!v) throw new Error('Respuesta de Voyage sin embedding');
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, x => x / norm);
}
