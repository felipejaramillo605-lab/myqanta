import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/habits")({
  beforeLoad: () => { throw redirect({ to: "/agenda" }); },
  component: () => null,
});