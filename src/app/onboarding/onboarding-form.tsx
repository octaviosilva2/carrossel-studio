"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { validateImageFile } from "@/lib/image-upload";
import { uploadImageToBlob } from "@/lib/blob-upload";
import { completeOnboarding } from "@/lib/actions/settings";
import type { ClientSettings } from "@/lib/actions/settings-types";

interface OnboardingFormProps {
  initial: ClientSettings;
}

/**
 * Form de onboarding (primeiro acesso): avatar, nome e @handle. SEM campo de
 * tema — o tema so e escolhido na hora de criar cada carrossel (regra fixada
 * no CLAUDE.md do produto). Usa completeOnboarding (marca onboardingCompletedAt),
 * preservando `verified`/`theme` atuais do dono (o form nao os expoe). "Deixar
 * para depois" e "Concluir" levam ao Dashboard; so "Concluir" persiste.
 */
export function OnboardingForm({ initial }: OnboardingFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);

  const [avatarError, setAvatarError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.ok) {
      setAvatarError(validation.error);
      e.target.value = "";
      return;
    }

    setAvatarError("");
    setPendingAvatarFile(file);
    e.target.value = "";
  }

  async function handleCropConfirm() {
    if (!pendingAvatarFile) return;

    setIsUploading(true);
    const result = await uploadImageToBlob(pendingAvatarFile);
    setIsUploading(false);
    setPendingAvatarFile(null);

    if (result.ok) {
      setAvatarUrl(result.url);
    } else {
      setAvatarError(result.error);
    }
  }

  function handleCropCancel() {
    setPendingAvatarFile(null);
  }

  async function handleFinish() {
    setIsSaving(true);
    setSaveError("");
    try {
      // Preserva verified/theme atuais (nao editaveis aqui) — so nome/handle/avatar.
      await completeOnboarding({
        name,
        handle,
        avatarUrl,
        verified: initial.verified,
        theme: initial.theme,
      });
      router.push("/dashboard");
    } catch {
      setIsSaving(false);
      setSaveError("Não foi possível salvar. Confira os campos e tente de novo.");
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Configure sua identidade
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
        >
          Deixar para depois
        </Button>
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        Defina como sua identidade aparece nos carrosséis.
      </p>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => avatarInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {isUploading ? "Enviando…" : "Enviar imagem"}
          </Button>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-name">Nome</Label>
            <Input
              id="onboarding-name"
              value={name}
              placeholder="Ex.: Octavio Silva"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-handle">@handle</Label>
            <div className="flex items-center">
              <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                @
              </span>
              <Input
                id="onboarding-handle"
                className="rounded-l-none"
                value={handle}
                placeholder="octaviosilva"
                onChange={(e) => setHandle(e.target.value.replace(/@/g, ""))}
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O tema claro/escuro é escolhido na hora de criar cada carrossel.
        </p>
      </div>

      {saveError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard")}
          disabled={isSaving}
        >
          Deixar para depois
        </Button>
        <Button type="button" onClick={handleFinish} disabled={isSaving}>
          {isSaving ? "Salvando…" : "Concluir"}
        </Button>
      </div>

      <ImageCropDialog
        file={pendingAvatarFile}
        shape="circle"
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
        isBusy={isUploading}
      />
    </div>
  );
}
