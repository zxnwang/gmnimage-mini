import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import type { ImageFile } from '../App';
import translations from '../translations';
import { generateVideo } from '../services/geminiService';
import { PhotoIcon, VideoIcon, DownloadIcon } from './Icons';
import Spinner from './Spinner';
import AnimatedWrapper from './AnimatedWrapper';

interface VideoGeneratorProps {
  t: (typeof translations)['en'];
}

const VideoDisplay: React.FC<{ title: string; videoUrl: string | null; isLoading?: boolean; status?: string; onDownload?: () => void; text: { videoWillAppear: string, downloadVideo: string } }> = ({ title, videoUrl, isLoading = false, status, onDownload, text }) => {
  return (
    <div className="w-full">
        <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
            {videoUrl && onDownload && (
                <button onClick={onDownload} className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors" title={text.downloadVideo}>
                    <DownloadIcon className="w-4 h-4 mr-1" />
                    <span>Download</span>
                </button>
            )}
        </div>
      <div className="w-full aspect-video bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden shadow-sm">
        {isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-10 p-4 text-white transition-opacity duration-300">
            <Spinner />
            <p className="mt-4 text-center text-sm">{status || "Generating..."}</p>
          </div>
        )}
        {videoUrl ? (
          <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain bg-black transition-opacity duration-500 opacity-0 animate-fade-in-up" style={{ animationFillMode: 'forwards' }} onLoadedData={(e) => e.currentTarget.style.opacity = '1'} />
        ) : (
          <div className="text-center text-gray-500 p-4">
            <VideoIcon className="mx-auto h-12 w-12" />
            <p className="mt-2">{text.videoWillAppear}</p>
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

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ t }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [startImage, setStartImage] = useState<ImageFile | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [videoGenerationStatus, setVideoGenerationStatus] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasApiKey === null) {
      checkApiKey();
    }
  }, [hasApiKey]);

  useEffect(() => {
    if (error) {
        const timer = setTimeout(() => setError(null), 5000);
        return () => clearTimeout(timer);
    }
  }, [error]);

  const checkApiKey = async () => {
    try {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const keySelected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(keySelected);
      } else {
        setHasApiKey(false); // Fallback if aistudio context is not available
      }
    } catch (e) {
      console.error("Error checking API key status:", e);
      setHasApiKey(false);
    }
  };

  const handleSelectKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success after dialog opens to avoid race conditions
      setHasApiKey(true);
    } catch (e) {
      console.error("Could not open API key selection:", e);
      setError("Failed to open the API key selection dialog.");
    }
  };

  const handleStartImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { setError(t.errorInvalidImage); return; }
      setError(null); setGeneratedVideoUrl(null);
      try {
        const base64 = await fileToBase64(file);
        setStartImage({ file, base64 });
      } catch (err) { setError(t.errorReadFile); console.error(err); }
    }
  }, [t]);

  const handleVideoSubmit = async () => {
    if (!videoPrompt) { setError(t.errorVideoPromptEmpty); return; }
    setIsLoading(true); setError(null); setGeneratedVideoUrl(null);
    try {
      const startImageData = startImage ? { base64Data: startImage.base64.split(',')[1], mimeType: startImage.file.type } : null;
      const resultUrl = await generateVideo(videoPrompt, startImageData, setVideoGenerationStatus);
      setGeneratedVideoUrl(resultUrl);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : t.errorUnexpected;
        if (errorMessage.includes('API key not found')) { setHasApiKey(false); }
        setError(errorMessage);
    } finally { setIsLoading(false); setVideoGenerationStatus(''); }
  };
  
  const downloadVideo = (videoUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = fileName;
    link.target = '_blank'; // Necessary for blob URLs in some browsers
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContent = () => {
      if (hasApiKey === null) {
          return <div className="flex items-center justify-center h-full"><Spinner /></div>;
      }
      if (hasApiKey === false) {
          return (
              <AnimatedWrapper>
                <div className="text-center p-8 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-xl font-bold mb-3 text-gray-800">{t.apiKeyRequired}</h3>
                    <p className="mb-6 text-gray-600 max-w-sm mx-auto">{t.apiKeyDescription}</p>
                    <button onClick={handleSelectKey} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors shadow-md hover:shadow-lg active:scale-95">{t.selectApiKey}</button>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 hover:underline mt-4">{t.learnMoreBilling}</a>
                </div>
              </AnimatedWrapper>
          );
      }
      return (
          <div className="space-y-6">
              <AnimatedWrapper delay={0}>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t.addStartingImageOptional}</h3>
                    <label htmlFor="start-image-upload" className="flex flex-col items-center justify-center w-full min-h-48 p-4 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        {startImage ? <img src={startImage.base64} alt="Start" className="max-h-48 rounded-md animate-fade-in-up" /> : <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />}
                        <span className="mt-4 font-semibold text-blue-600">{startImage ? t.changeFile : t.uploadAFile}</span>
                        {!startImage && <span className="text-xs text-gray-500">{t.dragAndDrop}</span>}
                    </label>
                    <input id="start-image-upload" type="file" className="sr-only" accept="image/*" onChange={handleStartImageUpload} disabled={isLoading} />
                </div>
              </AnimatedWrapper>
              <AnimatedWrapper delay={100}>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-300">
                    <label htmlFor="video-prompt" className="text-lg font-semibold text-gray-800 mb-2 block">{t.describeVideo}</label>
                    <textarea id="video-prompt" rows={4} className="block w-full sm:text-sm bg-gray-50 border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 transition" placeholder={t.videoPromptPlaceholder} value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} disabled={isLoading} />
                </div>
              </AnimatedWrapper>
              <div className="sticky bottom-6 z-10">
                 {error && <AnimatedWrapper><p className="text-red-600 bg-red-100 p-3 rounded-lg text-sm text-center mb-4 border border-red-200">{error}</p></AnimatedWrapper>}
                  <button onClick={handleVideoSubmit} disabled={!videoPrompt || isLoading} className="w-full flex items-center justify-center px-6 py-4 border border-transparent text-base font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/50 active:scale-98">
                      {isLoading ? <><Spinner /><span className="ml-3">{t.generatingVideo}...</span></> : <><VideoIcon className="w-5 h-5 mr-2"/>{t.generateVideoBtn}</>}
                  </button>
              </div>
          </div>
      );
  };

  return (
    <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      <div className="h-full">
          {renderContent()}
      </div>
      <div className="flex items-start">
        <AnimatedWrapper delay={100}>
            <VideoDisplay title={t.generatedVideo} videoUrl={generatedVideoUrl} isLoading={isLoading} status={videoGenerationStatus} onDownload={() => generatedVideoUrl && downloadVideo(generatedVideoUrl, 'generated-video.mp4')} text={{ videoWillAppear: t.videoWillAppear, downloadVideo: t.downloadVideo }}/>
        </AnimatedWrapper>
      </div>
    </main>
  );
};

export default VideoGenerator;