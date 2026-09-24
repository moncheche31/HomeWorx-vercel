import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineError } from "@/components/feedback/InlineError";
import {
  listMaterialPricingProviderStatus,
  removeMaterialPricingProvider,
  saveMaterialPricingProvider,
  verifyMaterialPricingProvider,
} from "@/features/estimating/services/materialPricing.functions";
import type { MaterialPricingProviderStatus } from "@/domains/materialPricing/types";

/**
 * Live material pricing credentials.
 *
 * Keys are write-only: they are stored server-side and never read back into
 * the browser. With no key configured, estimates keep pricing materials from
 * the catalog exactly as they do today.
 */
export function MaterialPricingProvidersCard() {
  const { t } = useTranslation("settings");
  const qc = useQueryClient();
  const list = useServerFn(listMaterialPricingProviderStatus);
  const save = useServerFn(saveMaterialPricingProvider);
  const verify = useServerFn(verifyMaterialPricingProvider);
  const remove = useServerFn(removeMaterialPricingProvider);

  const [keys, setKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const providers = useQuery({
    queryKey: ["materialPricingProviders"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["materialPricingProviders"] });

  const saveMutation = useMutation({
    mutationFn: (vars: { providerType: string; apiKey: string }) => save({ data: vars }),
    onSuccess: async (_res, vars) => {
      setError(null);
      setKeys((prev) => ({ ...prev, [vars.providerType]: "" }));
      toast.success(t("materialPricing.saved"));
      await invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: (providerType: string) => verify({ data: { providerType } }),
    onSuccess: async (res) => {
      if (res.ok) toast.success(t("materialPricing.verifyOk"));
      else toast.error(res.message ?? t("materialPricing.verifyFailed"));
      await invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (providerType: string) => remove({ data: { providerType } }),
    onSuccess: async () => {
      toast.success(t("materialPricing.removed"));
      await invalidate();
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
  });

  const rows: MaterialPricingProviderStatus[] = providers.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZap className="h-4 w-4" aria-hidden />
          {t("materialPricing.title")}
        </CardTitle>
        <CardDescription>{t("materialPricing.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <InlineError message={error} /> : null}
        {rows.map((row) => (
          <div key={row.providerType} className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{row.displayName}</span>
              <Badge variant={row.isConfigured ? "default" : "secondary"}>
                {row.isConfigured
                  ? t("materialPricing.configured")
                  : t("materialPricing.notConfigured")}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`key-${row.providerType}`}>{t("materialPricing.apiKey")}</Label>
              <Input
                id={`key-${row.providerType}`}
                type="password"
                autoComplete="off"
                placeholder={
                  row.isConfigured
                    ? t("materialPricing.keyStored")
                    : t("materialPricing.keyPlaceholder")
                }
                value={keys[row.providerType] ?? ""}
                onChange={(e) =>
                  setKeys((prev) => ({ ...prev, [row.providerType]: e.target.value }))
                }
              />
            </div>

            {row.lastVerifiedAt ? (
              <p className="text-xs text-muted-foreground">
                {row.lastVerifyStatus === "ok"
                  ? t("materialPricing.lastVerifyOk", {
                      when: new Date(row.lastVerifiedAt).toLocaleString(),
                    })
                  : t("materialPricing.lastVerifyFailed", {
                      when: new Date(row.lastVerifiedAt).toLocaleString(),
                      reason: row.lastVerifyError ?? "",
                    })}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  saveMutation.isPending || (keys[row.providerType] ?? "").trim().length < 8
                }
                onClick={() =>
                  saveMutation.mutate({
                    providerType: row.providerType,
                    apiKey: (keys[row.providerType] ?? "").trim(),
                  })
                }
              >
                {t("materialPricing.saveKey")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!row.isConfigured || verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(row.providerType)}
              >
                {t("materialPricing.testConnection")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!row.isConfigured || removeMutation.isPending}
                onClick={() => removeMutation.mutate(row.providerType)}
              >
                {t("materialPricing.remove")}
              </Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t("materialPricing.fallbackNote")}</p>
      </CardContent>
    </Card>
  );
}
