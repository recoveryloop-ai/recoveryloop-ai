import { AppShell } from "@/components/app-shell";
import { DemoLab } from "@/components/demo-lab";

export default function DemoPage() {
  return <AppShell active="/app/demo"><header className="workspace-header s7-header"><div><p className="eyebrow">Isolated judge experience</p><h1>Evidence challenge</h1><p>Change synthetic facts, watch the deterministic decision react, then reset without touching the provider ledger.</p></div><span className="status-pill">No public money actions</span></header><DemoLab /></AppShell>;
}
