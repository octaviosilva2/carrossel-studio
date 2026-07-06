"use client";

import { useState, type FormEvent } from "react";
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
import {
  createClientMock,
  USAGE_PLACEHOLDER,
  type AdminClientRow,
} from "@/lib/mock-redesign";

interface AdminClientProps {
  initialClients: AdminClientRow[];
}

/**
 * Tela de administração de clientes (redesign). TUDO aqui é MOCK client-side —
 * não existe ainda, no backend, o conceito de "admin gerencia múltiplos
 * clientes" (schema atual é 1 `users` por login, sem papel nem multi-tenant).
 * TODO(integração pós-merge): trocar por listagem/criação/gestão reais quando
 * o backend expuser essas actions (ver src/lib/mock-redesign.ts).
 */
export function AdminClient({ initialClients }: AdminClientProps) {
  const [clients, setClients] = useState(initialClients);
  const [managing, setManaging] = useState<AdminClientRow | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    try {
      await createClientMock(email, password);
      // Mock: so acrescenta localmente — nao persiste (sem backend ainda).
      setClients((prev) => [
        ...prev,
        {
          id: `mock-${prev.length + 1}`,
          name: email.split("@")[0] ?? "Novo cliente",
          handle: (email.split("@")[0] ?? "novocliente").toLowerCase(),
          email,
          carouselsCount: 0,
          status: "ativo",
        },
      ]);
      setEmail("");
      setPassword("");
    } catch {
      setCreateError("Não foi possível criar o cliente. Tente novamente.");
    } finally {
      setIsCreating(false);
    }
  }

  function toggleStatus(id: string) {
    setClients((prev) =>
      prev.map((client) =>
        client.id === id
          ? {
              ...client,
              status: client.status === "ativo" ? "suspenso" : "ativo",
            }
          : client,
      ),
    );
    setManaging((prev) =>
      prev && prev.id === id
        ? { ...prev, status: prev.status === "ativo" ? "suspenso" : "ativo" }
        : prev,
    );
  }

  function removeClient(id: string) {
    setClients((prev) => prev.filter((client) => client.id !== id));
    setManaging(null);
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="gerar automática"
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
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  {client.name}{" "}
                  <span className="text-muted-foreground">@{client.handle}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.email}
                </TableCell>
                <TableCell>{client.carouselsCount}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      client.status === "ativo"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "border-transparent bg-muted text-muted-foreground"
                    }
                  >
                    {client.status}
                  </Badge>
                </TableCell>
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
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={managing !== null} onOpenChange={(open) => !open && setManaging(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar cliente</DialogTitle>
          </DialogHeader>

          {managing ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {managing.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium">{managing.name}</p>
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

              <DialogFooter className="sm:justify-start">
                <Button type="button" variant="outline" size="sm" disabled>
                  Redefinir senha
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleStatus(managing.id)}
                >
                  {managing.status === "ativo" ? "Suspender" : "Reativar"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="sm:ml-auto"
                  onClick={() => removeClient(managing.id)}
                >
                  Excluir cliente
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
