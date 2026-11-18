import Home from "./Home";
import { publicCatalog } from "@/lib/catalog";

/* Server component: picks the featured catalog questions for "Start with a classic". */
export default function Page() {
  const all = publicCatalog();
  const featured = all.filter((q) => q.featured);
  return <Home featured={(featured.length ? featured : all).slice(0, 3)} />;
}
