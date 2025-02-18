import type { StartAvatarResponse } from "@heygen/streaming-avatar";

import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import {
  Button,
  Card,
  CardBody,
  Input,
  Spinner,
  Tabs,
  Tab,
} from "@nextui-org/react";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { OpenAIAssistant } from "@/app/openai-assistant";
import { MicrophoneSlash, PaperPlaneRight, PhoneDisconnect } from "@phosphor-icons/react";

interface InteractiveAvatarProps {
  avatar_id: string | null;
  avatar_voice_id: string | null;
  assistant_id: string | null;
  language: string;
}

export default function InteractiveAvatar({
  avatar_id,
  avatar_voice_id,
  assistant_id,
  language,
}: InteractiveAvatarProps) {
  // Для блокировки ввода используем единое состояние isProcessing
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [openaiAssistant, setOpenAIAssistant] = useState<OpenAIAssistant | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  // isProcessing будем использовать и для отключения UI (вместо isLoadingRepeat)
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>("");
  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  // История чата: каждый элемент – вопрос (user) и ответ (response)
  const [chatHistory, setChatHistory] = useState<{ user: string; response: string }[]>([]);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [chatMode, setChatMode] = useState("text_mode");
  const [isUserTalking, setIsUserTalking] = useState(false);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", { method: "POST" });
      const token = await response.text();
      console.log("Access Token:", token);
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
    }
    return "";
  }

  async function startSession() {
    setIsLoadingSession(true);
    const newToken = await fetchAccessToken();

    avatar.current = new StreamingAvatar({ token: newToken });
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) =>
      console.log("Avatar started talking", e)
    );
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) =>
      console.log("Avatar stopped talking", e)
    );
    avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      endSession();
    });
    avatar.current?.on(StreamingEvents.STREAM_READY, (event) => {
      console.log(">>>>> Stream ready:", event.detail);
      setStream(event.detail);
    });
    avatar.current?.on(StreamingEvents.USER_START, (event) => {
      console.log(">>>>> User started talking:", event);
      setIsUserTalking(true);
    });
    avatar.current?.on(StreamingEvents.USER_STOP, (event) => {
      console.log(">>>>> User stopped talking:", event);
      setIsUserTalking(false);
    });

    const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    const assistant = new OpenAIAssistant(openaiApiKey!);
    await assistant.initialize(assistant_id || "");
    setOpenAIAssistant(assistant);

    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: avatar_id || "",
        voice: {
          voiceId: avatar_voice_id || "",
          rate: 1,
          emotion: VoiceEmotion.FRIENDLY,
        },
        language: language,
        disableIdleTimeout: true,
      });
      setData(res);
      // По умолчанию переходим в голосовой режим (можно переключить на текстовый)
      setChatMode("voice_mode");
    } catch (error) {
      console.error("Error starting avatar session:", error);
    } finally {
      setIsLoadingSession(false);
    }
  }

  // Обработка текстового сообщения
  async function handleSpeak() {
    if (isProcessing) return; // если уже обрабатываем сообщение — выходим
    setIsProcessing(true);

    const currentText = text.trim();
    if (!currentText) {
      setIsProcessing(false);
      return;
    }
    // Добавляем вопрос в историю сразу с пустым ответом
    setChatHistory((prev) => [...prev, { user: currentText, response: "" }]);
    setText(""); // очищаем поле ввода

    if (!avatar.current) {
      setDebug("Avatar API not initialized");
      setIsProcessing(false);
      return;
    }

    try {
      // Получаем ответ от Assistant
      const response = await openaiAssistant?.getResponse(currentText);
      // Обновляем последний элемент истории, добавляя ответ
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          ...newHistory[newHistory.length - 1],
          response: response || "Sorry, I couldn't process your request.",
        };
        return newHistory;
      });
      // Отправляем текст в Heygen для озвучивания
      await avatar.current.speak({
        text: response || "Sorry, I couldn't process your request.",
        taskType: TaskType.REPEAT,
        taskMode: TaskMode.SYNC,
      });
    } catch (error) {
      console.error("Error getting response:", error);
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          ...newHistory[newHistory.length - 1],
          response: "Error getting response",
        };
        return newHistory;
      });
    } finally {
      setIsProcessing(false);
    }
  }

  // Обработка голосового ввода
  async function startAudioRecording() {
    try {
      console.log("Requesting microphone access...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted");

      // Определяем поддерживаемый MIME-тип
      let mimeType = "";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      } else {
        console.error("No supported MIME type for recording");
        return;
      }

      const mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      const audioChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        console.log("Data available:", event.data);
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped");
        // Создаем Blob с указанным MIME-типом
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        console.log("Audio blob created:", audioBlob);

        setIsProcessing(true);
        try {
          // Получаем расшифровку
          const transcription = await openaiAssistant?.getResponseFromAudio(audioBlob);
          if (transcription) {
            // Добавляем вопрос в историю сразу после расшифровки
            setChatHistory((prev) => [...prev, { user: transcription, response: "" }]);
            // Получаем ответ от Assistant
            const response = await openaiAssistant?.getResponse(transcription);
            setChatHistory((prev) => {
              const newHistory = [...prev];
              newHistory[newHistory.length - 1] = {
                ...newHistory[newHistory.length - 1],
                response: response || "No response",
              };
              return newHistory;
            });
            // Отправляем текст в Heygen для озвучивания
            await avatar.current?.speak({
              text: response!,
              taskType: TaskType.REPEAT,
              taskMode: TaskMode.SYNC,
            });
          }
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      console.log("MediaRecorder started with MIME type:", mimeType);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }

  // Обработка клика по кнопке записи
  const handleRecordButtonClick = async () => {
    if (isProcessing) return; // блокируем запуск новой записи, если идёт обработка
    if (!isRecording) {
      setIsRecording(true);
      await startAudioRecording();
    } else {
      setIsRecording(false);
      mediaRecorderRef.current?.stop();
    }
  };

  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");
      return;
    }
    await avatar.current.interrupt().catch((e) => setDebug(e.message));
  }

  async function endSession() {
    await avatar.current?.stopAvatar();
    setStream(undefined);
  }

  const handleChangeChatMode = useMemoizedFn(async (v) => {
    if (v === chatMode) return;
    setChatMode(v);
  });

  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [stream]);

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <Card className="h-full flex flex-col rounded-none md:rounded-lg">
        <CardBody className="flex-1 p-0 relative">
          {stream ? (
            <div className="h-full w-full flex justify-center items-center bg-black relative">
              <video ref={mediaStream} autoPlay playsInline className="h-full w-full object-contain">
                <track kind="captions" />
              </video>
              {/* Оверлей с элементами управления */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                <Button
                  isIconOnly
                  className="bg-red-500 text-white h-14 w-14 rounded-full"
                  onPress={endSession}
                  disabled={isProcessing}
                >
                  <PhoneDisconnect size={24} />
                </Button>
                <Button
                  isIconOnly
                  className={`h-14 w-28 rounded-full ${isRecording ? "bg-red-500" : "bg-green-600"} text-white`}
                  onPress={handleRecordButtonClick}
                  disabled={isProcessing}
                >
                  {isRecording ? "Send" : "Record .."}
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div className="h-full flex flex-col items-center justify-center gap-8 p-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Avatar Call</h1>
                <p className="text-gray-500">Start a conversation with AI avatar</p>
              </div>
              <Button
                className="bg-green-600 text-white w-full max-w-[300px] h-14 text-lg"
                onPress={startSession}
              >
                Start call
              </Button>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Spinner color="primary" size="lg" />
            </div>
          )}
        </CardBody>

        {/* Чат и управление */}
        <div className="p-4 border-t">
          <Tabs
            aria-label="Chat mode"
            selectedKey={chatMode}
            onSelectionChange={handleChangeChatMode}
            className="mb-4"
          >
            <Tab key="text_mode" title="Text" />
            <Tab key="voice_mode" title="Voice" />
          </Tabs>
          {chatMode === "text_mode" ? (
            <div className="flex gap-2">
              <Input
                fullWidth
                value={text}
                onValueChange={(newText) => {
                  // Блокируем изменение, если идет обработка
                  if (!isProcessing) setText(newText);
                }}
                placeholder="Type your message..."
                disabled={isProcessing}
                onKeyDown={(e) => {
                  if (isProcessing) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Enter") {
                    handleSpeak();
                  }
                }}
              />
              <Button
                isIconOnly
                color="primary"
                onPress={handleSpeak}
                disabled={isProcessing}
              >
                {isProcessing ? <Spinner size="sm" /> : <PaperPlaneRight size={20} />}
              </Button>
            </div>
          ) : (
            <div className="text-center text-gray-600">
              Voice mode active. Use the recording button on the avatar screen.
            </div>
          )}
        </div>
      </Card>

      {/* История чата (новейшие сообщения сверху) */}
      <Card className="md:rounded-lg rounded-none">
        <div className="p-4">
          <h3 className="font-bold mb-2">Chat History</h3>
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {chatHistory.slice().reverse().map((entry, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="text-sm font-medium text-primary">You: {entry.user}</div>
                <div className="text-sm text-gray-600">Avatar: {entry.response}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
