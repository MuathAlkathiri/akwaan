"use client";

import { GameBoard } from "@/features/games";
import { RequireAuth } from "@/components/auth/require-auth";
import { useParams } from "next/navigation";

export default function GamePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!id) {
    return <div className="text-center py-8">لم يتم العثور على اللعبة</div>;
  }

  return (
    <RequireAuth>
      <GameBoard gameId={id} />
    </RequireAuth>
  );
}
