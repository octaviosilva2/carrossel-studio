"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClientAccount, deleteClientAccount } from "@/lib/actions/admin";
import type { AdminClientListItem } from "@/lib/actions/admin-types";
import { USAGE_PLACEHOLDER } from "@/lib/mock-redesign";

interface AdminClientProps {
  initialClients: AdminClientListItem[];
}

/**
 * Tela de administração de clientes. Criar/listar/excluir usam as actions reais
 * (src/lib/actions/admin.ts). Sem "suspender" (não existe status no schema) e
 * sem uso/custo real (placeholder — não há tabela de tracking de tokens ainda).
 */
export function AdminClient({ initialClients }: AdminClientProps) {
  const router = useRouter();
  const [managing, setManaging] = useState<AdminClientListItem | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    try {
      await createClientAccount({ email, password });
      setEmail("");
      setPassword("");
      router.refresh();
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar o cliente. Tente novamente.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteClientAccount(id);
      setManaging(null);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o cliente. Tente novamente.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4 p-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Criar novo cliente</CardTitle>
          <p className="text-xs text-muted-foreground">
            Nome, handle, avatar e tema o cliente define no primeiro login
            (onboarding).
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="admin-new-email">E-mail</Label>
                <Input
                  id="admin-new-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="novo@cliente.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-new-password">Senha provisória</Label>
                <Input
                  id="admin-new-password"
                  type="text"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mín. 8 caracteres"
                />
              </div>
            </div>
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isCreating}>
                <Plus className="h-4 w-4" />
                {isCreating ? "Criando…" : "Criar cliente"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clientes</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Carrosséis</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum cliente ainda.
                </TableCell>
              </TableRow>
            ) : (
              initialClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    {client.name || (
                      <span className="text-muted-foreground italic">
                        (onboarding pendente)
                      </span>
                    )}{" "}
                    {client.handle ? (
                      <span className="text-muted-foreground">@{client.handle}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email}
                  </TableCell>
                  <TableCell>{client.carouselCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setManaging(client)}
                    >
                      Gerenciar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={managing !== null}
        onOpenChange={(open) => !open && setManaging(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar cliente</DialogTitle>
          </DialogHeader>

          {managing ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(managing.name || managing.email).charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {managing.name || managing.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{managing.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/60 p-3.5">
                  <p className="text-xs text-muted-foreground">Tokens este mês</p>
                  <p className="mt-1 text-xl font-bold">{USAGE_PLACEHOLDER}</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3.5">
                  <p className="text-xs text-muted-foreground">Custo estimado</p>
                  <p className="mt-1 text-xl font-bold">{USAGE_PLACEHOLDER}</p>
                </div>
              </div>

              {deleteError ? (
                <p className="text-sm text-destructive">{deleteError}</p>
              ) : null}

              <DialogFooter className="sm:justify-start">
                <Button type="button" variant="outline" size="sm" disabled>
                  Redefinir senha
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="sm:ml-auto"
                  disabled={isDeleting}
                  onClick={() => handleDelete(managing.id)}
                >
                  {isDeleting ? "Excluindo…" : "Excluir cliente"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
