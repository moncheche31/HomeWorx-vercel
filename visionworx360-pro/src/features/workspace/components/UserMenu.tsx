import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { LogOut, Settings, Building2, CreditCard, LifeBuoy, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { computeInitials } from "../utils/identity";

export function UserMenu() {
  const { t } = useTranslation(["workspace", "common", "billing", "support"]);
  const { signOut, status } = useAuth();
  const { profile } = useWorkspace();
  const label = profile.displayName;
  const initialsFallback = t("workspace:identity.initialsFallback", { defaultValue: "?" });
  const initials = computeInitials(label, initialsFallback);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("workspace:header.openMenu")}
          className="min-h-11 min-w-11 rounded-full p-0"
        >
          <Avatar className="size-9">
            {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
            <AvatarFallback
              className="bg-primary/10 text-sm font-semibold text-primary"
              data-testid="user-avatar-initials"
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-foreground-muted">
              {t("workspace:header.signedInAs")}
            </span>
            <span className="truncate text-sm font-medium text-foreground">{label}</span>
            {profile.email && (
              <span className="truncate text-xs text-foreground-muted">{profile.email}</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/profile">
            <UserIcon className="mr-2 size-4" aria-hidden />
            {t("workspace:nav.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/organization">
            <Building2 className="mr-2 size-4" aria-hidden />
            {t("workspace:nav.organization")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <Settings className="mr-2 size-4" aria-hidden />
            {t("workspace:nav.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/billing">
            <CreditCard className="mr-2 size-4" aria-hidden />
            {t("billing:title")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/support">
            <LifeBuoy className="mr-2 size-4" aria-hidden />
            {t("support:title")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={status === "signing_out"}
          onSelect={(e) => {
            e.preventDefault();
            void signOut();
          }}
        >
          <LogOut className="mr-2 size-4" aria-hidden />
          {t("common:actions.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
