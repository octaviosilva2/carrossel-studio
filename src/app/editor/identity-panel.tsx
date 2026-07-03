"use client";

import { useRef, useState, type ChangeEvent, type Dispatch } from "react";
import { Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CarouselIdentity, EditorAction } from "@/lib/editor-state";
import { validateImageFile } from "@/lib/image-upload";
import { uploadImageToBlob } from "@/lib/blob-upload";

interface IdentityPanelProps {
  identity: CarouselIdentity;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Bloco de identidade do perfil (unica por carrossel): nome, handle, avatar e
 * selo verificado. Editada uma vez, reflete em todos os slides via o reducer.
 */
export function IdentityPanel({ identity, dispatch }: IdentityPanelProps) {
  // Erro de validacao/upload do avatar — estado LOCAL, inline (falha fechado).
  const [avatarError, setAvatarError] = useState<string>("");
  // Upload em voo: desabilita o botao e evita duplo envio.
  const [isUploading, setIsUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Handle: remove qualquer "@" no onChange (o <Slide> prefixa "@" na render).
  function handleHandleChange(e: ChangeEvent<HTMLInputElement>) {
    const stripped = e.target.value.replace(/@/g, "");
    dispatch({ type: "UPDATE_IDENTITY", patch: { handle: stripped } });
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cancelou o picker: no-op.
    if (!file) return;

    // Validacao client antecipada (mesma regra 6 MB/tipo). O wrapper reforca isso,
    // mas checar aqui evita mostrar "enviando" para um arquivo ja invalido.
    const validation = validateImageFile(file);
    if (!validation.ok) {
      // Rejeitado: mostra o erro e NAO despacha (avatar anterior permanece).
      setAvatarError(validation.error);
      e.target.value = "";
      return;
    }

    // Envia ao Vercel Blob (upload real, S3). Em sucesso grava a URL https; em
    // falha mostra erro inline e NAO altera o estado (avatar anterior permanece).
    setIsUploading(true);
    setAvatarError("");
    const result = await uploadImageToBlob(file);
    setIsUploading(false);
    // Permite reenviar o mesmo arquivo depois (senao o onChange nao dispara).
    e.target.value = "";

    if (result.ok) {
      dispatch({ type: "SET_AVATAR", avatarUrl: result.url });
    } else {
      setAvatarError(result.error);
    }
  }

  function handleRemoveAvatar() {
    dispatch({ type: "REMOVE_AVATAR" });
    setAvatarError("");
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Identidade do perfil</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Nome */}
        <div className="space-y-1.5">
          <Label htmlFor="identity-name">Nome</Label>
          <Input
            id="identity-name"
            value={identity.name}
            placeholder="Ex.: Octavio Silva"
            onChange={(e) =>
              dispatch({
                type: "UPDATE_IDENTITY",
                patch: { name: e.target.value },
              })
            }
          />
        </div>

        {/* Handle (sem "@") */}
        <div className="space-y-1.5">
          <Label htmlFor="identity-handle">Handle</Label>
          <div className="flex items-center">
            <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              @
            </span>
            <Input
              id="identity-handle"
              className="rounded-l-none"
              value={identity.handle}
              placeholder="octaviosilva"
              onChange={handleHandleChange}
            />
          </div>
        </div>

        {/* Avatar (upload + remover) */}
        <div className="space-y-1.5">
          <Label>Avatar</Label>
          <div className="flex items-center gap-3">
            {/* Preview pequeno do avatar atual (nunca vazio: default = placeholder) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={identity.avatarUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {isUploading ? "Enviando…" : "Trocar avatar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveAvatar}
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            </div>
            {/* Input nativo escondido; o Button acima e o gatilho visual. */}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleAvatarChange}
            />
          </div>
          {avatarError ? (
            <p className="text-sm text-destructive">{avatarError}</p>
          ) : null}
        </div>

        {/* Selo verificado (on/off) */}
        <div className="flex items-center justify-between">
          <Label htmlFor="identity-verified">Selo verificado</Label>
          <Switch
            id="identity-verified"
            checked={identity.verified}
            onCheckedChange={() => dispatch({ type: "TOGGLE_VERIFIED" })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
