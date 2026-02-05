
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getBradyReaction = async (score: number, delta: number) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a witty, slightly dramatic, and funny commentator for a point-tracking app called "Brady's Points". 
      The score just changed by ${delta > 0 ? '+' : ''}${delta} and the total is now ${score}.
      Provide a one-sentence reaction to this. Be creative. 
      If the score is very high, be impressed. If it's very low, be mock-devastated.
      Keep the response under 15 words.`,
      config: {
        temperature: 0.8,
        topP: 0.95,
      }
    });

    return response.text?.trim() || "Brady is speechless.";
  } catch (error) {
    console.error("Gemini failed to react:", error);
    return delta > 0 ? "Brady's stock is rising!" : "A dark day for Brady's points.";
  }
};
