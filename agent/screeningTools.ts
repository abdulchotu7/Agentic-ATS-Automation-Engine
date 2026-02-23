import OpenAI from "openai";

export const SCREENING_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "answer_question",
      description:
        "Answer a job application question by interacting with the correct form element.",
      parameters: {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description: "CSS selector of the form element",
          },
          inputType: {
            type: "string",
            description:
              "Type of input: textarea | text | checkbox | radio | select",
          },
          value: {
            type: "string",
            description:
              "Answer text or option label to select",
          },
        },
        required: ["selector", "inputType", "value"],
      },
    },
  },
];