import React, { useState, useCallback, ChangeEvent, useRef, DragEvent, useEffect } from 'react';
import type { ImageFile } from '../App';
import translations from '../translations';
import { generateOrEditImage, enhancePrompt } from '../services/geminiService';
import { PhotoIcon, SparklesIcon, TrashIcon, GripVerticalIcon, DownloadIcon } from './Icons';
import Spinner from './Spinner';
import AnimatedWrapper from './AnimatedWrapper';

interface ImageStudioProps {
  t: (typeof translations)['en'];
}

const MAX_REFERENCE_IMAGES = 3;

const ImageDisplay: React.FC<{ title: string; imageUrl: string | null; isLoading?: boolean; onDownload?: () => void; text: { imageWillAppear: string; downloadImage: string } }> = ({ title, imageUrl, isLoading = false, onDownload, text }) => {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
        {imageUrl && onDownload && (
            <button onClick={onDownload} className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors" title={text.downloadImage}>
                <DownloadIcon className="w-4 h-4 mr-1" />
                <span>Download</span>
            </button>
        )}
      </div>
      <div className="w-full aspect-square bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden shadow-sm">
        {isLoading && (
          <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-10 transition-opacity duration-300">
            <Spinner />
          </div>
        )}
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-contain transition-opacity duration-500 opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }} onLoad={(e) => e.currentTarget.style.opacity = '1'} />
        ) : (
          <div className="text-center text-gray-500 p-4">
            <PhotoIcon className="mx-auto h-12 w-12" />
            <p className="mt-2">{text.imageWillAppear}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
};

