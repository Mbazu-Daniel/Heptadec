import { useState, useRef, useEffect } from "react";
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface ISelectOption {
  value: string;
  label: string;
}

interface ISearchableSelectProps {
  options: ISelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Choose…",
  disabled = false,
  className,
}: ISearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.value.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(option: ISelectOption) {
    onValueChange(option.value);
    setIsOpen(false);
    setSearchTerm("");
  }

  function handleClear() {
    onValueChange("");
    setSearchTerm("");
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 pr-16 py-2 text-sm text-foreground transition-colors duration-200 outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground truncate">
          {selectedOption ? (
            <span className="truncate">
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-muted-foreground/60">{placeholder}</span>
          )}
        </span>
      </button>

      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {selectedOption !== undefined && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear ${selectedOption.label}`}
            className="pointer-events-auto flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-on-accent transition-colors"
          >
            <IconX className="size-3.5" />
          </button>
        )}
        <IconChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          <div className="sticky top-0 bg-background p-2 border-b border-border">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full h-7 rounded-md border-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
              autoFocus
            />
          </div>
          <div className="p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matching results
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors duration-150 text-left",
                    option.value === value
                      ? "bg-foreground text-background"
                      : "text-foreground hover:bg-accent hover:text-on-accent"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.label !== option.value && (
                    <span className="text-xs text-muted-foreground/70 font-mono">
                      · {option.value}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
