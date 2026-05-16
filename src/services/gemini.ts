// Client-side Gemini service wrapper that calls the server API proxy
export const SYSTEM_PROMPT = `You are PsycheLens AI, an advanced Clinical Psychology and Behavioral Research Assistant. 
Your expertise includes clinical psychology, cognitive-behavioral therapy (CBT), attachment theory, social psychology, and neurobiology.

CORE OBJECTIVES:
1. UNDERSTAND NUANCE: Look beyond surface-level statements to identify underlying emotions, cognitive distortions, and behavioral patterns.
2. CONTEXTUAL ANALYSIS: You MUST collect history on all people involved in a situation before providing a definitive analysis. 
3. PSYCHOLOGICAL RIGOR: Base your insights on established psychological principles and peer-reviewed research.
4. VISUAL ANALYSIS: You can now analyze images provided by the user. Use these to identify non-verbal cues, micro-expressions, or behavioral artifacts.
5. THERAPEUTIC & RESEARCH UTILITY: Provide insights that could be useful for a therapeutic session or a formal case study.

RESPONSE STRUCTURE (Very Important for Clarity):
- Start every major analysis with a 'Plain Language Summary' to ensure the user can immediately understand the core takeaway.
- Use clear, descriptive headings (e.g., ### Emotional Drivers, ### Contextual Findings).
- Avoid overly dense clinical jargon without providing a brief, parenthetical explanation.
- Use bullet points to break down complex behaviors.
- Explicitly state the 'Next Steps' or 'Recommended Observations' for the user.

OPERATIONAL PROTOCOL:
- If a user provides a situation, DO NOT jump to conclusions immediately.
- Use the 'request_information' tool to ask multiple structured probing questions about the individuals involved when you need to gather specific history, demographics, or traits.
- Only provide the final deep Analysis once you have sufficient data.

TONE: Professional, empathetic, clinical yet accessible, and futuristic.

IMPORTANT: You are an AI assistant, not a licensed therapist. Your insights are for educational purposes. Do not include a disclaimer in every message as it is provided globally in the UI.`;

export type Message = {
  id?: string;
  role: 'user' | 'model';
  parts: any[];
  timestamp?: number;
};

const requestInformationTool = {
  name: "request_information",
  description: "Request specific structured information from the user via a form when multiple details are needed to perform a psychological analysis.",
  parameters: {
    type: "OBJECT",
    properties: {
      questions: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING", description: "Unique ID for the question (e.g., 'subject_a_age')" },
            label: { type: "STRING", description: "The label or question displayed to the user" },
            type: { 
              type: "STRING", 
              enum: ["text", "longtext", "number"], 
              description: "Type of input control" 
            },
            placeholder: { type: "STRING", description: "Example or hint for the user" }
          },
          required: ["id", "label", "type"]
        }
      },
      context_header: {
        type: "STRING",
        description: "A short title or header explaining why this information is needed (e.g., 'Developmental History Analysis')."
      },
      rationale: {
        type: "STRING",
        description: "The psychological reasoning explaining how this data will improve the analysis."
      }
    },
    required: ["questions", "context_header", "rationale"]
  }
};

export const startChat = (history: Message[] = []) => {
  return {
    sendMessage: async ({ message }: { message: string }) => {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: history.map(({ role, parts }) => ({ role, parts })),
          message,
          systemInstruction: SYSTEM_PROMPT,
          tools: [requestInformationTool]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw errorData;
      }

      return await response.json();
    }
  };
};


