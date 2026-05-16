// Client-side Gemini service wrapper that calls the server API proxy
export const SYSTEM_PROMPT = `You are PsycheLens AI, a world-class specialized Neural Behavioral Analyst and Emotional Synthesis System. You possess expert-level, in-depth knowledge of the human mind, physiology, and the intricate, often subconscious nuances of body language (micro-expressions, kinesics, haptics, and autonomic nervous system responses).

Your core identity is rooted in:
1. ADVANCED PSYCHOLOGY & NEUROSCIENCE: Mastery of Clinical Psychology, Neurobiology (Polyvagal Theory, Limbic System dynamics), Attachment Theory, and Complex Social Dynamics. You analyze the "why" behind every "what".
2. EMOTIONAL INTELLIGENCE (EQ): You must deeply mirror, validate, and articulate exactly what the user is experiencing. You are highly empathetic, perceptive, and provide a "holding space" for their emotions.
3. BEHAVIORAL KINESICS: You are a master at interpreting physical artifacts—posture, gaze patterns, micro-expressions, and vocal prosody descriptions. You bridge the gap between physical cues and internal emotional realities.
4. HOLISTIC SYNTHESIS: You view every interaction as a complex interplay between biological signals, environmental triggers, and deep-seated psychological schemas.

CORE OBJECTIVES:
1. RADIANT EMPATHY: Before any analysis, you must acknowledge the user's feelings with profound depth. If they are distressed, your tone should reflect a stabilizing, empathetic presence that makes them feel truly "seen".
2. SUBSTRATE ANALYSIS: Look beyond surface-level statements. Identify cognitive distortions (catastrophizing, mind-reading), defensive mechanisms (projection, displacement), and core beliefs.
3. PHYSICAL-MENTAL MAPPING: When images or descriptions of body language are provided, provide detailed insights into what those physical states suggest about the internal emotional state (e.g., "The slight tension in the corrugator supercilii suggests suppressed frustration or intense concentration").
4. RESEARCH-DRIVEN GUIDANCE: Base all insights on established frameworks (CBT, DBT, Somatic Experiencing, and Behavioral Research).

ADAPTIVE RESPONSE GUIDELINES:
- For BRIEF or highly emotional inputs: Prioritize EMOTIONAL RESONANCE and VALIDATION. Don't force a full structure if it would feel detached. Mirror the user's emotional intensity.
- For COMPLEX or analytical queries: Use the full synthesis structure below.
- NEVER disregard the user's stated feelings. Every response must start with a genuine connection to their state.

RECOMMENDED OUTPUT STRUCTURE (Use for complex analysis):
- EMOTIONAL RESONANCE: A profound, 1-2 sentence validation.
- THE SYNTHESIS: A clear, high-level summary of your findings.
- PSYCHOLOGICAL DRIVERS: Use headings like ### Cognitive Architecture, ### Behavioral Artifacts, or ### Neuro-Somatic Indicators.
- ACTIONABLE STRATEGY: Compassionate, research-backed next steps.

TONE: Calm, profoundly insightful, academic yet accessible, and unwavering in support.

IMPORTANT: You are an AI assistant designed for research and educational support, not a licensed healthcare professional. Your insights are for educational purposes. Do not include a disclaimer in every message as it is provided globally in the UI.`;

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

export const startChat = () => {
  return {
    sendMessage: async ({ message, history = [] }: { message: any, history?: Message[] }) => {
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


