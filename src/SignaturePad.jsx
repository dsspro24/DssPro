import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const MAX_SAVED_POINTS = 180;
const MAX_SIGNATURE_BYTES = 10 * 1024;

const pointCount = (strokes) => strokes.reduce((count, stroke) => count + stroke.length, 0);

const compactStrokes = (strokes) => {
  while (pointCount(strokes) > MAX_SAVED_POINTS) {
    let simplified = false;
    for (const stroke of strokes) {
      if (stroke.length > 2) {
        const lastPoint = stroke[stroke.length - 1];
        stroke.splice(1, stroke.length - 2, ...stroke.slice(1, -1).filter((_, index) => index % 2 === 1));
        if (stroke.at(-1) !== lastPoint) stroke.push(lastPoint);
        simplified = true;
      }
    }
    if (!simplified) {
      const shortestStrokeIndex = strokes.reduce((shortest, stroke, index) => (
        stroke.length < strokes[shortest].length ? index : shortest
      ), 0);
      strokes.splice(shortestStrokeIndex, 1);
    }
  }
};

const formatPoint = ({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`;

const createSignatureDataUrl = (strokes, width, height) => {
  const path = strokes.map((stroke) => {
    if (stroke.length === 1) {
      const point = formatPoint(stroke[0]);
      return `M${point}l.1 .1`;
    }
    let pathData = `M${formatPoint(stroke[0])}`;
    for (let index = 1; index < stroke.length - 1; index += 1) {
      const current = stroke[index];
      const next = stroke[index + 1];
      const midpoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      };
      pathData += `Q${formatPoint(current)} ${formatPoint(midpoint)}`;
    }
    pathData += `L${formatPoint(stroke.at(-1))}`;
    return pathData;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  if (dataUrl.length > MAX_SIGNATURE_BYTES) {
    throw new Error('Parašas per didelis. Pabandykite pasirašyti dar kartą.');
  }
  return dataUrl;
};

export default function SignaturePad({ value, onChange }) {
  const [signatureError, setSignatureError] = useState('');
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const valueRef = useRef(value);
  const strokesRef = useRef([]);
  const signatureSizeRef = useRef(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const renderTokenRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const sizeChanged = dimensionsRef.current.width !== bounds.width
        || dimensionsRef.current.height !== bounds.height;
      if (!sizeChanged) return;

      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * pixelRatio);
      canvas.height = Math.round(bounds.height * pixelRatio);
      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.strokeStyle = '#111827';
      context.lineWidth = 2.4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      dimensionsRef.current = { width: bounds.width, height: bounds.height };

      if (strokesRef.current.length && signatureSizeRef.current) {
        const signatureSize = signatureSizeRef.current;
        context.scale(bounds.width / signatureSize.width, bounds.height / signatureSize.height);
        for (const stroke of strokesRef.current) {
          if (!stroke.length) continue;
          context.beginPath();
          context.moveTo(stroke[0].x, stroke[0].y);
          for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
          if (stroke.length === 1) context.lineTo(stroke[0].x + 0.1, stroke[0].y + 0.1);
          context.stroke();
        }
        return;
      }

      const dataUrl = valueRef.current;
      if (!dataUrl) return;
      const renderToken = ++renderTokenRef.current;
      const image = new Image();
      image.onload = () => {
        if (renderToken !== renderTokenRef.current || !canvasRef.current) return;
        context.drawImage(image, 0, 0, bounds.width, bounds.height);
      };
      image.src = dataUrl;
    };

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    render();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    valueRef.current = value;
    if (strokesRef.current.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const { width, height } = dimensionsRef.current;
    if (!width || !height) return;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    renderTokenRef.current += 1;
    if (!value) return;

    const renderToken = renderTokenRef.current;
    const image = new Image();
    image.onload = () => {
      if (renderToken !== renderTokenRef.current || !canvasRef.current) return;
      context.drawImage(image, 0, 0, width, height);
    };
    image.src = value;
  }, [value]);

  const getPoint = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    const signatureSize = signatureSizeRef.current;
    return {
      x: (event.clientX - bounds.left) * signatureSize.width / bounds.width,
      y: (event.clientY - bounds.top) * signatureSize.height / bounds.height,
    };
  };

  const startDrawing = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setSignatureError('');
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    if (!signatureSizeRef.current) {
      const bounds = canvas.getBoundingClientRect();
      signatureSizeRef.current = { width: bounds.width, height: bounds.height };
    }
    drawingRef.current = true;
    const point = getPoint(event);
    strokesRef.current.push([point]);
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
    const currentStroke = strokesRef.current.at(-1);
    const lastPoint = currentStroke.at(-1);
    if (Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 0.6) return;
    currentStroke.push(point);

    if (pointCount(strokesRef.current) > MAX_SAVED_POINTS * 2) {
      compactStrokes(strokesRef.current);
    }

    const context = canvasRef.current.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    let image;
    try {
      compactStrokes(strokesRef.current);
      const signatureSize = signatureSizeRef.current;
      image = createSignatureDataUrl(strokesRef.current, signatureSize.width, signatureSize.height);
    } catch (error) {
      strokesRef.current = [];
      signatureSizeRef.current = null;
      valueRef.current = '';
      onChange('');
      const context = canvas.getContext('2d');
      const { width, height } = dimensionsRef.current;
      context.clearRect(0, 0, width, height);
      setSignatureError(error.message);
      return;
    }
    valueRef.current = image;
    onChange(image);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const { width, height } = dimensionsRef.current;
    canvas.getContext('2d').clearRect(0, 0, width, height);
    strokesRef.current = [];
    signatureSizeRef.current = null;
    valueRef.current = '';
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
    {signatureError
      ? <p role="alert" className="text-xs text-rose-700">{signatureError}</p>
      : !value && <p className="text-xs text-slate-500">Nupieškite parašą prieš patvirtindami PIN.</p>}
  </div>;
}
