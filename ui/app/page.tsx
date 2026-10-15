import { Home } from "@/components/dashboard/home";
import { PageBody, Topbar } from "@/components/shell/topbar";

export default function HomePage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Home" }]} />
      <PageBody>
        <Home />
      </PageBody>
    </>
  );
}
