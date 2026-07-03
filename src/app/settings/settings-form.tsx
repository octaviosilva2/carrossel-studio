"use client";

import { useRef, useState, type ChangeEvent } from "react";
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
import { DEFAULT_AVATAR_DATA_URL } from "@/lib/editor-state";
import { validateImageFile } from "@/lib/image-upload";
import { uploadImageToBlob } from "@/lib/blob-upload";
import { updateClientSettings } from "@/lib/actions/settings";
import type { ClientSettings } from "@/lib/actions/settings-types";

interface SettingsFormProps {
  initial: ClientSettings;
}

// Estado do botao Salvar (mesma linguagem visual da S3/S5).
type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Form da identidade padrao da marca. Estado LOCAL (controlado) espelhando o
 * `initial` vindo do servidor; salva chamando a server action updateClientSettings
 * (que revalida com Zod + filtra por ownerId). Reusa o upload de avatar do Blob e a
 * validacao de imagem (tipo + 6 MB) — mesmo caminho do IdentityPanel do editor.
 */
export function SettingsForm({ initial }: SettingsFormProps) {
  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [verified, setVerified] = useState(initial.verified);
  const [theme, setTheme] = useState<ClientSettings["theme"]>(initial.theme);

  const [avatarError, setAvatarError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");

  // Handle: remove qualquer "@" (o slide prefixa "@" na render; a borda reforca).
  function handleHandleChange(e: ChangeEvent<HTMLInputElement>) {
    setHandle(e.target.value.replace(/@/g, ""));
    setSaveState("idle");
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validacao client antecipada (mesma regra 6 MB/tipo) antes de mostrar "enviando".
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setAvatarError(validation.error);
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setAvatarError("");
    const result = await uploadImageToBlob(file);
    setIsUploading(false);
    e.target.value = ""; // permite reenviar o mesmo arquivo

    if (result.ok) {
      setAvatarUrl(result.url);
      setSaveState("idle");
    } else {
      setAvatarError(result.error);
    }
  }

  function handleRemoveAvatar() {
    setAvatarUrl(DEFAULT_AVATAR_DATA_URL);
    setAvatarError("");
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    setSaveError("");
    try {
      await updateClientSettings({ name, handle, avatarUrl, verified, theme });
      setSaveState("saved");
    } catch {
      // Nunca vaza detalhe tecnico — mensagem generica (a borda ja validou/rejeitou).
      setSaveState("error");
      setSaveError("Não foi possível salvar. Confira os campos e tente de novo.");
    }
  }

  const isBusy = saveState === "saving" || isUploading;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Identidade do perfil</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Nome */}
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Nome</Label>
          <Input
            id="settings-name"
            value={name}
            placeholder="Ex.: Octavio Silva"
            onChange={(e) => {
              setName(e.target.value);
              setSaveState("idle");
            }}
          />
        </div>

        {/* Handle (sem "@") */}
        <div className="space-y-1.5">
          <Label htmlFor="settings-handle">Handle</Label>
          <div className="flex items-center">
            <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              @
            </span>
            <Input
              id="settings-handle"
              className="rounded-l-none"
              value={handle}
              placeholder="octaviosilva"
              onChange={handleHandleChange}
            />
          </div>
        </div>

        {/* Avatar (upload + remover) */}
        <div className="space-y-1.5">
          <Label>Avatar</Label>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
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
          <Label htmlFor="settings-verified">Selo verificado</Label>
          <Switch
            id="settings-verified"
            checked={verified}
            onCheckedChange={(v) => {
              setVerified(v);
              setSaveState("idle");
            }}
          />
        </div>

        {/* Tema padrao (light/dark) */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="settings-theme">Tema padrão escuro</Label>
            <p className="text-sm text-muted-foreground">
              Define o tema inicial dos carrosséis novos.
            </p>
          </div>
          <Switch
            id="settings-theme"
            checked={theme === "dark"}
            onCheckedChange={(v) => {
              setTheme(v ? "dark" : "light");
              setSaveState("idle");
            }}
          />
        </div>

        {/* Salvar + estados (aria-live para leitor de tela) */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="button" onClick={handleSave} disabled={isBusy}>
            {saveState === "saving" ? "Salvando…" : "Salvar"}
          </Button>
          <span aria-live="polite" className="text-sm">
            {saveState === "saved" ? (
              <span className="text-muted-foreground">Salvo.</span>
            ) : saveState === "error" ? (
              <span className="text-destructive">{saveError}</span>
            ) : null}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
