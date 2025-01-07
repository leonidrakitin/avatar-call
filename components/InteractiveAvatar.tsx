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

export default function InteractiveAvatar() {

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [openaiAssistant, setOpenAIAssistant] = useState<OpenAIAssistant | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [avatarId, setAvatarId] = useState<string>("");
  const [language, setLanguage] = useState<string>("en");

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
    
    await assistant.initialize();
    setOpenAIAssistant(assistant);
    console.log(openaiAssistant);

    try {
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Low,
        avatarName: 'bb62535acf4145beb2619b5d5a3e8936',
        voice: {
          voiceId: 'ed7ab4c19eb74f949093d23beed89e6a',
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

        // Воспроизведение аудио для проверки
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();

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
            {user: "{...}", response: "Sorry, I couldn't process your voice input now. Please try later."},
          ]);
          await avatar.current?.speak({
            text: "Sorry, I couldn't process your voice input now. Please try later.",
            taskType: TaskType.REPEAT,
            taskMode: TaskMode.SYNC,
          });
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
    <div className="w-full flex flex-col gap-4">
      <Card>
        <CardBody className="h-[500px] flex flex-col justify-center items-center">
          {stream ? (
              <div className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden">
                <video
                    ref={mediaStream}
                    autoPlay
                    playsInline
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                >
                  <track kind="captions"/>
                </video>
                <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                  <Button
                      className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                      size="md"
                      variant="shadow"
                      onClick={handleInterrupt}
                  >
                    Interrupt task
                  </Button>
                  <Button
                      className="bg-gradient-to-tr from-indigo-500 to-indigo-300  text-white rounded-lg"
                      size="md"
                      variant="shadow"
                      onClick={endSession}
                  >
                    End session
                  </Button>
                </div>
              </div>
          ) : !isLoadingSession ? (
              <div className="h-full justify-center items-center flex flex-col gap-8 w-[500px] self-center">
                <div className="flex flex-col gap-2 w-full">
                  <p className="text-sm font-medium leading-none">
                    Custom Avatar ID (optional)
                  </p>
                  <Input
                      placeholder="Enter a custom avatar ID"
                      value={avatarId}
                      onChange={(e) => setAvatarId(e.target.value)}
                  />
                  <Select
                      label="Select language"
                      placeholder="Select language"
                      className="max-w-xs"
                      selectedKeys={[language]}
                      onChange={(e) => {
                        setLanguage(e.target.value);
                      }}
                  >
                    {STT_LANGUAGE_LIST.map((lang) => (
                        <SelectItem key={lang.key}>
                          {lang.label}
                        </SelectItem>
                    ))}
                  </Select>
                </div>
                <Button
                    className="bg-gradient-to-tr from-indigo-500 to-indigo-300 w-full text-white"
                    size="md"
                    variant="shadow"
                    onPress={startSession}
                >
                  Start session
                </Button>
              </div>
          ) : (
              <Spinner color="default" size="lg"/>
          )}
        </CardBody>
        <Divider/>
        <CardFooter className="flex flex-col gap-3 relative">
          <Tabs
              aria-label="Options"
              selectedKey={chatMode}
              onSelectionChange={(v) => {
                handleChangeChatMode(v);
              }}
          >
            <Tab key="text_mode" title="Text mode"/>
            <Tab key="voice_mode" title="Voice mode"/>
          </Tabs>
          {chatMode === "text_mode" ? (
              <div className="w-full flex relative">
                <InteractiveAvatarTextInput
                    disabled={!stream}
                    input={text}
                    label="Chat"
                    loading={isLoadingRepeat}
                    placeholder="Type something for the avatar to respond"
                    setInput={setText}
                    onSubmit={handleSpeak}
                />
                {text && (
                    <Chip className="absolute right-16 top-3">Listening</Chip>
                )}
              </div>
          ) : (
              <div className="w-full text-center">
                <Button
                    className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
                    size="md"
                    variant="shadow"
                    onClick={handleRecordButtonClick}
                >
                  {isRecording ? "Send" : "Talk"}
                </Button>
              </div>
          )}
        </CardFooter>
      </Card>
      <Card>
        <div className="h-auto w-full p-4 flex flex-col rounded-lg shadow-md">
          <h3 className="text-xl font-bold mb-4 text-center">Chat History</h3>
          <div className="text-sm font-medium max-h-64 overflow-y-auto space-y-4">
            {chatHistory.length === 0 ? (
                <div className="text-center text-blue-600 font-medium">
                  Nothing to display
                </div>
            ) : (
                chatHistory.map((entry, index) => (
                    <div key={index} className="flex flex-col">
                      <div className="text-right text-blue-1000 font-medium">
                        {entry.user}
                        </div>
                      <div className="text-left text-blue-600 font-medium">
                        {entry.response}
                      </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </Card>

      <p className="font-mono text-right">
        <span className="font-bold">Console:</span>
        <br/>
        {debug}
      </p>
    </div>
  );
}
