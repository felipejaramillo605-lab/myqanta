import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance")({
  component: () => <ComingSoon icon={Wallet} titleKey="nav.finance" />,
});