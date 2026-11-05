import { notFound } from "next/navigation";
import Lab from "@/components/Lab";
import { labEnabled } from "@/lib/http";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!labEnabled()) notFound();
  return (
    <Lab
      configured={Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL,
      )}
    />
  );
}
