import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getSupportContact } from "@/lib/config/supportContact";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appConfig } from "@/lib/config/env";
import { submitSupportRequest } from "../services/support.functions";

type Category = "problem" | "question" | "feedback";
type Contact = "email" | "phone" | "none";

/** In-app support entry: optional description, contact preference, safe diagnostics. */
export function SupportPage({ referenceId }: { referenceId?: string }) {
  const { t, i18n } = useTranslation(["support", "common"]);
  const supportContact = getSupportContact();
  const submit = useServerFn(submitSupportRequest);
  const previousRoute = useRouterState({ select: (s) => s.location.pathname });

  const [category, setCategory] = useState<Category>(referenceId ? "problem" : "question");
  const [contactPreference, setContactPreference] = useState<Contact>("email");
  const [contactValue, setContactValue] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await submit({
        data: {
          category,
          message: message.trim() || undefined,
          contactPreference,
          contactValue: contactValue.trim() || undefined,
          referenceId,
          route: previousRoute,
          appVersion: appConfig.version,
          locale: i18n.language,
          occurredAt: new Date().toISOString(),
        },
      });
      setSent(result.referenceId);
    } catch {
      setError(t("errors.submit"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-(--density-gap)">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("description")}</p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="size-4" aria-hidden />
            {t("form.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-base font-medium text-foreground">{t("sent.title")}</p>
              <p className="mt-1 text-sm text-foreground-muted">
                {t("sent.body", { reference: sent })}
              </p>
            </div>
          ) : (
            <>
              {referenceId ? (
                <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
                  {t("form.referenceAttached", { reference: referenceId })}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label>{t("form.category")}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger className="w-full text-base sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="problem">{t("category.problem")}</SelectItem>
                    <SelectItem value="question">{t("category.question")}</SelectItem>
                    <SelectItem value="feedback">{t("category.feedback")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-message">{t("form.message")}</Label>
                <Textarea
                  id="support-message"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("form.messagePlaceholder")}
                  className="text-base sm:text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("form.contactPreference")}</Label>
                  <Select
                    value={contactPreference}
                    onValueChange={(v) => setContactPreference(v as Contact)}
                  >
                    <SelectTrigger className="w-full text-base sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">{t("contact.email")}</SelectItem>
                      <SelectItem value="phone">{t("contact.phone")}</SelectItem>
                      <SelectItem value="none">{t("contact.none")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {contactPreference !== "none" ? (
                  <div className="space-y-2">
                    <Label htmlFor="support-contact">{t("form.contactValue")}</Label>
                    <Input
                      id="support-contact"
                      value={contactValue}
                      onChange={(e) => setContactValue(e.target.value)}
                      className="text-base sm:text-sm"
                    />
                  </div>
                ) : null}
              </div>

              {error ? <p className="text-sm text-danger">{error}</p> : null}

              <Button
                className="min-h-(--control-min-h) w-full text-base sm:w-auto sm:text-sm"
                disabled={busy}
                onClick={() => void onSubmit()}
              >
                {t("form.submit")}
              </Button>
              <p className="text-xs text-foreground-muted">{t("form.privacyNote")}</p>
              {supportContact ? (
                <p className="text-xs text-foreground-muted">
                  {t("form.directContact", { contact: supportContact })}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
