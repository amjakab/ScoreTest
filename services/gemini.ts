
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getBradyReaction = async (score: number, delta: number): Promise<string> => {
  try {
    const prompt = `Brady just got ${delta > 0 ? '+5' : '-5'} points. His total score is now ${score}. 
    Write a very short (max 10 words), funny, and sarcastic comment about Brady's current standing. 
    Make it sound like a competitive game announcer or a disappointed friend.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        maxOutputTokens: 50,
        temperature: 0.9,
      }
    });

    return response.text || "Brady's journey continues...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return delta > 0 ? "Brady is climbing!" : "Brady is sliding down!";
  }
};
