export type AssistantRole = "user" | "assistant";

export type AssistantConversationMessage = {
  role: AssistantRole;
  content: string;
};

export type AssistantRequestBody = {
  messages: AssistantConversationMessage[];
};

export type AssistantReply = {
  reply: string;
  model: string;
};
