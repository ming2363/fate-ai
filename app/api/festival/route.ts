import { todayFestivalTheme } from "@/lib/server/festival";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(todayFestivalTheme(), { headers: { "Cache-Control": "no-store" } });
}
