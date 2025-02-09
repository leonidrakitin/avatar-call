"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import InteractiveAvatar from "@/components/InteractiveAvatar";

function AvatarWrapper() {
  const searchParams = useSearchParams();
  const chat_id = searchParams.get("chatId");
  const avatar_id = searchParams.get("avatar_id");
  const avatar_voice_id = searchParams.get("avatar_voice_id");
  const assistant_id = searchParams.get("assistant_id");
  const language = searchParams.get("language") || "en";

  return (
    <InteractiveAvatar
      avatar_id={avatar_id}
      avatar_voice_id={avatar_voice_id}
      assistant_id={assistant_id}
      language={language}
    />
  );
}

export default function App() {
  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="w-full flex-1 flex flex-col items-center justify-center md:pt-4 md:pb-20">
        <div className="w-full h-full md:max-w-[900px]">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><p>Loading...</p></div>}>
            <AvatarWrapper />
          </Suspense>
        </div>
      </div>
    </div>
  );
}