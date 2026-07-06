"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCarousel } from "@/lib/actions/carousels";

interface NewCarouselButtonProps {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Omitido = so o icone (usado na sidebar recolhida). */
  label?: string;
}

/**
 * Botao "Novo carrossel": abre um modal pedindo o titulo antes de criar (fluxo
 * do mockup). createCarousel() (action real, inalterada) sempre grava o titulo
 * default no banco; o titulo escolhido aqui viaja na URL (?title=) e o editor
 * o aplica no estado inicial — o autosave (debounce) persiste de verdade pouco
 * depois, sem precisar mudar o contrato de createCarousel().
 */
export function NewCarouselButton({
  variant = "default",
  size,
  className,
  label = "Novo carrossel",
}: NewCarouselButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const { id } = await createCarousel();
      const trimmed = title.trim();
      setOpen(false);
      setTitle("");
      router.push(
        trimmed
          ? `/editor?id=${id}&title=${encodeURIComponent(trimmed)}`
          : `/editor?id=${id}`,
      );
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTitle("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          title="Novo carrossel"
        >
          <Plus className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo carrossel</DialogTitle>
          <DialogDescription>
            Dê um título para começar. Você pode renomear depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-carousel-title">Título</Label>
          <Input
            id="new-carousel-title"
            value={title}
            autoFocus
            placeholder="Ex.: 5 hábitos de produtividade"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isPending) handleConfirm();
            }}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
