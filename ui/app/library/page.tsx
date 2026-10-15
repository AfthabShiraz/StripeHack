import { Library } from "@/components/library";
import { PageBody, Topbar } from "@/components/shell/topbar";

export default function LibraryPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "Policy library" }]} />
      <PageBody>
        <Library />
      </PageBody>
    </>
  );
}
