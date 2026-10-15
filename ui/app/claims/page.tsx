import { Suspense } from "react";
import { ClaimsList } from "@/components/claims-list";
import { PageBody, Topbar } from "@/components/shell/topbar";

export default function ClaimsPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Claims" }]} />
      <PageBody>
        <Suspense>
          <ClaimsList />
        </Suspense>
      </PageBody>
    </>
  );
}
