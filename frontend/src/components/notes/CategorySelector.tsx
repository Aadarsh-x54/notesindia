import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, Plus, Search, X } from 'lucide-react';
import { categoriesApi } from '../../lib/api';
import { CATEGORY_ACCENT_PALETTE } from '../../lib/format';
import type { CategoryResponse, DuplicateCheckResponse, NewCategoryInput } from '../../types';

interface CategorySelectorProps {
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  newCategories: NewCategoryInput[];
  onNewCategoriesChange: (items: NewCategoryInput[]) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  selectedIds,
  onSelectedIdsChange,
  newCategories,
  onNewCategoriesChange,
}) => {
  const [search, setSearch] = useState('');
  const [showCreateBox, setShowCreateBox] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_ACCENT_PALETTE[0].hex);
  const [dupCheck, setDupCheck] = useState<DuplicateCheckResponse | null>(null);

  const { data: allCategories = [], isLoading } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => categoriesApi.list(),
  });

  // Real-time duplicate & near-duplicate category check
  useEffect(() => {
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      setDupCheck(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await categoriesApi.checkDuplicate(trimmed);
        setDupCheck(res);
      } catch {
        setDupCheck(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [newName]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCategories;
    return allCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.parentName && c.parentName.toLowerCase().includes(q))
    );
  }, [allCategories, search]);

  const selectedCategoryObjects = useMemo(
    () => allCategories.filter((c) => selectedIds.includes(c.id)),
    [allCategories, selectedIds]
  );

  const toggleExisting = (catId: string) => {
    if (selectedIds.includes(catId)) {
      onSelectedIdsChange(selectedIds.filter((id) => id !== catId));
    } else {
      onSelectedIdsChange([...selectedIds, catId]);
    }
  };

  const handleAddNewCategory = () => {
    const cleaned = newName.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2) return;

    // If exact match exists in DB, select existing instead of creating duplicate
    if (dupCheck?.exactMatch && dupCheck.existingMatch) {
      if (!selectedIds.includes(dupCheck.existingMatch.id)) {
        onSelectedIdsChange([...selectedIds, dupCheck.existingMatch.id]);
      }
      setNewName('');
      setShowCreateBox(false);
      return;
    }

    const alreadyQueued = newCategories.some(
      (nc) => nc.name.toLowerCase() === cleaned.toLowerCase()
    );
    if (!alreadyQueued) {
      onNewCategoriesChange([
        ...newCategories,
        {
          name: cleaned,
          parentId: newParentId || null,
          accentColor: newColor,
        },
      ]);
    }
    setNewName('');
    setNewParentId('');
    setShowCreateBox(false);
  };

  const removeQueuedNew = (name: string) => {
    onNewCategoriesChange(newCategories.filter((nc) => nc.name !== name));
  };

  return (
    <div className="space-y-3">
      {/* Selected Summary Pills */}
      {(selectedCategoryObjects.length > 0 || newCategories.length > 0) && (
        <div className="flex flex-wrap gap-2 p-3 bg-ni-black border border-ni-border">
          {selectedCategoryObjects.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-white bg-ni-surface border border-ni-border"
              style={{ borderBottomWidth: '2px', borderBottomColor: cat.accentColor }}
            >
              {cat.parentName ? `${cat.parentName} > ${cat.name}` : cat.name}
              <button
                type="button"
                onClick={() => toggleExisting(cat.id)}
                className="text-ni-muted hover:text-white"
                aria-label={`Remove ${cat.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {newCategories.map((nc) => (
            <span
              key={nc.name}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-white bg-ni-surface2 border border-ni-border"
              style={{ borderBottomWidth: '2px', borderBottomColor: nc.accentColor || '#3B82F6' }}
            >
              <span>{nc.name}</span>
              <span className="text-[10px] uppercase text-ni-muted">(New)</span>
              <button
                type="button"
                onClick={() => removeQueuedNew(nc.name)}
                className="text-ni-muted hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search & Create Trigger */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ni-subtle absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search existing categories (e.g. SSC CGL, Java, DBMS, Mathematics)..."
            className="ni-input pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreateBox((v) => !v);
            if (!showCreateBox && search.trim()) {
              setNewName(search.trim());
            }
          }}
          className="ni-btn-secondary shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create New Category
        </button>
      </div>

      {/* Inline Dynamic Category Creator */}
      {showCreateBox && (
        <div className="bg-ni-surface border border-ni-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
              Create Dynamic Category
            </h4>
            <button
              type="button"
              onClick={() => setShowCreateBox(false)}
              className="text-ni-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ni-muted mb-1">Category Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Object-Oriented Programming"
                className="ni-input"
              />
            </div>

            <div>
              <label className="block text-xs text-ni-muted mb-1">
                Parent Category (Optional)
              </label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="ni-input"
              >
                <option value="">None (Independent Root Category)</option>
                {allCategories.map((c: CategoryResponse) => (
                  <option key={c.id} value={c.id}>
                    {c.parentName ? `${c.parentName} > ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Duplicate Detection Banner */}
          {dupCheck?.exactMatch && dupCheck.existingMatch && (
            <div className="bg-ni-black border border-ni-border p-3 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-white">
                <AlertCircle className="w-4 h-4 text-ni-muted shrink-0" />
                <span>
                  Category <strong>{dupCheck.existingMatch.name}</strong> already exists. Select it
                  instead to avoid duplicates.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!selectedIds.includes(dupCheck.existingMatch!.id)) {
                    onSelectedIdsChange([...selectedIds, dupCheck.existingMatch!.id]);
                  }
                  setNewName('');
                  setShowCreateBox(false);
                }}
                className="ni-btn-primary py-1 px-2.5 text-xs shrink-0"
              >
                Use Existing
              </button>
            </div>
          )}

          {!dupCheck?.exactMatch && dupCheck && dupCheck.similarCategories.length > 0 && (
            <div className="bg-ni-black border border-ni-border p-3 text-xs space-y-2">
              <p className="text-ni-muted flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Similar categories already exist — did you mean one of these?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dupCheck.similarCategories.map((sim) => (
                  <button
                    key={sim.id}
                    type="button"
                    onClick={() => {
                      if (!selectedIds.includes(sim.id)) {
                        onSelectedIdsChange([...selectedIds, sim.id]);
                      }
                      setNewName('');
                      setShowCreateBox(false);
                    }}
                    className="px-2.5 py-1 bg-ni-surface text-white border border-ni-border hover:border-white"
                    style={{ borderBottomWidth: '2px', borderBottomColor: sim.accentColor }}
                  >
                    Select &ldquo;{sim.name}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Accent Line Color Picker */}
          <div>
            <label className="block text-xs text-ni-muted mb-1.5">
              Category Accent Line Color
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ACCENT_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setNewColor(c.hex)}
                  title={c.label}
                  className={`w-7 h-7 bg-ni-black border flex items-center justify-center ${
                    newColor === c.hex ? 'border-white' : 'border-ni-border'
                  }`}
                  style={{ borderTopWidth: '4px', borderTopColor: c.hex }}
                >
                  {newColor === c.hex && <Check className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={newName.trim().length < 2}
              onClick={handleAddNewCategory}
              className="ni-btn-primary py-2 text-xs"
            >
              Add Category to Note
            </button>
          </div>
        </div>
      )}

      {/* Existing Categories Multi-Select Grid */}
      <div className="bg-ni-black border border-ni-border p-3 max-h-60 overflow-y-auto">
        {isLoading ? (
          <p className="text-xs text-ni-muted p-2">Loading categories...</p>
        ) : filteredCategories.length === 0 ? (
          <p className="text-xs text-ni-muted p-2">
            No matching categories found. Click &ldquo;Create New Category&rdquo; above to add{' '}
            <strong className="text-white">{search}</strong>.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {filteredCategories.map((cat) => {
              const selected = selectedIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleExisting(cat.id)}
                  className={`text-left px-3 py-2 border transition-colors flex items-center justify-between gap-2 ${
                    selected
                      ? 'bg-ni-surface2 border-white text-white'
                      : 'bg-ni-surface border-ni-border text-ni-muted hover:text-white hover:border-ni-borderHover'
                  }`}
                  style={{ borderLeftWidth: '3px', borderLeftColor: cat.accentColor }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate">{cat.name}</div>
                    {cat.parentName && (
                      <div className="text-[10px] text-ni-subtle truncate">{cat.parentName}</div>
                    )}
                  </div>
                  {selected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
