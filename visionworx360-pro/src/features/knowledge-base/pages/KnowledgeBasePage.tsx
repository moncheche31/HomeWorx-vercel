import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeBaseBrowser } from "../components/KnowledgeBaseBrowser";
import { ServiceTaskBrowser } from "../components/ServiceTaskBrowser";
import { AssemblyTemplateList } from "../components/AssemblyTemplateList";
import { CreateAssemblyDialog } from "../components/CreateAssemblyDialog";
import { useLibraryVersionsQuery } from "../hooks/useKnowledgeBase";

/** Company-wide estimating library: seeded assemblies, favorites and templates. */
export function KnowledgeBasePage() {
  const { t } = useTranslation("knowledge-base");
  const [createOpen, setCreateOpen] = useState(false);
  const versions = useLibraryVersionsQuery();
  const current = versions.data?.find((v) => v.isCurrent);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground">{t("page.title")}</h1>
          {current && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {t("page.version", { version: current.version })}
            </Badge>
          )}
        </div>
        <p className="text-sm text-foreground-muted">{t("page.subtitle")}</p>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {t("actions.newItem")}
        </Button>
      </header>

      <Tabs defaultValue="library">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger className="min-h-11 flex-1" value="library">{t("tabs.library")}</TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1" value="service">{t("tabs.serviceTasks")}</TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1" value="favorites">{t("tabs.favorites")}</TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1" value="mine">{t("tabs.mine")}</TabsTrigger>
          <TabsTrigger className="min-h-11 flex-1" value="templates">{t("tabs.templates")}</TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-4">
          <KnowledgeBaseBrowser scope="library" />
        </TabsContent>
        <TabsContent value="service" className="mt-4">
          <ServiceTaskBrowser />
        </TabsContent>
        <TabsContent value="favorites" className="mt-4">
          <KnowledgeBaseBrowser scope="favorites" />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <KnowledgeBaseBrowser scope="mine" />
        </TabsContent>
        <TabsContent value="templates" className="mt-4 space-y-3">
          <p className="text-sm text-foreground-muted">{t("templates.subtitle")}</p>
          <AssemblyTemplateList />
        </TabsContent>
      </Tabs>

      <CreateAssemblyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
