import {
  GoogleGenAI,
  Modality,
  GenerateContentResponse,
} from "@google/genai";
import type { Part } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // This is a soft check; Veo will use a dynamically injected key.
  console.warn("API_KEY environment variable not set at startup.");
}

// This instance is used for non-Veo models (image editing, text generation)
const ai = new GoogleGenAI({ apiKey: API_KEY! });

const textModel = 'gemini-2.5-flash';
const imageModel = 'gemini-2.5-flash-image';
const videoModel = 'veo-3.1-fast-generate-preview';

export const enhancePrompt = async (prompt: string): Promise<string> => {
  if (!prompt.trim()) {
    return Promise.reject("Prompt cannot be empty.");
  }
  try {
    const response = await ai.models.generateContent({
      model: textModel,
      contents: prompt,
      config: {
        systemInstruction: `You are a creative assistant specializing in writing prompts for AI image editing. Rewrite and enrich the user's prompt to be more descriptive and artistic. Focus on details like style, lighting, composition, and mood, while preserving the original intent. Your response must be only the rewritten prompt text, without any preamble or explanation.`,
      },
    });
    
    if (!response.text) {
        throw new Error("The API returned an empty enhancement.");
    }

    return response.text;
  } catch (error) {
    console.error("Error enhancing prompt with Gemini:", error);
    if (error instanceof Error) {
        return Promise.reject(`Failed to enhance prompt: ${error.message}`);
    }
    return Promise.reject("An unknown error occurred while enhancing the prompt.");
  }
};


export const generateOrEditImage = async (
  prompt: string,
  baseImage: { base64Data: string; mimeType: string } | null,
  referenceImages: { base64Data: string; mimeType: string }[] = [],
  maskImage: { base64Data: string; mimeType: string } | null
): Promise<string> => {
  try {
    const parts: Part[] = [];

    if (baseImage) {
      parts.push({
        inlineData: {
          data: baseImage.base64Data,
          mimeType: baseImage.mimeType,
        },
      });
    }
    
    // A mask only makes sense with a base image.
    // The model expects the mask to be provided right after the original image.
    if (maskImage && baseImage) {
        parts.push({
            inlineData: {
                data: maskImage.base64Data,
                mimeType: maskImage.mimeType
            }
        });
    }

    referenceImages.forEach(ref => {
        parts.push({
            inlineData: {
                data: ref.base64Data,
                mimeType: ref.mimeType,
            }
        });
    });
      
    parts.push({ text: prompt });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: imageModel,
      contents: {
        parts: parts,
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    if (response.promptFeedback?.blockReason) {
        throw new Error(`Request was blocked: ${response.promptFeedback.blockReason}. Please modify your prompt.`);
    }

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("The API returned no content, which may be due to safety filters or an invalid prompt.");
    }

    const candidate = response.candidates[0];

    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        if (candidate.finishReason === 'SAFETY') {
            const safetyIssues = candidate.safetyRatings
                ?.filter(rating => rating.probability !== 'NEGLIGIBLE' && rating.probability !== 'LOW')
                .map(rating => rating.category.replace('HARM_CATEGORY_', ''))
                .join(', ');
            const message = `The request was blocked for safety reasons${safetyIssues ? `: ${safetyIssues}` : ''}. Please adjust your prompt.`;
            throw new Error(message);
        }
        
        let errorMessage = "Image generation failed.";
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
             errorMessage += ` Reason: ${candidate.finishReason}.`;
        }
        if (candidate.finishMessage) {
            errorMessage += ` Details: ${candidate.finishMessage}`;
        }
        throw new Error(errorMessage);
    }

    const imagePart = candidate.content.parts.find(part => part.inlineData?.data);
    if (imagePart?.inlineData?.data) {
        return imagePart.inlineData.data;
    }

    const textPart = candidate.content.parts.find(part => part.text);
    if (textPart?.text) {
        throw new Error(`API returned text instead of an image: "${textPart.text}"`);
    }

    throw new Error("No image data found in the API response.");

  } catch (error) {
    console.error("Error processing image with Gemini:", error);
    if (error instanceof Error) {
        return Promise.reject(error.message);
    }
    return Promise.reject("An unknown error occurred while communicating with the Gemini API.");
  }
};


export const generateVideo = async (
  prompt: string,
  startImage: { base64Data: string; mimeType: string } | null,
  onProgress: (message: string) => void,
): Promise<string> => {
    // Per Veo guidelines, create a new instance to get the latest selected key
    const aiWithLatestKey = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    try {
        onProgress("Initiating video generation...");
        let operation = await aiWithLatestKey.models.generateVideos({
            model: videoModel,
            prompt: prompt,
            ...(startImage && { 
                image: { 
                    imageBytes: startImage.base64Data, 
                    mimeType: startImage.mimeType 
                } 
            }),
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: startImage ? undefined : '16:9'
            }
        });

        const progressMessages = [
            "Storyboarding your scene...",
            "Rendering initial frames (this can take a minute)...",
            "Adding details and effects...",
            "This is a complex task, thanks for your patience!",
            "Finalizing the video...",
        ];
        let messageIndex = 0;
        
        onProgress(progressMessages[messageIndex++]);
        const progressInterval = setInterval(() => {
             if (messageIndex < progressMessages.length) {
                onProgress(progressMessages[messageIndex++]);
             }
        }, 15000); // Update message every 15s

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
            operation = await aiWithLatestKey.operations.getVideosOperation({ operation: operation });
        }
        
        clearInterval(progressInterval);
        onProgress("Video processing complete!");

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was found.");
        }

        onProgress("Downloading video...");
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            throw new Error(`Failed to download video: ${response.statusText}`);
        }

        const videoBlob = await response.blob();
        return URL.createObjectURL(videoBlob);

    } catch (error) {
        console.error("Error generating video with Gemini:", error);

        // Convert error to a string to reliably search for the API key error message.
        const errorString = (error instanceof Error) ? error.message : JSON.stringify(error);

        if (errorString.includes('Requested entity was not found')) {
            return Promise.reject('API key not found or invalid. Please select a valid API key and try again.');
        }
        
        // If it's a standard error and not the key error, reject with its message.
        if (error instanceof Error) {
            return Promise.reject(error.message);
        }

        // For other types of errors, reject with the stringified version.
        return Promise.reject(errorString || "An unknown error occurred while generating the video.");
    }
};