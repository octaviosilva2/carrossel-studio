"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Trash2, TriangleAlert, Upload } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { DEFAULT_AVATAR_DATA_URL } from "@/lib/editor-state";
import { validateImageFile } from "@/lib/image-upload";
import { uploadImageToBlob } from "@/lib/blob-upload";
import { changePassword, updateClientSettings } from "@/lib/actions/settings";
import type { ClientSettings } from "@/lib/actions/settings-types";

interface SettingsFormProps {
  initial: ClientSettings;
  userEmail: string;
  initialTab: "identity" | "account";
  /** null = onboarding ainda nao concluido (client.onboardingCompletedAt no banco). */
  onboardingCompletedAt: string | null;
}

// Estado do botao Salvar (mesma linguagem visual da S3/S5).
type SaveState = "idle" | "saving" | "saved" | "error";
type PasswordState = "idle" | "saving" | "saved" | "error";

/**
 * Form de Configurações com abas Identidade/Conta (redesign). Identidade
 * mantem a mesma logica de sempre (updateClientSettings real); Conta mostra o
 * e-mail (read-only) e troca de senha (changePassword real).
 */
export function SettingsForm({
  initial,
  userEmail,
  initialTab,
  onboardingCompletedAt,
}: SettingsFormProps) {
  const [tab, setTab] = useState<"identity" | "account">(initialTab);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(onboardingCompletedAt !== null);

  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [verified, setVerified] = useState(initial.verified);
  const [theme, setTheme] = useState<ClientSettings["theme"]>(initial.theme);

  const [avatarError, setAvatarError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordState, setPasswordState] = useState<PasswordState>("idle");
  const [passwordError, setPasswordError] = useState("");

  // Handle: remove qualquer "@" (o slide prefixa "@" na render; a borda reforca).
  function handleHandleChange(e: ChangeEvent<HTMLInputElement>) {
    setHandle(e.target.value.replace(/@/g, ""));
    setSaveState("idle");
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validacao client antecipada (mesma regra 6 MB/tipo) antes de abrir o ajuste.
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

  /** Confirmado no modal de ajuste (visual): segue com o upload REAL. */
  async function handleCropConfirm() {
    if (!pendingAvatarFile) return;

    setIsUploading(true);
    const result = await uploadImageToBlob(pendingAvatarFile);
    setIsUploading(false);
    setPendingAvatarFile(null);

    if (result.ok) {
      setAvatarUrl(result.url);
      setSaveState("idle");
    } else {
      setAvatarError(result.error);
    }
  }

  function handleCropCancel() {
    setPendingAvatarFile(null);
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
      setOnboardingDone(true);
    } catch {
      // Nunca vaza detalhe tecnico — mensagem generica (a borda ja validou/rejeitou).
      setSaveState("error");
      setSaveError("Não foi possível salvar. Confira os campos e tente de novo.");
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordState("saving");
    setPasswordError("");
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordState("saved");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordState("error");
      setPasswordError(
        err instanceof Error
          ? err.message
          : "Não foi possível trocar a senha. Tente novamente.",
      );
    }
  }

  const isBusy = saveState === "saving" || isUploading;
  const showOnboardingBanner = !onboardingDone && !bannerDismissed;

  return (
    <div className="space-y-4">
      {showOnboardingBanner ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Complete seu perfil
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300/80">
              Você pulou o onboarding. Defina avatar e handle.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setBannerDismissed(true)}
          >
            Dispensar
          </Button>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "identity" | "account")}>
        <TabsList>
          <TabsTrigger value="identity">Identidade</TabsTrigger>
          <TabsTrigger value="account">Conta</TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
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
                  {saveState === "saving" ? "Salvando…" : "Salvar alterações"}
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
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="settings-email">E-mail</Label>
                <Input id="settings-email" value={userEmail} readOnly disabled />
              </div>

              <form
                onSubmit={handleChangePassword}
                className="space-y-3 border-t border-border pt-4"
              >
                <p className="text-sm font-medium">Trocar senha</p>
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">Senha atual</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={passwordState === "saving"}
                  >
                    {passwordState === "saving" ? "Salvando…" : "Trocar senha"}
                  </Button>
                  <span aria-live="polite" className="text-sm">
                    {passwordState === "saved" ? (
                      <span className="text-muted-foreground">Senha alterada.</span>
                    ) : passwordState === "error" ? (
                      <span className="text-destructive">{passwordError}</span>
                    ) : null}
                  </span>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
