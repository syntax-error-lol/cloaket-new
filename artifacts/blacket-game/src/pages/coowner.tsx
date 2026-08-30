import { OwnerControlPanel } from "./owner";

// The co-owner panel is the owner panel minus two owner-only powers (the
// Market Pack Order card and re-enabling the 1k Pack). Both differences are
// handled inside OwnerControlPanel via variant="coowner"; the server enforces
// them too, so this is UI polish rather than the security boundary.
export default function CoownerPage() {
  return <OwnerControlPanel variant="coowner" />;
}
