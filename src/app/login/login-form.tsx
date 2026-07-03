"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/actions/auth";

/**
 * Botao de submit com estado pending derivado do form (useFormStatus). Fica num
 * componente separado porque useFormStatus so enxerga o <form> ancestral.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

/**
 * Formulario de login (Client). useActionState liga o form a signInAction: em
 * sucesso a action redireciona (nao retorna); em falha devolve `{ error }` generico
 * renderizado inline. Campos name="email"/name="password" batem com o esperado
 * pela action (FormData). Acessivel: label associado, erro com role=alert.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(signInAction, undefined);
  const hasError = Boolean(state?.error);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={hasError}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={hasError}
          aria-describedby={hasError ? "login-error" : undefined}
        />
      </div>

      {hasError ? (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {state?.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
