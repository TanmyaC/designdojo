import { Suspense } from "react";
import NewInterview from "./NewInterview";
import { publicCatalog } from "@/lib/catalog";

/* Server component: reads questions/*.md at build time and hands the public fields to the picker. */
export default function Page() {
  return <Suspense><NewInterview library={publicCatalog()} /></Suspense>;
}
