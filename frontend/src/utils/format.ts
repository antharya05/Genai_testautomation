const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
  'claude-sonnet-4-6': 'Claude Sonnet 4',
  'claude-opus-4-8': 'Claude Opus 4',
  'claude-haiku-4-5': 'Claude Haiku 4',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4',
  // OpenAI
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  // Gemini
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  // Groq
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'llama-3.1-8b-instant': 'Llama 3.1 8B',
  'mixtral-8x7b-32768': 'Mixtral 8x7B',
  // Ollama
  'llama3.2': 'Llama 3.2',
  'mistral': 'Mistral',
  'codellama': 'Code Llama',
};

export function formatModelName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId;
}
