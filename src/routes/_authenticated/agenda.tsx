import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agenda")({
  component: () => <ComingSoon icon={Calendar} titleKey="nav.agenda" />,
});