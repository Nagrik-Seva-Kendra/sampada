import type { CSSProperties } from "react";
import { FilePlus2 } from "lucide-react";
import { DeedType } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { findDeed } from "./deedData";
import { useCreateSampleDeed } from "./useSampleDeeds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * "Create a new deed" — pick a type, opens a blank draft in the full-page
 * editor (new tab). Shared by AllDeedsPage's toolbar and the dashboard
 * Sidebar's quick action, so there's exactly one create flow in the app.
 */
export function CreateDeedMenu({
  triggerClassName = "btn-calc",
  triggerStyle,
  triggerLabel,
}: {
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  triggerLabel?: string;
}) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const create = useCreateSampleDeed();

  function onCreate(type: DeedType) {
    create.mutate(
      { type, title: t("deedsUntitledTitle"), content: "" },
      { onSuccess: (item) => window.open(`/deeds/${type}/edit/${item.id}?new=1`, "_blank") },
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, ...triggerStyle }}
        >
          <FilePlus2 size={17} strokeWidth={2.2} />
          {triggerLabel ?? t("deedsCreateBtn")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("deedsCreateChooseType")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DeedType.options.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => onCreate(type)}>
            {findDeed(type)?.name[lang] ?? type}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
