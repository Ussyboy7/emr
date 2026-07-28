'use client';

import { ReactNode, RefObject } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';

type TemplateItemBase = {
  id: number;
  name: string;
  code?: string;
};

type Props<T extends TemplateItemBase> = {
  label: string;
  placeholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  showDropdown: boolean;
  onSearchFocus: () => void;
  dropdownRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  loadingText: string;
  emptyText: string;
  items: T[];
  selectedIds: Set<number>;
  selectedDetails: Map<number, T>;
  pinnedTemplate?: T | null;
  onToggle: (item: T) => void;
  onClearAll: () => void;
  selectedLabel: string;
  isOtherTemplate?: (item: T) => boolean;
  renderMeta: (item: T) => ReactNode;
};

export function TemplateCatalogMultiSelect<T extends TemplateItemBase>({
  label,
  placeholder,
  searchValue,
  onSearchChange,
  showDropdown,
  onSearchFocus,
  dropdownRef,
  loading,
  loadingText,
  emptyText,
  items,
  selectedIds,
  selectedDetails,
  pinnedTemplate,
  onToggle,
  onClearAll,
  selectedLabel,
  isOtherTemplate,
  renderMeta,
}: Props<T>) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative" ref={dropdownRef as RefObject<HTMLDivElement>}>
        <Input
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onSearchFocus}
        />
        {showDropdown && searchValue.trim() && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                {loadingText}
              </div>
            ) : items.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const isOtherRow = isOtherTemplate ? isOtherTemplate(item) : false;
                return (
                  <div
                    key={item.id}
                    onClick={() => onToggle(item)}
                    className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                      isSelected ? 'bg-muted/50' : ''
                    }`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => onToggle(item)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                        {item.name}
                        {isOtherRow && (
                          <Badge variant="outline" className="text-[10px]">
                            Describe in clinical indication
                          </Badge>
                        )}
                      </div>
                      {renderMeta(item)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-2 space-y-2">
          <div className="text-sm font-medium">
            {selectedLabel} ({selectedIds.size})
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedIds).map((id) => {
              const selected =
                selectedDetails.get(id) || (pinnedTemplate?.id === id ? pinnedTemplate : undefined);
              if (!selected) return null;
              return (
                <Badge key={selected.id} variant="secondary" className="flex items-center gap-1">
                  {selected.name}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => onToggle(selected)} />
                </Badge>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs">
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}
