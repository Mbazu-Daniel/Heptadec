import { IconDots } from "@tabler/icons-react";
import {
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";

export function SourceMenu({
  className,
  onSettings,
  onRemove,
}: {
  className?: string;
  onSettings: () => void;
  onRemove: () => void;
}) {
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label="Source actions"
        title="Source actions"
        className={className}
      >
        <IconDots size={16} />
      </MenuTrigger>
      <MenuPortal>
        <MenuPositioner sideOffset={4} align="end">
          <MenuPopup>
            <MenuItem onClick={onSettings}>
              <span className="material-symbols-outlined text-[16px]">
                settings
              </span>
              Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onRemove} className="text-red">
              <span className="material-symbols-outlined text-[16px]">
                delete
              </span>
              Remove
            </MenuItem>
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </MenuRoot>
  );
}
