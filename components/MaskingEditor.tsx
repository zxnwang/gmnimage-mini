import React, { useRef, useEffect, useState, MouseEvent } from 'react';
import type { ImageFile } from '../App';
import translations from '../translations';
import { MaskIcon, TrashIcon, XIcon } from './Icons';

interface MaskingEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (maskFile: ImageFile) => void;
  imageUrl: string;
  initialMask: string | null;
  t: (typeof translations)['en'];
}

const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) {
        throw new Error('Invalid data URL');
    }
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

const MaskingEditor: React.FC<MaskingEditorProps> = ({ isOpen, onClose, onSave, imageUrl, initialMask, t }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const [brushSize, setBrushSize] = useState(40);
  const [isErasing, setIsErasing] = useState(false);

  const resizeCanvases = () => {
    if (!containerRef.current || !imageCanvasRef.current || !drawingCanvasRef.current) return;

    const container = containerRef.current;
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const containerRatio = containerWidth / containerHeight;
        const imgRatio = img.width / img.height;
        
        let canvasWidth, canvasHeight;
        if (imgRatio > containerRatio) {
            canvasWidth = containerWidth;
            canvasHeight = containerWidth / imgRatio;
        } else {
            canvasHeight = containerHeight;
            canvasWidth = containerHeight * imgRatio;
        }
        
        [imageCanvasRef.current, drawingCanvasRef.current].forEach(canvas => {
            if (canvas) {
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
            }
        });
        
        const imageCtx = imageCanvasRef.current?.getContext('2d');
        if (imageCtx) {
            imageCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        }

        const drawingCtx = drawingCanvasRef.current?.getContext('2d');
        if (drawingCtx && initialMask) {
            const maskImg = new Image();
            maskImg.src = initialMask;
            maskImg.onload = () => {
                drawingCtx.globalCompositeOperation = 'source-over';
                drawingCtx.globalAlpha = 0.5;
                drawingCtx.fillStyle = 'red';

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasWidth;
                tempCanvas.height = canvasHeight;
                const tempCtx = tempCanvas.getContext('2d');
                if(!tempCtx) return;
                tempCtx.drawImage(maskImg, 0, 0, canvasWidth, canvasHeight);
                tempCtx.globalCompositeOperation = 'source-in';
                tempCtx.fillStyle = 'red';
                tempCtx.fillRect(0, 0, canvasWidth, canvasHeight);
                drawingCtx.drawImage(tempCanvas, 0, 0);
            };
        }
    }
  };

  useEffect(() => {
    if (isOpen) {
        resizeCanvases();
        window.addEventListener('resize', resizeCanvases);
    }
    return () => {
        window.removeEventListener('resize', resizeCanvases);
    };
  }, [isOpen, imageUrl, initialMask]);

  const getMousePos = (e: MouseEvent) => {
    const rect = drawingCanvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = 'red';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const startDrawing = (e: MouseEvent) => {
    isDrawing.current = true;
    const pos = getMousePos(e);
    lastPos.current = pos;
    // Draw a dot on single click
    drawLine(pos.x, pos.y, pos.x, pos.y);
  };
  
  const draw = (e: MouseEvent) => {
    if (!isDrawing.current) return;
    const pos = getMousePos(e);
    if (lastPos.current) {
        drawLine(lastPos.current.x, lastPos.current.y, pos.x, pos.y);
    }
    lastPos.current = pos;
  };
  
  const stopDrawing = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  const clearMask = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const invertMask = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    // Create a temporary canvas with the current mask
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if(!tempCtx) return;
    tempCtx.drawImage(canvas, 0, 0);

    // Clear the main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill with semi-transparent red
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Punch out the original mask shape
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(tempCanvas, 0, 0);
  };

  const handleSave = () => {
    const drawingCanvas = drawingCanvasRef.current;
    if (!drawingCanvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = drawingCanvas.width;
    tempCanvas.height = drawingCanvas.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    
    // Fill with black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Get image data from the drawing canvas
    const drawingCtx = drawingCanvas.getContext('2d');
    if (!drawingCtx) return;
    const imageData = drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
    const data = imageData.data;

    // Create a white silhouette on a new canvas where the mask was drawn
    const silhouetteCanvas = document.createElement('canvas');
    silhouetteCanvas.width = drawingCanvas.width;
    silhouetteCanvas.height = drawingCanvas.height;
    const silhouetteCtx = silhouetteCanvas.getContext('2d');
    if (!silhouetteCtx) return;

    // Iterate through pixels, if alpha > 0 (drawn on), make pixel white
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
        }
    }
    silhouetteCtx.putImageData(imageData, 0, 0);

    // Punch the white silhouette into the black background
    ctx.globalCompositeOperation = 'source-over'; // Actually should be destination-out logic
    ctx.drawImage(silhouetteCanvas, 0, 0);


    // Create final black and white mask
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = drawingCanvas.width;
    finalCanvas.height = drawingCanvas.height;
    const finalCtx = finalCanvas.getContext('2d');
    if(!finalCtx) return;

    finalCtx.fillStyle = 'black';
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    finalCtx.globalCompositeOperation = 'source-over';

    const finalImageData = finalCtx.getImageData(0,0, finalCanvas.width, finalCanvas.height);
    const finalData = finalImageData.data;
    const sourceData = silhouetteCtx.getImageData(0,0, silhouetteCanvas.width, silhouetteCanvas.height).data;
    for(let i=0; i<finalData.length; i += 4) {
        if(sourceData[i+3] > 0) { // If pixel on silhouette is not transparent
            finalData[i] = 255;
            finalData[i+1] = 255;
            finalData[i+2] = 255;
        }
    }
    finalCtx.putImageData(finalImageData, 0, 0);
    
    const base64 = finalCanvas.toDataURL('image/png');
    const file = dataURLtoFile(base64, 'mask.png');
    onSave({ file, base64 });
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex flex-col items-center justify-center p-4" onMouseUp={stopDrawing} onMouseLeave={stopDrawing}>
        <div className="absolute top-4 right-4">
            <button onClick={onClose} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/40 transition-colors">
                <XIcon className="w-6 h-6" />
            </button>
        </div>
        <div ref={containerRef} className="relative w-full h-full flex items-center justify-center max-w-7xl max-h-[85vh]">
            <canvas ref={imageCanvasRef} className="absolute"></canvas>
            <canvas ref={drawingCanvasRef} className="absolute cursor-crosshair" onMouseDown={startDrawing} onMouseMove={draw}></canvas>
        </div>
        
        <div className="absolute bottom-4 bg-gray-800 text-white p-4 rounded-xl shadow-2xl flex flex-col sm:flex-row items-center gap-4 sm:gap-6 animate-fade-in-up">
            <div className="flex items-center gap-3">
                <label htmlFor="brushSize" className="text-sm font-medium whitespace-nowrap">{t.brushSize}:</label>
                <input id="brushSize" type="range" min="5" max="150" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-32 cursor-pointer" />
            </div>

            <div className="bg-gray-700 h-8 w-px hidden sm:block"></div>

            <div className="flex items-center gap-2">
                <button onClick={() => setIsErasing(false)} className={`px-4 py-2 text-sm rounded-md transition-colors ${!isErasing ? 'bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-500'}`}>{t.brush}</button>
                <button onClick={() => setIsErasing(true)} className={`px-4 py-2 text-sm rounded-md transition-colors ${isErasing ? 'bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-500'}`}>{t.eraser}</button>
            </div>
            
            <div className="bg-gray-700 h-8 w-px hidden sm:block"></div>

            <div className="flex items-center gap-2">
                <button onClick={invertMask} className="px-4 py-2 text-sm rounded-md bg-gray-600 hover:bg-gray-500 transition-colors">{t.invertMask}</button>
                <button onClick={clearMask} className="px-4 py-2 text-sm rounded-md bg-gray-600 hover:bg-gray-500 transition-colors flex items-center gap-2">
                    <TrashIcon className="w-4 h-4"/> {t.clearMask}
                </button>
            </div>
            
            <button onClick={handleSave} className="w-full sm:w-auto px-6 py-2 text-sm font-semibold rounded-md bg-green-600 hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                <MaskIcon className="w-4 h-4" /> {t.saveMask}
            </button>
        </div>
    </div>
  );
};

export default MaskingEditor;
