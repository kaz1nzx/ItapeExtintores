import Workspace from "@/components/workspace";
import { demoStore } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default function Demo() {
  return (
    <Workspace
      initial={demoStore()}
      demo
      user={{ id: "demo", name: "Administrador", role: "admin" }}
    />
  );
}
