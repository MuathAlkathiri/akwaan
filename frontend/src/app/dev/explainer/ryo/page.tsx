import { notFound } from "next/navigation";
import { Preview } from "../preview";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview mechanicKey="read-your-opponent" name="اقرأ خصمك" />;
}
