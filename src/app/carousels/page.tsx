import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Settings, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-guard";
import { createCarousel, listCarousels } from "@/lib/actions/carousels";
import { signOutAction } from "@/lib/actions/auth";
import { CarouselList } from "./carousel-list";

// Nao cachear: a lista reflete o estado persistido mais recente do dono.
export const dynamic = "force-dynamic";

/**
 * Server action de criacao a partir de <form>. createCarousel() retorna apenas o
 * id; aqui redirecionamos para o editor do novo carrossel. `redirect()` lanca —
 * roda fora do try. Definida como action inline (so esta pagina a usa).
 */
async function createCarouselAction(): Promise<void> {
  "use server";
  const { id } = await createCarousel();
  redirect(`/editor?id=${id}`);
}

/**
 * Lista de carrosseis do dono (S3). Server Component: requireUser() barra deslogado
 * (-> /login) e listCarousels() traz somente os do dono. Botao "Novo carrossel"
 * cria e abre o editor; botao "Sair" encerra a sessao. Vazio -> CTA para criar.
 */
export default async function CarouselsPage() {
  await requireUser();
  const carousels = await listCarousels();

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Meus carrosséis
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra um carrossel para continuar ou crie um novo.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Configuracoes: identidade padrao da marca (S6). */}
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
            </Button>

            {/* Gerar com IA: leva a tela de intencao (Porta A, S5). */}
            <Button asChild variant="outline" size="sm">
              <Link href="/generate">
                <Sparkles className="h-4 w-4" />
                Gerar com IA
              </Link>
            </Button>

            {/* Novo carrossel: cria no servidor e abre o editor. */}
            <form action={createCarouselAction}>
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" />
                Novo carrossel
              </Button>
            </form>

            {/* Sair: encerra a sessao (limpa o cookie) e volta ao login. */}
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </header>

        {carousels.length === 0 ? (
          // Estado vazio: CTA para criar o primeiro carrossel.
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Você ainda não tem carrosséis.
            </p>
            <form action={createCarouselAction} className="mt-4">
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Criar meu primeiro carrossel
              </Button>
            </form>
          </div>
        ) : (
          <CarouselList carousels={carousels} />
        )}
      </div>
    </main>
  );
}
