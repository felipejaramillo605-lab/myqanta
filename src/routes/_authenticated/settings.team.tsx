import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/team")({
  beforeLoad: () => { throw redirect({ to: "/team" }); },
  component: () => null,
});
