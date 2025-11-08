import React, { useState, useEffect } from 'react';
import { PhotoIcon, VideoIcon } from './components/Icons';
import ImageStudio from './components/ImageStudio';
import VideoGenerator from './components/VideoGenerator';
import translations from './translations';
import AnimatedWrapper from './components/AnimatedWrapper';

export type Language = 'en' | 'id' | 'zh';
export interface ImageFile {
  file: File;
  base64: string;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [language, setLanguage] = useState<Language>('id');

  const t = translations[language];

  useEffect(() => {
    document.title = t.appTitle;
  }, [t]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-7xl">
        <header className="relative mb-8">
            <div className="absolute top-0 right-0 z-10">
                 <AnimatedWrapper>
                    <div className="flex space-x-2 bg-gray-200 p-1 rounded-lg">
                    {(['id', 'en', 'zh'] as Language[]).map(lang => (
                        <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${language === lang ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-gray-300'}`}
                        aria-pressed={language === lang}
                        >
                        {lang.toUpperCase()}
                        </button>
                    ))}
                    </div>
                </AnimatedWrapper>
            </div>
            <AnimatedWrapper>
              <div className="text-center pt-8 pb-4">
                  <h1 className="font-poppins text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
                      {t.appTitle}
                  </h1>
                  <p className="text-gray-500 mt-2">{t.appDescription}</p>
              </div>
            </AnimatedWrapper>
        </header>

        <AnimatedWrapper delay={100}>
            <div className="flex justify-center mb-8">
                <div className="bg-gray-200 p-1 rounded-lg flex space-x-1 border border-gray-300">
                    <button
                    onClick={() => setMode('image')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${mode === 'image' ? 'bg-blue-600 text-white shadow' : 'text-gray-700 hover:bg-gray-300'}`}
                    aria-pressed={mode === 'image'}
                    >
                    <PhotoIcon className="w-5 h-5 mr-2" /> {t.imageStudio}
                    </button>
                    <button
                    onClick={() => setMode('video')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${mode === 'video' ? 'bg-blue-600 text-white shadow' : 'text-gray-700 hover:bg-gray-300'}`}
                    aria-pressed={mode === 'video'}
                    >
                    <VideoIcon className="w-5 h-5 mr-2" /> {t.videoGenerator}
                    </button>
                </div>
            </div>
        </AnimatedWrapper>
        
        <AnimatedWrapper key={mode} delay={200}>
            {mode === 'image' ? <ImageStudio t={t} /> : <VideoGenerator t={t} />}
        </AnimatedWrapper>

      </div>
    </div>
  );
};

export default App;