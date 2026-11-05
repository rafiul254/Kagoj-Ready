import Preparation from "@/components/Preparation";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sample?: string }>;
}) {
  return <Preparation sampleEntry={(await searchParams).sample === "1"} />;
}
