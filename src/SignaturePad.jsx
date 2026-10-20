import { useEffect, useRef } from 'react';
import { Eraser } from 'lucide-react';

export default function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const valueRef = useRef(value);
  const lastRenderedValueRef = useRef(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    const drawImage = (dataUrl, width, height) => {
      const renderToken = ++renderTokenRef.current;
      if (!dataUrl) return;
      const image = new Image();
      image.onload = () => {
        if (renderToken !== renderTokenRef.current || !canvasRef.current) return;
        context.drawImage(image, 0, 0, width, height);
      };
      image.src = dataUrl;
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      if (dimensionsRef.current.width === bounds.width && dimensionsRef.current.height === bounds.height) return;
      const previousImage = dimensionsRef.current.width ? canvas.toDataURL('image/png') : valueRef.current;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * pixelRatio);
      canvas.height = Math.round(bounds.height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.strokeStyle = '#111827';
      context.lineWidth = 2.4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      dimensionsRef.current = { width: bounds.width, height: bounds.height };
      lastRenderedValueRef.current = previousImage;
      drawImage(previousImage, bounds.width, bounds.height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    valueRef.current = value;
    if (value === lastRenderedValueRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const { width, height } = dimensionsRef.current;
    context.clearRect(0, 0, width, height);
    if (!value) {
      lastRenderedValueRef.current = '';
      renderTokenRef.current += 1;
      return;
    }
    const renderToken = ++renderTokenRef.current;
    const image = new Image();
    image.onload = () => {
      if (renderToken !== renderTokenRef.current || !canvasRef.current) return;
      context.drawImage(image, 0, 0, width, height);
      lastRenderedValueRef.current = value;
    };
    image.src = value;
  }, [value]);

  const getPoint = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const startDrawing = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getPoint(event);
    const context = canvas.getContext('2d');
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = getPoint(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const image = canvas.toDataURL('image/png');
    valueRef.current = image;
    lastRenderedValueRef.current = image;
    onChange(image);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    canvas.getContext('2d').clearRect(0, 0, bounds.width, bounds.height);
    valueRef.current = '';
    lastRenderedValueRef.current = '';
    renderTokenRef.current += 1;
    onChange('');
  };

  return <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-700">Parašas</span>
      <button type="button" aria-label="Išvalyti parašą" title="Išvalyti parašą" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={clear}>
        <Eraser size={14} />Išvalyti
      </button>
    </div>
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-emerald-600">
      <canvas
        ref={canvasRef}
        aria-label="Parašo piešimo laukas"
        className="block h-36 w-full touch-none cursor-crosshair"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
    </div>
    {!value && <p className="text-xs text-slate-500">Nupieškite parašą prieš patvirtindami PIN.</p>}
  </div>;
}