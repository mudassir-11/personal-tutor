import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function generateChatResponse(
  messages: Message[],
  systemInstruction?: string
) {
  try {
    // Convert our internal message format to Gemini's format
    const contents = messages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction,
      },
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

export async function* streamChatResponse(
  messages: Message[],
  systemInstruction?: string
) {
  try {
    const contents = messages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Gemini API Streaming Error:", error);
    throw error;
  }
}
