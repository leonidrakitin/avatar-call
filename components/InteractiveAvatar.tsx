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
  CardFooter,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Chip,
  Tabs,
  Tab,
} from "@nextui-org/react";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, usePrevious } from "ahooks";
import { OpenAIAssistant } from "@/app/openai-assistant";
import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

import { STT_LANGUAGE_LIST } from "@/app/lib/constants";
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [openaiAssistant, setOpenAIAssistant] = useState<OpenAIAssistant | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();

  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<{ user: string; response: string }[]>([]);
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [chatMode, setChatMode] = useState("text_mode");
  const [isUserTalking, setIsUserTalking] = useState(false);

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token); // Log the token to verify

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
    }

    return "";
  }

  async function startSession() {
        setIsLoadingSession(true);
    const newToken = await fetchAccessToken();

    avatar.current = new StreamingAvatar({
      token: newToken,
    });
    avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
      console.log("Avatar started talking", e);
    });
    avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
      console.log("Avatar stopped talking", e);
    });
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
    
    await assistant.initialize(assistant_id || '');
    setOpenAIAssistant(assistant);
    console.log(openaiAssistant);

    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: avatar_id || '',
        voice: {
          voiceId: avatar_voice_id || '',
          rate: 1,
          emotion: VoiceEmotion.FRIENDLY,
        },
        language: language,
        disableIdleTimeout: true,
      });

      setData(res);
      // default to voice mode
      setChatMode("voice_mode");
    } catch (error) {
      console.error("Error starting avatar session:", error);
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }

    try {
      const response = await openaiAssistant?.getResponse(text);
      setChatHistory((prev) => [...prev, { user: text, response: response || "Sorry, I couldn't process your request." }]);
      await avatar.current.speak({
        text: response || "Sorry, I couldn't process your request.",
        taskType: TaskType.REPEAT,
        taskMode: TaskMode.SYNC,
      });
    } catch (error) {
      console.error("Error getting response:", error);
    } finally {
      setIsLoadingRepeat(false);
    }
  }

  async function startAudioRecording() {
    try {
      console.log("Requesting microphone access...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted");

      const mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = mediaRecorder; // Сохраняем mediaRecorder в реф

      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log("Data available:", event.data);
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        console.log("MediaRecorder stopped");
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        console.log("Audio blob created:", audioBlob);

        // // Воспроизведение аудио для проверки
        // const audioUrl = URL.createObjectURL(audioBlob);
        // const audio = new Audio(audioUrl);
        // audio.play();

        // Обработка с OpenAI
        try {
          const transcription = await openaiAssistant?.getResponseFromAudio(audioBlob);
          if (transcription) {
            console.log("Transcription:", transcription);
            const response = await openaiAssistant?.getResponse(transcription);
            setChatHistory((prev) => [
              ...prev,
              {user: transcription, response: response || "No response"},
            ]);
            await avatar.current?.speak({
              text: response!,
              taskType: TaskType.REPEAT,
              taskMode: TaskMode.SYNC,
            });
          }
        } finally {
          setChatHistory((prev) => [
            ...prev,
          ]);
        }
      };

      mediaRecorder.start();
      console.log("MediaRecorder started");
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }

  const handleRecordButtonClick = async () => {
    if (!isRecording) {
      // Начало записи
      setIsRecording(true);
      await startAudioRecording();
    } else {
      // Остановка записи
      setIsRecording(false);
      mediaRecorderRef.current?.stop(); // Останавливаем запись
    }
  };

  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current
      .interrupt()
      .catch((e) => {
        setDebug(e.message);
      });
  }

  async function endSession() {
    await avatar.current?.stopAvatar();
    setStream(undefined);
  }

  const handleChangeChatMode = useMemoizedFn(async (v) => {
    if (v === chatMode) {
      return;
    }
    if (v == "voice_mode") {
      startAudioRecording();
    }
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
  }, [mediaStream, stream]);

   return (
    <div className="w-full h-full flex flex-col gap-4">
      <Card className="h-full flex flex-col rounded-none md:rounded-lg">
        <CardBody className="flex-1 p-0 relative">
          {stream ? (
            <div className="h-full w-full flex justify-center items-center bg-black">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              >
                <track kind="captions" />
              </video>
              
              {/* Контролы звонка */}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                <Button
                  isIconOnly
                  className="bg-red-500 text-white h-14 w-14 rounded-full"
                  onPress={endSession}
                >
                  <PhoneDisconnect size={24} />
                </Button>
                <Button
                  isIconOnly
                  className="bg-yellow-500 text-white h-14 w-14 rounded-full"
                  onPress={handleInterrupt}
                >
                  <MicrophoneSlash size={24} />
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
                onValueChange={setText}
                placeholder="Type your message..."
                onKeyDown={(e) => e.key === "Enter" && handleSpeak()}
              />
              <Button
                isIconOnly
                color="primary"
                onPress={handleSpeak}
                disabled={isLoadingRepeat}
              >
                {isLoadingRepeat ? <Spinner size="sm" /> : <PaperPlaneRight size={20} />}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center">
              <Button
                className={`w-full max-w-[200px] h-12 ${
                  isRecording ? "bg-red-500" : "bg-primary"
                }`}
                onPress={handleRecordButtonClick}
              >
                {isRecording ? "Stop Recording" : "Start Recording"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* История чата */}
      <Card className="md:rounded-lg rounded-none">
        <div className="p-4">
          <h3 className="font-bold mb-2">Chat History</h3>
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {chatHistory.map((entry, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="text-sm font-medium text-primary">
                  You: {entry.user}
                </div>
                <div className="text-sm text-gray-600">
                  Avatar: {entry.response}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
