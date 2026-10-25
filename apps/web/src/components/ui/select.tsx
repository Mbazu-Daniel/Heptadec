import * as React from "react";
import { Combobox } from "@base-ui-components/react/combobox";
import {
  IconChevronDown,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface ISelectOption {
  value: string;
  label: string;
}

interface ISelectProps {
  options: ISelectOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  filterable?: boolean;
  clearable?: boolean;
  className?: string;
}

const SELECT_TRIGGER_CLASSNAME =
  "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25";

const SELECT_INPUT_CLASSNAME =
  "h-7 w-full rounded-md border-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none disabled:cursor-not-allowed disabled:opacity-50";

const SELECT_VALUE_CLASSNAME =
  "flex items-center gap-1.5 text-sm text-foreground truncate";

const SELECT_PLACEHOLDER_CLASSNAME = "text-muted-foreground/60";

const SELECT_LIST_CLASSNAME =
  "max-h-60 overflow-y-auto border border-border bg-background p-1 text-sm text-foreground shadow-lg w-[var(--anchor-width)]";

const SELECT_ITEM_CLASSNAME =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 data-[selected=true]:bg-foreground data-[selected=true]:text-background data-[highlighted=true]:bg-accent data-[highlighted=true]:text-on-accent data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none";

const SELECT_EMPTY_CLASSNAME =
  "px-3 py-2 text-xs text-muted-foreground";

const SELECT_CLEAR_CLASSNAME =
  "flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-on-accent transition-colors";

/**
 * A searchable select dropdown. Lists `options` and filters them as you type.
 * Use `clearable` to reset to `null`. When `filterable` is off, all options
 * are shown regardless of input.
 */
export function Select({
  options,
  value,
  onValueChange,
  placeholder = "Choose…",
  disabled = false,
  required = false,
  filterable = true,
  clearable = true,
  className,
}: ISelectProps) {
  const [inputValue, setInputValue] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!filterable || inputValue === "") {
      return options;
    }
    const q = inputValue.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
    );
  }, [options, inputValue, filterable]);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Combobox.Root
      value={value}
      onValueChange={(_value) => onValueChange(_value)}
      onInputValueChange={(_inputValue) => setInputValue(_inputValue)}
      disabled={disabled}
      required={required}
    >
      <Combobox.Trigger
        className={cn(SELECT_TRIGGER_CLASSNAME, className)}
        disabled={disabled}
        data-placeholder={selectedOption === null ? "" : undefined}
      >
        <Combobox.Value>
          {selectedOption ? (
            <span className={cn(SELECT_VALUE_CLASSNAME, "truncate", selectedOption.label === "" ? SELECT_PLACEHOLDER_CLASSNAME : undefined)}>
              {selectedOption.label === null ? selectedOption.value : selectedOption.label}
            </span>
          ) : (
            <span className={cn(SELECT_VALUE_CLASSNAME, SELECT_PLACEHOLDER_CLASSNAME)}>{placeholder}</span>
          )}
        </Combobox.Value>
        <IconChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180"
        />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} positionMethod="absolute">
          <Combobox.Popup className={SELECT_LIST_CLASSNAME}>
            <Combobox.Input
              className={SELECT_INPUT_CLASSNAME}
              placeholder={placeholder}
              disabled={disabled}
            />
            {clearable && value !== null && !disabled ? (
              <Combobox.Clear
                className={SELECT_CLEAR_CLASSNAME}
                onClick={(event) => {
                  event.stopPropagation();
                  onValueChange(null);
                }}
              >
                <IconX className="size-3.5" />
              </Combobox.Clear>
            ) : null}
            <Combobox.List>
              {filteredOptions.length === 0 ? (
                <Combobox.Empty className={SELECT_EMPTY_CLASSNAME}>
                  No matching results
                </Combobox.Empty>
              ) : (
                <Combobox.Collection>
                  {(item, index) => {
                    const option = filteredOptions.find((o) => o.value === item);
                    if (option === undefined) {
                      return null;
                    }
                    return (
                      <Combobox.Item
                        key={option.value}
                        value={option.value}
                        index={index}
                        className={SELECT_ITEM_CLASSNAME}
                      >
                        {option.label === null ? (
                          <span className="font-mono text-muted-foreground">
                            {option.value}
                          </span>
                        ) : (
                          <>
                            <span className="truncate">{option.label}</span>
                            {option.label !== option.value && (
                              <span className="text-xs text-muted-foreground/70 font-mono">
                                · {option.value}
                              </span>
                            )}
                          </>
                        )}
                      </Combobox.Item>
                    );
                  }}
                </Combobox.Collection>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
