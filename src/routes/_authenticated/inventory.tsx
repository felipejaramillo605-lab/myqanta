import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/coming-soon";
import { ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: () => <ComingSoon icon={ShoppingCart} titleKey="nav.inventory" />,
});