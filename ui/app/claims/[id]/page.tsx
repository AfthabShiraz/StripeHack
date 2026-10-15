import { notFound } from "next/navigation";
import { ClaimView } from "@/components/claim/claim-view";
import { CLAIMS, getClaim } from "@/lib/data";

export function generateStaticParams() {
  return CLAIMS.map((c) => ({ id: c.id }));
}

export default async function ClaimPage(props: PageProps<"/claims/[id]">) {
  const { id } = await props.params;
  if (!getClaim(id)) notFound();
  return <ClaimView id={id} />;
}
