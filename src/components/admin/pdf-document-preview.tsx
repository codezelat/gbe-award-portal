"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning, LoaderCircle } from "lucide-react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

export function PdfDocumentPreview({
  blob,
  fileName,
}: {
  blob: Blob;
  fileName: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!active) return;
        const task = pdfjs.getDocument({
          data,
          canvasMaxAreaInBytes: 64 * 1024 * 1024,
          enableXfa: false,
          maxImageSize: 40_000_000,
          stopAtErrors: true,
        });
        loadingTask = task;
        loadedDocument = await task.promise;
        if (!active) {
          await task.destroy();
          return;
        }
        setDocument(loadedDocument);
      } catch {
        if (active) setError(true);
      }
    })();

    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [blob]);

  if (error)
    return (
      <div
        className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 text-center"
        role="alert"
      >
        <FileWarning className="size-7 text-amber-700" />
        <p className="text-sm text-muted-foreground">
          This PDF could not be rendered safely. You can still download it.
        </p>
      </div>
    );

  if (!document)
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        Rendering PDF…
      </div>
    );

  return (
    <div
      aria-label={`${fileName}, ${document.numPages} page${document.numPages === 1 ? "" : "s"}`}
      className="h-full w-full overflow-y-auto p-3 sm:p-5"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {Array.from({ length: document.numPages }, (_, index) => (
          <PdfPage
            document={document}
            fileName={fileName}
            key={index + 1}
            pageNumber={index + 1}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPage({
  document,
  fileName,
  pageNumber,
}: {
  document: PDFDocumentProxy;
  fileName: string;
  pageNumber: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    let active = true;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let lastWidth = 0;

    const render = async () => {
      const availableWidth = Math.floor(wrapper.clientWidth);
      if (!availableWidth || Math.abs(availableWidth - lastWidth) < 2) return;
      lastWidth = availableWidth;
      renderTask?.cancel();
      setRendered(false);
      try {
        page ??= await document.getPage(pageNumber);
        if (!active) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = availableWidth / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
        renderTask = page.render({
          canvas,
          viewport,
          background: "rgb(255,255,255)",
        });
        await renderTask.promise;
        if (active) setRendered(true);
      } catch (cause: unknown) {
        if (
          active &&
          !(
            cause instanceof Error &&
            cause.name === "RenderingCancelledException"
          )
        )
          setFailed(true);
      }
    };

    const resizeObserver = new ResizeObserver(() => void render());
    resizeObserver.observe(wrapper);
    void render();
    return () => {
      active = false;
      resizeObserver.disconnect();
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [document, pageNumber, visible]);

  return (
    <div
      ref={wrapperRef}
      className="relative min-h-72 w-full overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/10"
    >
      {!rendered && !failed ? (
        <div
          className="absolute inset-0 grid place-items-center bg-white"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          <span className="sr-only">Rendering page {pageNumber}</span>
        </div>
      ) : null}
      {failed ? (
        <p className="grid min-h-72 place-items-center px-5 text-sm text-muted-foreground">
          Page {pageNumber} could not be rendered.
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          aria-label={`${fileName}, page ${pageNumber}`}
          className="block max-w-full"
          role="img"
        />
      )}
      <span className="absolute right-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">
        {pageNumber} / {document.numPages}
      </span>
    </div>
  );
}
