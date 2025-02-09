"use client";

import { useSearchParams } from "next/navigation";
import InteractiveAvatar from "@/components/InteractiveAvatar";

export default function App() {
  const searchParams = useSearchParams();
  const chat_id = searchParams.get("chatId");
  const avatar_id = searchParams.get("avatar_id");
  const avatar_voice_id = searchParams.get("avatar_voice_id");
  const assistant_id = searchParams.get("assistant_id");
  const language = searchParams.get("language") || "en"; // значение по умолчанию

  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="w-[900px] flex flex-col items-start justify-start gap-5 mx-auto pt-4 pb-20">
        <div className="w-full">
          <InteractiveAvatar
            avatar_id={avatar_id}
            avatar_voice_id={avatar_voice_id}
            assistant_id={assistant_id}
            language={language}
          />
        </div>
      </div>
    </div>
  );
}
