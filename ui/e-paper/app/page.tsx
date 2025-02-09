"use client"
import { useState, useEffect } from 'react';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPdf = async () => {
      try {
        const response = await fetch('/api/proxy');
        
        if (!response.ok) throw new Error('Failed to load PDF');
        if (!response.body) throw new Error('No response body');
        
        const reader = response.body.getReader();
        const contentLength = +(response.headers.get('Content-Length') || 0);
        
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          receivedLength += value.length;
          
          if (contentLength) {
            setProgress(Math.round((receivedLength / contentLength) * 100));
          }
        }
        
        const blob = new Blob(chunks);
        setPdfUrl(URL.createObjectURL(blob));
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setIsLoading(false);
      }
    };

    fetchPdf();
  }, []);

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-1xl font-bold underline mb-8">E-Paper Viewer</h1>
      
      {error && (
        <div className="text-red-500 text-xl">{error}</div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="w-64 bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-gray-600">Loading... {progress}%</span>
        </div>
      )}

      {pdfUrl && (
        <div className="w-full h-screen">
          <iframe
            src={pdfUrl}
            className="w-full h-full"
            frameBorder="0"
            title="E-Paper Viewer"
          />
        </div>
      )}
    </div>
  );
}