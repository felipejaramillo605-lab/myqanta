import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
import { Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/habits")({
  component: () => <ComingSoon icon={Repeat} titleKey="nav.productivity" />,
});