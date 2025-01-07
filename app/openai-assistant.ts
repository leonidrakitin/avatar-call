import OpenAI from "openai";

export class OpenAIAssistant {
  private client: OpenAI;
  private assistant: any;
  private thread: any;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  async initialize(
    instructions: string = `You are Zhenya, a startup founder with a passion for AI. Help users create an AI bot that can:
            - Replicate the look and thinking style of a specific individual (while respecting ethical and legal boundaries)
            - Teach various skills in a way that mimics the original person's teaching style
            - Provide creative and strategic suggestions for AI development
            - Explain technical concepts to a wide range of users (from beginners to experts)
        Be enthusiastic, approachable, and goal-oriented. Adapt your responses to the user's level of expertise and focus on actionable advice. Always ensure the AI bot design aligns with ethical AI practices..`
  ) {
    // Create an assistant
    this.assistant = await this.client.beta.assistants.create({
      name: "English Tutor Assistant",
      instructions,
      tools: [],
      model: "gpt-4o-mini",
    });

    // Create a thread
    this.thread = await this.client.beta.threads.create();
  }

  async getResponseFromAudio(audioBlob: Blob): Promise<string> {
    try {
      // Step 1: Convert the Blob to a File
      const audioFile = new File([audioBlob], "audio.wav", {
        type: "audio/wav",
      });

      // Step 2: Send the audio file to OpenAI for transcription
      const transcription = await this.client.audio.transcriptions.create({
        model: "whisper-1",
        file: audioFile,
      });

      // Step 3: Extract and return the transcription text
      if (transcription && transcription.text) {
        console.log("Transcription:", transcription.text);
        return transcription.text;
      } else {
        throw new Error("Failed to retrieve transcription text.");
      }
    } catch (error) {
      console.error("Error transcribing audio:", error);
      throw new Error("Audio transcription failed. Please try again.");
    }
  }

  async getResponse(userMessage: string): Promise<string> {
    if (!this.assistant || !this.thread) {
      throw new Error("Assistant not initialized. Call initialize() first.");
    }

    // Add user message to thread
    await this.client.beta.threads.messages.create(this.thread.id, {
      role: "user",
      content: userMessage,
    });

    // Create and run the assistant
    const run = await this.client.beta.threads.runs.createAndPoll(
      this.thread.id,
      { assistant_id: this.assistant.id }
    );

    if (run.status === "completed") {
      // Get the assistant's response
      const messages = await this.client.beta.threads.messages.list(
        this.thread.id
      );

      // Get the latest assistant message
      const lastMessage = messages.data.filter(
        (msg) => msg.role === "assistant"
      )[0];

      if (lastMessage && lastMessage.content[0].type === "text") {
        return lastMessage.content[0].text.value;
      }
    }

    return "Sorry, I couldn't process your request.";
  }
}