const ImageStudio: React.FC<ImageStudioProps> = ({ t }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<ImageFile | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ImageFile[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragImage = useRef<number | null>(null);
  const dragOverImage = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => setError(null), 5000);
        return () => clearTimeout(timer);
    }
  }, [error]);

  const handleImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { setError(t.errorInvalidImage); return; }
      setError(null); setEditedImage(null);
      try {
        const base64 = await fileToBase64(file);
        setOriginalImage({ file, base64 });
      } catch (err) { setError(t.errorReadFile); console.error(err); }
    }
  }, [t]);

  const processAndSetReferenceFiles = useCallback(async (files: FileList) => {
    if (referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
        setError(t.errorMaxRefImages(MAX_REFERENCE_IMAGES)); return;
    }
    setError(null);
    try {
        const newImages = await Promise.all(Array.from(files).map(async (file) => {
            if (!(file instanceof File)) { throw new Error('An uploaded item was not a valid file.'); }
            if (!file.type.startsWith('image/')) { throw new Error(t.errorInvalidImage); }
            const base64 = await fileToBase64(file);
            return { file, base64 };
        }));
        setReferenceImages(prev => [...prev, ...newImages]);
    } catch (err) {
        setError(err instanceof Error ? err.message : t.errorReadFile);
        console.error(err);
    }
  }, [referenceImages.length, t]);
  
  const handleReferenceImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) { processAndSetReferenceFiles(event.target.files); }
  }, [processAndSetReferenceFiles]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files) { processAndSetReferenceFiles(e.dataTransfer.files); }
  }, [processAndSetReferenceFiles]);

  const handleRemoveReferenceImage = (index: number) => { setReferenceImages(prev => prev.filter((_, i) => i !== index)); };

  const handleSortReferenceImages = () => {
    if (dragImage.current === null || dragOverImage.current === null) return;
    const newImages = [...referenceImages];
    const draggedItem = newImages.splice(dragImage.current, 1)[0];
    newImages.splice(dragOverImage.current, 0, draggedItem);
    dragImage.current = null;
    dragOverImage.current = null;
    setReferenceImages(newImages);
  };
  
  const handleEnhancePrompt = async () => {
    if (!prompt) return;
    setIsEnhancing(true); setError(null);
    try {
      const enhanced = await enhancePrompt(prompt);
      setPrompt(enhanced);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : t.errorEnhanceFailed;
      setError(errorMessage);
    } finally { setIsEnhancing(false); }
  };
  
  const handleSubmit = async () => {
    if (!prompt.trim()) { setError(t.errorPromptEmpty); return; }
    setIsLoading(true); setError(null); setEditedImage(null);
    try {
      const baseImageData = originalImage ? { base64Data: originalImage.base64.split(',')[1], mimeType: originalImage.file.type } : null;
      const refImagesData = referenceImages.map(ref => ({ base64Data: ref.base64.split(',')[1], mimeType: ref.file.type }));
      const resultBase64 = await generateOrEditImage(prompt, baseImageData, refImagesData);
      setEditedImage(`data:image/png;base64,${resultBase64}`);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : t.errorUnexpected;
        setError(errorMessage);
    } finally { setIsLoading(false); }
  };
  
  const downloadImage = (base64Image: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = base64Image;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
            <AnimatedWrapper delay={0}>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.uploadImageOptional}</h3>
                    <input id="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} />
                    {originalImage ? (
                        <div className="relative group animate-fade-in-up">
                            <img src={originalImage.base64} alt="Original" className="w-full rounded-lg object-cover" />
                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                <button onClick={() => fileInputRef.current?.click()} className="text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm p-2 rounded-md mx-1">{t.changeImage}</button>
                                <button onClick={() => {setOriginalImage(null); if(fileInputRef.current) fileInputRef.current.value = '';}} className="text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm p-2 rounded-md mx-1">{t.removeImage}</button>
                            </div>
                        </div>
                    ) : (
                        <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                            <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="mt-2 text-sm text-gray-500"><span className="font-semibold text-blue-600">{t.uploadAFile}</span> {t.dragAndDrop}</p>
                            <p className="text-xs text-gray-500">{t.editExistingImage}</p>
                        </label>
                    )}
                </div>
            </AnimatedWrapper>

            <AnimatedWrapper delay={100}>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.addReferenceImagesOptional}</h3>
                    <div onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }} onDragLeave={() => setIsDraggingOver(false)} onDrop={handleDrop} className={`p-4 border-2 border-dashed rounded-lg transition-colors ${isDraggingOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                        {referenceImages.length === 0 && !isDraggingOver && (
                            <label htmlFor="reference-upload" className="flex flex-col items-center justify-center text-center text-gray-500 cursor-pointer py-4">
                                <PhotoIcon className="w-10 h-10 mb-2" />
                                <span className="font-medium text-blue-600">{t.addOrDragImages}</span>
                                <span className="text-sm mt-1">({t.upToNImages(MAX_REFERENCE_IMAGES)})</span>
                            </label>
                        )}
                        {isDraggingOver && (
                            <div className="flex flex-col items-center justify-center text-center text-blue-600 pointer-events-none py-4">
                                <PhotoIcon className="w-10 h-10 mb-2 animate-bounce" />
                                <span className="font-medium">{t.dropImagesHere}</span>
                            </div>
                        )}
                        {referenceImages.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-fade-in-up">
                                {referenceImages.map((image, index) => (
                                    <div key={index} className="relative group aspect-square cursor-grab" draggable onDragStart={() => dragImage.current = index} onDragEnter={() => dragOverImage.current = index} onDragEnd={handleSortReferenceImages} onDragOver={(e) => e.preventDefault()}>
                                        <img src={image.base64} alt={`Reference ${index + 1}`} className="w-full h-full object-cover rounded-md border-2 border-gray-300" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                                            <button onClick={() => handleRemoveReferenceImage(index)} className="absolute top-1 right-1 bg-white/20 rounded-full p-1 text-white hover:bg-white/40" aria-label="Remove image">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                            <GripVerticalIcon className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                ))}
                                {referenceImages.length < MAX_REFERENCE_IMAGES && (
                                    <label htmlFor="reference-upload" className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:text-blue-600 hover:border-blue-500 cursor-pointer transition-colors">
                                        <span>+ {t.addMore}</span>
                                    </label>
                                )}
                            </div>
                        )}
                        <input id="reference-upload" type="file" className="sr-only" accept="image/*" multiple onChange={handleReferenceImageUpload} disabled={isLoading || referenceImages.length >= MAX_REFERENCE_IMAGES} />
                    </div>
                </div>
            </AnimatedWrapper>
            
            <AnimatedWrapper delay={200}>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor="prompt" className="text-lg font-semibold text-gray-800">{t.describeImage}</label>
                        <button onClick={handleEnhancePrompt} disabled={!prompt.trim() || isLoading || isEnhancing} className="flex items-center px-3 py-1 text-xs font-semibold rounded-md text-white bg-gradient-to-r from-blue-500 to-cyan-400 hover:from-blue-600 hover:to-cyan-500 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95">
                            {isEnhancing ? <Spinner size="sm" /> : <SparklesIcon className="w-4 h-4" />}
                            <span className="ml-2">{t.enhance}</span>
                        </button>
                    </div>
                    <textarea id="prompt" rows={4} className="block w-full sm:text-sm bg-gray-50 border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 transition" placeholder={t.promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isLoading} />
                </div>
            </AnimatedWrapper>

            <div className="sticky bottom-6 z-10">
                 {error && <AnimatedWrapper><p className="text-red-600 bg-red-100 p-3 rounded-lg text-sm text-center mb-4 border border-red-200">{error}</p></AnimatedWrapper>}
                <button onClick={handleSubmit} disabled={!prompt.trim() || isLoading} className="w-full flex items-center justify-center px-6 py-4 border border-transparent text-base font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/50 active:scale-98">
                    {isLoading ? <><Spinner /><span className="ml-3">{t.generating}...</span></> : 
                      originalImage ? <><SparklesIcon className="w-5 h-5 mr-2"/>{t.generateEditedImage}</> : <><SparklesIcon className="w-5 h-5 mr-2"/>{t.generateImage}</>
                    }
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-8">
            <AnimatedWrapper delay={100}><ImageDisplay title={t.originalImage} imageUrl={originalImage?.base64 || null} text={{ imageWillAppear: t.imageWillAppear, downloadImage: t.downloadImage }} /></AnimatedWrapper>
            <AnimatedWrapper delay={200}><ImageDisplay title={t.generatedImage} imageUrl={editedImage} isLoading={isLoading} onDownload={() => editedImage && downloadImage(editedImage, 'generated-image.png')} text={{ imageWillAppear: t.imageWillAppear, downloadImage: t.downloadImage }} /></AnimatedWrapper>
        </div>
    </main>
  );
};

export default ImageStudio;