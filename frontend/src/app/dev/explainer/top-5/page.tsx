import { notFound } from "next/navigation";
import { Preview } from "../preview";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview mechanicKey="top-5" name="توب 5" />;
}
