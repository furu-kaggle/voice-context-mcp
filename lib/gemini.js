import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
};

// contents は string / Part / Part[] / Content[] を受け付ける
export const generateContent = async (contents) => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
  });
  return response.text;
};

export const extractJson = (text) =>
  text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
