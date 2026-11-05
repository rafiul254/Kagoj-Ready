import { createCaseBudget } from "@/lib/agent/budget";
import { sameOrigin, safeResponse, clientIp } from "@/lib/http";
import { consumeRequest } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await consumeRequest(clientIp(request));
    return Response.json(
      { caseId: await createCaseBudget() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeResponse(error);
  }
}
