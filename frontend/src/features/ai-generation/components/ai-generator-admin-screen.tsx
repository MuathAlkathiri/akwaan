import { AIGenerator } from "./ai-generator";
export function AiGeneratorAdminScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">مولد الأسئلة بالذكاء الاصطناعي</h1>
      <AIGenerator />
    </div>
  );
}
