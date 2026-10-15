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

/**
 * Everything a source can be asked for from the list, kept off the page that
 * reads it: a source you are querying is not a source you are reconfiguring.
 */
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
