import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal, Undo2 } from 'lucide-react';
import { Dialog, IconButton } from '@wadeck-app/dsl-ui';
import { Logo } from './Logo.js';
import { moveId } from './useTabOrder.js';
import type { NavModule } from './navModel.js';

interface NavSettingsProps {
  // Every module the manifests list, in the order the tabs show them now, the hidden ones included.
  modules: NavModule[];
  // The ids of the modules the user hid.
  hidden: readonly string[];
  // Whether the user changed the default order or hid a module.
  customized: boolean;
  onSave: (ids: string[]) => void;
  onToggleHidden: (id: string) => void;
  onReset: () => void;
}

// The navigation settings of the user: the order of the module tabs and which of them are shown. A button in the top bar opens it.
export function NavSettings({ modules, hidden, customized, onSave, onToggleHidden, onReset }: NavSettingsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ids = modules.map((m) => m.id);
  return (
    <>
      <IconButton icon={<SlidersHorizontal size={14} />} aria-label="Navigation settings" title="Navigation settings" variant="ghost" size="icon-sm" onClick={() => setOpen(true)} />
      <Dialog title="Navigation" open={open} onOpenChange={setOpen} size="md">
        <p className="mb-1 text-sm text-muted">Order of the module tabs, and which of them are shown. It is saved in this browser.</p>
        <p className="mb-3 text-xs text-muted">Hidden modules are not in the top bar or the dashboard menu; their pages still open by their address, and the Modules page lists them.</p>
        <ol aria-label="Module tabs" className="space-y-1">
          {modules.map((m, i) => {
            const isHidden = hidden.includes(m.id);
            return (
              <li key={m.id} className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5">
                <span className={`flex flex-1 items-center gap-2 ${isHidden ? 'opacity-60' : ''}`}>
                  <Logo title={m.title} moduleId={m.id} />
                  <span className="text-sm font-medium text-content">{m.title}</span>
                  {isHidden ? <span className="rounded bg-muted-bg px-1.5 py-0.5 text-xs text-muted">Hidden</span> : null}
                </span>
                <IconButton
                  icon={isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  aria-label={isHidden ? `Show ${m.title}` : `Hide ${m.title}`}
                  title={isHidden ? 'Show in the top bar and the dashboard menu' : 'Hide from the top bar and the dashboard menu'}
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onToggleHidden(m.id)}
                />
                <IconButton icon={<ArrowUp size={14} />} aria-label={`Move ${m.title} earlier`} title="Move earlier" variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => onSave(moveId(ids, m.id, -1))} />
                <IconButton icon={<ArrowDown size={14} />} aria-label={`Move ${m.title} later`} title="Move later" variant="ghost" size="icon-xs" disabled={i === modules.length - 1} onClick={() => onSave(moveId(ids, m.id, 1))} />
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!customized}
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-content transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Reset to default
          </button>
        </div>
      </Dialog>
    </>
  );
}
