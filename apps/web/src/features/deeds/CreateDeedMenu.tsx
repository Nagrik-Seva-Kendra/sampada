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
      {
        onSuccess: (item) => {
          const url = `/deeds/${type}/edit/${item.id}?new=1`;
          // The draft has to exist before there's an editor URL to open, and by
          // the time it does, mobile browsers have expired the tap's user
          // activation and block the new tab. A blocked window.open returns
          // null, which on a phone would otherwise leave the tap looking dead —
          // so fall back to this tab, where the editor is a full page anyway.
          const tab = window.open(url, "_blank");
          if (!tab) window.location.assign(url);
        },
      },
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
