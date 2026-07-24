import { Button } from "@/components/ui/button";

export function TeamAnswerButton({
  name,
  score,
  disabled,
  onClick,
}: {
  name: string;
  score: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className="h-auto min-h-24 flex-col gap-1 rounded-3xl text-xl"
    >
      <span>{name}</span>
      <span className="text-sm opacity-80">{score} نقطة</span>
    </Button>
  );
}
