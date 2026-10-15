import { Payouts } from "@/components/payouts";
import { PageBody, Topbar } from "@/components/shell/topbar";

export default function PayoutsPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Payouts" }]} />
      <PageBody>
        <Payouts />
      </PageBody>
    </>
  );
}
