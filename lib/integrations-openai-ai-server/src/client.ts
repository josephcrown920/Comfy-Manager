import OpenAI from "openai";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "An OpenAI API key must be configured for the Studio assistant.",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});
