"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const REPO = process.env.NEXT_PUBLIC_RELEASE_REPOSITORY ?? "sp4rkiop/e-paper";
const WORKER_SRC = "/pdf.worker.min.mjs";
const ZOOM_LEVELS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_ZOOM_IDX = 3;
const MAX_CANVAS_AREA = 14_000_000;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  return pdfjs;
}

async function streamWithProgress(
  res: Response,
  onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const total = Number(res.headers.get("Content-Length") || 0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function PageCanvas({ doc, number, renderToken }: { doc: PDFDocumentProxy; number: number; renderToken: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const page = await doc.getPage(number);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let pixW = Math.round(base.width * dpr);
        if (pixW * (pixW * (base.height / base.width)) > MAX_CANVAS_AREA) {
          pixW = Math.floor(Math.sqrt(MAX_CANVAS_AREA * (base.width / base.height)));
        }
        const scale = pixW / base.width;
        canvas.width = pixW;
        canvas.height = Math.round(base.height * scale);
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;
        const render = page.render({ canvasContext: ctx, viewport: base.clone({ scale }) });
        task = render;
        await render.promise;
      } catch (err) {
        if (!cancelled) console.debug("page render skipped", err);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, renderToken, visible]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {visible && <canvas ref={canvasRef} className="block h-full w-full" />}
    </div>
  );
}

function Edition({ date }: { date: string }) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"download" | "parse">("download");
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageRatio, setPageRatio] = useState(1.4);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [containerWidth, setContainerWidth] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const oldBlobUrlRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/proxy?date=" + date, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!res.ok) throw new Error("Server could not fetch the PDF (HTTP " + res.status + ")");
        const bytes = await streamWithProgress(res, (loaded, total) => {
          if (ac.signal.aborted) return;
          setPhase("download");
          setProgress(total ? Math.min(99, Math.round((loaded / total) * 100)) : 0);
        });
        if (ac.signal.aborted) return;
        setPhase("parse");
        const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
        if (oldBlobUrlRef.current) URL.revokeObjectURL(oldBlobUrlRef.current);
        oldBlobUrlRef.current = URL.createObjectURL(blob);
        setBlobUrl(oldBlobUrlRef.current);
        const pdfjs = await getPdfJs();
        const loaded = await pdfjs.getDocument({ data: bytes }).promise;
        if (ac.signal.aborted) {
          loaded.destroy();
          return;
        }
        const first = await loaded.getPage(1);
        const base = first.getViewport({ scale: 1 });
        setPageRatio(base.height / base.width);
        setPageCount(loaded.numPages);
        setProgress(100);
        setDoc(loaded);
        scrollRef.current?.scrollTo({ top: 0 });
        setCurrentPage(1);
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load the PDF");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [date]);

  useEffect(() => {
    const url = oldBlobUrlRef.current;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(
        () => requestAnimationFrame(() => setContainerWidth(el.clientWidth)),
        160,
      );
    });
    ro.observe(el);
    requestAnimationFrame(() => setContainerWidth(el.clientWidth));
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, []);

  const fitWidth = containerWidth ? Math.max(300, containerWidth - 24) : 1200;
  const pageWidth = Math.round(fitWidth * ZOOM_LEVELS[zoomIdx]);
  const pageHeight = Math.round(pageWidth * pageRatio);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const top = el.scrollTop + el.clientHeight * 0.3;
        let current = 1;
        pageRefs.current.forEach((node, i) => {
          if (node && node.offsetTop <= top) current = i + 1;
        });
        setCurrentPage(current);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [doc, pageHeight]);

  const gotoPage = useCallback(
    (n: number) => {
      const target = pageRefs.current[Math.min(Math.max(1, n), pageCount) - 1];
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [pageCount],
  );

  const share = useCallback(async () => {
    const url = date
      ? "https://github.com/" + REPO + "/releases/download/" + date + "/Hindustan-Dhanbad.pdf"
      : document.location.href;
    const title = "Hindustan Dhanbad " + date;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link copied");
    } catch {
      setToast("Copy failed");
    }
    setTimeout(() => setToast(null), 2000);
  }, [date]);

  const btn =
    "shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-medium hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-40";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-neutral-800 bg-neutral-900 px-2">
        <button className={btn} disabled={loading || currentPage <= 1} onClick={() => gotoPage(currentPage - 1)}>
          ‹
        </button>
        <span className="text-xs text-neutral-300" data-testid="page-counter">
          {doc && !loading ? currentPage + " / " + pageCount : "—"}
        </span>
        <button className={btn} disabled={loading || (pageCount > 0 && currentPage >= pageCount)} onClick={() => gotoPage(currentPage + 1)}>
          ›
        </button>
        <div className="grow" />
        <button className={btn} disabled={!doc || zoomIdx <= 0} onClick={() => setZoomIdx(zoomIdx - 1)}>
          −
        </button>
        <span className="text-xs text-neutral-400">{Math.round(ZOOM_LEVELS[zoomIdx] * 100)}%</span>
        <button className={btn} disabled={!doc || zoomIdx >= ZOOM_LEVELS.length - 1} onClick={() => setZoomIdx(zoomIdx + 1)}>
          +
        </button>
        <div className="grow" />
        <button
          className={btn}
          disabled={!blobUrl}
          onClick={() => {
            if (!blobUrl) return;
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = "Hindustan-Dhanbad-" + date + ".pdf";
            a.click();
          }}
        >
          Download
        </button>
        <button className={btn} onClick={share}>
          Share
        </button>
      </div>

      <main ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
        {doc && (
          <div className="flex min-h-full w-max min-w-full flex-col items-center gap-4 px-3 py-4">
            {Array.from({ length: pageCount }, (_, i) => (
              <div
                key={date + "-" + (i + 1) + "-" + pageWidth}
                ref={(node) => {
                  pageRefs.current[i] = node;
                }}
                className="relative bg-white shadow-md ring-1 ring-neutral-800"
                style={{ width: pageWidth + "px", height: pageHeight + "px" }}
              >
                <PageCanvas doc={doc} number={i + 1} renderToken={pageWidth} />
              </div>
            ))}
          </div>
        )}

        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/90">
            {error ? (
              <div className="px-6 text-center text-red-400" data-testid="viewer-error">
                {error}
              </div>
            ) : (
              <div className="flex w-64 flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <span className="text-sm text-neutral-300">
                  {phase === "download" ? "Loading… " + progress + "%" : "Preparing pages…"}
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
                  <div
                    className="h-full rounded bg-blue-600 transition-all duration-200"
                    style={{ width: progress + "%" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-100 shadow">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function Viewer() {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");

  useEffect(() => {
    fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=100", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: { tag_name?: string }[]) => {
        const tags = list
          .map((r) => r.tag_name)
          .filter((t): t is string => Boolean(t))
          .sort()
          .reverse();
        setDates(tags);
        if (tags.length > 0) setDate(tags[0]);
      })
      .catch(() => setDate("__failed__"));
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="z-10 flex h-12 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-2">
        <span className="px-1 text-sm font-semibold tracking-tight">Dhanbad</span>
        <select
          aria-label="Edition date"
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={dates.length === 0}
        >
          {date === "__failed__" && <option value="__failed__">No editions found</option>}
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </header>
      {date && date !== "__failed__" && <Edition key={date} date={date} />}
    </div>
  );
}
