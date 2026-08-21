import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { globalSearch, type SearchHit } from "@/lib/search.functions";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const { data = [], isFetching } = useQuery({
    queryKey: ["global-search", term],
    queryFn: () => searchFn({ data: { q: term } }),
    enabled: open && term.length >= 2,
    staleTime: 15_000,
  });

  const groups = Array.from(new Set((data as SearchHit[]).map((h) => h.group)));

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Buscar"
        onClick={() => setOpen(true)}
        title="Buscar (⌘K)"
      >
        <Search className="size-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Buscar contactos, negocios, clientes, productos, tareas…"
        />
        <CommandList>
          <CommandEmpty>
            {term.length < 2
              ? "Escribe al menos 2 caracteres."
              : isFetching
                ? "Buscando…"
                : "Sin resultados."}
          </CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {(data as SearchHit[])
                .filter((h) => h.group === g)
                .map((h) => (
                  <CommandItem
                    key={h.id}
                    value={`${h.title} ${h.detail ?? ""} ${h.id}`}
                    onSelect={() => {
                      setOpen(false);
                      setQ("");
                      navigate({ to: h.href as never });
                    }}
                  >
                    <span className="truncate">{h.title}</span>
                    {h.detail && (
                      <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                        {h.detail}
                      </span>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
