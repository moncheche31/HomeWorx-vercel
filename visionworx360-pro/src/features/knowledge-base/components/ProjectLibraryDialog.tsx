import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeBaseBrowser } from "./KnowledgeBaseBrowser";
import { AssemblyTemplateList } from "./AssemblyTemplateList";

/**
 * Project-side entry point into the Knowledge Base: browse the seeded library
 * or drop a whole multi-trade template into the project's scope.
 */
export function ProjectLibraryDialog({
  open, onOpenChange, projectId, roomId = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  roomId?: string | null;
}) {
  const { t } = useTranslation("knowledge-base");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("page.title")}</DialogTitle>
          <DialogDescription>{t("page.subtitle")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="templates" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full">
            <TabsTrigger className="min-h-11 flex-1" value="templates">{t("tabs.templates")}</TabsTrigger>
            <TabsTrigger className="min-h-11 flex-1" value="library">{t("tabs.library")}</TabsTrigger>
            <TabsTrigger className="min-h-11 flex-1" value="favorites">{t("tabs.favorites")}</TabsTrigger>
          </TabsList>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="templates">
              <AssemblyTemplateList
                projectId={projectId}
                roomId={roomId}
                onApplied={() => onOpenChange(false)}
              />
            </TabsContent>
            <TabsContent value="library">
              <KnowledgeBaseBrowser scope="library" />
            </TabsContent>
            <TabsContent value="favorites">
              <KnowledgeBaseBrowser scope="favorites" />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
