import { useTranslation } from "react-i18next";
import { CompactBrand } from "@/components/brand/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { NotificationsPanel } from "./NotificationsPanel";
import { UserMenu } from "./UserMenu";
import { useWorkspace } from "../providers/WorkspaceProvider";

export function AppTopBar() {
  const { organization, profile } = useWorkspace();
  const { t } = useTranslation("workspace");

  return (
    <header data-app-chrome className="safe-top sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 py-1 backdrop-blur sm:gap-3 sm:px-6">
      <div className="min-w-0 shrink md:hidden">
        <CompactBrand />
      </div>
      <div className="hidden min-w-0 flex-1 md:block">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {profile.displayName}
          </span>
          <span className="hidden text-foreground-muted sm:inline">·</span>
          <span className="hidden truncate text-sm text-foreground-muted sm:inline">
            {organization?.organizationName ?? t("organization.emptyState.title")}
          </span>
        </div>
      </div>
      {/*
        Top bar controls stay at a fixed 44px touch target so text scaling and
        Spacious density never push the header into horizontal overflow.
      */}
      <div className="ml-auto flex shrink-0 items-center gap-1 [&_button]:min-h-[44px] [&_button]:min-w-[44px] [&_button]:px-2 sm:gap-2">
        <LanguageSwitcher variant="compact" />
        <NotificationsPanel />
        <UserMenu />
      </div>
    </header>
  );
}
