import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reminders")({
  beforeLoad: () => { throw redirect({ to: "/agenda" }); },
  component: () => null,
});
